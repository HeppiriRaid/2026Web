/* ============================================================
   KOKI TAKAMATSU — a word in brackets, centred as the eye reads it (css/style.css, .bx)
   The eye measures each gap where a bracket is, from its arm to the letters
   next to it:
     · up and down: the top-left mark's arm to the top of the first letter, and
       the bottom of the last letter to the bottom-right mark's arm;
     · across: the top-left mark to the letters at its height (the box's top
       band), and the letters at the bottom-right mark's height (its bottom band)
       to that mark. ("Kickstarter" ends in an r: at the bottom only its stem,
       further in than its top, so centring the word's outline left that gap
       longer.)
   Each pair is made equal. The word is drawn on a canvas, in the page's own
   font, and its letters' pixels are read in those places; then the word is
   nudged by the difference, in em. Before the fonts are in, or without this,
   the word is centred by its line box. Again on resize (the marks are whole
   pixels, so their share of the box moves a little with the size).
   ============================================================ */
(function () {
  "use strict";
  var words = [].slice.call(document.querySelectorAll(".bx > span"));
  if (!words.length || !document.fonts || !document.fonts.load) return;
  var cv = document.createElement("canvas"), c = cv.getContext("2d", { willReadFrequently: true });
  if (!c || !("actualBoundingBoxAscent" in c.measureText("x"))) return;
  var SIZE = 400, INK = 128;                         // drawn at 400px; a pixel half covered or more is ink

  // where the browser puts the baseline in the word's 1em line, in em (a mark on it: the font's own
  // ascent and descent don't say — measured 0.768em, they'd give 0.829)
  function baseline(span, fs) {
    var mark = document.createElement("i");
    mark.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
    span.appendChild(mark);
    var b = (mark.getBoundingClientRect().top - span.getBoundingClientRect().top) / fs;
    span.removeChild(mark);
    return b;
  }

  function centre(span) {
    var box = span.parentNode, cs = getComputedStyle(span), fs = parseFloat(cs.fontSize) || 16;
    var ls = parseFloat(cs.letterSpacing) || 0, text = span.textContent;
    var font = cs.fontStyle + " " + cs.fontWeight + " " + SIZE + "px " + cs.fontFamily;
    c.font = font;
    if ("letterSpacing" in c) c.letterSpacing = (ls / fs * SIZE) + "px";
    var m = c.measureText(text), A = Math.ceil(m.fontBoundingBoxAscent), D = Math.ceil(m.fontBoundingBoxDescent), pad = 8;
    var W = Math.ceil(m.width) + 2 * pad, H = A + D + 2 * pad;
    cv.width = W; cv.height = H;                                       // (resets the context)
    c.font = font;
    if ("letterSpacing" in c) c.letterSpacing = (ls / fs * SIZE) + "px";
    c.fillStyle = "#000"; c.textBaseline = "alphabetic";
    c.fillText(text, pad, pad + A);
    var px = c.getImageData(0, 0, W, H).data;
    function ink(x, y) { return px[(y * W + x) * 4 + 3] >= INK; }
    // in canvas pixels, from the word's start (x) and its baseline (y, down)
    var x0 = pad, yb = pad + A;
    var first = c.measureText(text.charAt(0)).width, last = c.measureText(text.charAt(text.length - 1)).width;
    var top = Infinity, bottom = -Infinity, x, y;
    for (x = 0; x < W; x++) {
      var inFirst = x - x0 < first, inLast = x - x0 >= m.width - last;
      if (!inFirst && !inLast) continue;
      for (y = 0; y < H; y++) if (ink(x, y)) {
        if (inFirst) top = Math.min(top, y - yb);
        if (inLast) bottom = Math.max(bottom, y - yb + 1);
      }
    }
    if (!isFinite(top) || !isFinite(bottom)) return;
    // the box, in the same pixels: the word's line is centred in it, its baseline `b` em down that 1em line
    var k = SIZE / fs, r = box.getBoundingClientRect(), bh = r.height * k;
    var s = (parseFloat(getComputedStyle(box, "::before").width) || 0) * k;
    var cy = (0.5 - baseline(span, fs)) * SIZE;                        // the box's middle, from the baseline
    var dy = cy - (top + bottom) / 2;                                   // up and down: the two gaps equal
    var boxTop = cy - bh / 2, boxBottom = cy + bh / 2;
    var left = Infinity, right = -Infinity, anyL = Infinity, anyR = -Infinity;
    for (y = 0; y < H; y++) {
      var yy = y - yb + dy, inTop = yy < boxTop + s, inBottom = yy >= boxBottom - s;
      for (x = 0; x < W; x++) if (ink(x, y)) {
        anyL = Math.min(anyL, x - x0); anyR = Math.max(anyR, x - x0 + 1);
        if (inTop) left = Math.min(left, x - x0);
        if (inBottom) right = Math.max(right, x - x0 + 1);
      }
    }
    if (!isFinite(left)) left = anyL;                                   // (no letter at a mark's height: the word's own edge)
    if (!isFinite(right)) right = anyR;
    var dx = m.width / 2 - (left + right) / 2;                          // across: the two gaps equal
    span.style.left = (dx / SIZE).toFixed(4) + "em";
    span.style.top = (dy / SIZE).toFixed(4) + "em";
    // up and down, once more in whole device pixels: the box's edges and the word's baseline each snap to
    // the pixel grid on their own, and the two roundings could add up to 2px. Where they now land, and
    // the word moved by whole pixels so the two gaps differ by no more than a pixel
    var dpr = window.devicePixelRatio || 1, snap = function (v) { return Math.round(v * dpr) / dpr; };
    var mark = document.createElement("i");
    mark.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
    span.appendChild(mark);
    var by = mark.getBoundingClientRect().top;
    span.removeChild(mark);
    r = box.getBoundingClientRect();
    var base = snap(by), gapTop = base + top / k - snap(r.top), gapBottom = snap(r.bottom) - (base + bottom / k);
    var move = Math.round((gapBottom - gapTop) / 2 * dpr) / dpr;
    if (move) span.style.top = (dy / SIZE + move / fs).toFixed(4) + "em";
  }

  function all() { words.forEach(function (w) { w.style.left = ""; w.style.top = ""; centre(w); }); }
  var cs = getComputedStyle(words[0]), queued = false;
  document.fonts.load(cs.fontWeight + " 16px " + cs.fontFamily).then(function () {
    all();
    window.addEventListener("resize", function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; all(); });
    });
  }, function () {});
})();
