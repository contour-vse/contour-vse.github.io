/* Writing Board shared view helpers (student page, tutor board and projector screen). Needs wb-engine.js and wb-api.js. */
var UI = (function () {
  var esc = Board.esc;
  var TYPE_HINT = { "Short Answer": "A few sentences", "Plan": "Dot points are fine", "Paragraph": "One paragraph", "Full Essay": "The whole piece" };

  /* The piece text with highlights. The container's text is exactly the piece text (numbers come from CSS),
     so a selection maps straight back to character offsets. */
  function located(text, hl) {
    var out = [], end = -1;
    (hl || []).map(function (h) { var at = WB.locate(text, h); return at ? { h: h, s: at.s, e: at.e } : null; })
      .filter(Boolean).sort(function (x, y) { return x.s - y.s; })
      .forEach(function (x) { if (x.s >= end) { out.push(x); end = x.e; } });
    out.forEach(function (x, i) { x.n = i + 1; });
    return out;
  }
  function pieceHtml(text, hl, active) {
    text = String(text || "");
    var parts = [], at = 0;
    located(text, hl).forEach(function (x) {
      parts.push(esc(text.slice(at, x.s)));
      parts.push('<mark class="hl ' + (x.h.g ? "hg" : "hf") + (x.h.id === active ? " on" : "") + '" data-id="' + esc(x.h.id) + '" data-n="' + x.n + '">' + esc(text.slice(x.s, x.e)) + "</mark>");
      at = x.e;
    });
    parts.push(esc(text.slice(at)));
    return parts.join("");
  }
  /* Character offsets of the current selection inside el, trimmed of spaces; null when nothing useful is selected. */
  function selOffsets(el, text) {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    var r = sel.getRangeAt(0);
    if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null;
    var pre = document.createRange();
    pre.setStart(el, 0); pre.setEnd(r.startContainer, r.startOffset);
    var s = pre.toString().length, e = s + r.toString().length;
    while (s < e && /\s/.test(text.charAt(s))) s++;
    while (e > s && /\s/.test(text.charAt(e - 1))) e--;
    return e > s ? { s: s, e: e, rect: r.getBoundingClientRect() } : null;
  }
  function notesHtml(text, mk, opts) {
    opts = opts || {};
    var list = located(text, mk && mk.h);
    if (!list.length) return opts.empty ? '<p class="muted">' + opts.empty + "</p>" : "";
    return '<ol class="notes">' + list.map(function (x) {
      var h = x.h, q = text.slice(x.s, x.e);
      return '<li class="' + (h.g ? "hg" : "hf") + '" data-id="' + esc(h.id) + '"><span class="nb">' + x.n + "</span><div>" +
        '<span class="cat">' + esc(h.cat) + "</span>" + (opts.quote === false ? "" : '<span class="quote">' + esc(q.length > 90 ? q.slice(0, 87) + "..." : q) + "</span>") +
        (h.c ? '<p class="cm">' + esc(h.c) + "</p>" : "") + "</div></li>";
    }).join("") + "</ol>";
  }
  function rubricHtml(r, opts) {
    opts = opts || {};
    var tot = 0, any = false;
    var rows = WB.CRIT.map(function (c) {
      var n = (r && r[c]) || 0; tot += n; if (n) any = true;
      var dots = ""; for (var i = 1; i <= WB.RUB_MAX; i++) dots += '<i class="' + (i <= n ? "on" : "") + '"></i>';
      return '<div class="rb"><span class="rl">' + c + '</span><span class="dots">' + dots + '</span><b>' + (n || "") + "</b></div>";
    }).join("");
    if (!any && opts.hideEmpty) return "";
    return '<div class="rubric">' + rows + '<div class="rtot"><span>Total</span><b>' + tot + " / " + WB.RUB_MAX * WB.CRIT.length + "</b></div></div>";
  }
  function starSvg(size, fill) {
    return '<svg width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill="' + (fill || "currentColor") + '"/></svg>';
  }
  var PEN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>';
  function ordinal(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function pts(n) { return n + (n === 1 ? " point" : " points"); }
  function votes(n) { return n + (n === 1 ? " vote" : " votes"); }

  /* A short burst of confetti in Contour colours. */
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
  return { pieceHtml: pieceHtml, selOffsets: selOffsets, notesHtml: notesHtml, rubricHtml: rubricHtml, located: located, starSvg: starSvg, PEN: PEN, ordinal: ordinal, pts: pts, votes: votes, confetti: confetti, TYPE_HINT: TYPE_HINT };
})();
