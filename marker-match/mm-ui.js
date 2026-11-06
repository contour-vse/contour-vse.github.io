/* Marker Match shared view helpers (student page, tutor board and projector screen). Needs mm-engine.js and mm-api.js. */
var UI = (function () {
  var esc = Net.esc;
  var ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 18h3M4 13h7M4 8h11"/><path d="M14.5 16.5l2.5 2.5 4.5-5"/></svg>';
  var HINT = { Ideas: "How fresh and clear the idea is", Structure: "How the piece is built and paced", Language: "Word choice, showing, variety", Control: "Tense, punctuation, sentences" };

  /* One criterion: a dot per student on a 1 to 10 track, the tutor's mark boxed.
     counts = [n1..n10]; opts: {tm, mine, avg, big, delay (s)} */
  function dotRow(crit, counts, opts) {
    opts = opts || {};
    var cols = "", d = opts.delay || 0, maxN = Math.max.apply(null, counts.concat([1]));
    for (var i = 1; i <= MM.TOP; i++) {
      var n = counts[i - 1] || 0, dots = "";
      for (var j = 0; j < n; j++) {
        var me = opts.mine === i && j === 0;
        dots += '<i class="' + (me ? "me" : "") + '" style="animation-delay:' + (d + 0.25 + (i - 1) * 0.04 + j * 0.035).toFixed(2) + 's"></i>';
      }
      cols += '<div class="dpc' + (opts.tm === i ? " tm" : "") + '">' + (opts.tm === i ? '<span class="flag" style="animation-delay:' + (d + 0.9).toFixed(2) + 's">Tutor</span>' : "") +
        '<div class="stack">' + dots + '</div><span class="ax">' + i + "</span></div>";
    }
    var avg = opts.avg ? '<span class="avgm" style="left:' + ((opts.avg - 0.5) / MM.TOP * 100).toFixed(1) + '%" title="Class average ' + opts.avg + '"></span>' : "";
    return '<div class="dp' + (opts.big ? " big" : "") + '" style="--maxn:' + maxN + '"><div class="dpl"><span>' + crit + "</span>" + (opts.tm ? '<b style="animation-delay:' + (d + 0.9).toFixed(2) + 's">' + opts.tm + "</b>" : "") + '</div><div class="dpt">' + cols + avg + "</div></div>";
  }
  function plots(spread, tm, opts) {
    opts = opts || {};
    return '<div class="plots">' + MM.CRIT.map(function (c, k) {
      return dotRow(c, (spread || {})[c] || [], { tm: tm && tm[c], mine: opts.mine && opts.mine[c], avg: opts.avg && opts.avg[c], big: opts.big, delay: k * 0.35 });
    }).join("") + "</div>";
  }
  /* Largest font (max to min px) at which el fits inside box without scrolling; long pieces get two columns on wide screens. */
  function fit(box, el, max, min) {
    if (!box || !el) return;
    box.classList.toggle("cols", el.textContent.length > 1300 && box.clientWidth > 1000);
    function fits() { return box.scrollHeight <= box.clientHeight + 1 && box.scrollWidth <= box.clientWidth + 1; }
    el.style.fontSize = max + "px";
    if (fits()) return;
    var lo = min, hi = max, best = min;
    while (hi - lo > 0.5) { var mid = (lo + hi) / 2; el.style.fontSize = mid + "px"; if (fits()) { best = mid; lo = mid; } else hi = mid; }
    el.style.fontSize = best + "px";
  }
  function marksLine(r) { return MM.CRIT.map(function (c) { return c.charAt(0) + " " + r[c]; }).join(", "); }
  function total(r) { return MM.CRIT.reduce(function (s, c) { return s + (r && r[c] || 0); }, 0); }
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
  return { ICON: ICON, HINT: HINT, fit: fit, dotRow: dotRow, plots: plots, marksLine: marksLine, total: total, ordinal: ordinal, pts: pts, confetti: confetti };
})();
