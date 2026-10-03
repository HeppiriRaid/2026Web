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
     and the work flies back to its place in the row. (The zoom and the "+" are
     shared with the front page's photos: js/zoom.js, css/zoom.css.)
   · Hard rule from the front page: every tween settles to the exact static
     state; if anything throws, the page falls back to a plain static row.
   ============================================================ */
(function () {
  "use strict";

  var root = document.documentElement;
  var gsap = window.gsap;
  function mq(q) { return !!(window.matchMedia && window.matchMedia(q).matches); }
  var REDUCE = mq("(prefers-reduced-motion: reduce)");
  if (window.__revealFailsafe) clearTimeout(window.__revealFailsafe);

  var strip = document.getElementById("strip");
  var track = document.getElementById("track");
  var zoom = document.getElementById("zoom");
  var pre = document.getElementById("preloader");
  if (!strip || !track || !zoom) return;
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

  /* ---------- the works: data/illustration.json (edited in console.html) -------
     Fetched on every visit, the newest copy there is (js/fresh.js): GitHub's the
     moment the console saves, with its new pictures straight from the repository
     until the site has them. Every text goes in as text (never as markup). */
  var works = [], N = 0, site = null;
  function loadWorks() {
    // (asked for in the page's head: window.__works — or the list the last page fetched a moment
    // ago, on the way here: js/wipe.js)
    var asked = window.__works || (window.__fresh && window.__fresh.get("data/illustration.json"));
    if (!asked) return Promise.resolve([]);
    return asked.then(function (r) {
      site = r.site;
      if (r.data && Array.isArray(r.data.works)) return r.data.works;
      if (window.console) console.error("illustration: could not load the works");
      return [];
    });
  }
  // a picture's address (on the site, or in the repository until the site has it)
  function at(path) { return window.__fresh ? window.__fresh.url(path, site) : path; }
  function make(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  // one work, in the same markup the page used to carry by hand
  function build(d) {
    var li = make("li", "work"), btn = make("button", "work-btn"), cap = make("p", "work-cap");
    var w = +d.width > 0 ? +d.width : 1, h = +d.height > 0 ? +d.height : 1;
    btn.type = "button";
    if (d.image) {                                  // its pixel size, so the row knows its shape before it loads
      var im = document.createElement("img");
      // the address waits in data-src: loadPictures() lets the ones on screen load first
      im.setAttribute("data-src", at(d.image));
      im.width = w; im.height = h; im.alt = d.title || ""; im.decoding = "async";
      if (d.full) im.setAttribute("data-full", at(d.full));
      btn.appendChild(im);
    } else {                                        // no picture yet: the grey holder, in its proportion
      var ph = make("span", "work-media");
      ph.style.setProperty("--ar", w + "/" + h);
      btn.appendChild(ph);
    }
    var plus = make("span", "plus");
    plus.setAttribute("aria-hidden", "true");
    btn.appendChild(plus);
    [d.title ? "Title: “" + d.title + "”" : "", d.date ? "Date: " + d.date : "", d.medium ? "Medium: " + d.medium : ""]
      .filter(Boolean).forEach(function (f, i) {
        if (i) cap.appendChild(document.createTextNode(" | "));
        cap.appendChild(make("span", "f", f));
      });
    li.setAttribute("data-title", d.title || "");
    li.appendChild(btn); li.appendChild(cap);
    return li;
  }
  function render(list) {
    var frag = document.createDocumentFragment();
    list.forEach(function (d) {
      try { if (d && typeof d === "object") frag.appendChild(build(d)); }
      catch (err) { if (window.console) console.error("illustration: skipped a work", err); }
    });
    track.appendChild(frag);
  }
  function collect() {
    works = $$(".work", track).map(function (el, i) {
      var btn = el.querySelector(".work-btn"), cap = el.querySelector(".work-cap");
      var inner = document.createElement("span");  // the caption rises inside its own mask
      inner.className = "cap-in";
      while (cap.firstChild) inner.appendChild(cap.firstChild);
      cap.appendChild(inner);
      var title = el.getAttribute("data-title") || "";
      cap.id = "cap" + i;
      btn.setAttribute("aria-label", "View " + (title || "work " + (i + 1)));
      btn.setAttribute("aria-describedby", cap.id);
      el.setAttribute("data-i", i);
      return { i: i, el: el, btn: btn, cap: cap, capIn: inner, plus: btn.querySelector(".plus"),
               img: btn.querySelector("img"), title: title || "Work " + (i + 1), shown: false };
    });
    N = works.length;
    // stepping back / forward to the page: the row where it was left (js/wipe.js noted it;
    // the smooth scroll measures the row first, just filled: until it does, it holds it empty)
    var was = window.__arriveAt;
    if (was && was.x > 0) { if (lenis) lenis.resize(); setScroll(was.x, true); }
    if (io) works.forEach(function (w) { io.observe(w.el); });
    loadPictures();
  }
  // The pictures on screen (and the first few) load at once, at high priority; the rest
  // only once those are in, so the first screen doesn't share the connection with every
  // picture in the row. (The browser's own lazy loading never starts inside this
  // sideways-scrolling row, so it is staged here.)
  function loadPictures() {
    var now = [], later = [];
    works.forEach(function (w) { if (w.img) (onScreen(w) || w.i < 4 ? now : later).push(w); });
    now.forEach(function (w) { w.img.setAttribute("fetchpriority", "high"); w.img.src = w.img.getAttribute("data-src"); });
    Promise.race([Promise.all(now.map(function (w) { return whenReady(w.img); })), wait(4000)])
      .then(function () { later.forEach(function (w) { w.img.src = w.img.getAttribute("data-src"); }); });
  }

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
      if (zoomed() || e.ctrlKey) return;
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
  function goTo(i) { if (N) setScroll(stopFor(clamp(i, 0, N - 1)), REDUCE); }   // (the list can be empty)

  // drag (mouse / pen) — touch keeps the native swipe
  var drag = null, eatClick = false;
  strip.addEventListener("pointerdown", function (e) {
    if (e.button !== 0 || e.pointerType === "touch" || zoomed() || introLock) return;
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

  /* ---------- the "+": it never moves, it only fades --------------------------
     in as its work appears (here); out the moment the work is opened, and back in once
     the work has returned to its place in the row (js/zoom.js). */
  function showPlus(w, delay, dur) {
    if (!w.plus) return;
    if (!gsap || REDUCE) { w.plus.style.opacity = 1; return; }
    gsap.to(w.plus, { opacity: 1, duration: dur || 0.45, delay: delay || 0, ease: "power2.out", overwrite: true });
  }

  /* ---------- whole device pixels for every moving edge ------------------------
     Inside the cursor's square a half-covered pixel on an edge folds through black
     (css/anim.css), so a wipe's moving edge, and a sliding picture, land on whole pixels. */
  function dp(v) { var d = window.devicePixelRatio || 1; return Math.round(v * d) / d; }
  // the clip for a wipe that has revealed p (0→1) of el, from its "left" or "right" edge;
  // the still sides lie a pixel outside the box
  function wipeClip(el, p, from) {
    var r = el.getBoundingClientRect();
    return from === "left" ? "inset(-1px " + (r.right - dp(r.left + r.width * p)) + "px -1px -1px)"
      : "inset(-1px -1px -1px " + (dp(r.right - r.width * p) - r.left) + "px)";
  }

  /* ---------- reveal: the front page's panel wipe, as works come into view ---- */
  var introLock = true;
  function reveal(w, delay) {
    if (w.shown) return;
    w.shown = true;
    if (io) io.unobserve(w.el);
    if (!gsap || REDUCE) { w.btn.style.clipPath = "none"; w.cap.style.opacity = 1; if (w.plus) w.plus.style.opacity = 1; return; }
    var s = { p: 0 };
    gsap.to(s, { p: 1, duration: 1.1, delay: delay, ease: worksEase,
      onUpdate: function () { w.btn.style.clipPath = wipeClip(w.btn, s.p, "left"); },
      onComplete: function () { w.btn.style.clipPath = "none"; } });
    gsap.set(w.capIn, { yPercent: 108 });
    w.cap.style.opacity = 1;
    gsap.to(w.capIn, { yPercent: 0, duration: 0.85, delay: delay + 0.32, ease: "power3.out",
      onComplete: function () { gsap.set(w.capIn, { clearProps: "transform" }); } });
    showPlus(w, delay + 0.72, 0.6);                  // the "+" fades in as the wipe reaches it
  }
  // wipe works in, in order, each only once its picture can paint (a work never wipes in
  // as an empty grey box) — but never waiting longer than `cap` ms for one
  function revealInOrder(list, base, step, cap) {
    var t0 = performance.now(), prev = -1;
    list.reduce(function (chain, w, k) {
      return chain.then(function () { return w.img ? Promise.race([whenReady(w.img), wait(cap)]) : null; })
        .then(function () {
          var now = (performance.now() - t0) / 1000, at = Math.max(base + step * k, prev + step, now);
          prev = at;
          reveal(w, at - now);
        });
    }, Promise.resolve());
  }
  var io = ("IntersectionObserver" in window) ? new IntersectionObserver(function (entries) {
    if (introLock) return;                          // the intro reveals what is on screen first
    var batch = entries.filter(function (en) { return en.isIntersecting; })
      .map(function (en) { return works[+en.target.getAttribute("data-i")]; })
      .filter(function (w) { return w && !w.shown; })
      .sort(function (a, b) { return a.i - b.i; });
    revealInOrder(batch, 0, 0.08, 4000);
  }, { threshold: 0.12 }) : null;

  /* ---------- zoom: the works in the zoom view (js/zoom.js, shared with the front page) ----
     It lifts a work out of the row; ← → / the wheel / a swipe there step through the row,
     and the row follows underneath, so closing lands home. */
  var view = window.__zoom ? window.__zoom({
    el: zoom,
    items: function () {
      return works.map(function (w) {
        return { el: w.el, box: w.btn, img: w.img, full: w.img && w.img.getAttribute("data-full"),
                 title: w.title, plus: w.plus, focus: w.btn, crop: false };
      });
    },
    lock: function () { if (lenis) lenis.stop(); },
    unlock: function () { if (lenis) lenis.start(); },
    follow: function (j) { setScroll(stopFor(j), true); }
  }) : null;
  function zoomed() { return !!view && view.isOpen(); }

  // open: "+" or anywhere on the work (unless that press was a drag)
  // (listens on the whole work, not just the button: while a work is still wiping in, the
  // clip-path also clips hit-testing, and a tap on its not-yet-revealed part must still open it)
  track.addEventListener("click", function (e) {
    var w = e.target.closest(".work");
    if (!w) return;
    if (eatClick) { e.preventDefault(); e.stopPropagation(); return; }
    if (view) view.open(+w.getAttribute("data-i"), e.detail === 0);   // (detail 0: opened with Enter / Space)
  });
  /* ---------- keyboard ------------------------------------------------------- */
  window.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    if (zoomed()) return;                                       // (the zoom's own keys: js/zoom.js)
    if (introLock || (menuNav && menuNav.classList.contains("open"))) return;
    var i = indexAt(aimScroll());
    if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown") goTo(i + 1);
    else if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp") goTo(i - 1);
    else if (k === "Home") goTo(0);
    else if (k === "End") setScroll(maxScroll(), REDUCE);
    else return;
    e.preventDefault();
  });

  /* (leaving for another page — the white wipe — lives in js/wipe.js, shared with the front page;
     as the next page comes into this window, what would outlive this one lets go) */
  document.addEventListener("kt:gone", function () { if (io) io.disconnect(); if (lenis) lenis.destroy(); });

  /* (the custom cursor lives in js/cursor.js, shared with the front page) */

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
    // the works on screen wipe in left to right, each once its picture can paint. Usually
    // they all can already, and this is the plain 0.09s cascade; on a slow first visit
    // from another page the sheet doesn't wait for them, and they follow as they arrive.
    var list = works.filter(onScreen);
    revealInOrder(list, 0.12, 0.09, 8000);
    if (!io) works.forEach(function (w) { if (list.indexOf(w) < 0) reveal(w, 0.12 + 0.09 * list.length); });
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
    var name = pre.querySelector(".pl-name"), arrive = !!window.__arrive;
    var entered = Promise.resolve();
    if (!arrive) {                     // a fresh visit: the name rises first (from another page of the site, no name)
      var enter = gsap.timeline();
      enter.to(name, { y: "0%", duration: 0.9, ease: "power3.out" });
      entered = new Promise(function (res) { enter.eventCallback("onComplete", res); });
    }
    var fonts = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, wait(2500)]) : Promise.resolve();
    var firstImgs = works.filter(function (w) { return w.img && onScreen(w); }).map(function (w) { return whenReady(w.img); });
    // the curtain never lifts onto a blank work — except from another page of the site,
    // where the sheet lifts at once: any work still loading wipes in as soon as its
    // picture can paint (intro())
    var imgs = arrive ? Promise.resolve() : Promise.race([Promise.all(firstImgs), wait(6000)]);
    Promise.all([entered, fonts, imgs]).then(function () {
      if (arrive && window.__wipe) {               // the white sheet lifts straight off as the intro rises in
        window.__wipe.arrive(intro, function () { if (lenis) lenis.start(); });
        return;
      }
      var tl = gsap.timeline();
      if (!arrive) tl.to(name, { y: "-115%", duration: 0.55, ease: "power3.in" }, "+=0.15");   // (never shown when arriving)
      tl.to(pre, { yPercent: -100, duration: 0.85, ease: "power4.inOut", modifiers: window.__wipe && window.__wipe.sheet }, arrive ? 0 : "-=0.25")
        .add(function () { pre.style.display = "none"; if (lenis) lenis.start(); })
        .add(intro, "-=0.45");
    });
    setTimeout(function () {                                  // failsafe: never leave the page covered
      if (introLock) { introLock = false; pre.style.display = "none"; root.classList.remove("anim"); if (lenis) lenis.start(); }
    }, 12000);
  }

  // start once the works are in the row and the type is in (a failed or slow list still
  // starts, onto an empty row). Not on the page's load event: that waits for every
  // picture in the row, and only the ones on screen matter here (start() waits for those).
  var typeIn = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, wait(2500)]) : Promise.resolve();
  // (emptied first: an old cached copy of the page still carries hand-written works)
  var listed = loadWorks().then(function (list) { track.textContent = ""; render(list); collect(); })
    .catch(function (err) { if (window.console) console.error("illustration: the row failed", err); });
  Promise.all([listed, typeIn]).then(function () {
    try { start(); } catch (err) {
      if (window.console) console.error("illustration.js failed, showing the static page:", err);
      introLock = false;
      root.classList.remove("anim");
      if (pre) pre.style.display = "none";
    }
  });
})();
