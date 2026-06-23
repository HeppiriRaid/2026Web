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

  // Custom scrollbar (the native one is hidden in CSS). We draw it ourselves so
  // the hamburger's yield (gutterNow) can read its EXACT on-screen state instead
  // of guessing at the native overlay rail.
  var scRail = document.body.appendChild(document.createElement("div"));
  scRail.className = "cscroll-rail";
  var scThumb = document.body.appendChild(document.createElement("div"));
  scThumb.className = "cscroll-thumb";

  var REDUCE = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var HAMBURGER_SCALE = 0.7; // the caught hamburger is 70% of the camouflage box

  var K = 4;                 // px per artboard pt (refreshed in place())
  var ty = 0;                // vertical offset currently applied to the button
  var scl = 1;               // current scale (1 over the marks, 0.7 once caught)
  var tx = 0;                // horizontal offset (catch yields left of the scrollbar)
  var OVERLAY = 18;          // px to clear the scrollbar while it is showing
  var RAIL_ZONE = 14;        // cursor within this of the right edge => over the bar
  var thumbShown = false;    // is the custom thumb currently up (recent scroll)?
  var railShown = false;     // is the custom rail currently up (hovering the bar)?
  var thumbFadeT = 0, railFadeT = 0, railDwellT = 0;
  var thumbTop = 0, thumbH = 0; // the drawn thumb's current band (px, viewport space)
  var pageVH = 0, pageSH = 1; // viewport / scroll height — for the thumb position
  var sbSpace = false;       // does a classic scrollbar take layout space? (cached)
  var classicGutter = 0;     // catch inset for a classic bar, ≈0 (cached)
  var _ax, _ay, _as;         // last-applied tx / ty / scl (skip redundant writes)
  var mode = null;           // "scrub" (over the marks) | "catch" (fixed corner)
  var easeUntil = 0;         // performance.now() until which we ease the offset
  var yieldHoldUntil = 0;    // …and until which the scrollbar yield stays disabled
                             // (a beat past easeUntil, so the morph fully settles first)
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
    layoutThumb();                                  // size/position the custom thumb
    apply();
  }

  // translate keeps the button centred on its anchor; scale() shrinks it about
  // that same centre, so the hamburger stays aligned with the camouflage box.
  // Skips the write when nothing changed (no per-frame style churn when idle).
  function apply() {
    if (tx === _ax && ty === _ay && scl === _as) return;
    // The extended panel yields WITH the button: the same horizontal dodge (tx)
    // is applied to the nav so the gap between panel and hamburger never changes
    // (perfect sync). Only rewrite it when tx actually moves — not on the
    // per-frame scrub ride, which changes ty only — to keep the writes minimal.
    if (tx !== _ax) nav.style.transform = tx ? "translateX(" + tx.toFixed(2) + "px)" : "";
    _ax = tx; _ay = ty; _as = scl;
    btn.style.transform =
      "translate(calc(-50% + " + tx.toFixed(2) + "px), calc(-50% + " + ty.toFixed(2) +
      "px)) scale(" + scl.toFixed(3) + ")";
  }

  // ---- custom scrollbar: geometry, visibility, and the overlap test ----------
  // We DRAW the bar, so these are facts, not guesses: the thumb band is exactly
  // what we positioned, and railShown/thumbShown are exactly when the rail/thumb
  // are on screen — so gutterNow() dodges in perfect sync.
  function layoutThumb() {
    var maxScroll = pageSH - pageVH;
    thumbH = Math.max(pageVH * pageVH / pageSH, 36);
    thumbTop = maxScroll > 0 ? (pageVH - thumbH) * scrollY() / maxScroll : 0;
    scThumb.style.height = thumbH.toFixed(1) + "px";                        // constant — a no-op once set
    scThumb.style.transform = "translateY(" + thumbTop.toFixed(1) + "px)";  // per-scroll: compositor, no layout
  }
  function syncThumb() { scThumb.classList.toggle("show", thumbShown || railShown); }
  function thumbOverlapsMenu() {
    var hbTop = 14.325 * K, hbBot = 21.605 * K, M = 10; // hamburger band + small margin
    return thumbTop < hbBot + M && (thumbTop + thumbH) > hbTop - M;
  }
  function gutterNow() {
    if (sbSpace) return classicGutter;             // classic bar: hamburger sits clear
    if (railShown) return OVERLAY;                 // full-height rail (hover) overlaps
    return (thumbShown && thumbOverlapsMenu()) ? OVERLAY : 0; // thumb reaches the menu
  }

  // scroll -> show the thumb, hold it briefly, then fade (drives thumbShown)
  function onScroll() {
    layoutThumb();
    if (!thumbShown) { thumbShown = true; syncThumb(); }
    if (thumbFadeT) clearTimeout(thumbFadeT);
    thumbFadeT = setTimeout(function () { thumbFadeT = 0; thumbShown = false; syncThumb(); }, 1100);
  }

  // hover near the right edge -> bring up the rail (+ a fatter thumb). The rail is
  // ACTIVITY-driven, not a hover latch: it auto-fades after RAIL_HOLD of no edge
  // movement even while the cursor is parked in the zone. A parked cursor fires no
  // mousemove, so a latch would never release ("yields once, never goes back") —
  // the auto-fade guarantees it always returns. Movement over the bar keeps
  // refreshing it; moving off hides it quickly. railShown is our own flag, so the
  // dodge tracks the rail exactly.
  var RAIL_HOLD = 1200;
  function armRailFade(ms) {
    if (railFadeT) clearTimeout(railFadeT);
    railFadeT = setTimeout(function () {
      railFadeT = 0;
      if (dragY === null) showRail(false);         // never hide mid-drag
    }, ms);
  }
  function showRail(on) {
    if (on === railShown) return;
    railShown = on;
    scRail.classList.toggle("show", on);
    scThumb.classList.toggle("rail", on);
    if (on) layoutThumb();
    syncThumb();
  }
  function onMove(e) {
    if (dragY !== null) return;                    // a thumb-drag drives the rail itself
    var onBar = (window.innerWidth - e.clientX) <= RAIL_ZONE;
    if (onBar) {
      if (railShown) {
        armRailFade(RAIL_HOLD);                     // keep alive while actively hovering
      } else if (!railDwellT) {                     // tiny dwell so a fly-through is ignored
        railDwellT = setTimeout(function () {
          railDwellT = 0; showRail(true); armRailFade(RAIL_HOLD);
        }, 110);
      }
    } else {
      if (railDwellT) { clearTimeout(railDwellT); railDwellT = 0; }
      if (railShown) armRailFade(220);             // moved off -> hide soon
    }
  }
  function railOut() {                              // cursor left the window
    if (railDwellT) { clearTimeout(railDwellT); railDwellT = 0; }
    if (railShown) armRailFade(220);
  }

  // drag the thumb to scroll
  var dragY = null, dragScroll = 0;
  scThumb.addEventListener("mousedown", function (e) {
    e.preventDefault();
    dragY = e.clientY; dragScroll = scrollY();
    showRail(true);
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", endDrag);
  });
  function onDrag(e) {
    var maxScroll = pageSH - pageVH, range = pageVH - thumbH;
    if (range <= 0) return;
    var t = Math.max(0, Math.min(maxScroll, dragScroll + (e.clientY - dragY) * (maxScroll / range)));
    if (window.__lenis) window.__lenis.scrollTo(t, { immediate: true });
    else window.scrollTo(0, t);
  }
  function endDrag() {
    dragY = null;
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", endDrag);
    if (railShown) armRailFade(RAIL_HOLD);         // re-arm so a post-drag park can't latch
  }

  // One driver, run every frame. Decides scrub vs catch, eases between them.
  function update() {
    var sc = scrollY();
    var cutoff = (markBottomDoc - sc) <= 0;        // lower square above top edge
    var nm = cutoff ? "catch" : "scrub";
    // scrub: keep the button centred on the (moving) marks. catch: corner (0).
    var tyTarget = nm === "catch" ? 0 : (markCenterDoc - sc - 18 * K);
    var sclTarget = nm === "catch" ? HAMBURGER_SCALE : 1; // shrink once caught

    if (nm !== mode) {
      if (mode !== null && !REDUCE) {
        easeUntil = performance.now() + 1200;
        yieldHoldUntil = easeUntil + 350;          // hold the yield a beat past the settle
      }
      mode = nm;
      btn.classList.toggle("scrolled", mode === "catch");
      setOpen(false, true);                        // never leave the menu adrift
    } else if (mode === "scrub" && Math.abs(tyTarget) > 2 &&
               nav.classList.contains("open")) {
      setOpen(false, true);                        // scrolled off the top → close
    }

    // The menu must NOT yield to the scrollbar/rail until the box<->hamburger
    // transition is COMPLETELY finished — held until yieldHoldUntil (a beat past
    // the position settle) so the morph never overlaps the yield. The position
    // ease itself still uses easeUntil so the catch feel is unchanged.
    var morphing = !REDUCE && performance.now() < easeUntil;
    var yieldHeld = !REDUCE && performance.now() < yieldHoldUntil;
    var txTarget = (nm === "catch" && !yieldHeld) ? -gutterNow() : 0;

    if (morphing) {
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

  function setOpen(open, viaScroll) {
    if (open === (btn.getAttribute("aria-expanded") === "true")) return; // already there
    if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = 0; }
    // In the two-grey-box (camouflage) state there is NO middle bar — the morph
    // slides a bar out into the panel, which only reads right for the 3-bar
    // hamburger. From the two-box state the panel would otherwise emerge from /
    // collapse into an empty gap and pop out of nothing, so here the "bar" the
    // panel grows from is FADED in on open and FADED out on close instead.
    var twoBox = !btn.classList.contains("scrolled");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? "Close menu" : "Menu");
    nav.setAttribute("aria-hidden", open ? "false" : "true");

    // A scroll-driven close fires while the button is flying up / catching the
    // corner (or a link-jump is scrolling the page). Morphing the panel back onto
    // that moving bar chases a stale position and glitches, so just fade the whole
    // panel out where it is and let the button revert on its own.
    if (!open && viaScroll) {
      midSpan.style.transition = ""; midSpan.style.opacity = "";   // button reverts naturally
      nav.style.transition = "opacity .2s ease";
      nav.style.opacity = "0";
      nav.classList.remove("open");
      phaseTimer = setTimeout(function () {
        phaseTimer = 0;
        bg.style.transition = "none";
        bg.style.transform = "none"; bg.style.opacity = ""; bg.style.visibility = "hidden";
        nav.style.transition = ""; nav.style.opacity = "";
      }, 220);
      return;
    }

    var f = flipParts();
    if (open) {
      midSpan.style.transition = ""; midSpan.style.opacity = ""; // CSS hides it (X)
      bg.style.visibility = "visible";
      bg.style.transition = "none";                 // seed exactly over the bar,
      bg.style.transform = f.seed;
      bg.style.opacity = twoBox ? "0" : "";         // two-box: fade the bar into being
      void bg.offsetWidth;                          // commit
      bg.style.transition = tr(".34s") + (twoBox ? ", opacity .3s ease" : ""); // phase 1: SLIDE
      if (twoBox) bg.style.opacity = "1";
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
        phaseTimer = setTimeout(function () {       // bar is back at the centre; resolve it
          phaseTimer = 0;
          if (twoBox) {
            // no real middle bar to hand to — fade the bar out, then hide
            bg.style.transition = "opacity .28s ease";
            bg.style.opacity = "0";
            phaseTimer = setTimeout(function () {
              phaseTimer = 0;
              midSpan.style.opacity = "";           // CSS (two-box keeps it hidden)
              bg.style.transition = "none";         // don't let opacity drift back up while hidden
              bg.style.visibility = "hidden";
              bg.style.opacity = "";
              requestAnimationFrame(function () { midSpan.style.transition = ""; });
            }, 290);
          } else {
            // hand off in one frame: real bar in, panel out -> no double, no gap
            midSpan.style.opacity = "";             // -> CSS (hamburger middle), still instant
            bg.style.visibility = "hidden";
            bg.style.opacity = "";
            requestAnimationFrame(function () { midSpan.style.transition = ""; });
          }
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
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("mousemove", onMove, { passive: true });
  document.addEventListener("mouseleave", railOut);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);

  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    setOpen(btn.getAttribute("aria-expanded") !== "true");
  });

  nav.querySelectorAll("a").forEach(function (a) {
    a.addEventListener("click", function (e) {
      var href = a.getAttribute("href");
      var t = document.querySelector(href);
      if (t) {
        e.preventDefault();
        // ABOUT ME is the first section, so scroll ALL the way to the top — that
        // covers the top-right corner buttons (nav + marks) too, instead of
        // landing just below them. Other sections keep the -48 clearance.
        if (href === "#about") {
          if (window.__lenis) window.__lenis.scrollTo(0, { duration: 1.3 });
          else window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (window.__lenis) {
          window.__lenis.scrollTo(t, { offset: -48, duration: 1.3 });
        } else {
          t.scrollIntoView({ behavior: "smooth" });
        }
      }
      setOpen(false, true);                          // a jump scroll follows — fade, don't morph
    });
  });

  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setOpen(false); });
  document.addEventListener("click", function (e) {
    if (nav.classList.contains("open") && !nav.contains(e.target) && !btn.contains(e.target)) setOpen(false);
  });
})();
