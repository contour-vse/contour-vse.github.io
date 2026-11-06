/* Prompt Feud client: talks to the Apps Script backend (pf.* actions), or runs pf-engine.js locally in demo mode.
   Needs: ../config.js (CONTOUR_ENDPOINT) and pf-engine.js. */
var Net = (function () {
  var EP = String(window.CONTOUR_ENDPOINT || "").trim();
  var demo = !EP;
  var DB_KEY = "contour-pf-demo-db";
  var chan = null;
  try { chan = new BroadcastChannel("contour-pf"); } catch (e) { chan = null; }
  var listeners = [];
  function changed() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }
  if (chan) chan.onmessage = changed;
  window.addEventListener("storage", function (e) { if (e.key === DB_KEY) changed(); });

  function readDb() { try { return JSON.parse(localStorage.getItem(DB_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function writeDb(db) { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) {} }
  function demoCall(body) {
    var db = readDb(), wrote = false;
    db.rooms = db.rooms || {};
    var copy = function (o) { return o ? JSON.parse(JSON.stringify(o)) : null; };
    var store = {
      exists: function (c) { return !!db.rooms[c]; },
      meta: function (c) { return db.rooms[c] ? copy(db.rooms[c].meta) : null; },
      load: function (c) { return copy(db.rooms[c]); },
      save: function (c, R) { db.rooms[c] = R; wrote = true; }
    };
    var res = PF.handle(body, store, { now: Date.now(), rand: Math.random });
    delete res.log;
    if (wrote) { writeDb(db); if (chan) chan.postMessage("x"); changed(); }
    return Promise.resolve(copy(res));
  }

  function call(action, body) {
    body = Object.assign({ action: action }, body || {});
    if (demo) return demoCall(body);
    return fetch(EP, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: "network", message: "No connection, try again" }; });
  }
  function state(room, extra) {
    var p = Object.assign({ action: "pf.state", room: room }, extra || {});
    if (demo) return demoCall(p);
    var qs = Object.keys(p).filter(function (k) { return p[k] != null && p[k] !== ""; })
      .map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(p[k]); }).join("&");
    return fetch(EP + (EP.indexOf("?") >= 0 ? "&" : "?") + qs).then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: "network" }; });
  }

  /* Poll every 1.5 s (instantly on demo changes). Sends the last version seen, so an unchanged room costs almost nothing.
     onState(view) gets every full view; {same:true} replies only refresh the clock. */
  function poll(getArgs, onState) {
    var busy = false, last = null, timer;
    function tick(force) {
      var a = getArgs(); if (!a || !a.room || busy) return;
      busy = true;
      var extra = Object.assign({}, a.extra || {});
      if (last && !force) extra.v = last.v;
      state(a.room, extra).then(function (v) {
        busy = false;
        if (v && v.ok && v.same && last) { last.now = v.now; last.endAt = v.endAt; onState(last, true); return; }
        if (v && v.ok) last = v;
        onState(v, false);
      }, function () { busy = false; });
    }
    timer = setInterval(tick, 1500);
    listeners.push(function () { tick(); });
    tick();
    return { now: function () { tick(true); }, stop: function () { clearInterval(timer); }, reset: function () { last = null; } };
  }

  function uid() {
    var a = "abcdefghjkmnpqrstuvwxyz23456789", s = "";
    for (var i = 0; i < 12; i++) s += a.charAt(Math.floor(Math.random() * a.length));
    return s;
  }
  function ls(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; }
  }
  /* Student identity: per tab in demo mode (several tabs on one computer are different students), per device when live. */
  function mine(k, v) {
    var st; try { st = demo ? sessionStorage : localStorage; } catch (e) { return null; }
    try { if (v === undefined) return st.getItem(k); if (v === null) st.removeItem(k); else st.setItem(k, v); } catch (e) { return null; }
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clock(ms) {
    ms = Math.max(0, ms); var s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
  }
  return { demo: demo, call: call, state: state, poll: poll, uid: uid, ls: ls, mine: mine, esc: esc, clock: clock };
})();
