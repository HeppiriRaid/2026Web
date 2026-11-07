/* ============================================================
   KOKI TAKAMATSU — contact page: its intro
   As the illustration page's: a first visit gets the front page's curtain (the
   name rises, then the curtain lifts); arriving from another page of the site,
   the white sheet lifts straight off (js/wipe.js) as the page rises in behind
   it. The parts come in with the front page's reveals (js/anim.js): text and
   links rise 42px into place, the triangle pops. Every tween settles to the
   element's exact static state; if anything throws, the static page shows.
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

  function intro() {
    locked = false;
    gsap.fromTo($$(".istage .brand, .istage .nav"), { opacity: 0, y: 42 },
      { opacity: 1, y: 0, duration: 1.0, ease: "power3.out", stagger: 0.075, clearProps: "transform" });
    var step = window.__arrive ? 0.045 : 0.075, at = 0.12;
    $$(".cstage .h, .cstage .tri, .cstage .copy").forEach(function (el) {
      if (el.matches(".tri")) gsap.fromTo(el, { opacity: 0, y: 14, scale: 0.6 },
        { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: "back.out(1.7)", delay: at, clearProps: "transform" });
      else gsap.fromTo(el, { opacity: 0, y: 42 },
        { opacity: 1, y: 0, duration: 1.0, ease: "power3.out", delay: at, clearProps: "transform" });
      at += step;
    });
  }

  function start() {
    if (!gsap || REDUCE || !pre) { shown(); return; }
    var name = pre.querySelector(".pl-name"), arrive = !!window.__arrive, entered = Promise.resolve();
    if (!arrive) {                     // a fresh visit: the name rises first (from another page of the site, no name)
      var enter = gsap.timeline();
      enter.to(name, { y: "0%", duration: 0.9, ease: "power3.out" });
      entered = new Promise(function (res) { enter.eventCallback("onComplete", res); });
    }
    var fonts = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, wait(2500)]) : Promise.resolve();
    Promise.all([entered, fonts]).then(function () {
      if (arrive && window.__wipe) { window.__wipe.arrive(intro, function () {}); return; }   // the sheet lifts as the page rises in
      var tl = gsap.timeline();
      if (!arrive) tl.to(name, { y: "-115%", duration: 0.55, ease: "power3.in" }, "+=0.15");
      tl.to(pre, { yPercent: -100, duration: 0.85, ease: "power4.inOut", modifiers: window.__wipe && window.__wipe.sheet }, arrive ? 0 : "-=0.25")
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
