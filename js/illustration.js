/* ============================================================
   Illustration page — one sideways row of works + a zoom view.

   · The row scrolls sideways with the SAME smooth scroll as the front page
     (Lenis, duration 1.1, the same easing), driven by the wheel / trackpad in
     either direction, by dragging, and by the arrow keys (one work per press).
     Touch keeps the native swipe.
   · Works reveal with the front page's panel wipe (slow → fast → slow) as they
     come into view; captions rise out of a mask; the "+" fades in last.
   · "+" (or a click on the work) lifts it out of the row into the zoom view:
     the band grey, the work centred with the same 12pt margin on opposite sides.
     ← → / the wheel / a swipe step between works there; Esc or a click closes,
     and the work flies back to its place in the row.
   · Hard rule from the front page: every tween settles to the exact static
     state; if anything throws, the page falls back to a plain static row.
   ============================================================ */
(function () {
  "use strict";

  var root = document.documentElement;
  var gsap = window.gsap;
  function mq(q) { return !!(window.matchMedia && window.matchMedia(q).matches); }
  var REDUCE = mq("(prefers-reduced-motion: reduce)");
  var FINE = mq("(pointer:fine)");
  if (window.__revealFailsafe) clearTimeout(window.__revealFailsafe);

  var strip = document.getElementById("strip");
  var track = document.getElementById("track");
  var zoom = document.getElementById("zoom");
  var pre = document.getElementById("preloader");
  if (!strip || !track || !zoom) return;
  var zoomBg = zoom.querySelector(".zoom-bg");
  var zoomUi = zoom.querySelector(".zoom-ui");
  var zoomTitle = document.getElementById("zoomTitle");
  var menuNav = document.getElementById("menuNav");

  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function K() { return parseFloat(getComputedStyle(root).getPropertyValue("--k")) || 4; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // custom cubic-bezier ease (no plugin) — same solver as the front page
  function cubicBezier(x1, y1, x2, y2) {
    function bz(p, a, b) { var m = 1 - p; return 3 * m * m * p * a + 3 * m * p * p * b + p * p * p; }
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var lo = 0, hi = 1, p = x;
      for (var i = 0; i < 18; i++) { p = (lo + hi) / 2; if (bz(p, x1, x2) < x) lo = p; else hi = p; }
      return bz(p, y1, y2);
    };
  }
  var worksEase = cubicBezier(0.38, 0, 0.5, 1);   // the front page's panel wipe: slow → fast → slow
  var lift = cubicBezier(0.22, 1, 0.36, 1);       // zoom: answers at once, lands softly

  /* ---------- the works ------------------------------------------------------ */
  var works = $$(".work", track).map(function (el, i) {
    var btn = el.querySelector(".work-btn"), cap = el.querySelector(".work-cap");
    var inner = document.createElement("span");    // the caption rises inside its own mask
    inner.className = "cap-in";
    while (cap.firstChild) inner.appendChild(cap.firstChild);
    cap.appendChild(inner);
    var first = cap.querySelector(".f");
    var title = ((first || cap).textContent || "").replace(/^\s*Title:\s*/i, "").replace(/[“”"]/g, "").trim();
    cap.id = "cap" + i;
    btn.setAttribute("aria-label", "View " + (title || "work " + (i + 1)));
    btn.setAttribute("aria-describedby", cap.id);
    el.setAttribute("data-i", i);
    return { i: i, el: el, btn: btn, cap: cap, capIn: inner, plus: btn.querySelector(".plus"),
             img: btn.querySelector("img"), title: title || "Work " + (i + 1), shown: false };
  });
  var N = works.length;

  /* ---------- sideways scroll ------------------------------------------------ */
  var lenis = null;
  if (gsap && !REDUCE && typeof window.Lenis !== "undefined") {
    lenis = new window.Lenis({
      wrapper: strip, content: track, eventsTarget: window,
      orientation: "horizontal", gestureOrientation: "both",
      duration: 1.1,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true, wheelMultiplier: 1, touchMultiplier: 1.4
    });
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
  } else {
    // no smooth scroll (reduced motion / no library): still let a vertical wheel move the row
    window.addEventListener("wheel", function (e) {
      if (Z.open || e.ctrlKey) return;
      var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (e.deltaMode === 1) d *= 32; else if (e.deltaMode === 2) d *= strip.clientWidth;
      strip.scrollLeft += d;
      e.preventDefault();
    }, { passive: false });
  }

  function maxScroll() { return Math.max(0, track.scrollWidth - strip.clientWidth); }
  function nowScroll() { return lenis ? lenis.scroll : strip.scrollLeft; }          // where the row is
  function aimScroll() { return lenis ? lenis.targetScroll : strip.scrollLeft; }    // where it is heading
  function setScroll(x, immediate) {
    x = clamp(x, 0, maxScroll());
    // programmatic:false, like a wheel scroll: Lenis then keeps targetScroll = the destination,
    // so quick repeated arrow presses chain from where the row is heading, not where it is
    if (lenis) lenis.scrollTo(x, { immediate: !!immediate, force: true, programmatic: false });
    else strip.scrollLeft = x;
  }
  // a work "at rest" sits on the 12pt outer margin
  function stopFor(i) { return clamp(works[i].el.offsetLeft - (parseFloat(getComputedStyle(track).paddingLeft) || 0), 0, maxScroll()); }
  function indexAt(x) {
    var best = 0, bd = Infinity;
    for (var i = 0; i < N; i++) { var d = Math.abs(stopFor(i) - x); if (d < bd - 0.5) { bd = d; best = i; } }
    return best;
  }
  function goTo(i) { setScroll(stopFor(clamp(i, 0, N - 1)), REDUCE); }

  // drag (mouse / pen) — touch keeps the native swipe
  var drag = null, eatClick = false;
  strip.addEventListener("pointerdown", function (e) {
    if (e.button !== 0 || e.pointerType === "touch" || Z.open || introLock) return;
    drag = { x: e.clientX, s: nowScroll(), moved: false, v: 0, lx: e.clientX, lt: performance.now() };
  });
  window.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) < 6) return;
      drag.moved = true; root.classList.add("is-dragging");
    }
    setScroll(drag.s - dx, true);
    var t = performance.now(), dt = t - drag.lt;
    if (dt > 0) drag.v = 0.75 * ((drag.lx - e.clientX) / dt) + 0.25 * drag.v;   // px per ms
    drag.lx = e.clientX; drag.lt = t;
  });
  function endDrag() {
    if (!drag) return;
    if (drag.moved) {
      eatClick = true; setTimeout(function () { eatClick = false; }, 0);         // the click that follows the drag
      var v = performance.now() - drag.lt > 90 ? 0 : drag.v;                      // a held pointer has no fling
      setScroll(nowScroll() + clamp(v * 280, -innerWidth, innerWidth), false);    // glide on, front-page easing
      root.classList.remove("is-dragging");
    }
    drag = null;
  }
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  /* ---------- reveal: the front page's panel wipe, as works come into view ---- */
  var introLock = true;
  function reveal(w, delay) {
    if (w.shown) return;
    w.shown = true;
    if (io) io.unobserve(w.el);
    if (!gsap || REDUCE) { w.btn.style.clipPath = "none"; w.cap.style.opacity = 1; if (w.plus) w.plus.style.opacity = 1; return; }
    var s = { p: 0 };
    gsap.to(s, { p: 1, duration: 1.1, delay: delay, ease: worksEase,
      onUpdate: function () { w.btn.style.clipPath = "inset(0px " + ((1 - s.p) * 100).toFixed(3) + "% 0px 0px)"; },
      onComplete: function () { w.btn.style.clipPath = "none"; } });
    gsap.set(w.capIn, { yPercent: 108 });
    w.cap.style.opacity = 1;
    gsap.to(w.capIn, { yPercent: 0, duration: 0.85, delay: delay + 0.32, ease: "power3.out",
      onComplete: function () { gsap.set(w.capIn, { clearProps: "transform" }); } });
    if (w.plus) gsap.fromTo(w.plus, { opacity: 0 }, { opacity: 1, duration: 0.5, delay: delay + 0.78, ease: "power2.out" });
  }
  var io = ("IntersectionObserver" in window) ? new IntersectionObserver(function (entries) {
    if (introLock) return;                          // the intro reveals what is on screen first
    var batch = entries.filter(function (en) { return en.isIntersecting; })
      .map(function (en) { return works[+en.target.getAttribute("data-i")]; })
      .filter(function (w) { return w && !w.shown; })
      .sort(function (a, b) { return a.i - b.i; });
    batch.forEach(function (w, n) { reveal(w, n * 0.08); });
  }, { threshold: 0.12 }) : null;
  if (io) works.forEach(function (w) { io.observe(w.el); });

  /* ---------- zoom ------------------------------------------------------------ */
  var Z = { open: false, busy: false, i: -1, fig: null, ret: null, wt: 0, acc: 0, used: false, sx: null, sy: 0, swiped: false };

  function aspect(w) { var r = w.btn.getBoundingClientRect(); return r.height ? r.width / r.height : 1; }
  // the work, centred, with the same margin (12pt) on opposite sides
  function fit(ar) {
    var m = 12 * K(), vw = window.innerWidth, vh = window.innerHeight;
    var aw = vw - 2 * m, ah = vh - 2 * m, w, h;
    if (aw / ah > ar) { h = ah; w = h * ar; } else { w = aw; h = w / ar; }
    return { left: (vw - w) / 2, top: (vh - h) / 2, width: w, height: h };
  }
  function rectOf(el) { var r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; }
  function place(f, r) {
    f.style.left = r.left + "px"; f.style.top = r.top + "px";
    f.style.width = r.width + "px"; f.style.height = r.height + "px";
  }
  function flip(from, to) {   // the transform that lays box `to` over box `from`
    return { x: from.left - to.left, y: from.top - to.top, scaleX: from.width / to.width, scaleY: from.height / to.height };
  }
  function makeFig(w) {
    var f = document.createElement("figure");
    f.className = "zoom-fig";
    if (w.img) {
      var im = document.createElement("img");
      im.alt = w.img.alt || w.title;
      im.src = w.img.currentSrc || w.img.src;                // already decoded: no blank frame
      var full = w.img.getAttribute("data-full");
      if (full) {                                           // swap to the large file once it can paint
        var hi = new Image(); hi.src = full;
        (hi.decode ? hi.decode() : Promise.reject()).then(function () { im.src = full; }, function () {});
      }
      f.appendChild(im); f.classList.add("has-img");
    }
    zoom.insertBefore(f, zoomUi);
    return f;
  }
  function focusIn(el) { try { el.focus({ preventScroll: true }); } catch (e) {} }

  function openZoom(i) {
    var w = works[i];
    if (!w || Z.open || Z.busy) return;
    Z.open = true; Z.busy = true; Z.i = i; Z.ret = w.btn;
    if (lenis) lenis.stop();
    var r0 = rectOf(w.btn), r1 = fit(r0.width / r0.height);
    var f = makeFig(w); place(f, r1); Z.fig = f;
    zoomTitle.textContent = w.title;
    zoom.classList.add("is-open"); zoom.setAttribute("aria-hidden", "false");
    w.el.classList.add("is-zoomed");
    focusIn(zoom);                                     // the dialog itself; Tab reaches the controls
    if (!gsap || REDUCE) { zoomBg.style.opacity = 1; Z.busy = false; return; }
    gsap.fromTo(f, flip(r0, r1), { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: 0.9, ease: lift,
      onComplete: function () { Z.busy = false; } });
    gsap.fromTo(zoomBg, { opacity: 0 }, { opacity: 1, duration: 0.55, ease: "power2.out" });
  }

  function closeZoom() {
    if (!Z.open || Z.busy) return;
    var w = works[Z.i], f = Z.fig;
    Z.busy = true;
    zoom.setAttribute("aria-hidden", "true");
    var r1 = { left: parseFloat(f.style.left), top: parseFloat(f.style.top), width: parseFloat(f.style.width), height: parseFloat(f.style.height) };
    var r0 = rectOf(w.btn);
    function done() {
      w.el.classList.remove("is-zoomed");               // the real work takes over in the same frame
      if (f.parentNode) f.parentNode.removeChild(f);
      Z.fig = null; Z.open = false; Z.busy = false;
      zoom.classList.remove("is-open");
      if (lenis) lenis.start();
      focusIn(w.btn);
    }
    if (!gsap || REDUCE) { zoomBg.style.opacity = 0; done(); return; }
    gsap.to(f, Object.assign(flip(r0, r1), { duration: 0.75, ease: lift, overwrite: true, onComplete: done }));
    gsap.to(zoomBg, { opacity: 0, duration: 0.5, delay: 0.1, ease: "power2.inOut" });
  }

  // step to the next / previous work inside the zoom: a sideways wipe in the
  // direction of travel (the old work sweeps off, the new one sweeps in)
  function stepZoom(d) {
    if (!Z.open || Z.busy) return;
    var j = Z.i + d;
    if (j < 0 || j >= N) {                                   // the ends: a small nudge, nothing more
      if (gsap && !REDUCE) gsap.fromTo(Z.fig, { xPercent: 0 }, { xPercent: -1.2 * d, duration: 0.16, ease: "power2.out", yoyo: true, repeat: 1 });
      return;
    }
    Z.busy = true;
    var ow = works[Z.i], nw = works[j], of = Z.fig;
    setScroll(stopFor(j), true);                             // the row follows underneath, so closing lands home
    ow.el.classList.remove("is-zoomed"); nw.el.classList.add("is-zoomed");
    var nf = makeFig(nw); place(nf, fit(aspect(nw)));
    Z.fig = nf; Z.i = j; zoomTitle.textContent = nw.title;
    if (!gsap || REDUCE) { of.parentNode.removeChild(of); Z.busy = false; return; }
    var a = { p: 0 }, b = { p: 0 };
    nf.style.clipPath = d > 0 ? "inset(0px 0px 0px 100%)" : "inset(0px 100% 0px 0px)";
    gsap.to(a, { p: 1, duration: 0.7, ease: worksEase,
      onUpdate: function () { of.style.clipPath = d > 0 ? "inset(0px " + (a.p * 100) + "% 0px 0px)" : "inset(0px 0px 0px " + (a.p * 100) + "%)"; },
      onComplete: function () { if (of.parentNode) of.parentNode.removeChild(of); } });
    gsap.to(of, { xPercent: -5 * d, duration: 0.7, ease: worksEase });
    gsap.to(b, { p: 1, duration: 0.8, delay: 0.1, ease: worksEase,
      onUpdate: function () { nf.style.clipPath = d > 0 ? "inset(0px 0px 0px " + ((1 - b.p) * 100) + "%)" : "inset(0px " + ((1 - b.p) * 100) + "% 0px 0px)"; },
      onComplete: function () { nf.style.clipPath = ""; Z.busy = false; } });
    gsap.fromTo(nf, { xPercent: 5 * d }, { xPercent: 0, duration: 0.8, delay: 0.1, ease: worksEase });
  }

  // open: "+" or anywhere on the work (unless that press was a drag)
  // (listens on the whole work, not just the button: while a work is still wiping in, the
  // clip-path also clips hit-testing, and a tap on its not-yet-revealed part must still open it)
  track.addEventListener("click", function (e) {
    var w = e.target.closest(".work");
    if (!w) return;
    if (eatClick) { e.preventDefault(); e.stopPropagation(); return; }
    openZoom(+w.getAttribute("data-i"));
  });
  // inside the zoom: the controls, else a click / tap anywhere closes
  zoom.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (b) { var a = b.getAttribute("data-act"); if (a === "close") closeZoom(); else stepZoom(a === "next" ? 1 : -1); return; }
    if (Z.swiped) return;
    closeZoom();
  });
  // swipe between works (touch / pen)
  zoom.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse") { Z.sx = e.clientX; Z.sy = e.clientY; } });
  zoom.addEventListener("pointerup", function (e) {
    if (Z.sx === null) return;
    var dx = e.clientX - Z.sx, dy = e.clientY - Z.sy;
    Z.sx = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      Z.swiped = true; setTimeout(function () { Z.swiped = false; }, 0);
      stepZoom(dx < 0 ? 1 : -1);
    }
  });
  // the wheel steps one work per gesture (a trackpad flick is one gesture, not ten)
  window.addEventListener("wheel", function (e) {
    if (!Z.open) return;
    e.preventDefault();
    if (e.ctrlKey) return;
    var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    var t = performance.now(), gap = t - Z.wt;
    Z.wt = t;
    if (gap > 220) { Z.acc = 0; Z.used = false; }
    if (Z.used || Z.busy) return;
    Z.acc += d;
    if (Math.abs(Z.acc) > 40) { Z.used = true; stepZoom(Z.acc > 0 ? 1 : -1); }
  }, { passive: false });

  /* ---------- keyboard ------------------------------------------------------- */
  window.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    if (Z.open) {
      if (k === "Escape") closeZoom();
      else if (k === "ArrowRight" || k === "ArrowDown") stepZoom(1);
      else if (k === "ArrowLeft" || k === "ArrowUp") stepZoom(-1);
      else if (k === "Tab") {                                    // keep focus inside the zoom
        var bs = $$("button", zoomUi), at = bs.indexOf(document.activeElement);
        focusIn(bs[at < 0 ? (e.shiftKey ? bs.length - 1 : 0) : (at + (e.shiftKey ? bs.length - 1 : 1)) % bs.length]);
      } else return;
      e.preventDefault();
      return;
    }
    if (introLock || (menuNav && menuNav.classList.contains("open"))) return;
    var i = indexAt(aimScroll());
    if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown") goTo(i + 1);
    else if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp") goTo(i - 1);
    else if (k === "Home") goTo(0);
    else if (k === "End") setScroll(maxScroll(), REDUCE);
    else return;
    e.preventDefault();
  });

  window.addEventListener("resize", function () {
    if (Z.open && Z.fig && !Z.busy) place(Z.fig, fit(aspect(works[Z.i])));
  });

  /* ---------- leaving: the paper curtain comes down (the preloader's own element) ---- */
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== "_self") return;
    var url;
    try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
    if (!gsap || REDUCE || !pre) return;
    e.preventDefault();
    pre.style.display = "flex";
    var name = pre.querySelector(".pl-name");
    if (name) gsap.set(name, { y: "110%" });
    gsap.fromTo(pre, { yPercent: 100 }, { yPercent: 0, duration: 0.7, ease: "power4.inOut",
      onComplete: function () { location.href = url.href; } });
  }, true);
  window.addEventListener("pageshow", function (ev) {        // back / forward cache: never restore a covered page
    if (ev.persisted && pre) { pre.style.display = "none"; if (gsap) gsap.set(pre, { clearProps: "transform" }); }
  });

  /* ---------- custom cursor (fine pointers) — the front page's ---------------- */
  function cursor() {
    var dot = document.querySelector(".cursor-dot"), ring = document.querySelector(".cursor-ring");
    if (!dot || !ring || !FINE || !gsap) return;
    root.classList.add("cursor-ready");
    var mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    function setDot() { dot.style.transform = "translate3d(" + mx + "px," + my + "px,0) translate(-50%,-50%)"; }
    function setRing() { ring.style.transform = "translate3d(" + rx.toFixed(1) + "px," + ry.toFixed(1) + "px,0) translate(-50%,-50%)"; }
    setDot(); setRing();
    window.addEventListener("mousemove", function (e) { mx = e.clientX; my = e.clientY; setDot(); }, { passive: true });
    gsap.ticker.add(function () {
      var nx = rx + (mx - rx) * 0.18, ny = ry + (my - ry) * 0.18;
      if (Math.abs(mx - nx) < 0.05) nx = mx;
      if (Math.abs(my - ny) < 0.05) ny = my;
      if (nx === rx && ny === ry) return;
      rx = nx; ry = ny; setRing();
    });
    var HOT = "a, .work-btn, .zoom-ui button";
    document.addEventListener("mouseover", function (e) { if (e.target.closest(HOT)) ring.classList.add("is-hover"); });
    document.addEventListener("mouseout", function (e) { if (e.target.closest(HOT)) ring.classList.remove("is-hover"); });
  }

  /* ---------- intro: the front page's preloader, then the header + works --------- */
  function whenReady(img) {
    var decode = function () { return img.decode ? img.decode().then(null, function () {}) : Promise.resolve(); };
    if (img.complete && img.naturalWidth) return decode();
    return new Promise(function (res) {
      img.addEventListener("load", res, { once: true });
      img.addEventListener("error", res, { once: true });
    }).then(decode);
  }
  function onScreen(w) { var r = w.el.getBoundingClientRect(); return r.right > 0 && r.left < window.innerWidth; }

  function intro() {
    introLock = false;
    gsap.fromTo($$(".istage .brand, .istage .nav"), { opacity: 0, y: 42 },
      { opacity: 1, y: 0, duration: 1.0, ease: "power3.out", stagger: 0.075, clearProps: "transform" });
    var n = 0;
    works.forEach(function (w) { if (onScreen(w)) reveal(w, 0.12 + 0.09 * n++); });
    if (!io) works.forEach(function (w) { reveal(w, 0.12 + 0.09 * n++); });
  }

  function start() {
    if (!gsap || REDUCE || !pre) {
      introLock = false;
      if (pre) pre.style.display = "none";
      root.classList.remove("anim");
      works.forEach(function (w) { w.shown = true; });
      return;
    }
    if (lenis) lenis.stop();
    var name = pre.querySelector(".pl-name");
    var enter = gsap.timeline();
    enter.to(name, { y: "0%", duration: 0.9, ease: "power3.out" });
    var entered = new Promise(function (res) { enter.eventCallback("onComplete", res); });
    var fonts = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, wait(2500)]) : Promise.resolve();
    var firstImgs = works.filter(function (w) { return w.img && onScreen(w); }).map(function (w) { return whenReady(w.img); });
    var imgs = Promise.race([Promise.all(firstImgs), wait(6000)]);    // the curtain never lifts onto a blank work
    Promise.all([entered, fonts, imgs]).then(function () {
      gsap.timeline()
        .to(name, { y: "-115%", duration: 0.55, ease: "power3.in" }, "+=0.15")
        .to(pre, { yPercent: -100, duration: 0.85, ease: "power4.inOut" }, "-=0.25")
        .add(function () { pre.style.display = "none"; if (lenis) lenis.start(); })
        .add(intro, "-=0.45");
    });
    setTimeout(function () {                                  // failsafe: never leave the page covered
      if (introLock) { introLock = false; pre.style.display = "none"; root.classList.remove("anim"); if (lenis) lenis.start(); }
    }, 12000);
  }

  try {
    cursor();
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
  } catch (err) {
    if (window.console) console.error("illustration.js failed, showing the static page:", err);
    root.classList.remove("anim");
    if (pre) pre.style.display = "none";
  }
})();
