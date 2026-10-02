/* ============================================================
   KOKI TAKAMATSU — the cursor: Maison Auge's inverse square
   A 12pt square follows the mouse and inverts whatever passes under it, live.
   It is not a WebGL shader (Maison Auge's isn't either): the square is filled
   with their #DCCBC3 and blended with "difference" (css/anim.css), so every
   pixel beneath shows |pixel - #DCCBC3|. That reads richer than a plain invert:
   white falls to a deep ink-blue instead of black, and colours keep their
   saturation.
   The motion is theirs too, solved exactly every frame: the square trails the
   pointer on their follow spring (stiffness 200, damping 25, mass 0.2), and it
   springs in, out, and up to 18pt over links and works on their box spring
   (350 / 25 / 0.5). A small rhombus marks the exact point, inverting live too.
   Two under-squares follow it beneath the page content and mirror the paper
   about #DCCBC3 first (see css/anim.css), so letters inside the square come out
   clean instead of outlined in black. (The white sheet carries its own pair, and
   the zoom's grey a mirror patch — every .cursor-fold.) They all share one
   rectangle, snapped to whole device pixels. The rule that keeps the square
   clean, and its check (tests/fold-check.mjs), are in CLAUDE.md.
   Fine pointers only; with reduced motion the normal cursor stays.
   ============================================================ */
(function () {
  "use strict";
  var lens = document.querySelector(".cursor-lens"), dot = document.querySelector(".cursor-dot");
  var mm = window.matchMedia;
  if (!lens || !dot || !mm || !mm("(pointer:fine)").matches) return;
  var root = document.documentElement, reduce = mm("(prefers-reduced-motion: reduce)");
  // the square and every under-square / mirror patch (css/anim.css) always share one rectangle;
  // so do the colour test's tone squares (js/menu-shade.js, made before this runs)
  var squares = [lens].concat([].slice.call(document.querySelectorAll(".cursor-fold, .cursor-tone")));
  var FIT = window.__fit || { dw: 460.807, clampPt: 259.2 };

  var HOT = "a, button, .plus", GROW = 1.5;      // over these the square grows 12pt -> 18pt
  var X = { x: 0, v: 0 }, Y = { x: 0, v: 0 }, S = { x: 0, v: 0 };
  var mx = 0, my = 0, shown = false, hot = false, live = false, raf = 0, last = 0, recheck = false, size = -1;

  // Place all three on whole device pixels. An edge pixel the square only partly
  // covered would mix mirrored and plain paper, which crosses #DCCBC3 again and
  // would show as a dark line round the square. The size is whole CSS pixels:
  // the browser gives a layer whole-pixel bounds, so 41.5px would draw as 42.
  function place() {
    var r = window.devicePixelRatio || 1;
    var k = Math.min(window.innerWidth / FIT.dw, FIT.clampPt ? window.innerHeight / FIT.clampPt : Infinity);
    var s = Math.round(12 * k * Math.max(0, S.x));
    var l = Math.round((X.x - s / 2) * r) / r, t = Math.round((Y.x - s / 2) * r) / r, i;
    var tf = "translate(" + l + "px," + t + "px)";
    for (i = 0; i < squares.length; i++) {
      if (s !== size) squares[i].style.width = squares[i].style.height = s + "px";
      squares[i].style.transform = tf;
    }
    size = s;
    if (menuLive() || mirrored) mirrorLabels(l, t, s);
  }

  // ---- the open menu's labels -------------------------------------------------------
  // White over the grey panel, they sit on both sides of #DCCBC3, so inside the square
  // their soft edges would fold through black — and the menu is above the under-squares.
  // So inside the square each label is drawn only as its copy in white's mirror
  // (css/anim.css, .menu-nav a::after), cut out of the label itself: the square turns the
  // copy into exactly white's colour, with clean edges. Outside the square, unchanged.
  var menu = document.querySelector(".menu-nav"), menuUntil = 0, mirrored = false;
  var labels = !menu ? [] : [].map.call(menu.querySelectorAll("a"), function (a) {
    var own = document.createElement("span");
    while (a.firstChild) own.appendChild(a.firstChild);
    a.appendChild(own);
    a.setAttribute("data-label", own.textContent);
    return { a: a, own: own, on: false };
  });
  function menuLive() { return !!menu && (menu.classList.contains("open") || performance.now() < menuUntil); }
  function poly(pts) { return "polygon(" + pts.map(function (p) { return p[0] + "px " + p[1] + "px"; }).join(", ") + ")"; }
  function mirrorLabels(l, t, s) {
    var boxes = labels.map(function (b) { return [b.own.getBoundingClientRect(), b.a.getBoundingClientRect()]; });
    var harmony = root.classList.contains("cursor-harmony");     // (the colour test's lens recolours, it doesn't invert: no copies)
    mirrored = false;
    labels.forEach(function (b, i) {
      var ro = boxes[i][0], ra = boxes[i][1], M = 6;              // letters can overhang their box a little
      var hit = !harmony && s > 0 && menuLive() && l < ro.right + M && l + s > ro.left - M && t < ro.bottom + M && t + s > ro.top - M;
      if (!hit) {
        if (b.on) { b.on = false; b.own.style.clipPath = ""; b.a.style.removeProperty("--cursor-copy"); }
        return;
      }
      b.on = mirrored = true;
      var x0 = l - ro.left, y0 = t - ro.top, x1 = x0 + s, y1 = y0 + s, W = ro.width + 999, H = ro.height + 999;
      // the label itself, with the square cut out of it (even-odd: the inner square is a hole)
      b.own.style.clipPath = "polygon(evenodd, -999px -999px, " + W + "px -999px, " + W + "px " + H + "px, -999px " + H + "px, -999px -999px, " +
        x0 + "px " + y0 + "px, " + x1 + "px " + y0 + "px, " + x1 + "px " + y1 + "px, " + x0 + "px " + y1 + "px, " + x0 + "px " + y0 + "px)";
      // …and its mirror copy, only inside the square
      var cx = l - ra.left, cy = t - ra.top;
      b.a.style.setProperty("--cursor-copy", poly([[cx, cy], [cx + s, cy], [cx + s, cy + s], [cx, cy + s]]));
    });
  }

  // m x'' + c x' + k (x - to) = 0, solved exactly over dt: the same curve at any frame rate
  function spring(s, to, dt, k, c, m) {
    var w = Math.sqrt(k / m), z = c / (2 * Math.sqrt(k * m)), x = s.x - to, v = s.v, e;
    if (z < 1) {
      var wd = w * Math.sqrt(1 - z * z), cs = Math.cos(wd * dt), sn = Math.sin(wd * dt), b = (v + z * w * x) / wd;
      e = Math.exp(-z * w * dt);
      s.x = to + e * (x * cs + b * sn);
      s.v = e * (v * cs - (z * w * b + x * wd) * sn);
    } else if (z > 1) {
      var q = w * Math.sqrt(z * z - 1), r1 = q - z * w, r2 = -q - z * w;
      var a = (v - r2 * x) / (r1 - r2), bb = x - a, e1 = Math.exp(r1 * dt), e2 = Math.exp(r2 * dt);
      s.x = to + a * e1 + bb * e2;
      s.v = a * r1 * e1 + bb * r2 * e2;
    } else {
      var cc = v + w * x;
      e = Math.exp(-w * dt);
      s.x = to + (x + cc * dt) * e;
      s.v = (v - w * cc * dt) * e;
    }
  }
  function settled(s, to, d, sp) {
    if (Math.abs(s.x - to) < d && Math.abs(s.v) < sp) { s.x = to; s.v = 0; return true; }
    return false;
  }

  function frame(t) {
    var dt = last ? Math.min((t - last) / 1000, 0.064) : 1 / 60, to;
    last = t;
    if (recheck) { recheck = false; setHot(document.elementFromPoint(mx, my)); }
    to = shown ? (hot ? GROW : 1) : 0;
    spring(X, mx, dt, 200, 25, 0.2);
    spring(Y, my, dt, 200, 25, 0.2);
    spring(S, to, dt, 350, 25, 0.5);
    var a = settled(X, mx, 0.05, 2), b = settled(Y, my, 0.05, 2), c = settled(S, to, 0.0005, 0.005);
    place();
    // (while the menu is open its labels may be sliding: keep their mirrors in step)
    if (a && b && c && !(menuLive() && size > 0)) { raf = 0; last = 0; } else raf = requestAnimationFrame(frame);
  }
  function wake() { if (!raf && !held) raf = requestAnimationFrame(frame); }

  // automated checks only (tests/fold-check.mjs, in a test browser): hold the square
  // anywhere, at any size, exactly as the cursor would draw it there; null lets go
  var held = false;
  if (navigator.webdriver) window.__cursorProbe = function (l, t, s) {
    if (raf) { cancelAnimationFrame(raf); raf = 0; last = 0; }
    held = s != null;
    if (!held) { size = -1; wake(); return; }
    for (var i = 0; i < squares.length; i++) {
      squares[i].style.width = squares[i].style.height = s + "px";
      squares[i].style.transform = "translate(" + l + "px," + t + "px)";
    }
    size = s;
    mirrorLabels(l, t, s);
  };
  function setHot(el) {
    var h = !!(el && el.closest && el.closest(HOT));
    if (h !== hot) { hot = h; wake(); }
  }

  function move(e) {
    mx = e.clientX; my = e.clientY;
    if (leavingPage) { remember(); return; }          // (the page is going: the square stays out)
    dot.style.transform = "translate3d(" + mx + "px," + my + "px,0) translate(-50%,-50%)";
    if (!shown) {                                    // appear where the mouse is, springing in; until
      shown = true; X.x = mx; Y.x = my; X.v = Y.v = 0;  // this first move the normal cursor stays
      root.classList.add("cursor-on", "cursor-ready");
    }
    setHot(e.target);
    wake();
  }
  function hide() { if (shown) { shown = false; root.classList.remove("cursor-on"); wake(); } }

  // ---- moving between pages (js/wipe.js) -------------------------------------------
  // The square goes with the page: as the white sheet starts to rise it springs out (its
  // own box spring), and on the next page it springs back in where the pointer is, as the
  // sheet lifts off, without waiting for the mouse to move. Where the pointer is crosses
  // over in sessionStorage (read once, good for 15 s).
  var leavingPage = false, SPOT = "kt-cursor";
  function remember() {
    try { sessionStorage.setItem(SPOT, JSON.stringify({ x: mx, y: my, t: Date.now() })); } catch (e) {}
  }
  document.addEventListener("kt:leave", function () {
    if (!live) return;
    leavingPage = true;
    if (shown) remember(); else { try { sessionStorage.removeItem(SPOT); } catch (e) {} }
    hide();
  });
  document.addEventListener("kt:arrive", function () {
    leavingPage = false;
    var at = null;
    try { at = JSON.parse(sessionStorage.getItem(SPOT) || "null"); sessionStorage.removeItem(SPOT); } catch (e) {}
    // (only while the pointer is over the page: it may have left the window meanwhile)
    if (!live || shown || !at || !(Date.now() - at.t < 15000) || !root.matches(":hover")) return;
    mx = at.x; my = at.y;
    dot.style.transform = "translate3d(" + mx + "px," + my + "px,0) translate(-50%,-50%)";
    shown = true; X.x = mx; Y.x = my; X.v = Y.v = 0; S.x = 0; S.v = 0;
    root.classList.add("cursor-on", "cursor-ready");
    recheck = true;
    wake();
  });
  function out(e) { if (!e.relatedTarget) hide(); }                     // left the window
  function scrolled() { if (shown) { recheck = true; wake(); } }         // the page moved under a still mouse

  function apply() {
    if (reduce.matches === !live) return;
    live = !reduce.matches;
    var how = live ? "addEventListener" : "removeEventListener";
    window[how]("mousemove", move, { passive: true });
    document[how]("mouseout", out);
    window[how]("scroll", scrolled, { capture: true, passive: true });
    window[how]("resize", wake);                                         // new scale / pixel ratio
    root.classList.toggle("cursor-live", live);                          // css/anim.css: steady text layer
    if (!live) { hide(); root.classList.remove("cursor-ready"); }
  }
  apply();
  if (reduce.addEventListener) reduce.addEventListener("change", apply);
  // (the next page coming into this window, js/wipe.js: the query outlives this page)
  document.addEventListener("kt:gone", function () { if (reduce.removeEventListener) reduce.removeEventListener("change", apply); });
  // (arriving from another page with the square out, the plain arrow is already hidden: the page's
  // head reads the note above and sets cursor-ready before its first frame, under the white sheet)
  // the menu opening / closing: its labels slide in, or fade out over ~0.8s
  if (menu && window.MutationObserver) new MutationObserver(function () {
    if (!menu.classList.contains("open")) menuUntil = performance.now() + 800;
    wake();
  }).observe(menu, { attributes: true, attributeFilter: ["class"] });
})();
