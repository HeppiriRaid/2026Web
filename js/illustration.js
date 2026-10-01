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

  // the "+" in whole device pixels — its size and its bars' thickness, with the bars exactly
  // centred — so all its edges land on pixels (css/illustration.css)
  function crispPlus() {
    var r = window.devicePixelRatio || 1, k = K();
    var w = Math.max(1, Math.round(0.6 * k * r)), s = Math.round(4.5 * k * r);
    if ((s - w) % 2) s += 1;
    root.style.setProperty("--plus-w", w / r + "px");
    root.style.setProperty("--plus-s", s / r + "px");
  }
  crispPlus();
  window.addEventListener("resize", crispPlus);

  /* ---------- the works: data/illustration.json (edited in console.html) -------
     Fetched fresh on every visit, so a Save in the console shows as soon as its
     deploy lands. Every text goes in as text (never as markup). */
  var works = [], N = 0;
  function loadWorks() {
    // the list the last page fetched a moment ago, on the way here (js/wipe.js)
    try {
      var s = JSON.parse(sessionStorage.getItem("kt-works") || "null");
      sessionStorage.removeItem("kt-works");
      if (s && Date.now() - s.t < 15000 && s.d && Array.isArray(s.d.works)) return Promise.resolve(s.d.works);
    } catch (e) {}
    if (!window.fetch) return Promise.resolve([]);
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 8000);
    return fetch("data/illustration.json?t=" + Date.now(), { cache: "no-store", signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) { return d && Array.isArray(d.works) ? d.works : []; })
      .catch(function (err) { if (window.console) console.error("illustration: could not load the works", err); return []; })
      .then(function (list) { clearTimeout(timer); return list; });
  }
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
      im.setAttribute("data-src", d.image);
      im.width = w; im.height = h; im.alt = d.title || ""; im.decoding = "async";
      if (d.full) im.setAttribute("data-full", d.full);
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
  function goTo(i) { if (N) setScroll(stopFor(clamp(i, 0, N - 1)), REDUCE); }   // (the list can be empty)

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

  /* ---------- the "+": it never moves, it only fades --------------------------
     in as its work appears, out the moment the work is opened, and back in once the
     work has returned to its place in the row. */
  function showPlus(w, delay, dur) {
    if (!w.plus) return;
    if (!gsap || REDUCE) { w.plus.style.opacity = 1; return; }
    gsap.to(w.plus, { opacity: 1, duration: dur || 0.45, delay: delay || 0, ease: "power2.out", overwrite: true });
  }
  function hidePlus(w) {
    if (!w.plus || !gsap || REDUCE) return;
    gsap.to(w.plus, { opacity: 0, duration: 0.25, ease: "power2.out", overwrite: true });
  }
  function setPlus(w, v) { if (w.plus) { if (gsap) gsap.killTweensOf(w.plus); w.plus.style.opacity = v; } }

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
  // GSAP modifiers for a picture sliding sideways by xPercent
  function slideX(f) { return { xPercent: function (v) { var w = parseFloat(f.style.width) || f.offsetWidth || 1; return dp(v / 100 * w) / w * 100; } }; }

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

  /* ---------- zoom ------------------------------------------------------------ */
  var Z = { open: false, busy: false, kbd: false, i: -1, fig: null, ret: null, wt: 0, acc: 0, used: false, sx: null, sy: 0, swiped: false };

  function aspect(w) { var r = w.btn.getBoundingClientRect(); return r.height ? r.width / r.height : 1; }
  // the work, centred, with the same margin (12pt) on opposite sides — on whole device
  // pixels: a picture edge on a half pixel blurs, and inside the cursor's square a blurred
  // edge folds through black (css/anim.css)
  function fit(ar) {
    var m = 12 * K(), vw = window.innerWidth, vh = window.innerHeight, r = window.devicePixelRatio || 1;
    var aw = vw - 2 * m, ah = vh - 2 * m, w, h;
    if (aw / ah > ar) { h = ah; w = h * ar; } else { w = aw; h = w / ar; }
    function px(v) { return Math.round(v * r) / r; }
    var left = px((vw - w) / 2), top = px((vh - h) / 2);
    return { left: left, top: top, width: px(left + w) - left, height: px(top + h) - top };
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
      im.src = w.img.currentSrc || w.img.getAttribute("src") || w.img.getAttribute("data-src");   // already decoded: no blank frame
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
  // a big image painted for the first time is decoded on that very frame (a visible hitch);
  // decode it off the main thread first — capped, so a slow file never holds the motion
  function ready(f) {
    var im = f.querySelector("img");
    if (!im || !im.decode) return Promise.resolve();
    return Promise.race([im.decode().then(null, function () {}), wait(160)]);
  }

  function openZoom(i) {
    var w = works[i];
    if (!w || Z.open || Z.busy) return;
    Z.open = true; Z.busy = true; Z.i = i; Z.ret = w.btn;
    if (lenis) lenis.stop();
    var r0 = rectOf(w.btn), r1 = fit(r0.width / r0.height);
    var f = makeFig(w); place(f, r1); Z.fig = f;
    zoomTitle.textContent = w.title;
    zoom.classList.add("is-open"); zoom.setAttribute("aria-hidden", "false");
    focusIn(zoom);                                     // the dialog itself; Tab reaches the controls
    hidePlus(w);                                       // the "+" fades out the moment the work is opened
    if (!gsap || REDUCE) { w.el.classList.add("is-zoomed"); zoomBg.style.opacity = 1; Z.busy = false; return; }
    gsap.set(f, flip(r0, r1));                         // sits exactly on the work in the row…
    f.style.visibility = "hidden";
    gsap.fromTo(zoomBg, { opacity: 0 }, { opacity: 1, duration: 0.55, ease: "power2.out" });   // the answer is immediate
    ready(f).then(function () {                        // …and lifts off once its picture can paint
      f.style.visibility = "";
      w.el.classList.add("is-zoomed");
      gsap.to(f, { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: 0.9, ease: lift,
        onComplete: function () { Z.busy = false; } });
    });
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
      showPlus(w, 0.05, 0.45);                          // …and then its "+" fades back in
      if (f.parentNode) f.parentNode.removeChild(f);
      Z.fig = null; Z.open = false; Z.busy = false;
      zoom.classList.remove("is-open");
      if (lenis) lenis.start();
      // keyboard visitors get their place back (with its focus ring); a mouse visitor
      // gets no ring at all — just the work landing and its "+" drawing in
      if (Z.kbd) focusIn(w.btn);
      else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }
    if (!gsap || REDUCE) { zoomBg.style.opacity = 0; done(); return; }
    setPlus(w, 0);
    gsap.to(f, Object.assign(flip(r0, r1), { duration: 0.75, ease: lift, overwrite: true, onComplete: done }));
    gsap.to(zoomBg, { opacity: 0, duration: 0.5, delay: 0.1, ease: "power2.inOut" });
  }

  // step to the next / previous work inside the zoom: a sideways wipe in the
  // direction of travel (the old work sweeps off, the new one sweeps in)
  function stepZoom(d) {
    if (!Z.open || Z.busy) return;
    var j = Z.i + d;
    if (j < 0 || j >= N) {                                   // the ends: a small nudge, nothing more
      if (gsap && !REDUCE) gsap.fromTo(Z.fig, { xPercent: 0 }, { xPercent: -1.2 * d, duration: 0.16, ease: "power2.out", yoyo: true, repeat: 1, modifiers: slideX(Z.fig) });
      return;
    }
    Z.busy = true;
    var ow = works[Z.i], nw = works[j], of = Z.fig;
    setScroll(stopFor(j), true);                             // the row follows underneath, so closing lands home
    ow.el.classList.remove("is-zoomed"); nw.el.classList.add("is-zoomed");
    setPlus(ow, 1); setPlus(nw, gsap && !REDUCE ? 0 : 1);    // both under the grey: no motion needed
    var nf = makeFig(nw); place(nf, fit(aspect(nw)));
    Z.fig = nf; Z.i = j; zoomTitle.textContent = nw.title;
    if (!gsap || REDUCE) { of.parentNode.removeChild(of); Z.busy = false; return; }
    var a = { p: 0 }, b = { p: 0 };
    var outFrom = d > 0 ? "left" : "right", inFrom = d > 0 ? "right" : "left";
    nf.style.clipPath = wipeClip(nf, 0, inFrom);
    gsap.to(a, { p: 1, duration: 0.7, ease: worksEase,
      onUpdate: function () { of.style.clipPath = wipeClip(of, 1 - a.p, outFrom); },
      onComplete: function () { if (of.parentNode) of.parentNode.removeChild(of); } });
    gsap.to(of, { xPercent: -5 * d, duration: 0.7, ease: worksEase, modifiers: slideX(of) });
    gsap.set(nf, { xPercent: 5 * d, modifiers: slideX(nf) });
    var t0 = performance.now();
    ready(nf).then(function () {                             // the new work sweeps in once it can paint —
      var delay = Math.max(0, 0.1 - (performance.now() - t0) / 1000);   // on the usual 0.1s cue when that is quick
      gsap.to(b, { p: 1, duration: 0.8, delay: delay, ease: worksEase,
        onUpdate: function () { nf.style.clipPath = wipeClip(nf, b.p, inFrom); },
        onComplete: function () { nf.style.clipPath = ""; Z.busy = false; } });
      gsap.to(nf, { xPercent: 0, duration: 0.8, delay: delay, ease: worksEase, modifiers: slideX(nf) });
    });
  }

  // open: "+" or anywhere on the work (unless that press was a drag)
  // (listens on the whole work, not just the button: while a work is still wiping in, the
  // clip-path also clips hit-testing, and a tap on its not-yet-revealed part must still open it)
  track.addEventListener("click", function (e) {
    var w = e.target.closest(".work");
    if (!w) return;
    if (eatClick) { e.preventDefault(); e.stopPropagation(); return; }
    Z.kbd = e.detail === 0;                         // opened with Enter / Space (a keyboard "click")
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

  /* (leaving for another page — the white wipe — lives in js/wipe.js, shared with the front page) */

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
