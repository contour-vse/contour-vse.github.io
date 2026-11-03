/* Contour Live engine: pure game rules shared by the browser (demo mode) and
   the Apps Script backend (_backend/Code.gs holds an exact copy of this block).
   No DOM, no network, no clock: the caller passes ctx = {bank, keys, points, sprintMs, now, rand}.
   store = {load(code) -> snap|null, save(code, snap), exists(code) -> bool}. */
var Engine = (function () {
  var ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  var LETTERS = ["A", "B", "C", "D"];
  var DEFAULT_TEAMS = ["Comets", "Falcons", "Rockets", "Sharks", "Tigers", "Wolves"];
  var CAMPUSES = ["Glen Waverley", "Box Hill", "Narre Warren", "Springvale", "Bentleigh", "Epping", "CBD", "Point Cook", "Online"];
  var HOF_LINE = "Your names go up in the weekly Contour Hall of Fame";

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
      mode: "lobby", round: null, qi: 0, revealed: false,
      rev: {}, players: {}, ta: {},
      sp: { status: "idle", startAt: 0, endAt: 0 },
      sa: {}, fin: {}
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

  function sprintStatus(snap, now) {
    var sp = snap.sp || {};
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

  function sprintTable(snap, ctx, now) {
    var ids = ctx.bank.sprint, sp = snap.sp, st = sprintStatus(snap, now);
    var end = st === "ended" ? Math.min(sp.endAt, now) : now;
    var rows = [];
    for (var pid in snap.sa) {
      var a = snap.sa[pid], score = 0, n = 0;
      for (var j = 0; j < ids.length; j++) if (a[ids[j]]) { n++; if (a[ids[j]] === ctx.keys[ids[j]]) score++; }
      if (!n) continue;
      var p = snap.players[pid] || { n: "?", t: 0 };
      var fin = snap.fin[pid] || end;
      rows.push({ pid: pid, n: p.n, t: p.t, score: score, answered: n, ms: Math.max(0, fin - sp.startAt), done: !!snap.fin[pid] });
    }
    rows.sort(function (x, y) { return (y.score - x.score) || (x.ms - y.ms) || (x.n < y.n ? -1 : 1); });
    return rows;
  }

  function membersOf(snap, t) {
    var out = [];
    for (var pid in snap.players) if (snap.players[pid].t === t) out.push(snap.players[pid].n);
    return out;
  }
  /* Hall of Fame rows for this class: type "team" = winning team(s), "sprint" = champion. */
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
      var top = sprintTable(snap, ctx, ctx.now)[0];
      if (top && top.score > 0) rows.push(Object.assign({}, base, { team: snap.teams[top.t] || "", names: top.n, score: top.score, ms: top.ms }));
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
      var op = b.op, list;
      if (op === "lobby") { snap.mode = "lobby"; }
      else if (op === "round") {
        if (!ctx.bank[b.round] || b.round === "sprint") return err("round");
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
      } else if (op === "sprintReady") {
        snap.mode = "sprint";
        if (snap.sp.status === "idle") snap.sp.status = "ready";
      } else if (op === "sprintStart") {
        var st = sprintStatus(snap, now);
        if (st === "running") return err("running");
        if (st === "ended" && !b.restart) return err("ended", "Sprint already ended");
        snap.mode = "sprint";
        snap.sa = {}; snap.fin = {};
        snap.sp = { status: "running", startAt: now, endAt: now + (ctx.sprintMs || 720000) };
      } else if (op === "sprintEnd") {
        if (snap.sp.status !== "running") return err("mode");
        snap.sp.status = "ended"; snap.sp.endAt = Math.min(snap.sp.endAt, now);
        log.push({ tab: "HallOfFame", key: snap.code + "|sprint", rows: hofRows(snap, ctx, "sprint") });
      } else return err("op");
      log.push({ tab: "Rooms", row: null });
      return { ok: true, log: log };
    }
    if (a === "join") {
      var id = String(b.pid || "");
      if (!/^[A-Za-z0-9]{6,24}$/.test(id)) return err("pid");
      var name = clean(b.name, 20); if (!name) return err("name", "Type your first name");
      var t = parseInt(b.team, 10);
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
    if (a === "sprint.answer" || a === "sprint.finish") {
      if (sprintStatus(snap, now) !== "running" && !(snap.sp.status === "running" && now < snap.sp.endAt + 3000)) return err("closed", "The sprint is not running");
      if (snap.fin[b.pid]) return err("finished", "You have finished");
      var mine = snap.sa[b.pid] || (snap.sa[b.pid] = {});
      if (a === "sprint.finish") {
        snap.fin[b.pid] = now;
        log.push({ tab: "Sprint", row: [new Date(now), snap.code, b.pid, me.n, snap.teams[me.t], "FINISH", "", ""] });
        return { ok: true, log: log };
      }
      if (ctx.bank.sprint.indexOf(b.qid) < 0) return err("qid");
      if (LETTERS.indexOf(b.choice) < 0) return err("choice");
      if (mine[b.qid]) return { ok: false, error: "locked", mine: mine };
      mine[b.qid] = b.choice;
      var count = 0; for (var k in mine) count++;
      if (count >= ctx.bank.sprint.length) snap.fin[b.pid] = now;
      log.push({ tab: "Sprint", row: [new Date(now), snap.code, b.pid, me.n, snap.teams[me.t], b.qid, b.choice, b.choice === ctx.keys[b.qid]] });
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
    var st = sprintStatus(snap, now), table = null;
    v.sprint = { status: st, closed: snap.sp.status === "ended", startAt: snap.sp.startAt, endAt: snap.sp.endAt, n: ctx.bank.sprint.length, finished: Object.keys(snap.fin).length };
    if (st === "running" || st === "ended") {
      var answered = 0, people = 0;
      for (var pid in snap.sa) { var c = Object.keys(snap.sa[pid]).length; if (c) { people++; answered += c; } }
      v.sprint.answered = answered; v.sprint.people = people;
    }
    if (st === "ended") {
      table = sprintTable(snap, ctx, now);
      v.sprint.top = table.slice(0, 5).map(function (r) { return { n: r.n, team: snap.teams[r.t] || "", score: r.score, ms: r.ms }; });
      v.sprint.keys = {}; ctx.bank.sprint.forEach(function (id) { v.sprint.keys[id] = ctx.keys[id]; });
    }
    var me = snap.players[b.pid];
    if (me) {
      v.me = { n: me.n, t: me.t, rank: rankOf(scores, me.t) };
      if (q && snap.ta[q] && snap.ta[q][me.t]) v.me.lock = { c: snap.ta[q][me.t].c, by: snap.ta[q][me.t].by };
      v.me.sprint = snap.sa[b.pid] || {};
      v.me.fin = !!snap.fin[b.pid];
      if (table) {
        for (var i = 0; i < table.length; i++) if (table[i].pid === b.pid) { v.me.score = table[i].score; v.me.place = i + 1; v.me.ms = table[i].ms; }
        v.me.of = table.length;
      }
    }
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

  function handle(b, store, ctx) {
    b = b || {};
    var a = b.action;
    if (a === "room.create") {
      var info = { campus: clean(b.campus, 40), cls: clean(b.cls, 40), resource: clean(b.resource, 40).replace(/[^A-Za-z0-9-]/g, "") || "y8-qr-1-1-wb", prize: clean(b.prize, 90) };
      if (!info.campus) return err("campus", "Pick the campus");
      if (!info.cls) return err("cls", "Type the class");
      if (!info.prize) return err("prize", "Type the tutor's prize");
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
    DEFAULT_TEAMS: DEFAULT_TEAMS, CAMPUSES: CAMPUSES, HOF_LINE: HOF_LINE
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Engine;
