/* Spreeder: word flash, scan drills, read then recall, and a projector class mode.
   Data: data/<set>.json (built by backend/tools/build_spreed.py; no recall keys in it).
   Recall answers are marked by the backend: POST {action:"spreed.check", set, pid, qid, choice} to CONTOUR_ENDPOINT.
   Deep links: ?set=y8-en-1-1&p=<passage id>&m=flash|scan|recall[&mode=class] */
(function () {
  "use strict";
  var EP = String(window.CONTOUR_ENDPOINT || "").trim();
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function clock(ms) { var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function secs(ms) { return (ms / 1000).toFixed(ms < 10000 ? 1 : 0); }

  var P = "<svg class=\"i\" viewBox=\"0 0 24 24\" aria-hidden=\"true\">";
  var I = {
    flash: P + "<path d=\"M13 2 4 14h7l-1 8 9-12h-7z\"/></svg>",
    scan: P + "<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"m20 20-4-4\"/></svg>",
    recall: P + "<path d=\"M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/></svg>",
    play: P + "<path d=\"M7 4v16l13-8z\" fill=\"currentColor\"/></svg>",
    pause: P + "<path d=\"M7 4v16M17 4v16\" stroke-width=\"4\"/></svg>",
    back: P + "<path d=\"M11 17 6 12l5-5M18 17l-5-5 5-5\"/></svg>",
    restart: P + "<path d=\"M3 12a9 9 0 1 0 3-6.7L3 8\"/><path d=\"M3 3v5h5\"/></svg>",
    screen: P + "<rect x=\"2\" y=\"4\" width=\"20\" height=\"13\" rx=\"2\"/><path d=\"M8 21h8M12 17v4\"/></svg>",
    grid: P + "<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"/></svg>",
    eye: P + "<path d=\"M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/></svg>",
    next: P + "<path d=\"M5 12h14M13 6l6 6-6 6\"/></svg>",
    clock: P + "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/></svg>",
    tick: P + "<path d=\"m5 12 5 5 9-10\"/></svg>",
    cross: P + "<path d=\"M6 6l12 12M18 6 6 18\"/></svg>",
    book: P + "<path d=\"M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z\"/><path d=\"M4 19V5\"/></svg>",
    stop: P + "<path d=\"M6 6h12v12H6z\" fill=\"currentColor\"/></svg>"
  };
  var MODES = [["flash", "Flash"], ["scan", "Scan"], ["recall", "Recall"]];
  var DRILL = {
    qual: { label: "Qualifiers", ins: "Tap every qualifier", tap: "word" },
    num: { label: "Numbers", ins: "Find it", tap: "word" },
    line: { label: "Lines", ins: "Tap the line", tap: "sent" },
    target: { label: "Targets", ins: "Tap the target", tap: "sent" },
    ontarget: { label: "On Target", ins: "Which answers it?", tap: "sent" },
    link: { label: "Linking", ins: "Tap the lines", tap: "sent" },
    clue: { label: "Clues", ins: "Tap the clue", tap: "word" },
    source: { label: "Found Out?", ins: "Tap the line", tap: "sent" }
  };

  /* ---------- state ---------- */
  var q = new URLSearchParams(location.search);
  var S = {
    set: /^[a-z0-9-]+$/.test(q.get("set") || "") ? q.get("set") : "y8-en-1-1",
    pid: q.get("p") || "",
    m: ["flash", "scan", "recall"].indexOf(q.get("m")) >= 0 ? q.get("m") : "flash",
    cls: q.get("mode") === "class",
    wpm: +(ls("spreeder.wpm") || 300),
    chunk: +(ls("spreeder.chunk") || 1),
    focus: ls("spreeder.focus") !== "0",
    data: null
  };
  if (!(S.wpm >= 150 && S.wpm <= 700)) S.wpm = 300;
  if ([1, 2, 3].indexOf(S.chunk) < 0) S.chunk = 1;
  var cleanup = null;
  function stopView() { if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; } }

  function syncUrl() {
    var u = new URLSearchParams();
    u.set("set", S.set);
    if (S.pid) { u.set("p", S.pid); u.set("m", S.m); }
    if (S.cls) u.set("mode", "class");
    try { history.replaceState(null, "", "?" + u.toString()); } catch (e) {}
  }
  function passage() { return S.data && S.data.passages.filter(function (p) { return p.id === S.pid; })[0]; }
  function words(p) { var n = 0; p.paras.forEach(function (pa) { pa.forEach(function (s) { n += s.split(" ").length; }); }); return n; }

  var toastT = null;
  function toast(msg) {
    var t = $(".toast") || document.body.appendChild(Object.assign(document.createElement("div"), { className: "toast" }));
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2200);
  }

  /* ---------- shell ---------- */
  function shell() {
    document.body.classList.toggle("cls", S.cls);
    var cb = $("#clsbtn");
    cb.innerHTML = I.screen; cb.classList.toggle("on", S.cls); cb.setAttribute("aria-pressed", S.cls ? "true" : "false");
    $("#setchip").textContent = S.data ? S.data.title : "";
    var p = passage();
    $("#bar").hidden = !p;
    if (p) {
      $("#psel").value = p.id;
      $("#tabs").innerHTML = MODES.map(function (m) {
        return '<button type="button" role="tab" data-m="' + m[0] + '" aria-selected="' + (S.m === m[0]) + '" class="' + (S.m === m[0] ? "on" : "") + '">' + I[m[0]] + "<span>" + m[1] + "</span></button>";
      }).join("");
    }
  }

  function render() {
    stopView();
    syncUrl();
    shell();
    var v = $("#view"), p = passage();
    if (!p) return home(v);
    if (S.m === "flash") return flashView(v, p);
    if (S.m === "scan") return scanView(v, p);
    return recallView(v, p);
  }

  function head(p) {
    return '<div class="ptitle"><h2>' + esc(p.title) + '</h2><span class="chip">' + esc(p.skill) + "</span></div>";
  }

  /* ---------- home: passage cards ---------- */
  function home(v) {
    var groups = [], by = {};
    S.data.passages.forEach(function (p) {
      var k = p.section || p.where;
      if (!by[k]) { by[k] = []; groups.push(k); }
      by[k].push(p);
    });
    v.innerHTML = groups.map(function (g) {
      return '<p class="sec">' + esc(g) + "</p><div class=\"cards\">" + by[g].map(function (p) {
        return '<button type="button" class="pcard" data-p="' + esc(p.id) + '"><b>' + esc(p.title) + '</b><span class="row"><span class="chip">' + esc(p.skill) +
          '</span><span class="n">' + words(p) + " words</span></span><span class=\"row\">" +
          '<span class="chip green">' + I.flash + "</span>" +
          (p.drills.length ? '<span class="chip green">' + I.scan + " " + p.drills.length + "</span>" : "") +
          (p.recall.length ? '<span class="chip green">' + I.recall + " " + p.recall.length + "</span>" : "") + "</span></button>";
      }).join("") + "</div>";
    }).join("");
    v.onclick = function (e) {
      var b = e.target.closest(".pcard"); if (!b) return;
      S.pid = b.getAttribute("data-p"); S.m = "flash"; render(); window.scrollTo(0, 0);
    };
    cleanup = function () { v.onclick = null; };
  }

  /* ---------- word flash ---------- */
  function orpIndex(w) {
    var m = /^[^A-Za-z0-9]*/.exec(w)[0].length, core = w.slice(m).replace(/[^A-Za-z0-9]+$/, ""), L = core.length;
    return m + (L <= 1 ? 0 : L <= 5 ? 1 : L <= 9 ? 2 : L <= 13 ? 3 : 4);
  }

  /* Mounts a word flash player in el. opts.onDone(stats) replaces the end screen (used by Recall). */
  function Flash(el, p, opts) {
    opts = opts || {};
    var toks = [], sents = [];
    p.paras.forEach(function (pa, pi) {
      pa.forEach(function (s, si) {
        var ws = s.split(" "), start = toks.length;
        sents.push({ start: start, text: s });
        ws.forEach(function (w, i) {
          toks.push({ w: w, sn: sents.length - 1, last: i === ws.length - 1, paraEnd: i === ws.length - 1 && si === pa.length - 1 });
        });
      });
    });
    var chunks = [], idx = 0, playing = false, timer = null, started = 0, elapsed = 0, finished = false;

    function build() {
      chunks = [];
      var base = 60000 / S.wpm, n = S.chunk;
      sents.forEach(function (s, sn) {
        var end = sn + 1 < sents.length ? sents[sn + 1].start : toks.length;
        for (var i = s.start; i < end; i += n) {
          var j = Math.min(i + n, end), last = toks[j - 1], txt = toks.slice(i, j).map(function (t) { return t.w; }).join(" ");
          var ms = base * (j - i);
          if (last.paraEnd) ms += base * 1.6;
          else if (last.last && /[.!?]["'”’]*$/.test(last.w)) ms += base * 1.0;
          else if (last.last || /[,;:]["'”’]*$/.test(last.w)) ms += base * 0.5;
          if (n === 1 && txt.length > 9) ms += base * 0.3;
          chunks.push({ t0: i, n: j - i, sn: sn, txt: txt, ms: ms });
        }
      });
    }
    function chunkAtTok(t) { for (var k = 0; k < chunks.length; k++) if (chunks[k].t0 + chunks[k].n > t) return k; return chunks.length - 1; }
    function leftMs() { var s = 0; for (var k = idx; k < chunks.length; k++) s += chunks[k].ms; return s; }

    el.innerHTML =
      '<div class="rsvp" id="rsvp" role="button" tabindex="0" aria-label="Play or pause"><span class="guide t"></span><span class="guide b"></span><div id="wl"></div></div>' +
      '<div class="ctx" id="ctx"></div>' +
      '<div class="prog" aria-hidden="true"><i id="pg"></i></div><div class="meta"><span id="mleft"></span><span id="mwpm"></span></div>' +
      '<div class="ctl"><button class="btn" id="fback" type="button" title="Back a sentence" aria-label="Back a sentence">' + I.back + '</button>' +
      '<button class="btn primary play-btn" id="fplay" type="button" aria-label="Play">' + I.play + "</button>" +
      '<button class="btn" id="frestart" type="button" title="Restart" aria-label="Restart">' + I.restart + "</button></div>" +
      '<div class="set"><label class="rng"><span class="lbl">WPM</span><input id="fwpm" type="range" min="150" max="700" step="25" value="' + S.wpm + '"><b id="fwpmv">' + S.wpm + "</b></label>" +
      '<span class="rng"><span class="lbl">Words</span><span class="seg" id="fchunk">' + [1, 2, 3].map(function (n) { return '<button type="button" data-n="' + n + '" class="' + (S.chunk === n ? "on" : "") + '">' + n + "</button>"; }).join("") + "</span></span>" +
      '<button type="button" class="tog' + (S.focus ? " on" : "") + '" id="ffocus" aria-pressed="' + S.focus + '">Focus</button></div>';

    var wl = $("#wl", el), rs = $("#rsvp", el), ctx = $("#ctx", el);
    function show(k) {
      var c = chunks[k]; if (!c) return;
      rs.classList.remove("idle");
      if (c.n === 1 && S.chunk === 1) {
        var w = c.txt, o = orpIndex(w);
        rs.classList.remove("multi");
        wl.className = "wordline";
        wl.innerHTML = '<span class="pre">' + esc(w.slice(0, o)) + '</span><span class="orp' + (S.focus ? " hl" : "") + '">' + esc(w.charAt(o)) + '</span><span class="post">' + esc(w.slice(o + 1)) + "</span>";
      } else {
        rs.classList.add("multi");
        wl.className = "wordline multi";
        wl.textContent = c.txt;
      }
      $("#pg", el).style.width = (100 * (k + 1) / chunks.length) + "%";
      $("#mleft", el).textContent = clock(leftMs());
      ctx.innerHTML = "";
    }
    function showCtx() {
      var c = chunks[Math.min(idx, chunks.length - 1)]; if (!c) return;
      var s = sents[c.sn], ws = s.text.split(" "), a = c.t0 - s.start;
      ctx.innerHTML = ws.map(function (w, i) { return i >= a && i < a + c.n ? "<mark>" + esc(w) + "</mark>" : esc(w); }).join(" ");
    }
    function meta() {
      $("#mwpm", el).textContent = S.wpm + " wpm";
      $("#mleft", el).textContent = clock(leftMs());
      $("#fplay", el).innerHTML = playing ? I.pause : I.play;
      $("#fplay", el).setAttribute("aria-label", playing ? "Pause" : "Play");
      $("#ffocus", el).disabled = S.chunk > 1;
    }
    function intro() {
      rs.classList.remove("multi"); rs.classList.add("idle");
      wl.className = "";
      wl.innerHTML = '<div class="hint"><span class="play">' + I.play + "</span><span>" + esc(p.title) + "</span></div>";
      $("#pg", el).style.width = "0%";
    }
    function tick() {
      if (!playing) return;
      if (idx >= chunks.length) return done();
      show(idx);
      var c = chunks[idx];
      idx++;
      timer = setTimeout(tick, c.ms);
    }
    function play() {
      if (finished) { restart(); }
      if (idx >= chunks.length) idx = 0;
      playing = true; started = performance.now(); meta(); tick();
    }
    function pause() {
      if (!playing) return;
      playing = false; clearTimeout(timer); elapsed += performance.now() - started;
      idx = Math.max(0, idx - 1);
      meta(); showCtx();
    }
    function toggle() { if (playing) pause(); else play(); }
    function back() {
      var was = playing; if (playing) pause();
      var c = chunks[Math.min(idx, chunks.length - 1)], s = c.sn;
      var first = chunkAtTok(sents[s].start);
      if (idx - first < 2 && s > 0) s--;
      idx = chunkAtTok(sents[s].start);
      show(idx); showCtx(); meta();
      if (was) play();
    }
    function restart() {
      var was = playing; if (playing) pause();
      idx = 0; elapsed = 0; finished = false; intro(); ctx.innerHTML = ""; meta();
      if (was) play();
    }
    function done() {
      playing = false; finished = true; elapsed += performance.now() - started;
      var n = toks.length, wpm = Math.round(n / (elapsed / 60000));
      meta();
      if (opts.onDone) return opts.onDone({ ms: elapsed, wpm: wpm, words: n });
      rs.classList.remove("multi"); rs.classList.add("idle");
      wl.className = "";
      wl.innerHTML = '<div class="hint">' + I.tick + "<span>" + clock(elapsed) + " · " + (wpm > 1200 ? "1200+" : wpm) + ' wpm</span><span class="ctl">' +
        '<button class="btn" type="button" data-go="again">' + I.restart + "</button>" +
        (p.recall.length ? '<button class="btn primary" type="button" data-go="recall">' + I.recall + " Recall</button>" : "") +
        (p.drills.length ? '<button class="btn navy" type="button" data-go="scan">' + I.scan + " Scan</button>" : "") + "</span></div>";
    }
    function reflow() {
      var t = chunks[Math.min(idx, chunks.length - 1)] ? chunks[Math.min(idx, chunks.length - 1)].t0 : 0;
      build(); idx = chunkAtTok(t); meta();
    }

    rs.addEventListener("click", function (e) {
      var go = e.target.closest("[data-go]");
      if (go) {
        e.stopPropagation();
        var g = go.getAttribute("data-go");
        if (g === "again") return restart();
        S.m = g; return render();
      }
      toggle();
    });
    rs.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); toggle(); } });
    $("#fplay", el).onclick = toggle;
    $("#fback", el).onclick = back;
    $("#frestart", el).onclick = restart;
    $("#fwpm", el).oninput = function () { S.wpm = +this.value; $("#fwpmv", el).textContent = S.wpm; ls("spreeder.wpm", S.wpm); reflow(); };
    $("#fchunk", el).onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      S.chunk = +b.getAttribute("data-n"); ls("spreeder.chunk", S.chunk);
      $$("button", this).forEach(function (x) { x.classList.toggle("on", x === b); });
      reflow(); if (!playing && idx > 0 && !finished) show(idx);
    };
    $("#ffocus", el).onclick = function () {
      S.focus = !S.focus; ls("spreeder.focus", S.focus ? "1" : "0");
      this.classList.toggle("on", S.focus); this.setAttribute("aria-pressed", S.focus);
      var o = $(".orp", wl); if (o) o.classList.toggle("hl", S.focus);
    };
    function key(e) {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.key !== " ") return;
      if (e.key === " " || e.key === "k") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
      else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        S.wpm = Math.max(150, Math.min(700, S.wpm + (e.key === "ArrowUp" ? 25 : -25)));
        $("#fwpm", el).value = S.wpm; $("#fwpmv", el).textContent = S.wpm; ls("spreeder.wpm", S.wpm); reflow();
      }
    }
    document.addEventListener("keydown", key);
    build(); intro(); meta();
    if (opts.autoplay) play();
    return { destroy: function () { playing = false; clearTimeout(timer); document.removeEventListener("keydown", key); } };
  }

  function flashView(v, p) {
    v.innerHTML = head(p) + '<div id="fl" style="display:flex;flex-direction:column;gap:14px"></div>';
    var f = Flash($("#fl", v), p);
    cleanup = f.destroy;
  }

  /* ---------- passage text with tappable words ---------- */
  function textHtml(p, only, cls) {
    var h = '<div class="text' + (p.poem ? " poem" : "") + (cls ? " " + cls : "") + '">';
    if (p.source && !only) h += '<p class="src">' + esc(p.source) + "</p>";
    p.paras.forEach(function (pa, pi) {
      if (only && only.indexOf(pi) < 0) return;
      h += '<p class="para"><span class="pn">' + (pi + 1) + "</span>" + pa.map(function (s, si) {
        return '<span class="s" data-s="' + pi + "." + si + '">' + s.split(" ").map(function (w, i) {
          return '<span class="w" data-w="' + pi + "." + si + "." + i + '">' + esc(w) + "</span>";
        }).join(" ") + "</span>";
      }).join(" ") + "</p>";
    });
    return h + "</div>";
  }
  function spanToks(root, a) { var out = []; for (var i = a[2]; i <= a[3]; i++) { var n = root.querySelector('[data-w="' + a[0] + "." + a[1] + "." + i + '"]'); if (n) out.push(n); } return out; }
  function sentEl(root, a) { return root.querySelector('[data-s="' + a[0] + "." + a[1] + '"]'); }

  /* ---------- scan drills ---------- */
  function scanView(v, p) {
    if (!p.drills.length) {
      v.innerHTML = head(p) + '<div class="intro"><div class="ico">' + I.scan + '</div><p>Coming soon</p><button class="btn primary" type="button" id="tofl">' + I.flash + " Flash</button></div>";
      $("#tofl", v).onclick = function () { S.m = "flash"; render(); };
      return;
    }
    var cur = 0;
    v.innerHTML = head(p) + '<div class="drills" id="dr"></div><div id="dbody" style="display:flex;flex-direction:column;gap:14px"></div>';
    function chips() {
      $("#dr", v).innerHTML = p.drills.map(function (d, i) {
        return '<button type="button" data-i="' + i + '" class="' + (i === cur ? "on" : "") + '">' + esc(DRILL[d.type].label) + ' <span class="c">' + d.rounds.length + "</span></button>";
      }).join("");
    }
    var run = null;
    function open(i) {
      if (run) run.stop();
      cur = i; chips();
      var d = p.drills[i], b = $("#dbody", v);
      b.innerHTML = '<div class="intro"><div class="ico">' + I.scan + "</div><h3>" + esc(DRILL[d.type].label) + "</h3><p>" + d.rounds.length + (d.rounds.length === 1 ? " round" : " rounds") +
        '</p><button class="btn primary big" type="button" id="dgo">' + I.play + " Start</button></div>";
      $("#dgo", b).onclick = function () { run = Drill(b, p, d, function () { open(i); }, function () { if (i + 1 < p.drills.length) open(i + 1); else open(0); }); };
    }
    $("#dr", v).onclick = function (e) { var b = e.target.closest("button"); if (b) open(+b.getAttribute("data-i")); };
    open(0);
    cleanup = function () { if (run) run.stop(); };
  }

  function Drill(box, p, d, again, nextDrill) {
    var T = DRILL[d.type], r = 0, t0 = performance.now(), roundT0 = t0, misses = 0, per = [], tick = null, st = null, dead = false;
    var allMs = 0, flashT = null;
    box.innerHTML = '<div class="cue" id="cue"></div><div id="ptext"></div>';
    var cue = $("#cue", box), pt = $("#ptext", box);
    var only = d.paras || null;
    pt.className = "tap " + (T.tap === "word" ? "wordmode" : "sentmode");
    pt.innerHTML = textHtml(p, only);
    var txt = $(".text", pt);

    function stats() {
      return '<span class="stats"><span>' + I.clock + '<b id="clk">' + clock(performance.now() - t0) + "</b></span><span>" + I.cross + '<b id="mis">' + misses + "</b></span></span>";
    }
    function startRound() {
      var R = d.rounds[r];
      st = { R: R, hits: [], phase: R.pickFirst ? "pick" : "tap", peeks: 0 };
      roundT0 = performance.now();
      $$(".w,.s", txt).forEach(function (w) { w.classList.remove("hit", "miss", "reveal", "cand", "wmark", "okw"); });
      if (R.shown) R.shown.forEach(function (a) { sentEl(txt, a).classList.add("cand"); });
      if (R.word) spanToks(txt, R.word).forEach(function (w) { w.classList.add("wmark"); });
      drawCue();
      txt.classList.toggle("dim", st.phase === "pick");
      if (d.type === "num") flashNum(R.cue);
      if (R.word) { var m = $(".w.wmark", txt); if (m) m.scrollIntoView({ block: "center", behavior: "smooth" }); }
      else if (R.shown) { var c = $(".s.cand", txt); if (c) c.scrollIntoView({ block: "center", behavior: "smooth" }); }
      else window.scrollTo({ top: box.getBoundingClientRect().top + window.scrollY - 8, behavior: "smooth" });
    }
    function flashNum(n) {
      var f = document.body.appendChild(Object.assign(document.createElement("div"), { className: "flashnum" }));
      f.textContent = n; txt.classList.add("blur");
      clearTimeout(flashT);
      flashT = setTimeout(function () { f.remove(); txt.classList.remove("blur"); }, 1300);
    }
    function need() { var R = st.R; return R.need || (d.type === "qual" ? R.at.length : 1); }
    function drawCue() {
      var R = st.R, h = '<div class="row"><span class="ins">' + (r + 1) + "/" + d.rounds.length + " · ";
      if (st.phase === "pick") h += esc(R.pick.ask);
      else if (st.phase === "after") h += esc(R.pick.ask);
      else if (d.type === "qual") h += esc(T.ins) + " " + st.hits.length + "/" + R.at.length;
      else if (d.type === "link") h += "Tap " + need() + " lines " + st.hits.length + "/" + need();
      else h += esc(T.ins);
      h += "</span>" + stats() + "</div>";
      if (d.type === "num") h += '<div class="row"><span class="say num" style="flex:1">?</span><button class="sm" type="button" data-a="peek">' + I.eye + " Peek</button></div>";
      else if (d.type === "clue") h += '<div class="say">' + esc(R.cue) + "</div>";
      else if (d.type !== "qual") h += '<div class="say">' + esc(R.cue) + "</div>";
      if (st.phase === "pick" || st.phase === "after") {
        h += '<div class="pick">' + R.pick.opts.map(function (o, i) { return '<button type="button" data-pick="' + i + '">' + esc(o) + "</button>"; }).join("") + "</div>";
      } else {
        h += '<div class="row" style="justify-content:flex-end"><button class="sm" type="button" data-a="show">' + I.eye + " Show</button></div>";
      }
      cue.innerHTML = h;
    }
    function miss(nodes) {
      misses++;
      nodes.forEach(function (w) { w.classList.add("miss"); });
      setTimeout(function () { nodes.forEach(function (w) { w.classList.remove("miss"); }); }, 600);
      var c = $("#mis", cue); if (c) c.textContent = misses;
    }
    function inSpan(a, w) { return w[0] === a[0] && w[1] === a[1] && w[2] >= a[2] && w[2] <= a[3]; }
    function onTap(e) {
      var n = e.target.closest(".w"); if (!n || !st || st.phase !== "tap") return;
      var w = n.getAttribute("data-w").split(".").map(Number), R = st.R;
      if (R.word && inSpan(R.word, w)) return;
      if (T.tap === "word") {
        var k = -1;
        R.at.forEach(function (a, i) { if (k < 0 && inSpan(a, w)) k = i; });
        if (k >= 0) {
          if (st.hits.indexOf(k) < 0) { st.hits.push(k); spanToks(txt, R.at[k]).forEach(function (x) { x.classList.add("hit"); }); }
        } else if (R.ok && R.ok.some(function (a) { return inSpan(a, w); })) {
          n.classList.add("okw"); return;
        } else return miss([n]);
      } else {
        var sk = -1;
        R.at.forEach(function (a, i) { if (a[0] === w[0] && a[1] === w[1]) sk = i; });
        if (R.shown && !R.shown.some(function (a) { return a[0] === w[0] && a[1] === w[1]; })) return;
        if (sk >= 0) {
          if (st.hits.indexOf(sk) < 0) { st.hits.push(sk); var se = sentEl(txt, R.at[sk]); se.classList.remove("cand"); se.classList.add("hit"); }
        } else return miss([sentEl(txt, [w[0], w[1]])]);
      }
      if (st.hits.length >= need()) roundDone(); else drawCue();
    }
    function roundDone() {
      var R = st.R;
      if (R.pick && !R.pickFirst && st.phase === "tap") { st.phase = "after"; drawCue(); return; }
      st.phase = "done";
      per.push(performance.now() - roundT0);
      drawCue();
      setTimeout(function () { if (dead) return; r++; if (r < d.rounds.length) startRound(); else finish(); }, 750);
    }
    function onCue(e) {
      var b = e.target.closest("button"); if (!b || !st) return;
      var a = b.getAttribute("data-a"), R = st.R;
      if (a === "peek") { misses++; flashNum(R.cue); drawCue(); return; }
      if (a === "show") {
        if (st.phase !== "tap") return;
        misses++;
        R.at.forEach(function (x, i) {
          if (st.hits.indexOf(i) >= 0) return;
          (T.tap === "word" ? spanToks(txt, x) : [sentEl(txt, x)]).forEach(function (w) { w.classList.add("reveal"); });
        });
        var first = $(".reveal", txt); if (first) first.scrollIntoView({ block: "center", behavior: "smooth" });
        st.hits = R.at.map(function (x, i) { return i; });
        setTimeout(function () { if (!dead) roundDone(); }, 1200);
        st.phase = "wait"; drawCue();
        return;
      }
      if (b.hasAttribute("data-pick") && (st.phase === "pick" || st.phase === "after")) {
        var i = +b.getAttribute("data-pick"), ok = i === R.pick.a;
        $$("[data-pick]", cue).forEach(function (x) { x.disabled = true; });
        b.classList.add(ok ? "right" : "wrong");
        if (!ok) { misses++; $$("[data-pick]", cue)[R.pick.a].classList.add("right"); }
        setTimeout(function () {
          if (dead) return;
          if (st.phase === "pick") { st.phase = "tap"; txt.classList.remove("dim"); drawCue(); }
          else { st.phase = "tap"; st.R = Object.assign({}, R, { pick: null }); roundDone(); }
        }, ok ? 450 : 1100);
      }
    }
    function finish() {
      clearInterval(tick);
      allMs = performance.now() - t0;
      var avg = per.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, per.length), pace = S.data.pace || 44;
      var pct = Math.min(100, 100 * avg / (pace * 1000 * 1.5)), mk = 100 / 1.5;
      box.innerHTML = '<div class="intro"><div class="ico">' + I.tick + "</div><h3>" + esc(T.label) + "</h3>" +
        '<div class="tiles"><div class="tile"><div class="v">' + clock(allMs) + '</div><div class="l">Time</div></div>' +
        '<div class="tile"><div class="v">' + secs(avg) + 's</div><div class="l">Per Find</div></div>' +
        '<div class="tile"><div class="v">' + misses + '</div><div class="l">Misses</div></div></div>' +
        '<div class="pace"><div class="track"><span class="fill' + (avg > pace * 1000 ? " slow" : "") + '" style="width:' + pct + '%"></span><span class="mk" style="left:' + mk + '%"></span></div>' +
        '<div class="lab"><span>0s</span><span>' + pace + "s exam pace</span></div></div>" +
        '<div class="ctl"><button class="btn" type="button" id="dagain">' + I.restart + " Again</button>" +
        (p.drills.length > 1 ? '<button class="btn primary" type="button" id="dnext">' + I.next + " Next</button>" : "") + "</div></div>";
      $("#dagain", box).onclick = again;
      var nx = $("#dnext", box); if (nx) nx.onclick = nextDrill;
    }
    txt.addEventListener("click", onTap);
    cue.addEventListener("click", onCue);
    tick = setInterval(function () { var c = $("#clk", cue); if (c) c.textContent = clock(performance.now() - t0); }, 250);
    startRound();
    return { stop: function () { dead = true; clearInterval(tick); clearTimeout(flashT); var f = $(".flashnum"); if (f) f.remove(); } };
  }

  /* ---------- read then recall ---------- */
  function check(pid, qid, choice) {
    if (!EP) return Promise.resolve({ ok: false, error: "offline" });
    var ctl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
    return fetch(EP, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "spreed.check", set: S.set, pid: pid, qid: qid, choice: choice }), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: "network" }; })
      .then(function (x) { clearTimeout(to); return x; });
  }

  function recallView(v, p) {
    var n = words(p), stop = null, read = null;
    function setup() {
      if (stop) stop();
      var est = Math.round(n / S.wpm * 60);
      v.innerHTML = head(p) + '<div class="intro"><div class="ico">' + I.recall + '</div><p>' + n + " words · " + clock(est * 1000) + "</p>" +
        '<div class="set"><label class="rng"><span class="lbl">WPM</span><input id="rwpm" type="range" min="150" max="700" step="25" value="' + S.wpm + '"><b id="rwpmv">' + S.wpm + "</b></label></div>" +
        '<div class="ctl"><button class="btn primary big" type="button" id="rread">' + I.book + ' Read</button><button class="btn navy big" type="button" id="rflash">' + I.flash + " Flash</button></div>" +
        (p.recall.length ? "" : '<p class="note">Coming soon</p>') + "</div>";
      $("#rwpm", v).oninput = function () {
        S.wpm = +this.value; ls("spreeder.wpm", S.wpm); $("#rwpmv", v).textContent = S.wpm;
        $(".intro p", v).textContent = n + " words · " + clock(Math.round(n / S.wpm * 60) * 1000);
      };
      $("#rread", v).onclick = timedRead;
      $("#rflash", v).onclick = flashRead;
    }
    function timedRead() {
      var total = Math.round(n / S.wpm * 60) * 1000, t0 = performance.now(), iv;
      v.innerHTML = head(p) + '<div class="timer"><span class="t" id="rt">' + clock(total) + '</span><span class="track"><i id="rbar" style="width:100%"></i></span><button class="btn" type="button" id="rdone">' + I.tick + " Done</button></div>" + textHtml(p);
      function end() {
        clearInterval(iv); stop = null;
        var ms = Math.min(performance.now() - t0, total);
        read = { ms: ms, wpm: Math.round(n / (ms / 60000)) };
        questions();
      }
      iv = setInterval(function () {
        var left = total - (performance.now() - t0);
        if (left <= 0) return end();
        $("#rt", v).textContent = clock(left);
        $("#rbar", v).style.width = (100 * left / total) + "%";
      }, 200);
      $("#rdone", v).onclick = end;
      stop = function () { clearInterval(iv); };
      window.scrollTo(0, 0);
    }
    function flashRead() {
      v.innerHTML = head(p) + '<div id="fl" style="display:flex;flex-direction:column;gap:14px"></div>';
      var f = Flash($("#fl", v), p, { autoplay: true, onDone: function (s) { f.destroy(); stop = null; read = s; questions(); } });
      stop = f.destroy;
    }
    function questions() {
      var qs = p.recall, k = 0, res = [];
      if (!qs.length) return result(res);
      function draw() {
        var Q = qs[k];
        v.innerHTML = head(p) + '<div class="dots">' + qs.map(function (x, i) { return '<i class="' + (res[i] || "") + '"></i>'; }).join("") + "</div>" +
          '<div class="qcard"><span class="qn">' + (k + 1) + "/" + qs.length + (EP ? "" : " · Offline") + '</span><p class="qq">' + esc(Q.q) + '</p><div class="opts">' +
          Q.opts.map(function (o, i) { return '<button type="button" class="opt" data-i="' + i + '"><span class="l">' + "ABCD".charAt(i) + "</span><span>" + esc(o) + '</span><span class="r"></span></button>'; }).join("") + "</div></div>";
        $(".opts", v).onclick = function (e) {
          var b = e.target.closest(".opt"); if (!b || b.disabled) return;
          var i = +b.getAttribute("data-i");
          $$(".opt", v).forEach(function (x) { x.disabled = true; if (x !== b) x.classList.add("dim"); });
          b.classList.add("wait");
          check(p.id, Q.id, i).then(function (x) {
            b.classList.remove("wait");
            if (x && x.ok) {
              res[k] = x.correct ? "right" : "wrong";
              b.classList.add(res[k]);
              $(".r", b).innerHTML = x.correct ? I.tick : I.cross;
            } else {
              res[k] = "off";
              toast("Offline: not checked");
            }
            setTimeout(function () { k++; if (k < qs.length) draw(); else result(res); }, 900);
          });
        };
      }
      draw();
    }
    function result(res) {
      var right = res.filter(function (x) { return x === "right"; }).length, checked = res.filter(function (x) { return x !== "off"; }).length;
      v.innerHTML = head(p) + '<div class="intro">' +
        (res.length ? '<div class="dots">' + res.map(function (x) { return '<i class="' + x + '"></i>'; }).join("") + "</div>" : "") +
        (checked ? '<div class="big-score">' + right + "<small> / " + checked + "</small></div>" : "") +
        '<div class="tiles"><div class="tile"><div class="v">' + clock(read ? read.ms : 0) + '</div><div class="l">Read</div></div>' +
        '<div class="tile"><div class="v">' + (read ? (read.wpm > 1200 ? "1200+" : read.wpm) : 0) + '</div><div class="l">WPM</div></div></div>' +
        '<div class="ctl"><button class="btn" type="button" id="ragain">' + I.restart + " Again</button>" +
        (p.drills.length ? '<button class="btn primary" type="button" id="rscan">' + I.scan + " Scan</button>" : "") + "</div></div>";
      $("#ragain", v).onclick = setup;
      var sc = $("#rscan", v); if (sc) sc.onclick = function () { S.m = "scan"; render(); };
    }
    setup();
    cleanup = function () { if (stop) stop(); };
  }

  /* ---------- boot ---------- */
  $("#clsbtn").onclick = function () { S.cls = !S.cls; shell(); syncUrl(); };
  $("#psel").onchange = function () { S.pid = this.value; render(); };
  $("#tabs").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; S.m = b.getAttribute("data-m"); render(); };
  $("#home").onclick = function (e) { e.preventDefault(); S.pid = ""; render(); };
  document.body.classList.toggle("cls", S.cls);

  fetch("data/" + S.set + ".json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) {
    S.data = d;
    $("#psel").innerHTML = d.passages.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.title) + " · " + esc(p.skill) + "</option>"; }).join("");
    if (S.pid && !passage()) S.pid = "";
    render();
  }).catch(function () {
    $("#view").innerHTML = '<div class="intro"><div class="ico">' + I.cross + "</div><p>Not found</p></div>";
  });

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    try { navigator.serviceWorker.register("sw.js"); } catch (e) {}
  }
})();
