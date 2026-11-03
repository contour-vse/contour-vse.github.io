/* Contour Live engine: pure game rules shared by the browser (demo mode) and
   the Apps Script backend (_backend/Code.gs holds an exact copy of this block).
   No DOM, no network, no clock: the caller passes ctx = {sets, points, sprintMs, now, rand},
   where sets[resource] = {bank, keys, explain}; each room uses the set of its resource.
   Solo games ("sprint" and "quiz") share one set of rules: individual, each answer locks,
   timer started by the tutor, results only after the tutor ends it.
   store = {load(code) -> snap|null, save(code, snap), exists(code) -> bool}. */
var Engine = (function () {
  var ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  var LETTERS = ["A", "B", "C", "D"];
  var DEFAULT_TEAMS = ["Comets", "Falcons", "Rockets", "Sharks", "Tigers", "Wolves"];
  var CAMPUSES = ["Glen Waverley", "Box Hill", "Narre Warren", "Springvale", "Bentleigh", "Epping", "CBD", "Point Cook", "Online"];
  var HOF_LINE = "Your names go up in the weekly Contour Hall of Fame";
  var PARTS = ["warmup", "challenge", "sprint", "quiz"];
  var SOLO = { sprint: { sp: "sp", a: "sa", fin: "fin", tab: "Sprint", name: "Exam Sprint" }, quiz: { sp: "qz", a: "qa", fin: "qfin", tab: "Quiz", name: "Quiz" } };
  function soloOf(snap, kind) {
    var k = SOLO[kind];
    if (!snap[k.sp]) { snap[k.sp] = { status: "idle", startAt: 0, endAt: 0 }; snap[k.a] = {}; snap[k.fin] = {}; }
    return { sp: snap[k.sp], a: snap[k.a], fin: snap[k.fin] };
  }
  function hasTeams(snap) { return !snap.parts || snap.parts.indexOf("warmup") >= 0 || snap.parts.indexOf("challenge") >= 0; }

  /* ISO week in Melbourne time (UTC+11 is close enough: no class runs Sunday 11pm). */
  function isoWeek(ms) {
    var d = new Date(ms + 11 * 3600000);
    var t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    var day = new Date(t).getUTCDay() || 7;
    var th = new Date(t + (4 - day) * 86400000);
    var y = th.getUTCFullYear();
    var wk = Math.ceil(((th - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
    return y + "-W" + (wk < 10 ? "0" : "") + wk;
  }

  function makeCode(rand, len) {
    var s = "";
    for (var i = 0; i < (len || 6); i++) s += ALPHA.charAt(Math.floor(rand() * ALPHA.length));
    return s;
  }

  function newRoom(code, tk, now, info) {
    info = info || {};
    var resource = info.resource || "y8-qr-1-1-wb", week = isoWeek(now);
    return {
      code: code, tk: tk, created: now, v: 1,
      campus: info.campus || "", cls: info.cls || "", resource: resource, week: week, weekId: week + ":" + resource,
      teams: DEFAULT_TEAMS.slice(),
      prize: { tutor: info.prize || "" },
      parts: info.parts || PARTS.slice(),
      mode: "lobby", round: null, qi: 0, revealed: false,
      rev: {}, players: {}, ta: {},
      sp: { status: "idle", startAt: 0, endAt: 0 },
      sa: {}, fin: {},
      qz: { status: "idle", startAt: 0, endAt: 0 }, qa: {}, qfin: {}
    };
  }

  function err(code, msg) { return { ok: false, error: code, message: msg || code }; }
  function clean(s, max) { return String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max); }
  function roundOf(ctx, qid) {
    for (var r in ctx.bank) if (ctx.bank[r].indexOf(qid) >= 0) return r;
    return null;
  }
  function currentQid(snap, ctx) {
    if (snap.mode !== "team" || !snap.round) return null;
    return ctx.bank[snap.round][snap.qi] || null;
  }

  function sprintStatus(snap, now, kind) {
    var sp = soloOf(snap, kind || "sprint").sp;
    if (sp.status === "running" && now >= sp.endAt) return "ended";
    return sp.status || "idle";
  }

  function teamScores(snap, ctx) {
    var out = snap.teams.map(function (n, i) { return { i: i, n: n, s: 0, p: 0 }; });
    for (var pid in snap.players) { var t = snap.players[pid].t; if (out[t]) out[t].p++; }
    for (var qid in snap.ta) {
      if (!snap.rev[qid]) continue;
      var r = roundOf(ctx, qid), pts = (ctx.points[r] || 1), key = ctx.keys[qid];
      var row = snap.ta[qid];
      for (var t2 in row) if (out[t2] && row[t2].c === key) out[t2].s += pts;
    }
    return out;
  }

  function rankOf(list, i) {
    var me = list[i]; if (!me) return 0;
    var r = 1;
    for (var k = 0; k < list.length; k++) if (list[k].s > me.s) r++;
    return r;
  }

  function sprintTable(snap, ctx, now, kind) {
    kind = kind || "sprint";
    var S = soloOf(snap, kind), ids = ctx.bank[kind], sp = S.sp, st = sprintStatus(snap, now, kind);
    var end = st === "ended" ? Math.min(sp.endAt, now) : now;
    var rows = [];
    for (var pid in S.a) {
      var a = S.a[pid], score = 0, n = 0;
      for (var j = 0; j < ids.length; j++) if (a[ids[j]]) { n++; if (a[ids[j]] === ctx.keys[ids[j]]) score++; }
      if (!n) continue;
      var p = snap.players[pid] || { n: "?", t: 0 };
      var fin = S.fin[pid] || end;
      rows.push({ pid: pid, n: p.n, t: p.t, score: score, answered: n, ms: Math.max(0, fin - sp.startAt), done: !!S.fin[pid] });
    }
    rows.sort(function (x, y) { return (y.score - x.score) || (x.ms - y.ms) || (x.n < y.n ? -1 : 1); });
    return rows;
  }

  function membersOf(snap, t) {
    var out = [];
    for (var pid in snap.players) if (snap.players[pid].t === t) out.push(snap.players[pid].n);
    return out;
  }
  /* Hall of Fame rows for this class: type "team" = winning team(s), "sprint" / "quiz" = champion. */
  function hofRows(snap, ctx, type) {
    var base = { weekId: snap.weekId, week: snap.week, resource: snap.resource, campus: snap.campus, cls: snap.cls, type: type, room: snap.code, at: ctx.now };
    var rows = [];
    if (type === "team") {
      var sc = teamScores(snap, ctx), best = 0;
      sc.forEach(function (t) { best = Math.max(best, t.s); });
      if (best > 0) sc.forEach(function (t) {
        if (t.s === best) rows.push(Object.assign({}, base, { team: t.n, names: membersOf(snap, t.i).join(", "), score: t.s, ms: 0 }));
      });
    } else {
      var top = sprintTable(snap, ctx, ctx.now, type)[0];
      if (top && top.score > 0) rows.push(Object.assign({}, base, { team: hasTeams(snap) ? (snap.teams[top.t] || "") : "", names: top.n, score: top.score, ms: top.ms, of: ctx.bank[type].length }));
    }
    return rows;
  }

  /* ---- writes ---- */
  function apply(snap, b, ctx) {
    var now = ctx.now, log = [];
    var a = b.action;
    if (a === "room.setTeams") {
      if (b.teams) {
        var names = (b.teams || []).map(function (x) { return clean(x, 24); }).filter(Boolean);
        if (names.length < 4 || names.length > 8) return err("teams", "Use 4 to 8 teams");
        snap.teams = names;
        for (var pid in snap.players) if (snap.players[pid].t >= names.length) snap.players[pid].t = 0;
        names.forEach(function (n, i) { log.push({ tab: "Teams", row: [new Date(now), snap.code, "team", i, n, "", ""] }); });
      }
      if (b.prize && b.prize.tutor != null) {
        var pz = clean(b.prize.tutor, 90);
        if (!pz) return err("prize", "Type the tutor's prize");
        snap.prize.tutor = pz;
      }
      return { ok: true, log: log };
    }
    if (a === "room.setPhase") {
      var op = b.op, list, so = /^(sprint|quiz)(Ready|Start|End)$/.exec(op || "");
      if (so && snap.parts.indexOf(so[1]) < 0) return err("part", "This class is not running the " + SOLO[so[1]].name);
      if (op === "lobby") { snap.mode = "lobby"; }
      else if (op === "round") {
        if (b.round !== "warmup" && b.round !== "challenge") return err("round");
        if (snap.parts.indexOf(b.round) < 0) return err("part", "This class is not running that round");
        snap.mode = "team"; snap.round = b.round; snap.qi = 0;
        snap.revealed = !!snap.rev[ctx.bank[b.round][0]];
      } else if (op === "next" || op === "prev") {
        if (snap.mode !== "team") return err("mode");
        list = ctx.bank[snap.round];
        snap.qi = Math.max(0, Math.min(list.length - 1, snap.qi + (op === "next" ? 1 : -1)));
        snap.revealed = !!snap.rev[list[snap.qi]];
      } else if (op === "reveal") {
        var q = currentQid(snap, ctx); if (!q) return err("mode");
        snap.revealed = true; snap.rev[q] = 1;
      } else if (op === "teamEnd") {
        snap.mode = "teamDone"; snap.teamEndAt = now;
        log.push({ tab: "HallOfFame", key: snap.code + "|team", rows: hofRows(snap, ctx, "team") });
      } else if (so) {
        var kind = so[1], K = SOLO[kind], S = soloOf(snap, kind);
        if (so[2] === "Ready") {
          snap.mode = kind;
          if (S.sp.status === "idle") S.sp.status = "ready";
        } else if (so[2] === "Start") {
          var st = sprintStatus(snap, now, kind);
          if (st === "running") return err("running");
          if (st === "ended" && !b.restart) return err("ended", K.name + " already ended");
          snap.mode = kind;
          snap[K.a] = {}; snap[K.fin] = {};
          snap[K.sp] = { status: "running", startAt: now, endAt: now + (ctx.sprintMs || 720000) };
        } else {
          if (S.sp.status !== "running") return err("mode");
          S.sp.status = "ended"; S.sp.endAt = Math.min(S.sp.endAt, now);
          log.push({ tab: "HallOfFame", key: snap.code + "|" + kind, rows: hofRows(snap, ctx, kind) });
        }
      } else return err("op");
      log.push({ tab: "Rooms", row: null });
      return { ok: true, log: log };
    }
    if (a === "join") {
      var id = String(b.pid || "");
      if (!/^[A-Za-z0-9]{6,24}$/.test(id)) return err("pid");
      var name = clean(b.name, 20); if (!name) return err("name", "Type your first name");
      var t = hasTeams(snap) ? parseInt(b.team, 10) : 0;
      if (!(t >= 0 && t < snap.teams.length)) return err("team", "Pick a team");
      snap.players[id] = { n: name, t: t, at: (snap.players[id] && snap.players[id].at) || now };
      log.push({ tab: "Teams", row: [new Date(now), snap.code, "player", id, name, t, snap.teams[t]] });
      return { ok: true, pid: id, log: log };
    }
    var me = snap.players[b.pid];
    if (!me) return err("join", "Join the room first");
    if (a === "team.answer") {
      var cq = currentQid(snap, ctx);
      if (!cq || b.qid !== cq) return err("moved", "That question has closed");
      if (snap.revealed) return err("revealed", "Answer already shown");
      if (LETTERS.indexOf(b.choice) < 0) return err("choice");
      var row = snap.ta[cq] || (snap.ta[cq] = {});
      if (row[me.t]) return { ok: false, error: "locked", locked: { c: row[me.t].c, by: row[me.t].by } };
      row[me.t] = { c: b.choice, by: me.n, at: now };
      log.push({ tab: "Answers", row: [new Date(now), snap.code, snap.round, cq, me.t, snap.teams[me.t], b.choice, b.pid, me.n, b.choice === ctx.keys[cq]] });
      return { ok: true, locked: { c: b.choice, by: me.n }, log: log };
    }
    var sa = /^(sprint|quiz)\.(answer|finish)$/.exec(a || "");
    if (sa) {
      var kd = sa[1] === "quiz" || b.kind === "quiz" ? "quiz" : "sprint", KS = SOLO[kd], SS = soloOf(snap, kd);
      if (sprintStatus(snap, now, kd) !== "running" && !(SS.sp.status === "running" && now < SS.sp.endAt + 3000)) return err("closed", "The " + KS.name + " is not running");
      if (SS.fin[b.pid]) return err("finished", "You have finished");
      var mine = SS.a[b.pid] || (SS.a[b.pid] = {});
      var tn = hasTeams(snap) ? snap.teams[me.t] : "";
      if (sa[2] === "finish") {
        SS.fin[b.pid] = now;
        log.push({ tab: KS.tab, row: [new Date(now), snap.code, b.pid, me.n, tn, "FINISH", "", ""] });
        return { ok: true, log: log };
      }
      if (ctx.bank[kd].indexOf(b.qid) < 0) return err("qid");
      if (LETTERS.indexOf(b.choice) < 0) return err("choice");
      if (mine[b.qid]) return { ok: false, error: "locked", mine: mine };
      mine[b.qid] = b.choice;
      var count = 0; for (var k in mine) count++;
      if (count >= ctx.bank[kd].length) SS.fin[b.pid] = now;
      log.push({ tab: KS.tab, row: [new Date(now), snap.code, b.pid, me.n, tn, b.qid, b.choice, b.choice === ctx.keys[b.qid]] });
      return { ok: true, mine: mine, log: log };
    }
    return err("action");
  }

  /* ---- reads ---- */
  function view(snap, b, ctx) {
    var now = ctx.now, tutor = !!(b.tk && b.tk === snap.tk);
    var scores = teamScores(snap, ctx);
    var v = {
      ok: true, v: snap.v, now: now, code: snap.code, mode: snap.mode, round: snap.round, qi: snap.qi,
      revealed: snap.revealed, prize: snap.prize, hof: HOF_LINE,
      campus: snap.campus, cls: snap.cls, resource: snap.resource, week: snap.week, weekId: snap.weekId,
      parts: snap.parts, teamMode: hasTeams(snap),
      teams: scores.map(function (t) { return { n: t.n, s: t.s, p: t.p }; })
    };
    if (snap.mode === "teamDone") {
      var best = 0; scores.forEach(function (t) { best = Math.max(best, t.s); });
      v.winners = best > 0 ? scores.filter(function (t) { return t.s === best; }).map(function (t) { return { n: t.n, s: t.s, names: membersOf(snap, t.i) }; }) : [];
    }
    var q = currentQid(snap, ctx);
    if (q) {
      var row = snap.ta[q] || {};
      v.qid = q; v.locked = Object.keys(row).map(Number);
      if (snap.revealed) {
        v.key = ctx.keys[q]; v.counts = { A: 0, B: 0, C: 0, D: 0 };
        for (var t in row) v.counts[row[t].c]++;
        v.picks = {}; for (var t3 in row) v.picks[t3] = row[t3].c;
      }
    }
    var me = snap.players[b.pid], tables = {};
    if (me) {
      v.me = { n: me.n, t: me.t, rank: rankOf(scores, me.t), solo: {} };
      if (q && snap.ta[q] && snap.ta[q][me.t]) v.me.lock = { c: snap.ta[q][me.t].c, by: snap.ta[q][me.t].by };
    }
    ["sprint", "quiz"].forEach(function (kind) {
      var S = soloOf(snap, kind), st = sprintStatus(snap, now, kind), table = null;
      var o = v[kind] = { status: st, closed: S.sp.status === "ended", startAt: S.sp.startAt, endAt: S.sp.endAt, n: ctx.bank[kind].length, finished: Object.keys(S.fin).length };
      if (st === "running" || st === "ended") {
        var answered = 0, people = 0;
        for (var pid in S.a) { var c = Object.keys(S.a[pid]).length; if (c) { people++; answered += c; } }
        o.answered = answered; o.people = people;
      }
      if (st === "ended") {
        table = sprintTable(snap, ctx, now, kind);
        o.top = table.slice(0, 5).map(function (r) { return { n: r.n, team: hasTeams(snap) ? (snap.teams[r.t] || "") : "", score: r.score, ms: r.ms }; });
        o.keys = {}; ctx.bank[kind].forEach(function (id) { o.keys[id] = ctx.keys[id]; });
        if (ctx.explain) { o.explain = {}; ctx.bank[kind].forEach(function (id) { if (ctx.explain[id]) o.explain[id] = ctx.explain[id]; }); }
      }
      if (me) {
        var m = v.me.solo[kind] = { ans: S.a[b.pid] || {}, fin: !!S.fin[b.pid] };
        if (table) {
          for (var i = 0; i < table.length; i++) if (table[i].pid === b.pid) { m.score = table[i].score; m.place = i + 1; m.ms = table[i].ms; }
          m.of = table.length;
        }
      }
    });
    if (tutor) {
      v.tutor = true;
      v.players = Object.keys(snap.players).length;
      v.roster = snap.teams.map(function () { return []; });
      for (var p2 in snap.players) { var pl = snap.players[p2]; if (v.roster[pl.t]) v.roster[pl.t].push(pl.n); }
    }
    return v;
  }

  /* Hall of Fame summaries from rows of one week.
     classes: each class's best team score, sorted. campuses: average winning team score per campus
     (an average, so a campus with 1 class is not behind one with 6). */
  function rankClasses(rows) {
    var byRoom = {}, list = [];
    rows.forEach(function (r) {
      if (r.type !== "team") return;
      var c = byRoom[r.room];
      if (!c) { c = byRoom[r.room] = { room: r.room, campus: r.campus, cls: r.cls, score: r.score, teams: [] }; list.push(c); }
      c.score = Math.max(c.score, r.score); c.teams.push({ team: r.team, names: r.names });
    });
    list.sort(function (x, y) { return (y.score - x.score) || (x.cls < y.cls ? -1 : 1); });
    list.forEach(function (c) { c.rank = 1 + list.filter(function (o) { return o.score > c.score; }).length; });
    var camp = {}, cl = [];
    list.forEach(function (c) {
      var k = camp[c.campus]; if (!k) { k = camp[c.campus] = { campus: c.campus, total: 0, n: 0 }; cl.push(k); }
      k.total += c.score; k.n++;
    });
    cl.forEach(function (k) { k.avg = Math.round(k.total / k.n * 10) / 10; });
    cl.sort(function (x, y) { return (y.avg - x.avg) || (y.n - x.n) || (x.campus < y.campus ? -1 : 1); });
    cl.forEach(function (k) { k.rank = 1 + cl.filter(function (o) { return o.avg > k.avg; }).length; });
    return { classes: list, campuses: cl };
  }

  /* Pick one week's rows; default is the newest week. */
  function hofPick(all, week) {
    var seen = {}, weeks = [];
    all.forEach(function (r) { if (!seen[r.weekId]) { seen[r.weekId] = 1; weeks.push(r.weekId); } });
    weeks.sort().reverse();
    var w = week && seen[week] ? week : (weeks[0] || "");
    return { ok: true, week: w, weeks: weeks, rows: all.filter(function (r) { return r.weekId === w; }) };
  }

  /* ctx for one resource's question set (null if that set does not exist). */
  function withSet(ctx, res) {
    if (!ctx.sets) return ctx;
    var st = ctx.sets[res]; if (!st) return null;
    var o = {}; for (var k in ctx) o[k] = ctx[k];
    o.bank = st.bank; o.keys = st.keys; o.explain = st.explain || {};
    return o;
  }

  function handle(b, store, ctx0) {
    b = b || {};
    var a = b.action, ctx = ctx0;
    if (a === "room.create") {
      var info = { campus: clean(b.campus, 40), cls: clean(b.cls, 40), resource: clean(b.resource, 40).replace(/[^A-Za-z0-9-]/g, "") || "y8-qr-1-1-wb", prize: clean(b.prize, 90) };
      if (b.parts) {
        info.parts = PARTS.filter(function (p) { return b.parts.indexOf(p) >= 0; });
        if (!info.parts.length) return err("parts", "Pick at least one part");
      }
      if (!info.campus) return err("campus", "Pick the campus");
      if (!info.cls) return err("cls", "Type the class");
      if (!info.prize) return err("prize", "Type the tutor's prize");
      ctx = withSet(ctx0, info.resource);
      if (!ctx) return err("resource", "No questions for " + info.resource);
      if (!info.parts) info.parts = PARTS.filter(function (p) { return (ctx.bank[p] || []).length; });
      info.parts = info.parts.filter(function (p) { return (ctx.bank[p] || []).length; });
      if (!info.parts.length) return err("parts", "That resource has none of those parts");
      var code, tries = 0;
      do { code = makeCode(ctx.rand, 6); tries++; } while (store.exists(code) && tries < 50);
      var tk = makeCode(ctx.rand, 16);
      var snap = newRoom(code, tk, ctx.now, info);
      store.save(code, snap);
      return { ok: true, code: code, tk: tk, log: [{ tab: "Rooms", row: null, code: code }] };
    }
    var room = String(b.room || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    var s = room && store.load(room);
    if (!s) return err("room", "Room not found");
    ctx = withSet(ctx0, s.resource);
    if (!ctx) return err("resource", "No questions for " + s.resource);
    if (a === "state") return view(s, b, ctx);
    if (a.indexOf("room.") === 0 && b.tk !== s.tk) return err("tutor", "Tutor key needed");
    var r = apply(s, b, ctx);
    if (r.ok) { s.v++; store.save(room, s); }
    r.v = s.v;
    return r;
  }

  return {
    handle: handle, apply: apply, view: view, newRoom: newRoom, makeCode: makeCode,
    teamScores: teamScores, sprintTable: sprintTable, sprintStatus: sprintStatus,
    hofRows: hofRows, hofPick: hofPick, isoWeek: isoWeek, rankClasses: rankClasses,
    soloOf: soloOf, withSet: withSet, hasTeams: hasTeams, PARTS: PARTS, SOLO: SOLO,
    DEFAULT_TEAMS: DEFAULT_TEAMS, CAMPUSES: CAMPUSES, HOF_LINE: HOF_LINE
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Engine;
