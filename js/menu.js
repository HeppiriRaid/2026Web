/* ============================================================
   Top-right menu — rides up with the page, then catches the corner.

   The two grey corner squares (.sqg) live inside the .stage and scroll
   away with the page. This button is position:fixed and the same grey,
   parked exactly over those squares. While the squares are on screen it
   tracks them precisely and rides UP with the page as you scroll, so it
   stays invisible (pure camouflage). The instant the squares are cut off
   by the top edge, the button "catches up": it eases back down into the
   corner and the two squares split into a three-bar hamburger. Click it
   and the hamburger becomes an X with the ABOUT / WORK / ILLUSTRATION /
   CONTACT menu.
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
  var OVERLAY = 18;          // px to clear the scrollbar (≈4.32pt*K, refreshed in place())
  var RAIL_ZONE = 14;        // cursor within this of the right edge => over the bar (≈3.36pt*K)
  var thumbShown = false;    // is the custom thumb currently up (recent scroll)?
  var railShown = false;     // is the custom rail currently up (hovering the bar)?
  var thumbFadeT = 0, railFadeT = 0, railDwellT = 0;
  var thumbTop = 0, thumbH = 0; // the drawn thumb's current band (px, viewport space)
  var pageVH = 0, pageSH = 1; // viewport / scroll height — for the thumb position
  var sbSpace = false;       // does a classic scrollbar take layout space? (cached)
  var classicGutter = 0;     // catch inset for a classic bar, ≈0 (cached)
  var _ax, _ay, _as;         // last-applied tx / ty / scl (skip redundant writes)
  var mode = null;           // "scrub" (over the marks) | "catch" (fixed corner)
  var btnLeft = 0;           // the button's layout left (its centre, before its own transform)
  var markCenterDoc = 18 * K; // marks' centre in document space (cached)
  var markBottomDoc = 36 * K; // marks' lower edge in document space (cached)
  // While a picture is up in the zoom (js/zoom.js) the button stays the top layer and holds still:
  // the page moving beneath the grey (the zoom follows a step) doesn't move it — it is read where
  // the page was when the picture came up — and it doesn't yield to the scrollbar (hidden then,
  // css/zoom.css). As the picture flies home it eases to wherever the page now puts it.
  var zoomEl = document.getElementById("zoom"), heldAt = null;

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
    // The menu reads the VIEWPORT, not the now-zoomable stage box, so it keeps its
    // original size + corner position while the content zooms. It uses the SAME fit
    // as the artboard (width, clamped by the first screen's height — see the head
    // script's window.__fit) so that when a wide/short window makes the stage
    // narrower and centred, the camouflage hamburger follows it INWARD instead of
    // drifting to the bare viewport corner. On a tall window at default zoom this
    // is exactly innerWidth/460.807 with stageLeft 0 — unchanged.
    var FIT = window.__fit || { dw: 460.807, clampPt: 0 };
    K = FIT.clampPt
      ? Math.min(window.innerWidth / FIT.dw, window.innerHeight / FIT.clampPt)
      : window.innerWidth / FIT.dw;
    var stageLeft = Math.max(0, (window.innerWidth - FIT.dw * K) / 2); // centred-stage inset
    OVERLAY = 4.32 * K;        // dodge + hover-zone track the viewport scale, so they
    RAIL_ZONE = 3.36 * K;      // stay matched to the (constant) scrollbar under zoom
    document.documentElement.style.setProperty("--mk", K);
    btnLeft = stageLeft + 454.8 * K;
    btn.style.left = btnLeft + "px";
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
    nav.style.right = Math.max(0, window.innerWidth - (stageLeft + hbLeft) + 4 * K) + "px";
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
    barShapes(); measurePanel();                    // (the bars' rest shapes at this size, the panel's box)
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

  // ---- the motion: one driver, run every frame, and every part of the hamburger read from a few
  // progress values, each moved by a GSAP tween on the zoom step's curve (stepEase: sets off gently,
  // lands long and soft; CLAUDE.md, "The flow of motion"):
  //   M.w  0 the two grey squares riding with the page .. 1 the hamburger caught in the corner
  //   M.o  0 closed .. 1 the menu open
  //   M.y  0 .. 1 stepped aside for the scrollbar
  //   M.h  0 .. 1 back from where it held still under the zoom's grey to where the page now puts it
  // Whatever moves together shares one of them, so it moves as one: the catch's position, size and the
  // bars' shape; the menu's panel growing out of the middle bar, the X, the shadow and the labels.
  // Everything moves by transform only, drawn between pixels: the bars' place and length by
  // translate / scaleY / rotate, never top / height (the browser snaps those to whole pixels, so a bar
  // stood still, then hopped — measured: the X's bars jiggled back and forth a dozen times a morph).
  // At rest each is exactly where the layout put it before. Nothing is read back
  // from the page while anything moves (the panel's start is worked out, not measured).
  function cubicBezier(x1, y1, x2, y2) {
    function bz(p, a, b) { var m = 1 - p; return 3 * m * m * p * a + 3 * m * p * p * b + p * p * p; }
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var lo = 0, hi = 1, p = x;
      for (var i = 0; i < 18; i++) { p = (lo + hi) / 2; if (bz(p, x1, x2) < x) lo = p; else hi = p; }
      return bz(p, y1, y2);
    };
  }
  var stepEase = cubicBezier(0.3, 0, 0.2, 1);     // the zoom step's
  var CATCH = 0.8, OPEN = 0.6, YIELD = 0.45, HOME = 0.75;   // seconds (HOME: as the zoom's picture flies home)
  var M = { w: 0, o: 0, y: 0, h: 1 }, T = { w: 0, o: 0, y: 0, h: 1 };     // where each is, where it is heading
  var gsap = window.gsap;
  // a new heading only when it changes (asked again each frame, it would start again from rest each frame)
  function go(key, to, dur) {
    if (T[key] === to) return;
    T[key] = to;
    if (!gsap || REDUCE) { M[key] = to; return; }
    var v = {}; v[key] = to;
    gsap.to(M, Object.assign({ duration: dur, ease: stepEase, overwrite: "auto" }, v));
  }
  function set(key, v) { if (gsap) gsap.killTweensOf(M, key); M[key] = T[key] = v; }
  function mix(a, b, t) { return a + (b - a) * t; }
  var heldTy = 0, gut = 0, twoBox = false, lastO = "", lastShape = "";

  // the bars, each as [centre, length] in the button's own pixels, exactly where the layout put them before
  // (not snapped one by one: the button itself sits between pixels, and snapped bars came out a pixel
  // apart in thickness): the two squares (camouflage), the three-bar hamburger, the X
  var BAR = { cam: [], ham: [], x: [], base: 1 }, panel = null;
  function edges(top, len) { return [top + len / 2, len]; }
  function barShapes() {
    var bar = Math.max(2, 2.4 * K), cam = [[0, 12 * K], [16.75 * K, 2.5 * K], [24 * K, 12 * K]], ham = [12.75, 16.75, 20.75];
    for (var i = 0; i < 3; i++) {
      BAR.cam[i] = edges(cam[i][0], cam[i][1]);
      BAR.ham[i] = edges(ham[i] * K, bar);
      BAR.x[i] = edges(16.75 * K, bar);                 // all three on the middle line, the outer two turned
    }
    // each bar's own box: 100px tall at the top, a whole number, so the browser draws it as it is before the
    // transform shapes it (a 7.5px box was snapped to 7 first, then scaled five times into a square: 3px short)
    BAR.base = 100;
    for (var j = 0; j < 3; j++) { btn.children[j].style.top = "0px"; btn.children[j].style.height = "100px"; }
    lastShape = "";
  }
  function barNow(i) {
    var w = M.w, o = M.o, a = BAR.cam[i], b = BAR.ham[i], x = BAR.x[i];
    return [mix(mix(a[0], b[0], w), x[0], o), mix(mix(a[1], b[1], w), x[1], o)];
  }
  function shapeBars() {
    var key = M.w + "|" + M.o;
    if (key === lastShape) return;
    lastShape = key;
    for (var i = 0; i < 3; i++) {
      var s = btn.children[i], c = barNow(i), turn = i === 1 ? 0 : (i === 0 ? 45 : -45) * M.o;
      s.style.transform = "translateY(" + (c[0] - BAR.base / 2).toFixed(3) + "px) rotate(" + turn.toFixed(3) +
        "deg) scaleY(" + (c[1] / BAR.base).toFixed(4) + ")";
      // the middle bar: drawn in as the squares split; while the menu is open (or opening) the panel,
      // seeded exactly over it, is the bar
      if (i === 1) s.style.opacity = M.o > 0 ? "0" : M.w.toFixed(3);
    }
  }
  // the panel: out of the middle bar to its own box, on the menu's clock. Its box is measured once, as a
  // menu motion starts (and on resize); the bar's place each frame is worked out from the button's own
  // numbers, so nothing is read back from the page mid-motion
  function measurePanel() {
    var r = nav.getBoundingClientRect();
    panel = r.width && r.height ? { left: r.left - tx, top: r.top, w: r.width, h: r.height } : null;
  }
  function seed() {
    if (!panel) return null;
    var cx = btnLeft + tx, cy = 18 * K + ty, BW = 12 * K, BH = 36 * K, m = barNow(1);
    var left = cx - BW / 2 * scl, top = cy + (m[0] - m[1] / 2 - BH / 2) * scl;
    return { x: left - (panel.left + tx), y: top - panel.top, sx: BW * scl / panel.w, sy: m[1] * scl / panel.h };
  }
  function shapePanel() {
    var o = M.o, opening = nav.classList.contains("open"), key = o + (opening ? "+" : "-");
    if (key === lastO && (o === 0 || o === 1)) return;          // (at rest, and nothing changed)
    lastO = key;
    var links = nav.querySelectorAll("a");
    if (o <= 0) {
      bg.style.visibility = "hidden"; bg.style.transform = "none"; bg.style.opacity = ""; bg.style.boxShadow = "";
      // (opening, on its first frame the motion hasn't moved yet: the labels stay out, not CSS's open state)
      for (var i = 0; i < links.length; i++) { links[i].style.opacity = opening ? "0" : ""; links[i].style.transform = ""; }
      return;
    }
    // it slides out of the bar as a thin line first, then drops open: on the one clock, its place and width
    // lead (1-(1-o)²) and its height follows (o²) — both still set off and land at rest, as o does — so it
    // never swells into a block over the button, and closing folds it up first, then slides it home
    var f = seed(), ox = 1 - (1 - o) * (1 - o), oy = o * o;
    bg.style.visibility = "visible";
    bg.style.transform = !f || o >= 1 ? "none" : "translate(" + mix(f.x, 0, ox).toFixed(3) + "px," + mix(f.y, 0, ox).toFixed(3) +
      "px) scale(" + mix(f.sx, 1, ox).toFixed(5) + "," + mix(f.sy, 1, oy).toFixed(5) + ")";
    bg.style.opacity = twoBox ? o.toFixed(3) : "";      // from the two squares there is no bar: it fades into being
    bg.style.boxShadow = "0 " + (2 * K).toFixed(2) + "px " + (9 * K).toFixed(2) + "px rgba(0,0,0," + (0.1 * o).toFixed(3) + ")";
    // the labels come in as the panel arrives under them, on its clock: over its second half, easing in
    // from nothing (a plain ramp would start at the panel's full speed)
    var t = Math.max(0, Math.min(1, (o - 0.5) / 0.5));
    t = t * t * (3 - 2 * t);
    for (var j = 0; j < links.length; j++) {
      links[j].style.opacity = t.toFixed(3);
      links[j].style.transform = "translateX(" + ((1 - t) * 5 * K).toFixed(3) + "px)";
    }
  }

  function update() {
    var up = !!zoomEl && zoomEl.getAttribute("aria-hidden") === "false";   // a picture up, not yet flying home
    if (up && heldAt === null) heldAt = scrollY();
    else if (!up && heldAt !== null) {
      if (heldAt !== scrollY() && !REDUCE) { heldTy = ty; set("h", 0); go("h", 1, HOME); }   // ease to the page's new place
      heldAt = null;
    }
    var sc = heldAt !== null ? heldAt : scrollY();
    var cutoff = (markBottomDoc - sc) <= 0;        // lower square above top edge
    var nm = cutoff ? "catch" : "scrub";
    if (nm !== mode) {
      var first = mode === null;
      mode = nm;
      btn.classList.toggle("scrolled", mode === "catch");
      if (first) set("w", mode === "catch" ? 1 : 0); else go("w", mode === "catch" ? 1 : 0, CATCH);
      setOpen(false, true);                        // never leave the menu adrift
    } else if (mode === "scrub" && Math.abs(markCenterDoc - sc - 18 * K) > 2 && nav.classList.contains("open")) {
      setOpen(false, true);                        // scrolled off the top → close
    }
    // position and size: blended from riding with the page (the squares over their marks) to the corner,
    // so the hamburger takes over from the page's own motion with no jolt, and back
    var ride = markCenterDoc - sc - 18 * K;
    var live = mix(ride, 0, M.w);
    ty = M.h < 1 ? mix(heldTy, live, M.h) : live;
    scl = mix(1, HAMBURGER_SCALE, M.w);
    // the scrollbar: stepped aside only once caught (never mid-catch), never under the zoom
    var zoomed = document.documentElement.classList.contains("zoom-open");
    var g = (mode === "catch" && M.w >= 1 && !zoomed) ? gutterNow() : 0;
    if (g) gut = g;
    go("y", g ? 1 : 0, YIELD);
    tx = -gut * M.y;
    apply();
    shapeBars();
    shapePanel();
  }

  function setOpen(open, viaScroll) {
    if (open === (btn.getAttribute("aria-expanded") === "true")) return; // already there
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? "Close menu" : "Menu");
    nav.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) twoBox = !btn.classList.contains("scrolled");   // the panel fades in where there is no bar
    measurePanel();                                           // (once, as the motion starts)
    nav.classList.toggle("open", open);
    go("o", open ? 1 : 0, OPEN);
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
      // the page you are already on (aria-current): just close the menu, don't reload
      if (a.getAttribute("aria-current") === "page") { e.preventDefault(); setOpen(false); return; }
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
