/* ============================================================
   Illustration page — smooth horizontal gallery.
   Vertical scroll is translated into a sideways pan of the frame row
   (GSAP ScrollTrigger pin), smoothed by Lenis. Each frame settles in
   as it enters, tied to the same scroll so the motion stays buttery.
   Shares the camouflage menu (menu.js) and the custom cursor.
   Degrades to a native sideways scroll under reduced-motion / touch.
   ============================================================ */
(function () {
  "use strict";
  var root = document.documentElement;
  var gsap = window.gsap, ST = window.ScrollTrigger;
  var REDUCE = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var COARSE = window.matchMedia && window.matchMedia("(hover:none),(pointer:coarse)").matches;
  if (gsap && ST) gsap.registerPlugin(ST);

  function reveal() { root.classList.remove("anim"); }   // drop the pre-hide gate

  // ---------- preloader: wipe out, then reveal -----------------------------
  function intro() {
    var pre = document.getElementById("preloader");
    var name = document.querySelector(".pl-name");
    if (!gsap || REDUCE || !pre) {                 // no animation: just show the page
      if (pre) pre.style.display = "none";
      reveal();
      heroIn(true);
      return;
    }
    var tl = gsap.timeline({ onComplete: function () { pre.style.display = "none"; } });
    tl.set(pre, { autoAlpha: 1 })
      .from(name, { yPercent: 110, duration: 0.9, ease: "power3.out" })
      .to(name, { yPercent: -115, duration: 0.6, ease: "power3.in" }, "+=0.35")
      .to(pre, { yPercent: -100, duration: 0.85, ease: "power4.inOut" }, "-=0.2")
      .add(function () { reveal(); heroIn(false); }, "-=0.55");
  }

  // ---------- hero (header + title) reveal ---------------------------------
  function heroIn(instant) {
    var els = [].slice.call(document.querySelectorAll(".brand, .istage .nav, .ititle, .ihint"));
    if (!gsap || instant || REDUCE) { gsap.set && gsap.set(els, { clearProps: "opacity,transform" }); els.forEach(function(e){e.style.opacity="";}); return; }
    gsap.set(els, { opacity: 0 });
    gsap.timeline({ defaults: { ease: "power3.out" } })
      .to(".brand", { opacity: 1, y: 0, duration: 0.8, startAt: { y: 24 } }, 0)
      .to(".istage .nav", { opacity: 1, y: 0, duration: 0.8, startAt: { y: 24 }, stagger: 0.06 }, 0.05)
      .to(".ititle", { opacity: 1, y: 0, duration: 1.05, startAt: { y: 46 } }, 0.12)
      .to(".ihint", { opacity: 1, duration: 0.8 }, 0.5)
      .add(function () { gsap.set(els, { clearProps: "transform" }); });
  }

  // ---------- smooth scroll (Lenis) ----------------------------------------
  var lenis = null;
  if (window.Lenis && !REDUCE && !COARSE) {
    lenis = new window.Lenis({
      duration: 1.1,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true, wheelMultiplier: 1, touchMultiplier: 1.4,
    });
    window.__lenis = lenis;
    if (ST) lenis.on("scroll", ST.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  // ---------- horizontal gallery -------------------------------------------
  function buildGallery() {
    var hgal = document.querySelector(".hgal");
    var track = document.querySelector(".hgal-track");
    if (!hgal || !track || !gsap || !ST || REDUCE || COARSE) return; // CSS native-scroll fallback
    var dist = function () { return Math.max(0, track.scrollWidth - window.innerWidth); };

    // the pan: vertical scroll distance == horizontal travel, scrubbed (Lenis smooths it)
    var pan = gsap.to(track, {
      x: function () { return -dist(); },
      ease: "none",
      scrollTrigger: {
        trigger: hgal, start: "top top", end: function () { return "+=" + dist(); },
        pin: true, scrub: 0.6, invalidateOnRefresh: true, anticipatePin: 1,
      },
    });

    // each frame settles as it enters from the right, tied to the pan (containerAnimation)
    gsap.utils.toArray(".frame").forEach(function (frame) {
      var box = frame.querySelector(".frame-box, .end");
      var meta = frame.querySelector(".frame-meta");
      if (box) gsap.fromTo(box, { opacity: 0, scale: 1.06, yPercent: 4 },
        { opacity: 1, scale: 1, yPercent: 0, ease: "power2.out",
          scrollTrigger: { trigger: frame, containerAnimation: pan, start: "left 92%", end: "left 52%", scrub: true } });
      if (meta) gsap.fromTo(meta, { opacity: 0, y: 22 },
        { opacity: 1, y: 0, ease: "power3.out",
          scrollTrigger: { trigger: frame, containerAnimation: pan, start: "left 80%", end: "left 50%", scrub: true } });
    });

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ST.refresh(); });
    window.addEventListener("load", function () { ST.refresh(); });
  }

  // ---------- custom cursor (fine pointers only) — transform-driven --------
  function cursor() {
    var dot = document.querySelector(".cursor-dot");
    var ring = document.querySelector(".cursor-ring");
    if (!dot || !ring || !gsap || !window.matchMedia("(pointer:fine)").matches) return;
    root.classList.add("cursor-ready");
    var mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    function setDot() { dot.style.transform = "translate3d(" + mx + "px," + my + "px,0) translate(-50%,-50%)"; }
    function setRing() { ring.style.transform = "translate3d(" + rx.toFixed(1) + "px," + ry.toFixed(1) + "px,0) translate(-50%,-50%)"; }
    setDot(); setRing();
    window.addEventListener("mousemove", function (e) { mx = e.clientX; my = e.clientY; setDot(); }, { passive: true });
    gsap.ticker.add(function () {
      var nrx = rx + (mx - rx) * 0.18, nry = ry + (my - ry) * 0.18;
      if (Math.abs(mx - nrx) < 0.05) nrx = mx;
      if (Math.abs(my - nry) < 0.05) nry = my;
      if (nrx === rx && nry === ry) return;
      rx = nrx; ry = nry; setRing();
    });
    document.addEventListener("mouseover", function (e) { if (e.target.closest("a, .frame")) ring.classList.add("is-hover"); });
    document.addEventListener("mouseout", function (e) { if (e.target.closest("a, .frame")) ring.classList.remove("is-hover"); });
  }

  // ---------- go ------------------------------------------------------------
  try {
    buildGallery();
    cursor();
    if (document.readyState === "complete") intro();
    else window.addEventListener("load", intro, { once: true });
    // safety: if fonts/images stall, still reveal within a beat
    setTimeout(function () { if (root.classList.contains("anim")) { reveal(); heroIn(true); var p = document.getElementById("preloader"); if (p) p.style.display = "none"; } }, 4500);
  } catch (err) {
    if (window.console) console.error("gallery.js failed, showing static page:", err);
    reveal();
    var p = document.getElementById("preloader"); if (p) p.style.display = "none";
  }
})();
