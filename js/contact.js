/* ============================================================
   KOKI TAKAMATSU — contact page: its intro
   As the illustration page's: a first visit gets the front page's curtain (the
   name rises, then the curtain lifts); arriving from another page of the site,
   the white sheet lifts straight off (js/wipe.js) as the page rises in behind
   it. The page rises 42px into place as one: the header, the heading, its
   triangle, the address and the links share one clock and one easing, the
   zoom step's (stepEase: sets off gently, lands long and soft; CLAUDE.md, "The
   flow of motion"). Every tween settles to the element's exact static state;
   if anything throws, the static page shows.
   ============================================================ */
(function () {
  "use strict";
  var root = document.documentElement, gsap = window.gsap, pre = document.getElementById("preloader");
  var REDUCE = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (window.__revealFailsafe) clearTimeout(window.__revealFailsafe);
  var locked = true;

  function $$(s) { return [].slice.call(document.querySelectorAll(s)); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function shown() { locked = false; if (pre) pre.style.display = "none"; root.classList.remove("anim"); }

  // custom cubic-bezier ease (no plugin) — the same solver as js/zoom.js
  function cubicBezier(x1, y1, x2, y2) {
    function bz(p, a, b) { var m = 1 - p; return 3 * m * m * p * a + 3 * m * p * p * b + p * p * p; }
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var lo = 0, hi = 1, p = x;
      for (var i = 0; i < 18; i++) { p = (lo + hi) / 2; if (bz(p, x1, x2) < x) lo = p; else hi = p; }
      return bz(p, y1, y2);
    };
  }
  var stepEase = cubicBezier(0.3, 0, 0.2, 1);     // the zoom step's: sets off gently, lands long and soft

  // the whole page rises in as one motion: one clock, one easing, nothing starting on its own
  function intro() {
    locked = false;
    gsap.fromTo($$(".istage .brand, .istage .nav, .cstage .h, .cstage .tri, .cstage .copy"), { opacity: 0, y: 42 },
      { opacity: 1, y: 0, duration: 1.1, ease: stepEase, force3D: false, clearProps: "transform" });
  }

  function start() {
    if (!gsap || REDUCE || !pre) { shown(); return; }
    var name = pre.querySelector(".pl-name"), arrive = !!window.__arrive, entered = Promise.resolve();
    if (!arrive) {                     // a fresh visit: the name rises first (from another page of the site, no name)
      var enter = gsap.timeline();
      enter.to(name, { y: "0%", duration: 0.9, ease: stepEase, force3D: false });
      entered = new Promise(function (res) { enter.eventCallback("onComplete", res); });
    }
    var fonts = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, wait(2500)]) : Promise.resolve();
    Promise.all([entered, fonts]).then(function () {
      if (arrive && window.__wipe) { window.__wipe.arrive(intro, function () {}); return; }   // the sheet lifts as the page rises in
      var tl = gsap.timeline();
      if (!arrive) tl.to(name, { y: "-115%", duration: 0.55, ease: stepEase, force3D: false }, "+=0.15");
      tl.to(pre, { yPercent: -100, duration: 0.85, ease: stepEase, force3D: false, modifiers: window.__wipe && window.__wipe.sheet }, arrive ? 0 : "-=0.25")
        .add(function () { pre.style.display = "none"; })
        .add(intro, "-=0.45");
    });
    setTimeout(function () { if (locked) shown(); }, 12000);   // failsafe: never leave the page covered
  }

  try { start(); } catch (err) {
    if (window.console) console.error("contact.js failed, showing the static page:", err);
    shown();
  }
})();
