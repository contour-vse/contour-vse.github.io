/* Prompt Feud engine: pure rules shared by the browser (demo mode) and the Apps Script backend
   (backend Code.gs holds an exact copy of this file between the PFENGINE markers).
   No DOM, no network, no clock: the caller passes ctx = {now, rand}.
   A room R = {meta, data}:
     meta = {code, tk, created, v, campus, cls, phase, round, teams: [{name, score}], turn, strikes,
             steal: {order: [team], at} | null, bank, winner, ev, last: {n, kind, i, team} | null, hist: [{n, prompt, bank, winner, src}],
             players: {pid: {n, a (anonymous name), k (public key), t (team), at}}}
     data = {prompt, kind, src (set | live | own), answers: [{t, pts, alt: [], o (0 hidden, 1 won, 2 shown at the end), by}],
             guesses: [{id, team, pid, t, at, st (p pending, h hit, x strike, d dismissed), i}], subs: {pid: {t, at, up}}, undo: []}
   phase: lobby (teams join) | collect (LIVE: students send their own reading) | group (tutor groups readings into answers) |
          play (teams guess) | end (round over, points banked) | leaderboard
   store = {exists(code), meta(code) -> meta|null, load(code) -> R|null, save(code, R, dirty)}. */
var PF = (function () {
  var ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  var PHASES = ["lobby", "collect", "group", "play", "end", "leaderboard"];
  var TEAM_NAMES = ["Comets", "Falcons", "Rockets", "Sharks"];
  var COLOURS = ["Teal", "Coral", "Amber", "Indigo", "Jade", "Ruby", "Olive", "Plum", "Cobalt", "Mint", "Scarlet", "Violet", "Copper", "Silver", "Gold", "Saffron", "Crimson", "Azure", "Lilac", "Ochre"];
  var ANIMALS = ["Fox", "Owl", "Otter", "Koala", "Wombat", "Panda", "Falcon", "Lynx", "Gecko", "Heron", "Quokka", "Puffin", "Echidna", "Dingo", "Kestrel", "Possum", "Platypus", "Magpie", "Dolphin", "Emu", "Robin", "Seal"];
  var STRIKES = 3, TOTAL = 30, MIN_ANS = 3, MAX_ANS = 8, MAX_READ = 120, MAX_GUESS = 80, MAX_PROMPT = 300,
    MAX_ANS_T = 60, MAX_PLAYERS = 80, MAX_GUESSES = 60, MAX_UNDO = 10;
  var STOP = {};
  ("a an the to of and or in on at for is it its be by as are was with from that this these those your you their they them " +
    "his her he she we our my me i about into than then so not no someone something somebody thing things really very just get got being").split(" ").forEach(function (w) { STOP[w] = 1; });

  function err(code, msg) { return { ok: false, error: code, message: msg || code }; }
  function clean(s, max) { return String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max); }
  function makeCode(rand, len) {
    var s = "";
    for (var i = 0; i < (len || 6); i++) s += ALPHA.charAt(Math.floor(rand() * ALPHA.length));
    return s;
  }
  function int(x) { var n = Number(x); return Math.floor(n) === n ? n : NaN; }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }

  function newRoom(code, tk, now, info) {
    return {
      meta: {
        code: code, tk: tk, created: now, v: 1, campus: info.campus, cls: info.cls,
        phase: "lobby", round: 0, teams: info.teams.map(function (n) { return { name: n, score: 0 }; }),
        turn: 0, strikes: 0, steal: null, bank: 0, winner: -1, ev: 0, last: null, hist: [], players: {}
      },
      data: { prompt: "", kind: "", src: "", answers: [], guesses: [], subs: {}, undo: [] }
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
    return "Player " + (Object.keys(meta.players).length + 1);
  }
  function teamSizes(M) {
    var n = M.teams.map(function () { return 0; });
    for (var p in M.players) if (n[M.players[p].t] != null) n[M.players[p].t]++;
    return n;
  }
  function smallest(M) { var n = teamSizes(M), best = 0; for (var i = 1; i < n.length; i++) if (n[i] < n[best]) best = i; return best; }

  /* ---- fuzzy matching: suggests which answer a guess means (the tutor still confirms) ---- */
  function stem(w) {
    if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";
    if (w.length > 4 && /(ed|es|ly)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function tokens(s) {
    var out = [], seen = {};
    String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(" ").forEach(function (w) {
      if (!w || STOP[w]) return;
      w = stem(w); if (!seen[w]) { seen[w] = 1; out.push(w); }
    });
    return out;
  }
  function sim(a, b) {
    var A = tokens(a), B = tokens(b);
    if (!A.length || !B.length) return 0;
    var hit = 0;
    A.forEach(function (x) {
      for (var j = 0; j < B.length; j++) {
        var y = B[j];
        if (x === y || (x.length > 3 && y.length > 3 && (x.indexOf(y) === 0 || y.indexOf(x) === 0))) { hit++; break; }
      }
    });
    return hit / Math.min(A.length, B.length) * 0.7 + 2 * hit / (A.length + B.length) * 0.3;
  }
  /* [{i, s}] best first, only answers that look related (s from 0 to 1). */
  function suggest(answers, text) {
    var out = [];
    (answers || []).forEach(function (x, i) {
      var best = sim(text, x.t);
      (x.alt || []).forEach(function (a) { best = Math.max(best, sim(text, a) * 0.92); });
      if (best >= 0.34) out.push({ i: i, s: Math.round(best * 100) / 100 });
    });
    out.sort(function (x, y) { return y.s - x.s || x.i - y.i; });
    return out.slice(0, 3);
  }

  /* LIVE mode: the tutor's groups of student readings become the board.
     groups = [{t, alt: [], n}] (n = readings in the group); the biggest groups win, points out of 30. */
  function fromGroups(groups, size) {
    var list = (groups || []).filter(function (g) { return g && clean(g.t, MAX_ANS_T) && g.n > 0; });
    var total = list.reduce(function (s, g) { return s + g.n; }, 0);
    list = list.map(function (g, j) { return { g: g, j: j }; }).sort(function (x, y) { return y.g.n - x.g.n || x.j - y.j; })
      .slice(0, size || 6).map(function (x) { return x.g; });
    return list.map(function (g) {
      return { t: clean(g.t, MAX_ANS_T), pts: Math.max(1, Math.round(TOTAL * g.n / (total || 1))), alt: (g.alt || []).slice(0, 12).map(function (a) { return clean(a, MAX_READ); }).filter(Boolean), n: g.n };
    });
  }
  function checkAnswers(list) {
    if (!Array.isArray(list)) return null;
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var x = list[i] || {}, t = clean(x.t, MAX_ANS_T), p = int(x.pts);
      if (!t) continue;
      if (!(p >= 1 && p <= 99)) return null;
      out.push({ t: t, pts: p, alt: (Array.isArray(x.alt) ? x.alt : []).slice(0, 12).map(function (a) { return clean(a, MAX_READ); }).filter(Boolean), o: 0, by: -1, j: i });
    }
    if (out.length < MIN_ANS || out.length > MAX_ANS) return null;
    out.sort(function (x, y) { return y.pts - x.pts || x.j - y.j; });
    out.forEach(function (x) { delete x.j; });
    return out;
  }

  function active(M) { return M.steal ? M.steal.order[M.steal.at] : M.turn; }
  function pending(D) { for (var i = 0; i < D.guesses.length; i++) if (D.guesses[i].st === "p") return D.guesses[i]; return null; }

  function roomLog(R, now) {
    var M = R.meta, keep = { meta: M, data: { prompt: R.data.prompt, kind: R.data.kind, src: R.data.src, answers: R.data.answers, guesses: R.data.guesses, subs: R.data.subs, undo: [] } };
    var js = JSON.stringify(keep);
    if (js.length > 48000) { keep.data.subs = {}; keep.data.guesses = []; js = JSON.stringify(keep); }
    return { tab: "PFRooms", key: M.code, row: [M.code, M.tk, new Date(M.created), new Date(now), M.campus, M.cls, M.phase, M.round, js] };
  }
  function roundLog(R, now) {
    var M = R.meta, D = R.data, w = M.winner >= 0 ? M.teams[M.winner].name : "";
    return { tab: "PFRounds", key: M.code + ":" + M.round, row: [M.code + ":" + M.round, new Date(now), M.code, M.round, D.prompt, D.src, JSON.stringify(D.answers.map(function (x) { return { t: x.t, pts: x.pts, o: x.o, by: x.by }; })), w, M.phase === "end" ? M.bank : ""] };
  }
  function guessLog(R, g, now) {
    var M = R.meta, p = M.players[g.pid];
    var res = { p: "pending", h: "hit", x: "strike", d: "dismissed" }[g.st];
    return { tab: "PFGuesses", key: M.code + ":" + M.round + ":" + g.id, row: [M.code + ":" + M.round + ":" + g.id, new Date(now), M.code, M.round, M.teams[g.team] ? M.teams[g.team].name : "", g.pid || "tutor", p ? p.a : "", g.t, res, g.i >= 0 ? R.data.answers[g.i].t : ""] };
  }

  /* Undo keeps only what a judgement can change, so the room stays small. */
  function snap(R) {
    var M = R.meta, hr = null;
    M.hist.forEach(function (h) { if (h.n === M.round) hr = copy(h); });
    return { phase: M.phase, sc: M.teams.map(function (t) { return t.score; }), turn: M.turn, strikes: M.strikes, steal: copy(M.steal), bank: M.bank, winner: M.winner, hr: hr,
      as: R.data.answers.map(function (x) { return [x.o, x.by]; }), gs: R.data.guesses.map(function (g) { return [g.id, g.st, g.i]; }) };
  }
  function unsnap(R, u) {
    var M = R.meta, D = R.data, had = {};
    M.phase = u.phase; M.turn = u.turn; M.strikes = u.strikes; M.steal = u.steal; M.bank = u.bank; M.winner = u.winner;
    u.sc.forEach(function (s, i) { if (M.teams[i]) M.teams[i].score = s; });
    M.hist = M.hist.filter(function (h) { return h.n !== M.round; }); if (u.hr) M.hist.push(u.hr);
    M.hist.sort(function (x, y) { return x.n - y.n; });
    u.as.forEach(function (a, i) { if (D.answers[i]) { D.answers[i].o = a[0]; D.answers[i].by = a[1]; } });
    u.gs.forEach(function (g) { had[g[0]] = g; });
    D.guesses = D.guesses.filter(function (g) { return had[g.id]; });
    D.guesses.forEach(function (g) { g.st = had[g.id][1]; g.i = had[g.id][2]; });
  }
  function endRound(R, winner, log, now) {
    var M = R.meta;
    M.winner = winner; M.phase = "end";
    if (winner >= 0) M.teams[winner].score += M.bank;
    M.hist = M.hist.filter(function (h) { return h.n !== M.round; });
    M.hist.push({ n: M.round, prompt: R.data.prompt, bank: M.bank, winner: winner, src: R.data.src });
    log.push(roundLog(R, now));
  }
  function startRound(R, info, now) {
    var M = R.meta, D = R.data;
    M.strikes = 0; M.steal = null; M.bank = 0; M.winner = -1; M.last = null;
    D.prompt = info.prompt; D.kind = info.kind || ""; D.src = info.src || ""; D.answers = info.answers || []; D.guesses = []; D.undo = [];
    if (info.fresh) D.subs = {};
  }

  /* ---- writes ---- */
  function apply(R, b, ctx) {
    var M = R.meta, D = R.data, now = ctx.now, a = b.action, log = [];
    function done(extra) { log.push(roomLog(R, now)); var o = { ok: true, log: log }; for (var k in extra || {}) o[k] = extra[k]; return o; }
    function event(kind, i, team) { M.ev++; M.last = { n: M.ev, kind: kind, i: i, team: team }; }

    if (a === "pf.join") {
      var id = String(b.pid || "");
      if (!/^[A-Za-z0-9]{6,24}$/.test(id)) return err("pid");
      var name = clean(b.name, 20); if (!name) return err("name", "Type your first name");
      var p = M.players[id], t = b.team == null || b.team === "" ? -1 : int(b.team);
      if (t !== -1 && !(t >= 0 && t < M.teams.length)) return err("team", "Pick a team");
      if (!p) {
        if (Object.keys(M.players).length >= MAX_PLAYERS) return err("full", "This room is full");
        var k, ids = {}; for (var q in M.players) ids[M.players[q].k] = 1;
        do { k = makeCode(ctx.rand, 8); } while (ids[k]);
        p = M.players[id] = { n: name, a: anonFor(M, ctx.rand), k: k, t: t >= 0 ? t : smallest(M), at: now };
      } else {
        p.n = name;
        if (t >= 0 && t !== p.t) { if (M.phase === "play") return err("locked", "Teams are locked during a round"); p.t = t; }
      }
      return done({ pid: id, a: p.a, k: p.k, team: p.t });
    }

    var me = M.players[b.pid];

    if (a === "pf.team") {
      if (!me) return err("join", "Join the room first");
      var tt = int(b.team);
      if (!(tt >= 0 && tt < M.teams.length)) return err("team", "Pick a team");
      if (M.phase === "play") return err("locked", "Teams are locked during a round");
      me.t = tt;
      return done({ team: tt });
    }

    if (a === "pf.read") {
      if (!me) return err("join", "Join the room first");
      if (M.phase !== "collect") return err("closed", "Readings are closed");
      var rt = clean(b.text, MAX_READ); if (!rt) return err("empty", "Type your reading first");
      var s = D.subs[b.pid] || { at: now };
      s.t = rt; s.up = now; D.subs[b.pid] = s;
      log.push({ tab: "PFReadings", key: M.code + ":" + M.round + ":" + b.pid, row: [M.code + ":" + M.round + ":" + b.pid, new Date(now), M.code, M.round, b.pid, me.n, me.a, M.teams[me.t].name, rt] });
      return done({ t: rt });
    }

    if (a === "pf.guess") {
      var tutor = !!(b.tk && b.tk === M.tk);
      if (!tutor && !me) return err("join", "Join the room first");
      if (M.phase !== "play") return err("closed", "No round is being played");
      var team = tutor ? (b.team == null ? active(M) : int(b.team)) : me.t;
      if (team !== active(M)) return err("turn", M.teams[active(M)].name + " are guessing now");
      if (pending(D)) return err("wait", "Wait for the tutor to judge the last guess");
      var gt = clean(b.text, MAX_GUESS); if (!gt) return err("empty", "Type a guess first");
      if (D.guesses.length >= MAX_GUESSES) return err("full", "That is a lot of guesses already");
      var g = { id: makeCode(ctx.rand, 6), team: team, pid: tutor ? "" : b.pid, t: gt, at: now, st: "p", i: -1 };
      D.guesses.push(g); event("guess", -1, team);
      log.push(guessLog(R, g, now));
      return done({ id: g.id });
    }

    if (a === "pf.phase") {
      var op = b.op;
      if (op === "lobby" || op === "leaderboard") {
        if (M.phase === "play") return err("phase", "Finish this round first");
        M.phase = op;
      } else if (op === "collect") {
        var pr = clean(b.prompt, MAX_PROMPT);
        if ((M.phase === "collect" || M.phase === "group") && (!pr || pr === D.prompt)) { M.phase = "collect"; }
        else {
          if (M.phase === "play") return err("phase", "Finish this round first");
          if (!pr) return err("prompt", "Type the prompt");
          M.round++; startRound(R, { prompt: pr, kind: clean(b.kind, 30), src: "live", fresh: true }, now);
          M.phase = "collect"; M.turn = (M.round - 1) % M.teams.length;
        }
      } else if (op === "close") {
        if (M.phase !== "collect") return err("phase", "Readings are not open");
        M.phase = "group";
      } else if (op === "round") {
        if (M.phase === "play") return err("phase", "Finish this round first");
        var p2 = clean(b.prompt, MAX_PROMPT); if (!p2) return err("prompt", "Type the prompt");
        var ans = checkAnswers(b.answers); if (!ans) return err("answers", "A board needs 3 to 8 answers, each with points");
        var liveRound = M.phase === "group" || M.phase === "collect";
        if (!liveRound) M.round++;
        var src = ["set", "live", "own"].indexOf(b.src) >= 0 ? b.src : "own";
        startRound(R, { prompt: p2, kind: clean(b.kind, 30), src: src, answers: ans, fresh: false }, now);
        var st = b.turn == null || b.turn === "" ? (M.round - 1) % M.teams.length : int(b.turn);
        if (!(st >= 0 && st < M.teams.length)) return err("team", "Pick a team");
        M.turn = st; M.phase = "play"; event("start", -1, st);
        log.push(roundLog(R, now));
      } else if (op === "turn") {
        var nt = int(b.team);
        if (M.phase !== "play" || M.steal) return err("phase", "Pick the team before the steal");
        if (!(nt >= 0 && nt < M.teams.length)) return err("team", "Pick a team");
        var pg = pending(D); if (pg && pg.team !== nt) pg.st = "d";
        M.turn = nt; event("turn", -1, nt);
      } else if (op === "judge") {
        if (M.phase !== "play") return err("phase", "No round is being played");
        var i = int(b.ans); if (!(i >= -2 && i < D.answers.length)) return err("ans");
        var gu = pending(D);
        if (b.gid && (!gu || gu.id !== b.gid)) return err("gone", "That guess was already judged");
        if (i === -2) { if (!gu) return err("gone", "No guess to dismiss"); }
        else if (i >= 0 && D.answers[i].o) return err("open", "That answer is already up");
        D.undo.push(snap(R)); if (D.undo.length > MAX_UNDO) D.undo.shift();
        var team2 = active(M);
        if (!gu) { gu = { id: makeCode(ctx.rand, 6), team: team2, pid: "", t: i >= 0 ? D.answers[i].t : "", at: now, st: "p", i: -1 }; D.guesses.push(gu); }
        if (i === -2) { gu.st = "d"; event("dismiss", -1, team2); }
        else if (i >= 0) {
          gu.st = "h"; gu.i = i; D.answers[i].o = 1; D.answers[i].by = team2; M.bank += D.answers[i].pts;
          event("hit", i, team2);
          var left = D.answers.filter(function (x) { return !x.o; }).length;
          if (M.steal) { endRound(R, team2, log, now); M.last.won = 1; }
          else if (!left) { endRound(R, M.turn, log, now); M.last.won = 1; }
        } else {
          gu.st = "x";
          if (M.steal) {
            event("strike", -1, team2); M.steal.at++;
            if (M.steal.at >= M.steal.order.length) { endRound(R, M.turn, log, now); M.last.won = 1; }
          } else {
            M.strikes++; event("strike", -1, team2);
            if (M.strikes >= STRIKES) {
              var order = []; for (var j = 1; j < M.teams.length; j++) order.push((M.turn + j) % M.teams.length);
              M.steal = { order: order, at: 0 }; M.last.steal = 1;
            }
          }
        }
        log.push(guessLog(R, gu, now));
      } else if (op === "undo") {
        if (!D.undo.length) return err("undo", "Nothing to undo");
        if (M.phase !== "play" && M.phase !== "end") return err("phase", "Nothing to undo");
        unsnap(R, D.undo.pop());
        event("undo", -1, active(M));
        log.push(roundLog(R, now));
      } else if (op === "finish") {
        if (M.phase !== "play") return err("phase", "No round is being played");
        D.undo.push(snap(R)); if (D.undo.length > MAX_UNDO) D.undo.shift();
        var pg2 = pending(D); if (pg2) pg2.st = "d";
        var w = b.winner == null || b.winner === "" ? M.turn : int(b.winner);
        if (!(w >= -1 && w < M.teams.length)) return err("team", "Pick a team");
        endRound(R, w, log, now); event("win", -1, w);
      } else if (op === "reveal" || op === "revealAll") {
        if (M.phase !== "end") return err("phase", "Reveal answers once the round is over");
        if (op === "reveal") {
          var ri = int(b.ans); if (!(ri >= 0 && ri < D.answers.length)) return err("ans");
          if (!D.answers[ri].o) D.answers[ri].o = 2;
          event("reveal", ri, -1);
        } else { D.answers.forEach(function (x) { if (!x.o) x.o = 2; }); event("revealAll", -1, -1); }
        log.push(roundLog(R, now));
      } else return err("op");
      return done();
    }
    return err("action");
  }

  /* ---- reads ---- */
  function board(M) {
    var out = M.teams.map(function (t, i) { return { i: i, name: t.name, score: t.score, won: M.hist.filter(function (h) { return h.winner === i; }).length }; });
    out.sort(function (x, y) { return y.score - x.score || y.won - x.won || x.i - y.i; });
    out.forEach(function (r) { r.rank = 1 + out.filter(function (o) { return o.score > r.score; }).length; });
    return out;
  }

  function view(R, b, ctx) {
    var M = R.meta, D = R.data, tutor = !!(b.tk && b.tk === M.tk), me = M.players[b.pid];
    var sizes = teamSizes(M), anon = M.teams.map(function () { return []; });
    Object.keys(M.players).sort(function (x, y) { return M.players[x].at - M.players[y].at; }).forEach(function (p) { var pl = M.players[p]; if (anon[pl.t]) anon[pl.t].push(pl.a); });
    var shown = M.phase === "play" || M.phase === "end" || (tutor && M.phase !== "lobby");
    var pg = pending(D);
    var v = {
      ok: true, v: M.v, now: ctx.now, code: M.code, campus: M.campus, cls: M.cls, phase: M.phase, round: M.round,
      prompt: M.round ? D.prompt : "", kind: D.kind, src: D.src,
      teams: M.teams.map(function (t, i) { return { name: t.name, score: t.score, n: sizes[i], a: anon[i] }; }),
      turn: M.turn, active: M.phase === "play" ? active(M) : -1, strikes: M.strikes,
      steal: M.steal ? { team: active(M), left: M.steal.order.length - M.steal.at } : null,
      bank: M.bank, winner: M.winner, last: M.last, hist: M.hist, board: board(M),
      joined: Object.keys(M.players).length, reads: Object.keys(D.subs).length,
      tiles: shown ? D.answers.map(function (x) { return x.o ? { o: x.o, t: x.t, pts: x.pts, by: x.by } : { o: 0 }; }) : [],
      pending: pg ? { id: pg.id, team: pg.team, t: pg.t, a: M.players[pg.pid] ? M.players[pg.pid].a : "" } : null
    };
    if (tutor) {
      v.tutor = true;
      v.answers = D.answers;
      if (pg) v.pending.sug = suggest(D.answers, pg.t);
      v.players = Object.keys(M.players).sort(function (x, y) { return M.players[x].at - M.players[y].at; }).map(function (p) {
        var pl = M.players[p]; return { k: pl.k, a: pl.a, n: pl.n, t: pl.t, read: !!D.subs[p] };
      });
      v.subs = Object.keys(D.subs).filter(function (p) { return M.players[p]; }).sort(function (x, y) { return D.subs[x].at - D.subs[y].at; })
        .map(function (p) { return { k: M.players[p].k, a: M.players[p].a, n: M.players[p].n, t: D.subs[p].t }; });
      v.guesses = D.guesses.map(function (g) { var pl = M.players[g.pid]; return { id: g.id, team: g.team, t: g.t, a: pl ? pl.a : "", n: pl ? pl.n : "", st: g.st, i: g.i }; });
      v.undo = D.undo.length;
      return v;
    }
    if (!me) return v;
    v.me = { n: me.n, a: me.a, k: me.k, team: me.t, read: D.subs[b.pid] ? D.subs[b.pid].t : "" };
    v.mine = D.guesses.filter(function (g) { return g.team === me.t; }).map(function (g) { return { t: g.t, st: g.st, i: g.i, me: g.pid === b.pid }; });
    return v;
  }

  function handle(b, store, ctx) {
    b = b || {};
    var a = b.action;
    if (a === "pf.create") {
      var names = (Array.isArray(b.teams) ? b.teams : []).map(function (n, i) { return clean(n, 20) || TEAM_NAMES[i] || "Team " + (i + 1); });
      if (names.length < 2 || names.length > 4) return err("teams", "Pick 2 to 4 teams");
      var seen = {};
      for (var i = 0; i < names.length; i++) { if (seen[names[i].toLowerCase()]) return err("teams", "Give each team its own name"); seen[names[i].toLowerCase()] = 1; }
      var info = { campus: clean(b.campus, 40), cls: clean(b.cls, 40), teams: names };
      if (!info.campus) return err("campus", "Pick the campus");
      if (!info.cls) return err("cls", "Type the class");
      var code, tries = 0;
      do { code = makeCode(ctx.rand, 6); tries++; } while (store.exists(code) && tries < 50);
      var tk = makeCode(ctx.rand, 16), R = newRoom(code, tk, ctx.now, info);
      store.save(code, R, {});
      return { ok: true, code: code, tk: tk, log: [roomLog(R, ctx.now)] };
    }
    var room = String(b.room || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!room) return err("room", "Room not found");
    if (a === "pf.state") {
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
    if (a === "pf.phase" && b.tk !== R1.meta.tk) return err("tutor", "Tutor key needed");
    if (a === "pf.guess" && b.tk && b.tk !== R1.meta.tk) return err("tutor", "Tutor key needed");
    var r = apply(R1, b, ctx);
    if (r.ok) { R1.meta.v++; store.save(room, R1, {}); }
    r.v = R1.meta.v;
    return r;
  }

  return {
    handle: handle, apply: apply, view: view, board: board, suggest: suggest, fromGroups: fromGroups, tokens: tokens, clean: clean,
    PHASES: PHASES, TEAM_NAMES: TEAM_NAMES, STRIKES: STRIKES, TOTAL: TOTAL, MIN_ANS: MIN_ANS, MAX_ANS: MAX_ANS, MAX_READ: MAX_READ, MAX_GUESS: MAX_GUESS
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PF;
