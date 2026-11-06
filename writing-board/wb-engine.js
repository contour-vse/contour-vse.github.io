/* Writing Board engine: pure rules shared by the browser (demo mode) and the Apps Script backend
   (backend Code.gs holds an exact copy of this file between the WBENGINE markers).
   No DOM, no network, no clock: the caller passes ctx = {now, rand}.
   A room R = {meta, pieces, marks}:
     meta   = {code, tk, created, v, campus, cls, title, type, prompt, mins, rubric, phase, endAt, focus,
               players: {pid: {n, a (anonymous name), k (public piece key), at, s (has a piece), m (has marks), pp (a paper piece the tutor typed)}},
               votes: {voterPid: pieceKey}, ladder: {on, term, anon} (the Term Ladder on the projector)}
     pieces = {pid: {t (text), at (first submit), up (last submit), w (words)}}
     marks  = {pid: {h: [{id, s, e, q, cat, g, c}], c (whole piece comment), r: {Ideas..Control: 0 to 10}, star}}
   The pid is a student's private id (it signs their actions); everyone else only ever sees the piece key k.
   Term Ladder: tutor stars carry across the term. A class is campus + class text (normalised), a student is their first name in that class,
   a term is the calendar quarter of the room's start (Melbourne time). Each star is a WBStars row: starRow() below.
   store = {exists(code), meta(code) -> meta|null, load(code) -> R|null, save(code, R, dirty), stars(classKey) -> [starRow] (for wb.ladder)}. */
var WB = (function () {
  var ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  var TYPES = ["Short Answer", "Plan", "Paragraph", "Full Essay"];
  var GOOD = ["Hook", "Turning Point", "Show Not Tell", "Strong Verb", "Fresh Angle", "Sentence Variety", "Strong Ending", "Clear Contention", "Evidence Explained"];
  var FIX = ["Telling", "Runway", "Lucky Rescue", "Moral Line", "Too Many Scenes", "Off Prompt", "Weak Verb", "Unexplained Evidence"];
  var CRIT = ["Ideas", "Structure", "Language", "Control"];
  var PHASES = ["writing", "reading", "feedback", "leaderboard"];
  var LIMITS = [0, 3, 5, 8, 10, 12, 15, 20, 25, 30, 35, 40, 45];
  var COLOURS = ["Teal", "Coral", "Amber", "Indigo", "Jade", "Ruby", "Olive", "Plum", "Cobalt", "Mint", "Scarlet", "Violet", "Copper", "Silver", "Gold", "Saffron", "Crimson", "Azure", "Lilac", "Ochre"];
  var ANIMALS = ["Fox", "Owl", "Otter", "Koala", "Wombat", "Panda", "Falcon", "Lynx", "Gecko", "Heron", "Quokka", "Puffin", "Echidna", "Dingo", "Kestrel", "Possum", "Platypus", "Magpie", "Dolphin", "Emu", "Robin", "Seal"];
  var STAR = 3, RUB_MAX = 10, MAX_TEXT = 8000, MAX_HL = 80, MAX_NOTE = 400, MAX_WHOLE = 1200, MAX_PAPER = 3000, MEL = 10 * 3600000;

  function err(code, msg) { return { ok: false, error: code, message: msg || code }; }
  function clean(s, max) { return String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max); }
  /* Multi line text: keeps line breaks, drops control characters, trims the ends. */
  function cleanText(s, max) {
    return String(s == null ? "" : s).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
      .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "").slice(0, max);
  }
  function words(t) { var m = String(t || "").match(/\S+/g); return m ? m.length : 0; }
  function makeCode(rand, len) {
    var s = "";
    for (var i = 0; i < (len || 6); i++) s += ALPHA.charAt(Math.floor(rand() * ALPHA.length));
    return s;
  }
  function int(x) { var n = Number(x); return Math.floor(n) === n ? n : NaN; }
  function has(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }

  function newRoom(code, tk, now, info) {
    return {
      meta: {
        code: code, tk: tk, created: now, v: 1,
        campus: info.campus, cls: info.cls, title: info.title, type: info.type, prompt: info.prompt,
        mins: info.mins, rubric: !!info.rubric,
        phase: "writing", endAt: 0, focus: "", players: {}, votes: {}
      },
      pieces: {}, marks: {}
    };
  }

  /* "Teal Fox": a colour and an animal nobody else in the room has, while they last. */
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
    return "Writer " + (Object.keys(meta.players).length + 1);
  }
  function byKey(meta, k) {
    if (!k) return null;
    for (var pid in meta.players) if (meta.players[pid].k === k) return pid;
    return null;
  }
  function blankMarks() { return { h: [], c: "", r: {}, star: 0 }; }

  /* ---- Term Ladder ---- */
  function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function classKey(campus, cls) { return norm(campus) + "|" + norm(cls); }
  function firstName(n) {
    var w = String(n == null ? "" : n).replace(/[^A-Za-z\u00C0-\u024F' ]+/g, " ").trim().split(/\s+/)[0] || "";
    return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : "";
  }
  /* Calendar quarter in Melbourne time (AEST, close enough at the edges): {id: "2026-T4", label: "Term 4 2026"}. */
  function termOf(ms) {
    var d = new Date(Number(ms) + MEL), y = d.getUTCFullYear(), q = Math.floor(d.getUTCMonth() / 3) + 1;
    return { id: y + "-T" + q, label: "Term " + q + " " + y };
  }
  function termLabel(id) { var m = /^(\d{4})-T([1-4])$/.exec(id || ""); return m ? "Term " + m[2] + " " + m[1] : ""; }
  /* One star record per piece: the WBStars row (and the demo store) are built from this. */
  function starRow(M, pid, star) {
    var p = M.players[pid];
    return { key: M.code + ":" + pid, room: M.code, term: termOf(M.created).id, ck: classKey(M.campus, M.cls), campus: M.campus, cls: M.cls, n: firstName(p && p.n), star: star ? 1 : 0 };
  }
  function starRows(R) {
    var out = [];
    for (var pid in R.marks) if (R.marks[pid].star && R.meta.players[pid]) out.push(starRow(R.meta, pid, 1));
    return out;
  }
  function starLog(M, pid, star, now) {
    var r = starRow(M, pid, star);
    return { tab: "WBStars", key: r.key, ck: r.ck, row: [r.key, new Date(now), r.room, r.term, r.ck, r.campus, r.cls, r.n, r.star] };
  }
  /* A colour and an animal that stay the same for one student all term (for the anonymous ladder). */
  function ladderAnon(ck, n) {
    var rnd = seeded(ck + "|" + n.toLowerCase());
    return COLOURS[Math.floor(rnd() * COLOURS.length)] + " " + ANIMALS[Math.floor(rnd() * ANIMALS.length)];
  }
  /* Stars per first name for one class and one term. rows: starRow list (any class; others are skipped). */
  function ladder(rows, ck, term) {
    var by = {}, terms = {}, out = [], used = {};
    (rows || []).forEach(function (r) {
      if (r.ck !== ck || !r.n) return;
      terms[r.term] = 1;
      if (r.term !== term || !Number(r.star)) return;
      var key = r.n.toLowerCase(), e = by[key] || (by[key] = { n: r.n, stars: 0, rooms: {} });
      if (!e.rooms[r.room]) { e.rooms[r.room] = 1; }
      e.stars++;
    });
    for (var k in by) out.push({ n: by[k].n, stars: by[k].stars, lessons: Object.keys(by[k].rooms).length });
    out.sort(function (x, y) { return (y.stars - x.stars) || (x.n < y.n ? -1 : x.n > y.n ? 1 : 0); });
    out.forEach(function (r) {
      r.rank = 1 + out.filter(function (o) { return o.stars > r.stars; }).length;
      var a = ladderAnon(ck, r.n), i = 2; while (used[a]) a = ladderAnon(ck, r.n + i++); used[a] = 1; r.anon = a;
    });
    return { rows: out, terms: Object.keys(terms) };
  }

  /* Where a highlight sits in the text now: its saved offsets if the quote still matches, else the quote's first match. */
  function locate(text, h) {
    if (text.slice(h.s, h.e) === h.q) return { s: h.s, e: h.e };
    var i = h.q ? text.indexOf(h.q) : -1;
    return i < 0 ? null : { s: i, e: i + h.q.length };
  }

  function board(R) {
    var M = R.meta, votes = {}, out = [];
    for (var v in M.votes) votes[M.votes[v]] = (votes[M.votes[v]] || 0) + 1;
    for (var pid in R.pieces) {
      var p = M.players[pid]; if (!p) continue;
      var mk = R.marks[pid] || {}, n = votes[p.k] || 0, star = mk.star ? 1 : 0, rub = 0;
      for (var c in mk.r || {}) rub += mk.r[c] || 0;
      out.push({ k: p.k, a: p.a, pid: pid, votes: n, star: star, pts: n + STAR * star, rub: M.rubric ? rub : 0, at: R.pieces[pid].at });
    }
    out.sort(function (x, y) { return (y.pts - x.pts) || (y.rub - x.rub) || (x.at - y.at); });
    out.forEach(function (r) { r.rank = 1 + out.filter(function (o) { return o.pts > r.pts || (o.pts === r.pts && o.rub > r.rub); }).length; });
    return out;
  }

  function roomLog(M, now) {
    return { tab: "WBRooms", key: M.code, row: [M.code, M.tk, new Date(M.created), new Date(now), M.campus, M.cls, M.title, M.type, M.phase, JSON.stringify(M)] };
  }
  function markLog(R, pid, now) {
    var M = R.meta, mk = R.marks[pid] || blankMarks(), p = M.players[pid], tot = 0;
    for (var c in mk.r) tot += mk.r[c] || 0;
    return { tab: "WBMarks", key: M.code + ":" + pid, row: [M.code + ":" + pid, new Date(now), M.code, pid, p.a, JSON.stringify(mk), mk.star ? 1 : 0, M.rubric ? tot : ""] };
  }

  /* ---- writes ---- */
  function apply(R, b, ctx) {
    var M = R.meta, now = ctx.now, a = b.action, log = [], dirty = { meta: false, pieces: [], marks: [] };
    function done(extra) { var o = { ok: true, log: log, dirty: dirty }; for (var k in extra || {}) o[k] = extra[k]; return o; }

    if (a === "wb.join") {
      var id = String(b.pid || "");
      if (!/^[A-Za-z0-9]{6,24}$/.test(id)) return err("pid");
      var name = clean(b.name, 20); if (!name) return err("name", "Type your first name");
      var p = M.players[id];
      if (!p) {
        var k; do { k = makeCode(ctx.rand, 8); } while (byKey(M, k));
        p = M.players[id] = { n: name, a: anonFor(M, ctx.rand), k: k, at: now };
      } else p.n = name;
      dirty.meta = true; log.push(roomLog(M, now));
      return done({ pid: id, a: p.a, k: p.k });
    }

    if (a === "wb.phase") {
      var op = b.op;
      if (PHASES.indexOf(op) >= 0) M.phase = op;
      else if (op === "timerStart") {
        var mins = b.mins != null ? int(b.mins) : M.mins;
        if (!(mins > 0 && mins <= 90)) return err("mins", "Pick a time limit");
        if (M.phase !== "writing") return err("phase", "The timer runs while students write");
        M.mins = mins; M.endAt = now + mins * 60000;
      } else if (op === "timerAdd") {
        if (M.phase !== "writing") return err("phase", "The timer runs while students write");
        M.endAt = Math.max(M.endAt, now) + 60000;
      } else if (op === "timerClear") { M.endAt = 0; }
      else if (op === "focus") {
        if (b.k && !R.pieces[byKey(M, b.k)]) return err("piece", "That piece is not in");
        M.focus = b.k || "";
      } else if (op === "ladder") {
        var tm = String(b.term || "");
        if (tm && !termLabel(tm)) return err("term", "Pick a term");
        M.ladder = { on: b.on ? 1 : 0, term: tm, anon: b.anon ? 1 : 0 };
      } else return err("op");
      dirty.meta = true; log.push(roomLog(M, now));
      return done();
    }

    if (a === "wb.paper") {
      if (M.phase === "leaderboard") return err("phase", "Go back to reading or feedback to add a piece");
      var pn = clean(b.name, 20); if (!pn) return err("name", "Type the student's first name");
      var pt = cleanText(b.text, MAX_PAPER); if (!pt) return err("empty", "Type the piece first");
      var ppid = b.k ? byKey(M, String(b.k)) : null, pl;
      if (b.k) {
        if (!ppid || !M.players[ppid].pp) return err("piece", "That paper piece is gone");
        pl = M.players[ppid]; pl.n = pn;
      } else {
        do { ppid = "paper" + makeCode(ctx.rand, 10); } while (M.players[ppid]);
        var pk; do { pk = makeCode(ctx.rand, 8); } while (byKey(M, pk));
        pl = M.players[ppid] = { n: pn, a: anonFor(M, ctx.rand), k: pk, at: now, pp: 1 };
      }
      var ppc = R.pieces[ppid] || { at: now };
      ppc.t = pt; ppc.up = now; ppc.w = words(pt);
      R.pieces[ppid] = ppc; pl.s = 1;
      dirty.pieces.push(ppid); dirty.meta = true;
      log.push(roomLog(M, now));
      log.push({ tab: "WBPieces", key: M.code + ":" + ppid, row: [M.code + ":" + ppid, new Date(now), M.code, ppid, pl.n + " (paper)", pl.a, pt, ppc.w, new Date(ppc.at), new Date(ppc.up)] });
      if (R.marks[ppid] && R.marks[ppid].star) log.push(starLog(M, ppid, 1, now));
      return done({ k: pl.k, a: pl.a });
    }

    var me = M.players[b.pid];

    if (a === "wb.submit") {
      if (!me) return err("join", "Join the room first");
      if (M.phase !== "writing") return err("closed", "Writing has closed");
      var t = cleanText(b.text, MAX_TEXT);
      if (!t) return err("empty", "Write something first");
      var pc = R.pieces[b.pid] || { at: now };
      pc.t = t; pc.up = now; pc.w = words(t);
      R.pieces[b.pid] = pc; me.s = 1;
      dirty.pieces.push(b.pid); dirty.meta = true;
      log.push({ tab: "WBPieces", key: M.code + ":" + b.pid, row: [M.code + ":" + b.pid, new Date(now), M.code, b.pid, me.n, me.a, t, pc.w, new Date(pc.at), new Date(pc.up)] });
      return done({ at: pc.at, up: pc.up, w: pc.w, t: t });
    }

    if (a === "wb.vote") {
      if (!me) return err("join", "Join the room first");
      if (M.phase !== "reading" && M.phase !== "feedback") return err("closed", "Voting is closed");
      var to = "";
      if (b.k) {
        var target = byKey(M, String(b.k));
        if (!target || !R.pieces[target]) return err("piece", "That piece is not in");
        if (target === b.pid) return err("own", "Vote for someone else's piece");
        to = M.players[target].k; M.votes[b.pid] = to;
      } else delete M.votes[b.pid];
      dirty.meta = true;
      log.push({ tab: "WBVotes", key: M.code + ":" + b.pid, row: [M.code + ":" + b.pid, new Date(now), M.code, b.pid, me.a, to ? M.players[byKey(M, to)].a : "", to] });
      return done({ vote: to });
    }

    if (a === "wb.mark") {
      var pid = byKey(M, b.k), pz = pid && R.pieces[pid];
      if (!pz) return err("piece", "That piece is not in");
      var mk = R.marks[pid] || blankMarks(), out = {};
      var find = function (hid) { for (var i = 0; i < mk.h.length; i++) if (mk.h[i].id === hid) return mk.h[i]; return null; };
      var cat = function (c) { return GOOD.indexOf(c) >= 0 ? 1 : FIX.indexOf(c) >= 0 ? 0 : -1; };
      var hop = b.op;
      if (hop === "hl.add") {
        var s = int(b.s), e = int(b.e), g = cat(b.cat);
        if (!(s >= 0 && e > s && e <= pz.t.length && e - s <= 3000)) return err("range", "Select some words first");
        if (g < 0) return err("cat", "Pick a category");
        if (mk.h.length >= MAX_HL) return err("full", "That is a lot of highlights already");
        for (var j = 0; j < mk.h.length; j++) {
          var at = locate(pz.t, mk.h[j]);
          if (at && s < at.e && e > at.s) return err("overlap", "Part of that is already highlighted");
        }
        var hl = { id: makeCode(ctx.rand, 6), s: s, e: e, q: pz.t.slice(s, e), cat: b.cat, g: g, c: clean(b.c, MAX_NOTE) };
        mk.h.push(hl); mk.h.sort(function (x, y) { return x.s - y.s; }); out.id = hl.id;
      } else if (hop === "hl.note" || hop === "hl.cat") {
        var h = find(b.id); if (!h) return err("hl", "That highlight is gone");
        if (hop === "hl.note") h.c = clean(b.c, MAX_NOTE);
        else { var g2 = cat(b.cat); if (g2 < 0) return err("cat", "Pick a category"); h.cat = b.cat; h.g = g2; }
      } else if (hop === "hl.del") {
        mk.h = mk.h.filter(function (x) { return x.id !== b.id; });
      } else if (hop === "note") {
        mk.c = cleanText(b.c, MAX_WHOLE);
      } else if (hop === "rubric") {
        if (!M.rubric) return err("rubric", "The rubric is off for this room");
        var n = int(b.n);
        if (CRIT.indexOf(b.crit) < 0 || !(n >= 0 && n <= RUB_MAX)) return err("rubric");
        if (n) mk.r[b.crit] = n; else delete mk.r[b.crit];
      } else if (hop === "star") {
        mk.star = b.on ? 1 : 0;
        log.push(starLog(M, pid, mk.star, now));
      } else return err("op");
      R.marks[pid] = mk; M.players[pid].m = 1;
      dirty.marks.push(pid); dirty.meta = true;
      log.push(markLog(R, pid, now));
      out.mk = mk;
      return done(out);
    }
    return err("action");
  }

  /* ---- reads ---- */
  function seeded(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return function () { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; h ^= h >>> 16; return (h >>> 0) / 4294967296; }; }

  function view(R, b, ctx) {
    var M = R.meta, now = ctx.now, tutor = !!(b.tk && b.tk === M.tk), me = M.players[b.pid];
    var subs = Object.keys(R.pieces).filter(function (p) { return M.players[p]; }).sort(function (x, y) { return R.pieces[x].at - R.pieces[y].at; });
    var later = M.phase === "feedback" || M.phase === "leaderboard";
    var v = {
      ok: true, v: M.v, now: now, code: M.code, campus: M.campus, cls: M.cls, title: M.title, type: M.type, prompt: M.prompt,
      mins: M.mins, rubric: M.rubric, phase: M.phase, endAt: M.endAt, focus: M.focus,
      joined: Object.keys(M.players).length, submitted: subs.length, voted: Object.keys(M.votes).length
    };
    function marksOut(pid) {
      var mk = R.marks[pid]; if (!mk) return null;
      return { h: mk.h, c: mk.c, r: M.rubric ? mk.r : {}, star: mk.star ? 1 : 0 };
    }
    var lb = board(R), byK = {};
    lb.forEach(function (r) { byK[r.k] = r; });
    if (tutor) {
      v.tutor = true;
      v.paper = Object.keys(M.players).filter(function (p) { return M.players[p].pp; }).length;
      v.ladder = M.ladder || { on: 0, term: "", anon: 0 };
      v.term = termOf(M.created).id;
      v.players = Object.keys(M.players).sort(function (x, y) { return M.players[x].at - M.players[y].at; }).map(function (pid) {
        var p = M.players[pid], pc = R.pieces[pid], r = byK[p.k];
        var o = { k: p.k, a: p.a, n: p.n, s: !!pc, voted: !!M.votes[pid] };
        if (p.pp) o.pp = 1;
        if (pc) { o.t = pc.t; o.w = pc.w; o.at = pc.at; o.up = pc.up; o.votes = r.votes; o.pts = r.pts; o.mk = marksOut(pid); }
        return o;
      });
      v.board = lb.map(function (r) { return { k: r.k, a: r.a, votes: r.votes, star: r.star, pts: r.pts, rub: r.rub, rank: r.rank }; });
      return v;
    }
    if (!me) return v;
    var mine = R.pieces[b.pid];
    v.me = { n: me.n, a: me.a, k: me.k, t: mine ? mine.t : "", w: mine ? mine.w : 0, at: mine ? mine.at : 0, up: mine ? mine.up : 0, vote: M.votes[b.pid] || "" };
    if (M.phase !== "writing") {
      var rnd = seeded(b.pid + M.code), order = subs.filter(function (p) { return p !== b.pid; });
      for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), x = order[i]; order[i] = order[j]; order[j] = x; }
      if (mine) order.unshift(b.pid);
      v.pieces = order.map(function (pid) {
        var p = M.players[pid], pc = R.pieces[pid], o = { k: p.k, a: p.a, t: pc.t, w: pc.w };
        if (pid === b.pid) o.mine = true;
        if (later && (p.k === M.focus || pid === b.pid)) o.mk = marksOut(pid);
        return o;
      });
    }
    if (M.phase === "leaderboard") {
      v.top = lb.slice(0, 3).map(function (r) { return { k: r.k, a: r.a, votes: r.votes, star: r.star, pts: r.pts, rank: r.rank }; });
      var mr = byK[me.k];
      if (mr) { v.me.rank = mr.rank; v.me.votes = mr.votes; v.me.star = mr.star; v.me.pts = mr.pts; }
      v.of = lb.length;
    }
    return v;
  }

  function handle(b, store, ctx) {
    b = b || {};
    var a = b.action;
    if (a === "wb.create") {
      var info = {
        campus: clean(b.campus, 40), cls: clean(b.cls, 40), title: clean(b.title, 80),
        type: TYPES.indexOf(b.type) >= 0 ? b.type : "", prompt: cleanText(b.prompt, 2000),
        mins: int(b.mins || 0), rubric: !!b.rubric
      };
      if (!info.campus) return err("campus", "Pick the campus");
      if (!info.cls) return err("cls", "Type the class");
      if (!info.title) return err("title", "Type the task title");
      if (!info.type) return err("type", "Pick the task type");
      if (!info.prompt) return err("prompt", "Type the prompt");
      if (!(info.mins >= 0 && info.mins <= 90)) return err("mins", "Pick a time limit");
      var code, tries = 0;
      do { code = makeCode(ctx.rand, 6); tries++; } while (store.exists(code) && tries < 50);
      var tk = makeCode(ctx.rand, 16), R = newRoom(code, tk, ctx.now, info);
      store.save(code, R, { meta: true, pieces: [], marks: [] });
      return { ok: true, code: code, tk: tk, log: [roomLog(R.meta, ctx.now)] };
    }
    var room = String(b.room || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!room) return err("room", "Room not found");
    if (a === "wb.state") {
      if (b.v) {
        var m = store.meta(room);
        if (!m) return err("room", "Room not found");
        if (String(m.v) === String(b.v)) return { ok: true, same: true, v: m.v, now: ctx.now, endAt: m.endAt, phase: m.phase };
      }
      var R0 = store.load(room);
      return R0 ? view(R0, b, ctx) : err("room", "Room not found");
    }
    if (a === "wb.ladder") {
      var RL = store.load(room);
      if (!RL) return err("room", "Room not found");
      if (b.tk !== RL.meta.tk) return err("tutor", "Tutor key needed");
      var ML = RL.meta, ck = classKey(ML.campus, ML.cls), now0 = termOf(ctx.now).id, here = termOf(ML.created).id;
      var want = String(b.term || (ML.ladder && ML.ladder.term) || here);
      if (!termLabel(want)) return err("term", "Pick a term");
      /* This room's own stars win over what the store has (the store can lag a write behind). */
      var mineRows = starRows(RL), seen = {};
      mineRows.forEach(function (r) { seen[r.key] = 1; });
      var all = (store.stars ? store.stars(ck) || [] : []).filter(function (r) { return !seen[r.key] && r.room !== ML.code; }).concat(mineRows);
      var L = ladder(all, ck, want), ts = {};
      L.terms.concat([now0, here, want]).forEach(function (t) { ts[t] = 1; });
      return {
        ok: true, campus: ML.campus, cls: ML.cls, term: want, label: termLabel(want), anon: ML.ladder && ML.ladder.anon ? 1 : 0,
        terms: Object.keys(ts).sort().reverse().map(function (t) { return { id: t, label: termLabel(t) }; }),
        rows: L.rows, stars: L.rows.reduce(function (s, r) { return s + r.stars; }, 0)
      };
    }
    var R1 = store.load(room);
    if (!R1) return err("room", "Room not found");
    if ((a === "wb.mark" || a === "wb.phase" || a === "wb.paper") && b.tk !== R1.meta.tk) return err("tutor", "Tutor key needed");
    var r = apply(R1, b, ctx);
    if (r.ok) { R1.meta.v++; store.save(room, R1, r.dirty); }
    delete r.dirty;
    r.v = R1.meta.v;
    return r;
  }

  return {
    handle: handle, apply: apply, view: view, board: board, locate: locate, words: words, cleanText: cleanText,
    classKey: classKey, firstName: firstName, termOf: termOf, termLabel: termLabel, starRow: starRow, starRows: starRows, ladder: ladder,
    TYPES: TYPES, GOOD: GOOD, FIX: FIX, CRIT: CRIT, PHASES: PHASES, LIMITS: LIMITS, STAR: STAR, RUB_MAX: RUB_MAX, MAX_TEXT: MAX_TEXT, MAX_PAPER: MAX_PAPER
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = WB;
