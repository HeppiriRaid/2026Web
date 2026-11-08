/* ============================================================
   KOKI TAKAMATSU — the pages on a narrow screen (css/narrow.css): what CSS
   alone can't place.
   - The grey bands (BACK GROUND, CALLIGRAPHY; the front page) stay where they
     are, beneath the page and the cursor's under-squares — the under-squares
     must lie above them, or letters on the grey would fold inside the square
     (CLAUDE.md) — so on a narrow screen each is laid exactly under its section
     (.sec[data-band]) whenever the page's layout moves; on the artboard it
     keeps its own place (its points).
   - The shapes that grow into place (js/anim.js, js/contact.js: a heading's
     triangle, the red square) rest on whole pixels, as on the artboard
     (css/style.css): moved, a shape is drawn exactly where it is, at rest on
     whole pixels, so one resting between them would hop as its motion let go
     of it. In the column each falls where the text before it ends, between
     pixels: so each is nudged onto the pixel grid (position: relative, which
     moves nothing else; its size is whole, css/narrow.css). It is read with
     its motion taken out (a scale about its middle and a lift), so it can be
     read mid-motion.
   Nothing here moves while anything else does: it follows the layout, read
   once a frame at most, all read before anything is written.
   ============================================================ */
(function () {
  "use strict";
  var root = document.documentElement;
  var bands = [].slice.call(document.querySelectorAll("body > .band"));
  var secs = [].slice.call(document.querySelectorAll(".sec[data-band]"));
  if (bands.length !== secs.length) bands = [];
  var shapes = [].slice.call(document.querySelectorAll(".stage .tri, .stage .sq"));
  if (!bands.length && !shapes.length) return;
  var own = bands.map(function (b) { return b.getAttribute("style") || ""; }), queued = false, ro = null;

  // where a shape's box lies on the page, its motion taken out: GSAP moves it by translate and scale
  // about its middle (DOMMatrix a, d, e, f), and the nudge it has from here is taken out too
  function laid(el) {
    var r = el.getBoundingClientRect(), t = getComputedStyle(el).transform;
    var m = t && t !== "none" ? new DOMMatrix(t) : { a: 1, d: 1, e: 0, f: 0 };
    return [r.left + window.pageXOffset - el.offsetWidth / 2 * (1 - m.a) - m.e - (parseFloat(el.style.left) || 0),
            r.top + window.pageYOffset - el.offsetHeight / 2 * (1 - m.d) - m.f - (parseFloat(el.style.top) || 0)];
  }

  function place() {
    queued = false;
    var narrow = root.classList.contains("narrow"), y = window.pageYOffset || 0, dpr = window.devicePixelRatio || 1;
    // (read everything first, then write: one layout)
    var at = narrow ? bands.map(function (b, i) { var r = secs[i].getBoundingClientRect(); return [r.top + y, r.height]; }) : [];
    var to = narrow ? shapes.map(function (el) { return el.offsetWidth ? laid(el) : null; }) : [];
    bands.forEach(function (b, i) {
      if (!narrow) { if (b.getAttribute("style") !== own[i]) b.setAttribute("style", own[i]); return; }
      b.style.top = at[i][0] + "px";
      b.style.height = at[i][1] + "px";
    });
    shapes.forEach(function (el, i) {
      if (!narrow || !to[i]) { if (el.style.left || el.style.top) el.style.left = el.style.top = ""; return; }
      el.style.left = Math.round(to[i][0] * dpr) / dpr - to[i][0] + "px";
      el.style.top = Math.round(to[i][1] * dpr) / dpr - to[i][1] + "px";
    });
  }
  function later() { if (!queued) { queued = true; requestAnimationFrame(place); } }

  place();
  if (window.ResizeObserver) {
    ro = new ResizeObserver(later);
    [].forEach.call(document.querySelectorAll(".stage > .sec, .cstage"), function (s) { ro.observe(s); });
  }
  window.addEventListener("resize", later);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);
  // (the next page coming into this window, js/wipe.js: the observer outlives this page)
  document.addEventListener("kt:gone", function () { if (ro) ro.disconnect(); });
})();
