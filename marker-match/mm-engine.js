/* Marker Match engine: pure rules shared by the browser (demo mode) and the Apps Script backend
   (backend Code.gs holds an exact copy of this file between the MMENGINE markers).
   No DOM, no network, no clock: the caller passes ctx = {now, rand}.
   A room R = {meta, piece, marks}:
     meta  = {code, tk, created, v, campus, cls, set, phase, round, title, kind,
              players: {pid: {n, a (anonymous name), k (public key), at, tot (points), ex (exact marks), pr: {round: points}, pp (paper: the tutor enters the marks)}},
              rounds: [{n, title, kind, idx, tm: {Ideas..Control}, why (one line), done, lk (marks in), avg: {}, spread: {}}]}
     piece = {title, kind, prompt, text, rubric: {Ideas..Control: what a strong mark looks like}} (the piece being marked now)
     marks = {pid: {r: {Ideas..Control: 1 to 10}, at, d (distance), pts}} (this round only)
   phase: lobby | marking (students mark and lock in) | reveal (class spread, tutor marks, points) | leaderboard
   Points for a piece = 40 minus the total distance from the tutor's marks (4 criteria, 1 to 10 each), never below 0.
   Leaderboards are per lesson (per room).
   store = {exists(code), meta(code) -> meta|null, load(code) -> R|null, save(code, R, dirty)}. */
var MM = (function () {
  var ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  var CRIT = ["Ideas", "Structure", "Language", "Control"];
  var PHASES = ["lobby", "marking", "reveal", "leaderboard"];
  var KINDS = ["Narrative", "Persuasive"];
  var COLOURS = ["Teal", "Coral", "Amber", "Indigo", "Jade", "Ruby", "Olive", "Plum", "Cobalt", "Mint", "Scarlet", "Violet", "Copper", "Silver", "Gold", "Saffron", "Crimson", "Azure", "Lilac", "Ochre"];
  var ANIMALS = ["Fox", "Owl", "Otter", "Koala", "Wombat", "Panda", "Falcon", "Lynx", "Gecko", "Heron", "Quokka", "Puffin", "Echidna", "Dingo", "Kestrel", "Possum", "Platypus", "Magpie", "Dolphin", "Emu", "Robin", "Seal"];
  var TOP = 10, MAX_PTS = 40, MAX_TEXT = 8000, MAX_WHY = 240, MAX_PLAYERS = 80, MAX_ROUNDS = 30;

  function err(code, msg) { return { ok: false, error: code, message: msg || code }; }
  function clean(s, max) { return String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max); }
  function cleanText(s, max) {
    return String(s == null ? "" : s).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
      .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "").slice(0, max);
  }
  function makeCode(rand, len) {
    var s = "";
    for (var i = 0; i < (len || 6); i++) s += ALPHA.charAt(Math.floor(rand() * ALPHA.length));
    return s;
  }
  function int(x) { var n = Number(x); return Math.floor(n) === n ? n : NaN; }

  /* {Ideas..Control} with every criterion a whole number 1 to 10, else null. */
  function marks(r) {
    if (!r || typeof r !== "object") return null;
    var o = {};
    for (var i = 0; i < CRIT.length; i++) { var n = int(r[CRIT[i]]); if (!(n >= 1 && n <= TOP)) return null; o[CRIT[i]] = n; }
    return o;
  }
  function distance(r, tm) { var d = 0; CRIT.forEach(function (c) { d += Math.abs(r[c] - tm[c]); }); return d; }
  function points(r, tm) { return Math.max(0, MAX_PTS - distance(r, tm)); }

  function newRoom(code, tk, now, info) {
    return {
      meta: { code: code, tk: tk, created: now, v: 1, campus: info.campus, cls: info.cls, set: info.set, phase: "lobby", round: 0, title: "", kind: "", players: {}, rounds: [] },
      piece: { title: "", kind: "", prompt: "", text: "", rubric: {} }, marks: {}
    };
  }

  function anonFor(meta, rand) {
    var used = {}, cs = {}, as = {};
    for (var p in meta.players) { var a = meta.players[p].a; used[a] = 1; var bits = a.split(" "); cs[bits[0]] = 1; as[bits[1]] = 1; }
    var pick = function (l) { return l[Math.floor(rand() * l.length)]; };
    for (var i = 0; i < 300; i++) {
      var c = pick(COLOURS), n = pick(ANIMALS), name = c + " " + n;
      if (used[name]) continue;
      if (i < 200 && (cs[c] || as[n])) continue;
      return name;
    }
    return "Marker " + (Object.keys(meta.players).length + 1);
  }
  function cur(M) { return M.rounds[M.rounds.length - 1] || null; }

  /* Overall leaderboard: points, then exact marks, then who joined first. */
  function board(M) {
    var out = Object.keys(M.players).map(function (pid) { var p = M.players[pid]; return { pid: pid, k: p.k, a: p.a, tot: p.tot, ex: p.ex, at: p.at, n: Object.keys(p.pr).length }; });
    out.sort(function (x, y) { return (y.tot - x.tot) || (y.ex - x.ex) || (x.at - y.at); });
    out.forEach(function (r) { r.rank = 1 + out.filter(function (o) { return o.tot > r.tot || (o.tot === r.tot && o.ex > r.ex); }).length; });
    return out;
  }
  /* This round only, for the reveal. */
  function roundBoard(R) {
    var M = R.meta, out = [];
    for (var pid in R.marks) { var m = R.marks[pid], p = M.players[pid]; if (p && m.pts != null) out.push({ k: p.k, a: p.a, pts: m.pts, d: m.d, at: m.at }); }
    out.sort(function (x, y) { return (y.pts - x.pts) || (x.at - y.at); });
    out.forEach(function (r) { r.rank = 1 + out.filter(function (o) { return o.pts > r.pts; }).length; });
    return out;
  }
  function spread(R) {
    var s = {}, avg = {}, n = 0;
    CRIT.forEach(function (c) { s[c] = []; for (var i = 0; i < TOP; i++) s[c].push(0); avg[c] = 0; });
    for (var pid in R.marks) {
      if (!R.meta.players[pid]) continue;
      n++; CRIT.forEach(function (c) { s[c][R.marks[pid].r[c] - 1]++; avg[c] += R.marks[pid].r[c]; });
    }
    CRIT.forEach(function (c) { avg[c] = n ? Math.round(avg[c] / n * 10) / 10 : 0; });
    return { spread: s, avg: avg, n: n };
  }

  function roomLog(M, now) {
    return { tab: "MMRooms", key: M.code, row: [M.code, M.tk, new Date(M.created), new Date(now), M.campus, M.cls, M.set, M.phase, M.round, JSON.stringify(M)] };
  }
  function roundLog(R, now) {
    var M = R.meta, rd = cur(M), P = R.piece;
    return { tab: "MMRounds", key: M.code + ":" + M.round, row: [M.code + ":" + M.round, new Date(now), M.code, M.round, P.title, P.kind, P.prompt, P.text, JSON.stringify(rd.tm), rd.why, JSON.stringify(P.rubric || {}), rd.done ? JSON.stringify({ avg: rd.avg, spread: rd.spread, n: rd.lk }) : ""] };
  }
  function markLog(R, pid, now) {
    var M = R.meta, m = R.marks[pid], p = M.players[pid];
    return { tab: "MMMarks", key: M.code + ":" + M.round + ":" + pid, row: [M.code + ":" + M.round + ":" + pid, new Date(now), M.code, M.round, pid, p.n, p.a, JSON.stringify(m.r), m.d == null ? "" : m.d, m.pts == null ? "" : m.pts] };
  }

  /* ---- writes ---- */
  function apply(R, b, ctx) {
    var M = R.meta, now = ctx.now, a = b.action, log = [], dirty = { piece: false, marks: false };
    function done(extra) { log.push(roomLog(M, now)); var o = { ok: true, log: log, dirty: dirty }; for (var k in extra || {}) o[k] = extra[k]; return o; }

    if (a === "mm.join") {
      var id = String(b.pid || "");
      if (!/^[A-Za-z0-9]{6,24}$/.test(id)) return err("pid");
      var name = clean(b.name, 20); if (!name) return err("name", "Type your first name");
      var p = M.players[id];
      if (!p) {
        if (Object.keys(M.players).length >= MAX_PLAYERS) return err("full", "This room is full");
        var k, ids = {}; for (var q in M.players) ids[M.players[q].k] = 1;
        do { k = makeCode(ctx.rand, 8); } while (ids[k]);
        p = M.players[id] = { n: name, a: anonFor(M, ctx.rand), k: k, at: now, tot: 0, ex: 0, pr: {} };
      } else p.n = name;
      return done({ pid: id, a: p.a, k: p.k });
    }

    if (a === "mm.lock") {
      var me = M.players[b.pid];
      if (!me) return err("join", "Join the room first");
      if (M.phase !== "marking") return err("closed", "Marking is closed");
      if (R.marks[b.pid]) return err("locked", "You already locked in");
      var r = marks(b.r); if (!r) return err("marks", "Mark all four criteria first");
      R.marks[b.pid] = { r: r, at: now }; dirty.marks = true;
      cur(M).lk = Object.keys(R.marks).length;
      log.push(markLog(R, b.pid, now));
      return done({ r: r });
    }

    if (a === "mm.paper") {
      if (M.phase !== "marking") return err("phase", "Put a piece up first");
      var pn = clean(b.name, 20); if (!pn) return err("name", "Type the student's first name");
      var pr = marks(b.r); if (!pr) return err("marks", "Mark all four criteria first");
      var ppid = null;
      for (var x in M.players) if (M.players[x].pp && M.players[x].n.toLowerCase() === pn.toLowerCase()) ppid = x;
      if (!ppid) {
        if (Object.keys(M.players).length >= MAX_PLAYERS) return err("full", "This room is full");
        var ks = {}; for (var q2 in M.players) ks[M.players[q2].k] = 1;
        var pk; do { pk = makeCode(ctx.rand, 8); } while (ks[pk]);
        do { ppid = "paper" + makeCode(ctx.rand, 10); } while (M.players[ppid]);
        M.players[ppid] = { n: pn, a: anonFor(M, ctx.rand), k: pk, at: now, tot: 0, ex: 0, pr: {}, pp: 1 };
      }
      R.marks[ppid] = { r: pr, at: now }; dirty.marks = true;
      cur(M).lk = Object.keys(R.marks).length;
      log.push(markLog(R, ppid, now));
      return done({ k: M.players[ppid].k, a: M.players[ppid].a });
    }

    if (a === "mm.phase") {
      var op = b.op;
      if (op === "round") {
        if (M.phase === "marking" && Object.keys(R.marks).length) return err("phase", "Reveal this piece first");
        var pc = b.piece || {};
        var piece = { title: clean(pc.title, 80), kind: KINDS.indexOf(pc.kind) >= 0 ? pc.kind : "", prompt: clean(pc.prompt, 300), text: cleanText(pc.text, MAX_TEXT), rubric: {} };
        CRIT.forEach(function (c) { var d = clean(pc.rubric && pc.rubric[c], 120); if (d) piece.rubric[c] = d; });
        if (!piece.title) return err("title", "Give the piece a title");
        if (!piece.text) return err("text", "The piece has no text");
        var tm = marks(pc.marks); if (!tm) return err("marks", "Set your marks for all four criteria");
        var why = clean(pc.why, MAX_WHY);
        if (M.phase === "marking") { M.rounds.pop(); M.round--; }
        if (M.rounds.length >= MAX_ROUNDS) return err("full", "That is a lot of rounds already");
        M.round++; M.title = piece.title; M.kind = piece.kind; M.phase = "marking";
        R.piece = piece; R.marks = {}; dirty.piece = true; dirty.marks = true;
        M.rounds.push({ n: M.round, title: piece.title, kind: piece.kind, idx: b.idx == null ? "" : String(b.idx).slice(0, 20), tm: tm, why: why, done: 0, lk: 0, avg: {}, spread: {} });
        log.push(roundLog(R, now));
      } else if (op === "reveal") {
        if (M.phase !== "marking") return err("phase", "Nothing to reveal");
        var rd = cur(M);
        for (var pid in R.marks) {
          var pl = M.players[pid]; if (!pl) continue;
          var m = R.marks[pid];
          m.d = distance(m.r, rd.tm); m.pts = points(m.r, rd.tm);
          pl.pr[M.round] = m.pts; pl.tot += m.pts;
          CRIT.forEach(function (c) { if (m.r[c] === rd.tm[c]) pl.ex++; });
          log.push(markLog(R, pid, now));
        }
        var sp = spread(R);
        rd.done = 1; rd.lk = sp.n; rd.avg = sp.avg; rd.spread = sp.spread;
        M.phase = "reveal"; dirty.marks = true;
        log.push(roundLog(R, now));
      } else if (op === "leaderboard" || op === "lobby") {
        if (M.phase === "marking" && Object.keys(R.marks).length) return err("phase", "Reveal this piece first");
        if (M.phase === "marking") { M.rounds.pop(); M.round--; M.title = ""; R.marks = {}; dirty.marks = true; }
        M.phase = op;
      } else return err("op");
      return done();
    }
    return err("action");
  }

  /* ---- reads ---- */
  function view(R, b, ctx) {
    var M = R.meta, tutor = !!(b.tk && b.tk === M.tk), me = M.players[b.pid], rd = cur(M);
    var showPiece = M.phase === "marking" || M.phase === "reveal";
    var v = {
      ok: true, v: M.v, now: ctx.now, code: M.code, campus: M.campus, cls: M.cls, set: M.set, phase: M.phase, round: M.round,
      rounds: M.rounds.filter(function (x) { return x.done; }).length, joined: Object.keys(M.players).length, locked: Object.keys(R.marks).length
    };
    if (showPiece) v.piece = R.piece;
    if (M.phase === "reveal" && rd) {
      v.tm = rd.tm; v.why = rd.why; v.spread = rd.spread; v.avg = rd.avg;
      v.top = roundBoard(R).slice(0, 5).map(function (r) { return { k: r.k, a: r.a, pts: r.pts, rank: r.rank }; });
    }
    var lb = board(M);
    if (tutor) {
      v.tutor = true;
      if (rd) { v.tm = rd.tm; v.why = rd.why; }
      v.done = M.rounds.map(function (x) { return x.idx; });
      v.players = Object.keys(M.players).sort(function (x, y) { return M.players[x].at - M.players[y].at; }).map(function (pid) {
        var p = M.players[pid], m = R.marks[pid];
        return { k: p.k, a: p.a, n: p.n, pp: p.pp ? 1 : 0, locked: !!m, r: m ? m.r : null, pts: m && m.pts != null ? m.pts : null, tot: p.tot };
      });
      v.board = lb.map(function (r) { return { k: r.k, a: r.a, tot: r.tot, ex: r.ex, rank: r.rank, n: r.n }; });
      if (M.phase === "reveal") v.top = roundBoard(R).map(function (r) { return { k: r.k, a: r.a, pts: r.pts, rank: r.rank }; });
      return v;
    }
    if (M.phase === "leaderboard") v.top = lb.slice(0, 5).map(function (r) { return { k: r.k, a: r.a, tot: r.tot, rank: r.rank }; });
    if (!me) return v;
    var mine = R.marks[b.pid], mr = null;
    lb.forEach(function (r) { if (r.pid === b.pid) mr = r; });
    v.me = { n: me.n, a: me.a, k: me.k, r: mine ? mine.r : null, d: mine && mine.d != null ? mine.d : null, pts: mine && mine.pts != null ? mine.pts : null, tot: me.tot, rank: mr.rank, of: lb.length };
    return v;
  }

  function handle(b, store, ctx) {
    b = b || {};
    var a = b.action;
    if (a === "mm.create") {
      var info = { campus: clean(b.campus, 40), cls: clean(b.cls, 40), set: clean(b.set, 80) };
      if (!info.campus) return err("campus", "Pick the campus");
      if (!info.cls) return err("cls", "Type the class");
      if (!info.set) return err("set", "Pick a set");
      var code, tries = 0;
      do { code = makeCode(ctx.rand, 6); tries++; } while (store.exists(code) && tries < 50);
      var tk = makeCode(ctx.rand, 16), R = newRoom(code, tk, ctx.now, info);
      store.save(code, R, { piece: true, marks: true });
      return { ok: true, code: code, tk: tk, log: [roomLog(R.meta, ctx.now)] };
    }
    var room = String(b.room || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!room) return err("room", "Room not found");
    if (a === "mm.state") {
      if (b.v) {
        var m = store.meta(room);
        if (!m) return err("room", "Room not found");
        if (String(m.v) === String(b.v)) return { ok: true, same: true, v: m.v, now: ctx.now, phase: m.phase };
      }
      var R0 = store.load(room);
      return R0 ? view(R0, b, ctx) : err("room", "Room not found");
    }
    var R1 = store.load(room);
    if (!R1) return err("room", "Room not found");
    if ((a === "mm.phase" || a === "mm.paper") && b.tk !== R1.meta.tk) return err("tutor", "Tutor key needed");
    var r = apply(R1, b, ctx);
    if (r.ok) { R1.meta.v++; store.save(room, R1, r.dirty); }
    delete r.dirty;
    r.v = R1.meta.v;
    return r;
  }

  return {
    handle: handle, apply: apply, view: view, board: board, spread: spread, marks: marks, distance: distance, points: points, cleanText: cleanText,
    CRIT: CRIT, PHASES: PHASES, KINDS: KINDS, TOP: TOP, MAX_PTS: MAX_PTS
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = MM;
