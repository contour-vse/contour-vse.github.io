/* Prompt Feud shared view helpers (student page, tutor board and projector screen). Needs pf-engine.js and pf-api.js. */
var UI = (function () {
  var esc = Net.esc;
  var TEAM_COL = ["#007AFF", "#E88100", "#17793F", "#0B3D91"];
  var TEAM_SOFT = ["#E5F1FF", "#FFF0DC", "#E2F5EA", "#E4ECF8"];
  var ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4" width="8" height="4" rx="1.2"/><rect x="13" y="4" width="8" height="4" rx="1.2"/><rect x="3" y="10" width="8" height="4" rx="1.2"/><rect x="13" y="10" width="8" height="4" rx="1.2"/><rect x="3" y="16" width="8" height="4" rx="1.2"/><rect x="13" y="16" width="8" height="4" rx="1.2"/></svg>';
  var X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="4.2" stroke-linecap="round"/></svg>';

  function teamStyle(i) { return "--tc:" + (TEAM_COL[i] || TEAM_COL[0]) + ";--ts:" + (TEAM_SOFT[i] || TEAM_SOFT[0]); }

  /* The answer board: answers ranked 1 to n, two columns on wide screens (1 to half down the left).
     tiles = [{o, t, pts, by}] (o 0 hidden). opts: {flip: {i: 1} tiles to animate, reveal: true adds Reveal buttons on hidden tiles (tutor, round over),
     full: answers with text for hidden tiles (tutor eyes only)}. */
  function boardHtml(tiles, opts) {
    opts = opts || {};
    var n = tiles.length, half = Math.ceil(n / 2), cells = [];
    if (opts.one) {  /* phones: one column, 1 to n down the page */
      tiles.forEach(function (x, i) { cells.push(tileHtml(x, i, opts)); });
      return '<div class="fboard one" style="--rows:' + n + '">' + cells.join("") + "</div>";
    }
    for (var r = 0; r < half; r++) for (var c = 0; c < 2; c++) {
      var i = c * half + r;
      if (i >= n) { cells.push('<div class="tile none"></div>'); continue; }
      cells.push(tileHtml(tiles[i], i, opts));
    }
    return '<div class="fboard" style="--rows:' + half + '">' + cells.join("") + "</div>";
  }
  function tileHtml(x, i, opts) {
    var full = opts.full && opts.full[i];
    var back = x.o ? '<div class="face back' + (x.o === 2 ? " late" : "") + '"' + (x.by >= 0 ? ' style="' + teamStyle(x.by) + '"' : "") + '><span class="tt">' + esc(x.t) + '</span><span class="tp">' + x.pts + "</span></div>" : "";
    var front = '<div class="face front"><span class="tn">' + (i + 1) + "</span>" + (full ? '<span class="peek ans-t">' + esc(full.t) + " <b>" + full.pts + "</b></span>" : "") +
      (opts.reveal && !x.o ? '<button type="button" class="btn ghost rv" data-reveal="' + i + '">Reveal</button>' : "") + "</div>";
    return '<div class="tile' + (x.o ? " open" : "") + (opts.flip && opts.flip[i] ? " flip" : "") + '" data-i="' + i + '"><div class="inner">' + front + back + "</div></div>";
  }
  function strikesHtml(n, max) {
    var s = "";
    for (var i = 0; i < (max || 3); i++) s += '<span class="sx' + (i < n ? " on" : "") + '">' + X + "</span>";
    return '<div class="strikes" aria-label="' + n + ' strikes">' + s + "</div>";
  }
  /* A huge X over the screen for a moment. */
  function bigStrike(n) {
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var d = document.createElement("div"); d.className = "bigx";
    var s = ""; for (var i = 0; i < Math.max(1, n || 1); i++) s += '<span style="animation-delay:' + (i * 0.08) + 's">' + X + "</span>";
    d.innerHTML = s; document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 1500);
  }
  function banner(html, cls) {
    var d = document.createElement("div"); d.className = "fbanner " + (cls || ""); d.innerHTML = html; document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 2600);
  }
  function teamsBar(v, opts) {
    opts = opts || {};
    return '<div class="tbar">' + v.teams.map(function (t, i) {
      var on = v.active === i;
      return '<div class="tcard' + (on ? " on" : "") + (opts.mine === i ? " mine" : "") + '" style="' + teamStyle(i) + '"><span class="tnm">' + esc(t.name) + "</span>" +
        '<span class="tsc">' + t.score + "</span>" + (on ? '<span class="tturn">' + (v.steal ? "Steal" : "Guessing") + "</span>" : "") + "</div>";
    }).join("") + "</div>";
  }
  function ordinal(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function pts(n) { return n + (n === 1 ? " point" : " points"); }

  function confetti(ms) {
    var c = document.createElement("canvas"), x = c.getContext("2d");
    if (!x || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
    c.className = "confetti"; document.body.appendChild(c);
    var W = c.width = innerWidth, H = c.height = innerHeight, cols = ["#0B3D91", "#007AFF", "#2FB76A", "#E88100", "#FFC24B"], bits = [];
    for (var i = 0; i < 160; i++) bits.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.6, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, r: Math.random() * 6, w: 6 + Math.random() * 7, h: 8 + Math.random() * 8, c: cols[i % cols.length], s: (Math.random() - 0.5) * 0.3 });
    var t0 = performance.now();
    (function frame(t) {
      x.clearRect(0, 0, W, H);
      bits.forEach(function (b) { b.x += b.vx; b.y += b.vy; b.vy += 0.04; b.r += b.s; x.save(); x.translate(b.x, b.y); x.rotate(b.r); x.fillStyle = b.c; x.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); x.restore(); });
      if (t - t0 < (ms || 4200)) requestAnimationFrame(frame); else c.remove();
    })(t0);
  }
  return { ICON: ICON, X: X, TEAM_COL: TEAM_COL, teamStyle: teamStyle, boardHtml: boardHtml, strikesHtml: strikesHtml, bigStrike: bigStrike, banner: banner, teamsBar: teamsBar, ordinal: ordinal, pts: pts, confetti: confetti };
})();
