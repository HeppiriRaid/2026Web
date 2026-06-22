/* ============================================================
   KOKI TAKAMATSU — animation driver
   Hard rule: every tween settles to the element's exact static
   state. Reveals only ever animate opacity, transform (ending at
   identity) and clip-path (ending at inset(0)). The "+" marks are
   opacity-only so their translate(-50%,-50%) centring is never
   touched. If anything throws, we fall back to the static page.
   ============================================================ */
(function () {
  "use strict";

  var root = document.documentElement;
  var REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // hand control over from the head-script failsafe
  if (window.__revealFailsafe) clearTimeout(window.__revealFailsafe);

  function showStatic() {
    root.classList.remove("anim");
    var p = document.getElementById("preloader");
    if (p) p.parentNode && p.parentNode.removeChild(p);
  }

  // No GSAP, or user prefers reduced motion → static page, native scroll.
  if (REDUCE || typeof window.gsap === "undefined") {
    showStatic();
    return;
  }

  try {
    var gsap = window.gsap;
    if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);
    var ST = window.ScrollTrigger;

    /* Pre-decode the photos and rasterise their compositing layer up front
       (this happens during the preloader, behind the overlay). Otherwise the
       large source image decodes + paints synchronously on the first frame of
       its wipe, dropping one long frame — the stutter at the start of the
       reveal. will-change is stripped again on completion (see strip()), so the
       resting layout stays pixel-identical. */
    gsap.utils.toArray(".ph img").forEach(function (im) {
      if (im.decode) { try { im.decode().catch(function () {}); } catch (e) {} }
      im.style.willChange = "transform";
    });

    /* ---------- smooth scroll (Lenis), wired to ScrollTrigger ---------- */
    var lenis = null;
    if (typeof window.Lenis !== "undefined") {
      lenis = new window.Lenis({
        duration: 1.1,
        easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
        smoothWheel: true,
        wheelMultiplier: 1,
        touchMultiplier: 1.4,
      });
      window.__lenis = lenis;
      if (ST) lenis.on("scroll", ST.update);
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
    }

    /* ---------- reveal primitives -------------------------------------
       Each tween is a fromTo so the start state is explicit, and on
       completion EVERY trace of the animation is removed: transform is
       cleared, clip-path is set to none. The element is then left with
       only opacity:1 (or, for photos/boxes, clip-path:none) — i.e. it
       rasterises identically to the static page, no compositing layer.  */
    function strip(t) { gsap.set(t, { clearProps: "transform,willChange" }); }

    // custom cubic-bezier ease (no plugin): solves y for a given x via bisection
    function cubicBezier(x1, y1, x2, y2) {
      function bz(p, a, b) { var m = 1 - p; return 3 * m * m * p * a + 3 * m * p * p * b + p * p * p; }
      return function (x) {
        if (x <= 0) return 0; if (x >= 1) return 1;
        var lo = 0, hi = 1, p = x;
        for (var i = 0; i < 18; i++) { p = (lo + hi) / 2; if (bz(p, x1, x2) < x) lo = p; else hi = p; }
        return bz(p, y1, y2);
      };
    }
    // Works panels: slow → fast → slow, with the opening ease-in slightly
    // shorter than the closing ease-out (velocity peaks at ~43%).
    var worksEase = cubicBezier(0.38, 0, 0.5, 1);

    function slideIn(t, o) {   // text, captions, brand, nav
      return gsap.fromTo(t, { opacity: 0, y: 42 }, Object.assign(
        { opacity: 1, y: 0, duration: 1.0, ease: "power3.out",
          onComplete: function () { strip(t); } }, o || {}));
    }
    function popIn(t, o) {      // triangles + squares
      return gsap.fromTo(t, { opacity: 0, y: 14, scale: 0.6 }, Object.assign(
        { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: "back.out(1.7)",
          onComplete: function () { strip(t); } }, o || {}));
    }
    function tickIn(t, o) {     // corner ticks / link ticks
      return gsap.fromTo(t, { opacity: 0, scale: 0.35 }, Object.assign(
        { opacity: 1, scale: 1, duration: 0.5, ease: "power2.out",
          onComplete: function () { strip(t); } }, o || {}));
    }
    function plusIn(t, o) {     // "+" — OPACITY ONLY (never touch transform)
      return gsap.fromTo(t, { opacity: 0 }, Object.assign(
        { opacity: 1, duration: 0.6, ease: "power2.out" }, o || {}));
    }
    function imageIn(t, o) {    // photos — wipe in (top→down); optional settle from a slight zoom
      // images marked data-noscale wipe at their natural size (no size change)
      var els = gsap.utils.toArray(t);
      var noScale = els.length && els[0].hasAttribute("data-noscale");
      var from = { clipPath: "inset(0px 0px 100% 0px)" };
      var to = { clipPath: "inset(0px 0px 0px 0px)", duration: 1.25, ease: "power3.out",
                 onComplete: function () { gsap.set(t, { clipPath: "none" }); strip(t); } };
      if (!noScale) { from.scale = 1.12; to.scale = 1; }
      return gsap.fromTo(t, from, Object.assign(to, o || {}));
    }
    function boxIn(t, o) {      // grey panels — sideways wipe (L→R), slow→fast→slow
      o = o || {};
      var els = gsap.utils.toArray(t);
      var stag = o.stagger || 0;
      // Selected Works panels also fade in (gentle, to match the soft start)
      var fadeEls = els.filter(function (e) { return e.hasAttribute("data-fade"); });
      if (fadeEls.length) {
        gsap.fromTo(fadeEls, { opacity: 0 },
          { opacity: 1, duration: 0.9, ease: "power2.inOut", stagger: stag });
      }
      // Drive the wipe from a numeric proxy and write the clip-path each frame.
      // GSAP's clip-path STRING interpolation does not honor a function ease
      // (it snaps), so the custom slow→fast→slow worksEase — ease-in ~43% (a
      // little shorter) then a longer ease-out — only applies via the proxy.
      var first;
      els.forEach(function (el, i) {
        var s = { p: 0 };
        var tw = gsap.to(s, {
          p: 1, duration: 2.0, ease: worksEase, delay: stag * i,
          onUpdate: function () { el.style.clipPath = "inset(0px " + ((1 - s.p) * 100) + "% 0px 0px)"; },
          onComplete: function () { gsap.set(el, { clipPath: "none" }); strip(el); },
        });
        if (i === 0) first = tw;
      });
      return first;
    }

    function typeOf(el) {
      if (el.matches(".plus")) return "plus";
      if (el.matches(".ph img")) return "image";
      if (el.matches(".box")) return "box";
      if (el.matches(".ltick") || el.matches(".fr > i")) return "tick";
      if (el.matches(".tri") || el.matches(".sq") || el.matches(".sqg")) return "pop";
      return "slide";
    }
    function revealBy(type, els, o) {
      switch (type) {
        case "plus":  return plusIn(els, o);
        case "image": return imageIn(els, o);
        case "box":   return boxIn(els, o);
        case "tick":  return tickIn(els, o);
        case "pop":   return popIn(els, o);
        default:      return slideIn(els, o);
      }
    }

    /* ---------- collect every animated element ------------------------- */
    var all = gsap.utils.toArray(
      ".brand, .nav, .h, .copy, .cap, .tri, .sq, .sqg, .ltick, .fr > i, .plus, .ph img, .box"
    );

    // split into first-screen (intro) vs below-fold (scroll)
    var vh = window.innerHeight;
    var intro = [], scroll = [];
    all.forEach(function (el) {
      var top = el.getBoundingClientRect().top + window.scrollY;
      el.__top = top;
      (top < vh * 0.96 ? intro : scroll).push(el);
    });
    intro.sort(function (a, b) { return a.__top - b.__top; });

    /* ---------- intro timeline (top→down cascade after preloader) ------ */
    var introTL = gsap.timeline({ paused: true });
    var dur = { slide: 1.0, pop: 0.7, tick: 0.5, plus: 0.6, image: 1.25, box: 1.0 };
    var at = 0;
    intro.forEach(function (el) {
      var ty = typeOf(el);
      // The hero photo LEADS the cascade (position 0). Because the intro
      // overlaps the curtain lift, the wipe is already underway by the time the
      // curtain clears — so the photo's spot is never left blank (no
      // "progressing without photo, then it suddenly appears").
      var pos = (ty === "image") ? 0 : at;
      introTL.add(revealBy(ty, el, { duration: dur[ty] }), pos);
      if (ty !== "image") at += 0.075;
    });

    var TYPES = ["slide", "pop", "tick", "plus", "image", "box"];

    // reveal whatever is still hidden, grouped by type (used as a safety net
    // for the final screen, where elements can't reach a "top x%" trigger line)
    function revealRemaining() {
      var left = all.filter(function (el) {
        return parseFloat(getComputedStyle(el).opacity) < 0.99;
      });
      if (!left.length) return;
      TYPES.forEach(function (ty) {
        var els = left.filter(function (e) { return typeOf(e) === ty; });
        if (els.length) revealBy(ty, els, { stagger: 0.05, overwrite: "auto" });
      });
    }

    /* ---------- below-fold reveals (batched by type) ------------------- */
    function setupScroll() {
      if (!ST) { // no ScrollTrigger → just reveal everything
        TYPES.forEach(function (ty) {
          var els = scroll.filter(function (e) { return typeOf(e) === ty; });
          if (els.length) revealBy(ty, els, { stagger: 0.04 });
        });
        return;
      }
      TYPES.forEach(function (ty) {
        var els = scroll.filter(function (e) { return typeOf(e) === ty; });
        if (!els.length) return;
        ST.batch(els, {
          start: "top 88%",
          once: true,
          onEnter: function (b) { revealBy(ty, b, { stagger: 0.06, overwrite: "auto" }); },
        });
      });
      // final-screen catch-all: the calligraphy group sits in the last viewport
      // and can't reach a "top 88%" line, so reveal any stragglers once the last
      // section heading scrolls into view (a comfortably reachable trigger).
      var last = document.getElementById("contact");
      if (last) {
        ST.create({ trigger: last, start: "top 72%", once: true, onEnter: revealRemaining });
      }
      ST.refresh();
    }

    /* ---------- preloader → intro -------------------------------------- */
    var pre = document.getElementById("preloader");
    function runIntro() { introTL.play(); }

    // Build + measure the ScrollTriggers NOW, up front, behind the still
    // preloader. ScrollTrigger.refresh() forces a synchronous layout of every
    // trigger; doing it at the preloader→intro handoff dropped an ~80ms frame
    // right as the profile reveal started (the stutter). Scroll is locked until
    // the reveal, so the triggers being ready early is harmless.
    setupScroll();

    // resolves once an image is actually paintable (loaded + decoded)
    function whenReady(img) {
      if (!img) return Promise.resolve();
      if (img.decode) { return img.decode().then(null, function () {}); }
      if (img.complete && img.naturalWidth) return Promise.resolve();
      return new Promise(function (res) {
        img.addEventListener("load", res, { once: true });
        img.addEventListener("error", res, { once: true });
      });
    }
    function withTimeout(p, ms) {
      return Promise.race([p, new Promise(function (res) { setTimeout(res, ms); })]);
    }

    if (pre && !REDUCE) {
      var name = pre.querySelector(".pl-name");
      var bar = pre.querySelector(".pl-bar");
      if (lenis) lenis.stop();

      // The hero photo must be painted before the curtain lifts. Otherwise the
      // wipe plays over an empty frame and the image pops in mid-animation.
      var hero = document.querySelector(".ph img[data-noscale]") || document.querySelector(".ph img");
      var heroReady = withTimeout(whenReady(hero), 6000);

      // entrance (wordmark + bar) runs regardless; the curtain only lifts once
      // BOTH the entrance has played and the hero image is ready to paint.
      var enter = gsap.timeline();
      enter.to(name, { y: "0%", duration: 0.9, ease: "power3.out" })
           .to(bar, { width: "100%", duration: 1.0, ease: "power2.inOut" }, "-=0.75");
      var entered = new Promise(function (res) { enter.eventCallback("onComplete", res); });

      Promise.all([entered, heroReady]).then(function () {
        var exit = gsap.timeline();
        exit.to(name, { y: "-115%", duration: 0.55, ease: "power3.in" }, "+=0.15")
            .to(pre, { yPercent: -100, duration: 0.85, ease: "power4.inOut" }, "-=0.25")
            .add(function () {
              pre.style.display = "none";
              if (lenis) lenis.start();
            })
            .add(runIntro, "-=0.45");
      });
    } else {
      if (pre) pre.style.display = "none";
      runIntro();
    }

    /* ---------- custom cursor (fine pointers only) --------------------- */
    (function cursor() {
      var dot = document.querySelector(".cursor-dot");
      var ring = document.querySelector(".cursor-ring");
      if (!dot || !ring || !window.matchMedia("(pointer:fine)").matches) return;
      root.classList.add("cursor-ready");

      var mx = window.innerWidth / 2, my = window.innerHeight / 2, rx = mx, ry = my;
      var dx = gsap.quickSetter(dot, "left", "px"),
          dy = gsap.quickSetter(dot, "top", "px"),
          rxS = gsap.quickSetter(ring, "left", "px"),
          ryS = gsap.quickSetter(ring, "top", "px");
      dx(mx); dy(my); rxS(rx); ryS(ry);

      window.addEventListener("mousemove", function (e) {
        mx = e.clientX; my = e.clientY; dx(mx); dy(my);
      }, { passive: true });
      gsap.ticker.add(function () {
        rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18; rxS(rx); ryS(ry);
      });
      document.addEventListener("mouseover", function (e) {
        if (e.target.closest("a, .plus")) ring.classList.add("is-hover");
      });
      document.addEventListener("mouseout", function (e) {
        if (e.target.closest("a, .plus")) ring.classList.remove("is-hover");
      });
    })();

    /* ---------- nav → smooth scroll to sections ------------------------ */
    (function nav() {
      var map = { ABOUT: "#about", WORK: "#works", CONTACT: "#contact" };
      document.querySelectorAll(".nav").forEach(function (a) {
        a.style.cursor = "pointer";
        a.addEventListener("click", function (e) {
          e.preventDefault();
          var sel = map[(a.textContent || "").trim()];
          var target = sel && document.querySelector(sel);
          if (!target) return;
          if (lenis) lenis.scrollTo(target, { offset: -48, duration: 1.3 });
          else target.scrollIntoView({ behavior: "smooth" });
        });
      });
    })();

    // recompute trigger positions once fonts have fully settled
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { if (ST) ST.refresh(); });
    }
    window.addEventListener("load", function () { if (ST) ST.refresh(); });

  } catch (err) {
    // anything goes wrong → guarantee the static, correct page
    if (window.console) console.error("anim.js failed, showing static page:", err);
    showStatic();
  }
})();
