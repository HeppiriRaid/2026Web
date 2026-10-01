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
   (350 / 25 / 0.5). The red dot marks the exact point.
   Fine pointers only; with reduced motion the normal cursor stays.
   ============================================================ */
(function () {
  "use strict";
  var lens = document.querySelector(".cursor-lens"), dot = document.querySelector(".cursor-dot");
  var mm = window.matchMedia;
  if (!lens || !dot || !mm || !mm("(pointer:fine)").matches) return;
  var root = document.documentElement, reduce = mm("(prefers-reduced-motion: reduce)");

  var HOT = "a, button, .plus", GROW = 1.5;      // over these the square grows 12pt -> 18pt
  var X = { x: 0, v: 0 }, Y = { x: 0, v: 0 }, S = { x: 0, v: 0 };
  var mx = 0, my = 0, shown = false, hot = false, live = false, raf = 0, last = 0, recheck = false;

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
    lens.style.transform = "translate3d(" + X.x.toFixed(2) + "px," + Y.x.toFixed(2) + "px,0) translate(-50%,-50%) scale(" + Math.max(0, S.x).toFixed(4) + ")";
    if (a && b && c) { raf = 0; last = 0; } else raf = requestAnimationFrame(frame);
  }
  function wake() { if (!raf) raf = requestAnimationFrame(frame); }
  function setHot(el) {
    var h = !!(el && el.closest && el.closest(HOT));
    if (h !== hot) { hot = h; wake(); }
  }

  function move(e) {
    mx = e.clientX; my = e.clientY;
    dot.style.transform = "translate3d(" + mx + "px," + my + "px,0) translate(-50%,-50%)";
    if (!shown) {                                    // appear where the mouse is, springing in
      shown = true; X.x = mx; Y.x = my; X.v = Y.v = 0;
      root.classList.add("cursor-on");
    }
    setHot(e.target);
    wake();
  }
  function hide() { if (shown) { shown = false; root.classList.remove("cursor-on"); wake(); } }
  function out(e) { if (!e.relatedTarget) hide(); }                     // left the window
  function scrolled() { if (shown) { recheck = true; wake(); } }         // the page moved under a still mouse

  function apply() {
    if (reduce.matches === !live) return;
    live = !reduce.matches;
    var how = live ? "addEventListener" : "removeEventListener";
    window[how]("mousemove", move, { passive: true });
    document[how]("mouseout", out);
    window[how]("scroll", scrolled, { capture: true, passive: true });
    root.classList.toggle("cursor-ready", live);
    if (!live) hide();
  }
  apply();
  if (reduce.addEventListener) reduce.addEventListener("change", apply);
})();
