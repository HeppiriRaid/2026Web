/* ============================================================
   KOKI TAKAMATSU — a word in brackets, centred on its ink (css/style.css, .bx)
   The box centres the word's line box; but letters carry their own side space
   (a K more than an r) and a line its own room above and below the letters, so
   the ink sat up to 2px off centre. Here each word's ink is read from the font
   itself (canvas measureText: how far the letters' shapes reach left, right,
   up and down), and the word is nudged by the difference, in em: the nudge
   scales with the type, so it holds at any size and needs no resize. Before
   the fonts are in, or without this, the word is centred by its line box.
   ============================================================ */
(function () {
  "use strict";
  var words = [].slice.call(document.querySelectorAll(".bx > span"));
  if (!words.length || !document.fonts || !document.fonts.load) return;
  var c = document.createElement("canvas").getContext("2d");
  if (!c || !("actualBoundingBoxAscent" in c.measureText("x"))) return;
  var SIZE = 1000;                                   // measured large, used in em

  function centre(span) {
    var cs = getComputedStyle(span), fs = parseFloat(cs.fontSize) || 16, ls = parseFloat(cs.letterSpacing) || 0;
    c.font = cs.fontStyle + " " + cs.fontWeight + " " + SIZE + "px " + cs.fontFamily;
    if ("letterSpacing" in c) c.letterSpacing = (ls / fs * SIZE) + "px";
    var m = c.measureText(span.textContent);
    // across: the ink's middle against the word's own middle (its advance)
    var dx = (m.width / 2 - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2) / SIZE;
    // up and down: where the browser itself puts the baseline in the word's 1em line (a mark on it: the
    // font's own ascent and descent don't say — measured 0.768em down, they'd give 0.829), and the ink's
    // middle, from there, against the line's middle (the box's: the word is centred in it)
    span.style.top = "";
    var mark = document.createElement("i");
    mark.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
    span.appendChild(mark);
    var base = (mark.getBoundingClientRect().top - span.getBoundingClientRect().top) / fs;
    span.removeChild(mark);
    var dy = 0.5 - (base + (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2 / SIZE);
    span.style.left = dx.toFixed(4) + "em";
    span.style.top = dy.toFixed(4) + "em";
  }

  var first = words[0], cs = getComputedStyle(first);
  document.fonts.load(cs.fontWeight + " 16px " + cs.fontFamily).then(function () {
    words.forEach(centre);
  }, function () {});
})();
