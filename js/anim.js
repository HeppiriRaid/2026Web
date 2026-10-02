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

    /* Pre-decode the photos up front (this happens during the preloader, behind
       the overlay). Otherwise the large source image decodes on the first frame of
       its wipe, dropping one long frame — the stutter at the start of the reveal.
       (No layer of their own: a layer is drawn at the photo's exact, fractional
       place with soft edges, and a soft edge between a bright photo and the paper
       folds inside the cursor's square — CLAUDE.md. Drawn in place, a photo wipes
       in on the very pixels it rests on; measured, it wipes no less smoothly.) */
    gsap.utils.toArray(".ph img").forEach(function (im) {
      if (im.decode) { try { im.decode().catch(function () {}); } catch (e) {} }
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
    // The clip for a wipe that has revealed p (0→1) of el, from its "left", "right" or "top"
    // edge. The moving edge lands on a whole device pixel and the still sides lie a pixel
    // outside the box: inside the cursor's square, a half-covered pixel on a wipe's edge
    // would fold through black (css/anim.css). (A scaled element keeps plain percentages.)
    function wipeClip(el, p, from) {
      var r = el.getBoundingClientRect(), d = window.devicePixelRatio || 1;
      var snap = function (v) { return Math.round(v * d) / d; };
      if (Math.abs(r.width - el.offsetWidth) > 0.5) {
        var q = (1 - p) * 100 + "%";
        return from === "left" ? "inset(0px " + q + " 0px 0px)" : from === "right" ? "inset(0px 0px 0px " + q + ")" : "inset(0px 0px " + q + " 0px)";
      }
      var t = -1, rt = -1, b = -1, l = -1;
      if (from === "left") rt = r.right - snap(r.left + r.width * p);
      else if (from === "right") l = snap(r.right - r.width * p) - r.left;
      else b = r.bottom - snap(r.top + r.height * p);
      return "inset(" + t + "px " + rt + "px " + b + "px " + l + "px)";
    }

    function imageIn(t, o) {    // photos — wipe in (top→down); optional settle from a slight zoom
      // images marked data-noscale wipe at their natural size (no size change)
      var els = gsap.utils.toArray(t);
      var noScale = els.length && els[0].hasAttribute("data-noscale");
      if (noScale) {             // (through a proxy each, so the wipe's edge can land on whole pixels)
        var opt = o || {}, first;
        els.forEach(function (el, i) {
          var s = { p: 0 }, draw = function () { el.style.clipPath = wipeClip(el, s.p, "top"); };
          draw();
          var tw = gsap.to(s, { p: 1, duration: opt.duration || 1.25, ease: "power3.out",
            delay: (opt.delay || 0) + (opt.stagger || 0) * i, onUpdate: draw,
            onComplete: function () { gsap.set(el, { clipPath: "none" }); strip(el); } });
          if (!i) first = tw;
        });
        return first;
      }
      var from = { clipPath: "inset(0px 0px 100% 0px)" };
      var to = { clipPath: "inset(0px 0px 0px 0px)", duration: 1.25, ease: "power3.out",
                 onComplete: function () { gsap.set(t, { clipPath: "none" }); strip(t); } };
      if (!noScale) { from.scale = 1.12; to.scale = 1; }
      return gsap.fromTo(t, from, Object.assign(to, o || {}));
    }
    // Proxy-driven clip wipe (slow→fast→slow worksEase). GSAP's clip-path
    // STRING interpolation does not honor a function ease (it snaps), so we
    // tween a numeric proxy and write the clip-path each frame. clipFor(p)
    // maps progress 0→1 to the clip-path string (direction of the wipe).
    function wipeProxy(t, stag, clipFor) {
      var first;
      gsap.utils.toArray(t).forEach(function (el, i) {
        var s = { p: 0 };
        var tw = gsap.to(s, {
          p: 1, duration: 2.0, ease: worksEase, delay: (stag || 0) * i,
          onUpdate: function () { el.style.clipPath = clipFor(s.p, el); },
          onComplete: function () { gsap.set(el, { clipPath: "none" }); strip(el); },
        });
        if (i === 0) first = tw;
      });
      return first;
    }
    function clipLR(p, el) { return wipeClip(el, p, "left"); }   // wipe left→right
    function clipRL(p, el) { return wipeClip(el, p, "right"); }  // wipe right→left
    function clipTB(p, el) { return wipeClip(el, p, "top"); }    // wipe top→bottom

    function boxIn(t, o) {      // grey panels — sideways wipe, slow→fast→slow
      o = o || {};
      var els = gsap.utils.toArray(t);
      var stag = o.stagger || 0;
      // Selected Works panels also fade in (gentle, to match the soft start)
      var fadeEls = els.filter(function (e) { return e.hasAttribute("data-fade"); });
      if (fadeEls.length) {
        gsap.fromTo(fadeEls, { opacity: 0 },
          { opacity: 1, duration: 0.9, ease: "power2.inOut", stagger: stag });
      }
      // most panels wipe left→right; data-rtl panels (Ressolve) wipe right→left
      return wipeProxy(els, stag, function (p, el) {
        return el.hasAttribute("data-rtl") ? clipRL(p, el) : clipLR(p, el);
      });
    }
    function vimageIn(t, o) {   // calligraphy photo — the SAME panel wipe, top→bottom
      o = o || {};
      return wipeProxy(t, o.stagger || 0, clipTB);
    }

    function typeOf(el) {
      if (el.matches(".plus")) return "plus";
      if (el.matches(".ph img")) return el.hasAttribute("data-vwipe") ? "vimage" : "image";
      if (el.matches(".box")) return "box";
      if (el.matches(".ltick") || el.matches(".fr > i")) return "tick";
      if (el.matches(".tri") || el.matches(".sq")) return "pop";
      return "slide";
    }
    function revealBy(type, els, o) {
      // mark every element handled, so neither the per-type batch nor the
      // catch-all can reveal the same element twice
      gsap.utils.toArray(els).forEach(function (e) { e.__shown = 1; });
      switch (type) {
        case "plus":  return plusIn(els, o);
        case "image": return imageIn(els, o);
        case "vimage": return vimageIn(els, o);
        case "box":   return boxIn(els, o);
        case "tick":  return tickIn(els, o);
        case "pop":   return popIn(els, o);
        default:      return slideIn(els, o);
      }
    }

    /* ---------- collect every animated element ------------------------- */
    // NB: .sqg (the two top-right corner squares) are intentionally excluded —
    // they render statically with no appear motion.
    var all = gsap.utils.toArray(
      ".brand, .nav, .h, .copy, .cap, .tri, .sq, .ltick, .fr > i, .plus, .ph img, .box"
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
    // arriving from another page (js/wipe.js) the parts come in closer together
    var step = window.__arrive ? 0.045 : 0.075;
    intro.forEach(function (el) {
      var ty = typeOf(el);
      // The hero photo LEADS the cascade (position 0). Because the intro
      // overlaps the curtain lift, the wipe is already underway by the time the
      // curtain clears — so the photo's spot is never left blank (no
      // "progressing without photo, then it suddenly appears").
      var pos = (ty === "image") ? 0 : at;
      introTL.add(revealBy(ty, el, { duration: dur[ty] }), pos);
      if (ty !== "image") at += step;
    });

    var TYPES = ["slide", "pop", "tick", "plus", "image", "vimage", "box"];

    // reveal whatever is still hidden, grouped by type (used as a safety net
    // for the final screen, where elements can't reach a "top x%" trigger line)
    function revealRemaining() {
      // only elements that were never revealed (NOT ones still mid-animation,
      // which the opacity test used to catch and re-trigger → the stutter)
      var left = all.filter(function (el) { return !el.__shown; });
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
          onEnter: function (b) {
          var fresh = b.filter(function (e) { return !e.__shown; });
          if (fresh.length) revealBy(ty, fresh, { stagger: 0.06, overwrite: "auto" });
        },
        });
      });
      // Catch-all ONLY for the true stragglers: the few elements at the very
      // bottom that sit too low to ever reach their own "top 88%" line. Anchor
      // it to the lowest element and fire as it enters (top bottom), i.e. LATE —
      // so every element above reveals separately via its own batch as it
      // scrolls in, instead of the catch-all bunching them all at once.
      var lastEl = scroll.length
        ? scroll.reduce(function (a, b) { return b.__top > a.__top ? b : a; }, scroll[0])
        : null;
      if (lastEl) {
        ST.create({ trigger: lastEl, start: "top bottom", once: true, onEnter: revealRemaining });
      }
      ST.refresh();
    }

    /* ---------- preloader → intro -------------------------------------- */
    var pre = document.getElementById("preloader");
    function runIntro() { introTL.play(); }

    // Arriving at a section from another page (index.html#about …): the browser lines
    // the section's heading up with the top of the window. Land where the nav links
    // here land instead — ABOUT ME at the very top of the page (name and corner marks
    // showing), the others 48px above their heading. Done behind the curtain.
    function landOnSection() {
      var h = location.hash, t = /^#(about|works|contact)$/.test(h) && document.querySelector(h);
      if (!t) return;
      // its place in the layout (its reveal may already be sliding it in from 42px below)
      for (var top = 0, el = t; el; el = el.offsetParent) top += el.offsetTop;
      var y = h === "#about" ? 0 : Math.max(0, top - 48);
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
      window.scrollTo(0, y);
    }

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
      if (lenis) lenis.stop();

      // The hero photo must be painted before the curtain lifts. Otherwise the
      // wipe plays over an empty frame and the image pops in mid-animation. First the
      // photos the owner set in the console go in (js/photos.js), so the one waited
      // for is the one shown.
      var heroReady = withTimeout(window.__photos || Promise.resolve(), 2500).then(function () {
        var hero = document.querySelector(".ph img[data-noscale]") || document.querySelector(".ph img");
        return withTimeout(whenReady(hero), 6000);
      });

      if (window.__arrive && window.__wipe) {
        // From another page of the site (js/wipe.js): no name — the white sheet that
        // covered the last page lifts straight off this one as the intro rises in.
        heroReady.then(function () {
          landOnSection();
          window.__wipe.arrive(runIntro, function () { if (lenis) lenis.start(); });
        });
      } else {
        // entrance (wordmark) runs regardless; the curtain only lifts once BOTH
        // the entrance has played and the hero image is ready to paint.
        var enter = gsap.timeline();
        enter.to(name, { y: "0%", duration: 0.9, ease: "power3.out" });
        var entered = new Promise(function (res) { enter.eventCallback("onComplete", res); });

        Promise.all([entered, heroReady]).then(function () {
          landOnSection();
          var exit = gsap.timeline();
          exit.to(name, { y: "-115%", duration: 0.55, ease: "power3.in" }, "+=0.15")
              .to(pre, { yPercent: -100, duration: 0.85, ease: "power4.inOut", modifiers: window.__wipe && window.__wipe.sheet }, "-=0.25")
              .add(function () {
                pre.style.display = "none";
                if (lenis) lenis.start();
              })
              .add(runIntro, "-=0.45");
        });
      }
    } else {
      landOnSection();
      if (pre) pre.style.display = "none";
      runIntro();
    }

    /* (the custom cursor lives in js/cursor.js, shared with the illustration page) */

    /* ---------- nav → smooth scroll to sections ------------------------ */
    (function nav() {
      var map = { ABOUT: "#about", WORK: "#works", CONTACT: "#contact" };
      document.querySelectorAll(".nav").forEach(function (a) {
        a.style.cursor = "pointer";
        a.addEventListener("click", function (e) {
          e.preventDefault();
          var label = (a.textContent || "").trim();
          var sel = map[label];
          var target = sel && document.querySelector(sel);
          if (!target) return;
          // ABOUT ME is the first section — scroll all the way to the top so the
          // top-right corner buttons (nav + marks) are covered too, not cut off.
          if (label === "ABOUT") {
            if (lenis) lenis.scrollTo(0, { duration: 1.3 });
            else window.scrollTo({ top: 0, behavior: "smooth" });
          } else if (lenis) {
            lenis.scrollTo(target, { offset: -48, duration: 1.3 });
          } else {
            target.scrollIntoView({ behavior: "smooth" });
          }
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
