/* Contour Live client: talks to the Apps Script backend, or runs the same engine locally in demo mode.
   Needs: ../config.js (CONTOUR_ENDPOINT), questions.js, engine.js, and keys.js for demo mode. */
var Live = (function () {
  var EP = String(window.CONTOUR_ENDPOINT || "").trim();
  var demo = !EP;
  var DB_KEY = "contour-live-demo-db";
  var chan = null;
  try { chan = new BroadcastChannel("contour-live"); } catch (e) { chan = null; }
  var listeners = [];
  function changed() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }
  if (chan) chan.onmessage = changed;
  window.addEventListener("storage", function (e) { if (e.key === DB_KEY) changed(); });

  function ctx() {
    var sets = {}, K = window.DEMO_KEYS || {}, E = window.DEMO_EXPLAIN || {};
    for (var res in window.QUESTIONS) {
      var Q = window.QUESTIONS[res], bank = {};
      ["warmup", "challenge", "sprint", "quiz"].forEach(function (p) { bank[p] = (Q[p] || []).map(function (q) { return q.id; }); });
      sets[res] = { bank: bank, keys: K[res] || {}, explain: E[res] || {} };
    }
    return { sets: sets, points: { warmup: 1, challenge: 3, sprint: 1, quiz: 1 }, sprintMs: 12 * 60 * 1000, now: Date.now(), rand: Math.random };
  }
  function readDb() { try { return JSON.parse(localStorage.getItem(DB_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function writeDb(db) { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) {} }

  function demoCall(body) {
    var db = readDb(), wrote = false;
    db.rooms = db.rooms || {};
    var store = {
      exists: function (c) { return !!db.rooms[c]; },
      load: function (c) { return db.rooms[c] ? JSON.parse(JSON.stringify(db.rooms[c])) : null; },
      save: function (c, s) { db.rooms[c] = s; wrote = true; }
    };
    var res = Engine.handle(body, store, ctx());
    (res.log || []).forEach(function (l) {
      if (l.tab !== "HallOfFame") return;
      var k = String(l.key).split("|");
      db.hof = (db.hof || []).filter(function (r) { return !(r.room === k[0] && r.type === k[1]); }).concat(l.rows || []);
      wrote = true;
    });
    delete res.log;
    if (wrote) { writeDb(db); if (chan) chan.postMessage("x"); changed(); }
    return Promise.resolve(JSON.parse(JSON.stringify(res)));
  }

  function call(action, body) {
    body = Object.assign({ action: action }, body || {});
    if (demo) return demoCall(body);
    return fetch(EP, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: "network", message: "No connection, try again" }; });
  }
  function state(room, extra) {
    var p = Object.assign({ action: "state", room: room }, extra || {});
    if (demo) return demoCall(p);
    var qs = Object.keys(p).filter(function (k) { return p[k] != null && p[k] !== ""; })
      .map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(p[k]); }).join("&");
    return fetch(EP + (EP.indexOf("?") >= 0 ? "&" : "?") + qs).then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: "network" }; });
  }

  /* Hall of Fame rows for one week id (or the newest week). */
  function hallOfFame(week) {
    if (demo) return Promise.resolve(Engine.hofPick(readDb().hof || [], week));
    return fetch(EP + (EP.indexOf("?") >= 0 ? "&" : "?") + "action=hallOfFame" + (week ? "&week=" + encodeURIComponent(week) : ""))
      .then(function (r) { return r.json(); }).catch(function () { return { ok: false, error: "network" }; });
  }

  /* "2026-W45:y8-qr-1-1-wb" -> {week:"Week 45", dates:"2 to 8 Nov", title:"Advanced Quantitative Reasoning 1.1 Workbook"} */
  function weekLabel(id) {
    var m = /^(\d{4})-W(\d{2}):?(.*)$/.exec(id || ""); if (!m) return { week: id || "", dates: "", title: "" };
    var y = +m[1], w = +m[2], jan4 = Date.UTC(y, 0, 4), d4 = new Date(jan4).getUTCDay() || 7;
    var mon = new Date(jan4 + ((w - 1) * 7 - (d4 - 1)) * 86400000), sun = new Date(mon.getTime() + 6 * 86400000);
    var M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var dates = mon.getUTCDate() + (mon.getUTCMonth() !== sun.getUTCMonth() ? " " + M[mon.getUTCMonth()] : "") + " to " + sun.getUTCDate() + " " + M[sun.getUTCMonth()];
    var R = window.FEEDBACK_RESOURCES || {}, QS = window.QUESTIONS || {};
    var title = QS[m[3]] && QS[m[3]].title ? QS[m[3]].title : (R[m[3]] ? R[m[3]].title : m[3]);
    return { week: "Week " + w, dates: dates, title: title };
  }

  /* Poll every 1.5 s (and instantly on demo changes). onState(view) is called with each fresh view. */
  function poll(getArgs, onState) {
    var busy = false, timer = null;
    function tick() {
      var a = getArgs(); if (!a || !a.room || busy) return;
      busy = true;
      state(a.room, a.extra).then(function (v) { busy = false; onState(v); }, function () { busy = false; });
    }
    timer = setInterval(tick, 1500);
    listeners.push(tick);
    tick();
    return { now: tick, stop: function () { clearInterval(timer); } };
  }

  function uid() {
    var a = "abcdefghjkmnpqrstuvwxyz23456789", s = "";
    for (var i = 0; i < 12; i++) s += a.charAt(Math.floor(Math.random() * a.length));
    return s;
  }
  function ls(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; }
  }
  /* Student identity: per tab in demo mode (so several tabs on one computer are different students), per device when live. */
  function mine(k, v) {
    var st; try { st = demo ? sessionStorage : localStorage; } catch (e) { return null; }
    try { if (v === undefined) return st.getItem(k); if (v === null) st.removeItem(k); else st.setItem(k, v); } catch (e) { return null; }
  }
  /* The question set of the current room (call useSet with the room's resource). */
  var curSet = null;
  function useSet(res) { if (window.QUESTIONS[res]) curSet = res; return Q(); }
  function Q() {
    var all = window.QUESTIONS;
    if (!curSet || !all[curSet]) curSet = all["y8-qr-1-1-wb"] ? "y8-qr-1-1-wb" : Object.keys(all)[0];
    var st = all[curSet];
    ["warmup", "challenge", "sprint", "quiz"].forEach(function (p) { if (!st[p]) st[p] = []; });
    return st;
  }
  /* Short label for a solo question: its workbook number if it has one, else Q1, Q2... */
  function qnum(q, i) { return q && q.label ? q.label.replace(/^Workbook /, "") : "Q" + (i + 1); }
  function byId(id) {
    var st = Q();
    for (var r in st) if (Array.isArray(st[r])) for (var i = 0; i < st[r].length; i++) if (st[r][i].id === id) return st[r][i];
    return null;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function imgs(q, base) {
    if (!q || !q.img) return "";
    var list = Array.isArray(q.img) ? q.img : [q.img];
    return list.map(function (f) { return '<img class="qimg" src="' + base + "img/" + esc(f) + '" alt="">'; }).join("");
  }
  function clock(ms) {
    ms = Math.max(0, ms); var s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
  }
  return { demo: demo, call: call, state: state, hallOfFame: hallOfFame, weekLabel: weekLabel, useSet: useSet, Q: Q, qnum: qnum, poll: poll, uid: uid, ls: ls, mine: mine, byId: byId, esc: esc, imgs: imgs, clock: clock, LETTERS: ["A", "B", "C", "D"] };
})();
