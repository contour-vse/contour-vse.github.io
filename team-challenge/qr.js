/* Small QR code maker (byte mode, error correction M, versions 1 to 10). No libraries.
   QR.svg(text, {dark, light}) returns an SVG string. QR.matrix(text) returns rows of booleans. */
var QR = (function () {
  // [ec codewords per block, [blocks, data codewords] groups...] for level M
  var M = [null,
    [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]],
    [16, [4, 27]], [18, [4, 31]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]]];
  var ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  function gmul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
    return z & 255;
  }
  function rsDivisor(deg) {
    var r = []; for (var i = 0; i < deg - 1; i++) r.push(0); r.push(1);
    var root = 1;
    for (var k = 0; k < deg; k++) {
      for (var j = 0; j < r.length; j++) { r[j] = gmul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      root = gmul(root, 2);
    }
    return r;
  }
  function rsRemainder(data, div) {
    var r = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ r.shift(); r.push(0);
      div.forEach(function (c, i) { r[i] ^= gmul(c, f); });
    });
    return r;
  }
  function utf8(s) {
    if (typeof TextEncoder !== "undefined") return Array.from(new TextEncoder().encode(s));
    return unescape(encodeURIComponent(s)).split("").map(function (c) { return c.charCodeAt(0); });
  }
  function dataCap(v) { var t = M[v], n = 0; for (var g = 1; g < t.length; g++) n += t[g][0] * t[g][1]; return n; }

  function matrix(text) {
    var bytes = utf8(text), ver = 0;
    for (var v = 1; v <= 10; v++) { var cc = v < 10 ? 8 : 16; if (4 + cc + bytes.length * 8 <= dataCap(v) * 8) { ver = v; break; } }
    if (!ver) throw new Error("Text too long for QR");
    var bits = [];
    function put(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(function (b) { put(b, 8); });
    var cap = dataCap(ver) * 8;
    put(0, Math.min(4, cap - bits.length));
    while (bits.length % 8) bits.push(0);
    for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var data = []; for (var i = 0; i < bits.length; i += 8) { var b = 0; for (var j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }

    // split into blocks, add error correction, interleave
    var t = M[ver], div = rsDivisor(t[0]), blocks = [], pos = 0;
    for (var g = 1; g < t.length; g++) for (var k = 0; k < t[g][0]; k++) {
      var d = data.slice(pos, pos + t[g][1]); pos += t[g][1];
      blocks.push({ d: d, e: rsRemainder(d, div) });
    }
    var all = [], maxD = 0; blocks.forEach(function (bl) { maxD = Math.max(maxD, bl.d.length); });
    for (i = 0; i < maxD; i++) blocks.forEach(function (bl) { if (i < bl.d.length) all.push(bl.d[i]); });
    for (i = 0; i < t[0]; i++) blocks.forEach(function (bl) { all.push(bl.e[i]); });

    var size = ver * 4 + 17, mod = [], fn = [];
    for (i = 0; i < size; i++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    function setF(x, y, dark) { mod[y][x] = dark; fn[y][x] = true; }
    for (i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var x = cx + dx, y = cy + dy, dist = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, dist !== 2 && dist !== 4);
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    var al = ALIGN[ver], n = al.length;
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) setF(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    function drawFormat(mask) {
      var dat = (0 << 3) | mask, rem = dat;
      for (var q = 0; q < 10; q++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var fb = ((dat << 10) | rem) ^ 0x5412;
      function bit(q) { return ((fb >>> q) & 1) !== 0; }
      for (q = 0; q <= 5; q++) setF(8, q, bit(q));
      setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8));
      for (q = 9; q < 15; q++) setF(14 - q, 8, bit(q));
      for (q = 0; q < 8; q++) setF(size - 1 - q, 8, bit(q));
      for (q = 8; q < 15; q++) setF(8, size - 15 + q, bit(q));
      setF(8, size - 8, true);
    }
    drawFormat(0);
    if (ver >= 7) {
      var rem2 = ver;
      for (i = 0; i < 12; i++) rem2 = (rem2 << 1) ^ ((rem2 >>> 11) * 0x1F25);
      var vb = (ver << 12) | rem2;
      for (i = 0; i < 18; i++) {
        var bt = ((vb >>> i) & 1) !== 0, a = size - 11 + (i % 3), c = Math.floor(i / 3);
        setF(a, c, bt); setF(c, a, bt);
      }
    }
    // place data
    var bi = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) for (j = 0; j < 2; j++) {
        var x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && bi < all.length * 8) { mod[y][x] = ((all[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0; bi++; }
      }
    }
    function maskFn(m, x, y) {
      switch (m) {
        case 0: return (x + y) % 2 === 0; case 1: return y % 2 === 0; case 2: return x % 3 === 0;
        case 3: return (x + y) % 3 === 0; case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
        case 5: return x * y % 2 + x * y % 3 === 0; case 6: return (x * y % 2 + x * y % 3) % 2 === 0;
        default: return ((x + y) % 2 + x * y % 3) % 2 === 0;
      }
    }
    function applyMask(m) { for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) if (!fn[y][x] && maskFn(m, x, y)) mod[y][x] = !mod[y][x]; }
    function penalty() {
      var p = 0, dark = 0, x, y;
      for (var pass = 0; pass < 2; pass++) for (y = 0; y < size; y++) {
        var run = 1;
        for (x = 1; x <= size; x++) {
          var a1 = x < size ? (pass ? mod[x][y] : mod[y][x]) : null, a0 = pass ? mod[x - 1][y] : mod[y][x - 1];
          if (a1 === a0) run++; else { if (run >= 5) p += run - 2; run = 1; }
        }
        var line = []; for (x = 0; x < size; x++) line.push(pass ? mod[x][y] : mod[y][x]);
        var s = line.map(function (b) { return b ? "1" : "0"; }).join("");
        var re = /(?=(10111010000|00001011101))/g; while (re.exec(s)) { p += 40; re.lastIndex++; }
      }
      for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) {
        var c0 = mod[y][x]; if (c0 === mod[y][x + 1] && c0 === mod[y + 1][x] && c0 === mod[y + 1][x + 1]) p += 3;
      }
      for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (mod[y][x]) dark++;
      var total = size * size; p += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
      return p;
    }
    var best = 0, bestP = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(m); drawFormat(m);
      var pp = penalty(); if (pp < bestP) { bestP = pp; best = m; }
      applyMask(m);
    }
    applyMask(best); drawFormat(best);
    return mod;
  }

  function svg(text, opt) {
    opt = opt || {};
    var m = matrix(text), n = m.length, q = 4, d = "";
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (m[y][x]) d += "M" + (x + q) + "," + (y + q) + "h1v1h-1z";
    var s = n + q * 2;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + " " + s + '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
      '<rect width="100%" height="100%" fill="' + (opt.light || "#fff") + '"/><path d="' + d + '" fill="' + (opt.dark || "#000") + '"/></svg>';
  }
  return { matrix: matrix, svg: svg };
})();
if (typeof module !== "undefined" && module.exports) module.exports = QR;
