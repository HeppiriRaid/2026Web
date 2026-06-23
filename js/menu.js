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

  // The panel background is its own element so it can morph (FLIP) out of the
  // hamburger's middle bar — see setOpen(). It sits behind the menu text.
  var bg = document.createElement("div");
  bg.className = "menu-bg";
  nav.insertBefore(bg, nav.firstChild);
  var midSpan = btn.children[1];   // the hamburger's middle bar

  var REDUCE = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var HAMBURGER_SCALE = 0.7; // the caught hamburger is 70% of the camouflage box

  var K = 4;                 // px per artboard pt (refreshed in place())
  var ty = 0;                // vertical offset currently applied to the button
  var scl = 1;               // current scale (1 over the marks, 0.7 once caught)
  var tx = 0;                // horizontal offset (catch yields left of the scrollbar)
  var OVERLAY = 18;          // px to clear an overlay scrollbar while it is showing
  var RAIL_IN = 12;          // cursor within this of the right edge => actually over the bar
  var RAIL_OUT = 32;         // must move out past this before the rail is "gone" (hysteresis)
  var RAIL_HOLD = 750;       // ms to keep dodging after leaving (outlasts the rail's fade)
  var RAIL_DWELL = 130;      // ms the cursor must rest on the bar before the rail counts
  var barVisible = false;    // is the (overlay) scrollbar's thumb currently up?
  var barTimer = 0;
  var railVisible = false;   // is the full rail up because the mouse is over it?
  var railTimer = 0;
  var dwellTimer = 0;
  var cursorOnBar = false;   // cursor currently within RAIL_IN of the right edge
  var dwelled = false;       // ...and has rested there long enough to count
  var pageVH = 0, pageSH = 1; // viewport / scroll height — for the thumb position
  var sbSpace = false;       // does a classic scrollbar take layout space? (cached)
  var classicGutter = 0;     // catch inset for a classic bar, ≈0 (cached)
  var _ax, _ay, _as;         // last-applied tx / ty / scl (skip redundant writes)
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
    // The extended menu sits to the LEFT of the caught hamburger, its box top
    // aligned with the hamburger's top bar. Both are derived from the fixed
    // catch geometry (button centre 454.8/18, top bar at 12.75 / left at 448.8,
    // the whole thing scaled about its centre by HAMBURGER_SCALE).
    var hbTop = (18 - (18 - 12.75) * HAMBURGER_SCALE) * K;        // top-bar top edge
    var hbLeft = (454.8 - (454.8 - 448.8) * HAMBURGER_SCALE) * K; // bars' left edge
    nav.style.top = hbTop + "px";
    nav.style.left = "auto";
    nav.style.right = Math.max(0, window.innerWidth - hbLeft + 4 * K) + "px";
    var stageTopDoc = sRect.top + scrollY();
    markCenterDoc = stageTopDoc + 18 * K;
    markBottomDoc = stageTopDoc + 36 * K;
    // Cache the page/scrollbar metrics here (layout reads) so the per-frame
    // update() never touches the DOM geometry — that was thrashing layout.
    var de = document.documentElement;
    pageVH = de.clientHeight;
    pageSH = de.scrollHeight;
    var cw = de.clientWidth;
    sbSpace = window.innerWidth - cw > 0;          // classic (space-taking) scrollbar?
    var ov = 460.8 * K - cw;                        // hamburger's overlap of it (≈0)
    classicGutter = ov > 0.5 ? ov + 2 : 0;
    apply();
  }

  // translate keeps the button centred on its anchor; scale() shrinks it about
  // that same centre, so the hamburger stays aligned with the camouflage box.
  // Skips the write when nothing changed (no per-frame style churn when idle).
  function apply() {
    if (tx === _ax && ty === _ay && scl === _as) return;
    _ax = tx; _ay = ty; _as = scl;
    btn.style.transform =
      "translate(calc(-50% + " + tx.toFixed(2) + "px), calc(-50% + " + ty.toFixed(2) +
      "px)) scale(" + scl.toFixed(3) + ")";
  }

  // Where the overlay scrollbar's draggable thumb sits vertically right now, and
  // whether it reaches the hamburger's band. The track ~ viewport height; the
  // thumb height/position follow the usual scrollbar maths.
  function thumbOverlapsHamburger() {
    var maxScroll = pageSH - pageVH;
    if (maxScroll <= 0) return false;
    var thumbH = Math.max(pageVH * pageVH / pageSH, 24);
    var thumbTop = (pageVH - thumbH) * scrollY() / maxScroll;
    var hbTop = 14.325 * K, hbBot = 21.605 * K, M = 12; // bars' band + "about to" margin
    return thumbTop < hbBot + M && (thumbTop + thumbH) > hbTop - M;
  }

  // How far the caught hamburger slides LEFT to clear the scrollbar — only when it
  // would actually be overlapped, otherwise 0 (original placement).
  //  • classic (space-taking) bar: the hamburger sits in the content area, so this
  //    is just any real overlap (≈ 0).
  //  • overlay bar: the rail is transparent, so on scroll only the THUMB shows —
  //    dodge while its band reaches the hamburger; but hovering the right edge
  //    reveals the FULL-height rail, which always overlaps, so dodge then too.
  function gutterNow() {
    if (sbSpace) return classicGutter;             // cached — no per-frame layout read
    if (railVisible) return OVERLAY;               // full rail up (hover) -> always overlaps
    return (barVisible && thumbOverlapsHamburger()) ? OVERLAY : 0;
  }

  // The overlay scrollbar is "up" for a short while after scrolling. Scrolling is
  // also a moment the rail can appear/stay under a resting cursor, so re-check
  // engage here AND hold the rail up: a rail shown by hover stays visible while
  // you keep scrolling, so cancel any pending fade and only re-arm it once the
  // bar finally goes down.
  function pingBar() {
    barVisible = true;
    if (barTimer) clearTimeout(barTimer);
    barTimer = setTimeout(function () { barVisible = false; barTimer = 0; maybeFade(); }, 1200);
    if (railTimer) { clearTimeout(railTimer); railTimer = 0; }   // scrolling holds the rail up
    maybeEngage();
  }

  // No API exposes the overlay rail, so treat it as showing once the cursor is
  // genuinely ON the bar (within RAIL_IN), has RESTED there (RAIL_DWELL — passing
  // through doesn't count) AND the bar is UP (barVisible — a cold bar shows
  // nothing). It can appear by moving onto an up bar OR by scrolling while the
  // cursor rests on it (maybeEngage, from onMove + pingBar). Crucially the rail
  // also STAYS up while you keep scrolling even after the cursor leaves it, so it
  // only fades once you are NEITHER on it NOR scrolling (maybeFade). Engaged it
  // holds through the RAIL_IN..RAIL_OUT band; the fade waits out RAIL_HOLD.
  function maybeEngage() {
    if (cursorOnBar && dwelled && barVisible) {
      railVisible = true;
      if (railTimer) { clearTimeout(railTimer); railTimer = 0; }
    }
  }
  function maybeFade() {
    if (railVisible && !cursorOnBar && !barVisible && !railTimer) {
      railTimer = setTimeout(function () { railVisible = false; railTimer = 0; }, RAIL_HOLD);
    }
  }
  function leaveBar() {
    cursorOnBar = false; dwelled = false;
    if (dwellTimer) { clearTimeout(dwellTimer); dwellTimer = 0; }
  }
  function onMove(e) {
    var fromRight = window.innerWidth - e.clientX;
    if (fromRight <= RAIL_IN) {                 // on the scrollbar
      if (railTimer) { clearTimeout(railTimer); railTimer = 0; }     // staying -> cancel fade
      if (!cursorOnBar) {                       // just arrived -> start the dwell clock
        cursorOnBar = true;
        dwellTimer = setTimeout(function () { dwellTimer = 0; dwelled = true; maybeEngage(); }, RAIL_DWELL);
      }
    } else {                                    // off the scrollbar
      leaveBar();
      if (fromRight > RAIL_OUT) maybeFade();     // fade only if not still scrolling
    }
  }
  function railOut() { leaveBar(); maybeFade(); }

  // One driver, run every frame. Decides scrub vs catch, eases between them.
  function update() {
    var sc = scrollY();
    var cutoff = (markBottomDoc - sc) <= 0;        // lower square above top edge
    var nm = cutoff ? "catch" : "scrub";
    // scrub: keep the button centred on the (moving) marks. catch: corner (0).
    var tyTarget = nm === "catch" ? 0 : (markCenterDoc - sc - 18 * K);
    var sclTarget = nm === "catch" ? HAMBURGER_SCALE : 1; // shrink once caught
    var txTarget = nm === "catch" ? -gutterNow() : 0;     // yield only when the bar overlaps

    if (nm !== mode) {
      if (mode !== null && !REDUCE) easeUntil = performance.now() + 1200;
      mode = nm;
      btn.classList.toggle("scrolled", mode === "catch");
      setOpen(false);                              // never leave the menu adrift
    } else if (mode === "scrub" && Math.abs(tyTarget) > 2 &&
               nav.classList.contains("open")) {
      setOpen(false);                              // scrolled off the top → close
    }

    if (!REDUCE && performance.now() < easeUntil) {
      ty += (tyTarget - ty) * 0.07;                // gentle ease into the new regime
      scl += (sclTarget - scl) * 0.07;             // shrink/grow eases in with it
    } else {
      ty = tyTarget;                               // steady state: exact tracking
      scl = sclTarget;
    }
    // tx rides its own clock so the scrollbar yield can slide in/out mid-catch
    if (REDUCE || Math.abs(txTarget - tx) <= 0.05) tx = txTarget;
    else tx += (txTarget - tx) * 0.12;
    apply();
  }

  // The morph is a FLIP split into two phases: SLIDE (bar -> thin full-width line
  // at the panel top) then EXPAND (that line -> full panel). flipParts() gives the
  // transforms mapping the panel's box onto the bar (seed) and onto that thin line.
  var WE = "cubic-bezier(.38,0,.5,1)";
  var phaseTimer = 0;
  function tr(dur) {
    return "transform " + dur + " " + WE + ", background-color .55s ease, box-shadow .55s ease";
  }
  function flipParts() {
    var b = btn.children[1].getBoundingClientRect();   // the middle bar
    var p = nav.getBoundingClientRect();               // the panel's natural box
    if (!p.width || !p.height) return { seed: "none", thin: "none" };
    var tx = (b.left - p.left).toFixed(2), ty = (b.top - p.top).toFixed(2);
    var sx = (b.width / p.width).toFixed(4), sy = (b.height / p.height).toFixed(4);
    return {
      seed: "translate(" + tx + "px," + ty + "px) scale(" + sx + "," + sy + ")",
      thin: "translate(0px,0px) scale(1," + sy + ")"
    };
  }

  function setOpen(open) {
    if (open === (btn.getAttribute("aria-expanded") === "true")) return; // already there
    if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = 0; }
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? "Close menu" : "Menu");
    nav.setAttribute("aria-hidden", open ? "false" : "true");
    var f = flipParts();
    if (open) {
      midSpan.style.transition = ""; midSpan.style.opacity = ""; // CSS hides it (X)
      bg.style.visibility = "visible";
      bg.style.transition = "none";                 // seed exactly over the bar,
      bg.style.transform = f.seed;
      void bg.offsetWidth;                          // commit
      bg.style.transition = tr(".34s");             // phase 1: SLIDE left (+ widen), stay thin
      nav.classList.add("open");
      bg.style.transform = f.thin;
      phaseTimer = setTimeout(function () {         // phase 2: EXPAND down into the panel
        phaseTimer = 0;
        bg.style.transition = tr(".46s");
        bg.style.transform = "translate(0px,0px) scale(1,1)";
      }, 300);
    } else {
      // hold the real middle bar hidden so it doesn't double with the returning
      // panel — the panel itself is what travels back to the cross centre.
      midSpan.style.transition = "none"; midSpan.style.opacity = "0";
      bg.style.transition = tr(".3s");              // close: collapse back to the thin line
      bg.style.transform = f.thin;
      nav.classList.remove("open");                 // un-cross the X into the hamburger
      phaseTimer = setTimeout(function () {         // ...then slide it back onto the bar
        phaseTimer = 0;
        bg.style.transition = tr(".34s");
        bg.style.transform = f.seed;
        phaseTimer = setTimeout(function () {       // hand off in one frame: real bar in,
          phaseTimer = 0;                           // panel out -> no double, no gap
          midSpan.style.opacity = "";               // -> CSS (hamburger middle), still instant
          bg.style.visibility = "hidden";
          requestAnimationFrame(function () { midSpan.style.transition = ""; });
        }, 340);
      }, 270);
    }
  }

  place();
  // Prefer GSAP's ticker (one shared rAF, runs right after Lenis updates the
  // scroll position); otherwise spin a lightweight rAF of our own.
  if (window.gsap && window.gsap.ticker) window.gsap.ticker.add(update);
  else (function loop() { update(); requestAnimationFrame(loop); })();
  window.addEventListener("resize", place);
  window.addEventListener("scroll", pingBar, { passive: true });
  window.addEventListener("mousemove", onMove, { passive: true });
  document.addEventListener("mouseleave", railOut);
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
