/* ============================================================
   Top-right menu — rides up with the page, then catches the corner.

   The two grey corner squares (.sqg) live inside the .stage and scroll
   away with the page. This button is position:fixed and the same grey,
   parked exactly over those squares. While the squares are on screen it
   tracks them precisely and rides UP with the page as you scroll, so it
   stays invisible (pure camouflage). The instant the squares are cut off
   by the top edge, the button "catches up": it eases back down into the
   corner and the two squares split into a three-bar hamburger. Click it
   and the hamburger becomes an X with the ABOUT / WORK / CONTACT menu.
   The whole thing reverses smoothly on the way back up. Uses Lenis for
   smooth in-page scrolling when available; degrades to a plain fixed
   hamburger under reduced-motion or without the animation layer.
   ============================================================ */
(function () {
  "use strict";
  var btn = document.getElementById("menuBtn");
  var nav = document.getElementById("menuNav");
  var stage = document.querySelector(".stage");
  if (!btn || !nav || !stage) return;

  var REDUCE = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var K = 4;                 // px per artboard pt (refreshed in place())
  var ty = 0;                // vertical offset currently applied to the button
  var mode = null;           // "scrub" (over the marks) | "catch" (fixed corner)
  var easeUntil = 0;         // performance.now() until which we ease the offset
  var markCenterDoc = 18 * K; // marks' centre in document space (cached)
  var markBottomDoc = 36 * K; // marks' lower edge in document space (cached)

  function scrollY() {
    return window.pageYOffset || document.documentElement.scrollTop || 0;
  }

  // Position + scale the fixed button/menu to the artboard, and cache where
  // the real marks sit in document space. The marks are artboard y 0..36
  // (centre 18) inside the .stage; we read it off the STAGE box (which is
  // never touched by the intro animation) rather than the .sqg rects (which
  // are mid-flight while the intro plays), so the cache is always correct.
  function place() {
    var sRect = stage.getBoundingClientRect();
    K = sRect.width / 460.807;
    document.documentElement.style.setProperty("--mk", K);
    btn.style.left = (454.8 * K) + "px";
    btn.style.top = (18 * K) + "px";
    btn.style.right = "auto";
    nav.style.top = (42 * K) + "px";
    nav.style.right = Math.max(0, window.innerWidth - 460.8 * K) + "px";
    var stageTopDoc = sRect.top + scrollY();
    markCenterDoc = stageTopDoc + 18 * K;
    markBottomDoc = stageTopDoc + 36 * K;
    apply(ty);
  }

  function apply(v) {
    btn.style.transform = "translate(-50%, calc(-50% + " + v.toFixed(2) + "px))";
  }

  // One driver, run every frame. Decides scrub vs catch, eases between them.
  function update() {
    var sc = scrollY();
    var cutoff = (markBottomDoc - sc) <= 0;        // lower square above top edge
    var nm = cutoff ? "catch" : "scrub";
    // scrub: keep the button centred on the (moving) marks. catch: corner (0).
    var target = nm === "catch" ? 0 : (markCenterDoc - sc - 18 * K);

    if (nm !== mode) {
      if (mode !== null && !REDUCE) easeUntil = performance.now() + 1200;
      mode = nm;
      btn.classList.toggle("scrolled", mode === "catch");
      setOpen(false);                              // never leave the menu adrift
    } else if (mode === "scrub" && Math.abs(target) > 2 &&
               nav.classList.contains("open")) {
      setOpen(false);                              // scrolled off the top → close
    }

    if (!REDUCE && performance.now() < easeUntil) {
      ty += (target - ty) * 0.07;                  // gentle ease into the new regime
      apply(ty);
    } else if (ty !== target) {
      ty = target;                                 // steady state: exact tracking
      apply(ty);
    }
  }

  function setOpen(open) {
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? "Close menu" : "Menu");
    nav.setAttribute("aria-hidden", open ? "false" : "true");
    nav.classList.toggle("open", open);
  }

  place();
  // Prefer GSAP's ticker (one shared rAF, runs right after Lenis updates the
  // scroll position); otherwise spin a lightweight rAF of our own.
  if (window.gsap && window.gsap.ticker) window.gsap.ticker.add(update);
  else (function loop() { update(); requestAnimationFrame(loop); })();
  window.addEventListener("resize", place);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);

  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    setOpen(btn.getAttribute("aria-expanded") !== "true");
  });

  nav.querySelectorAll("a").forEach(function (a) {
    a.addEventListener("click", function (e) {
      var t = document.querySelector(a.getAttribute("href"));
      if (t) {
        e.preventDefault();
        if (window.__lenis) window.__lenis.scrollTo(t, { offset: -48, duration: 1.3 });
        else t.scrollIntoView({ behavior: "smooth" });
      }
      setOpen(false);
    });
  });

  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setOpen(false); });
  document.addEventListener("click", function (e) {
    if (nav.classList.contains("open") && !nav.contains(e.target) && !btn.contains(e.target)) setOpen(false);
  });
})();
