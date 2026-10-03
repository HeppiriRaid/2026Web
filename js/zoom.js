/* ============================================================
   KOKI TAKAMATSU — the zoom view, and the "+" that opens it
   The same on both pages: the illustration page's works (js/illustration.js
   hands them over) and the front page's photos with a "+" (wired below).
   · A click on a picture — or on its "+" — lifts it out of its place into the
     band grey, centred with the same 12pt margin on opposite sides. A photo its
     place shows cropped (the front page's) opens whole: the crop opens out as
     it lifts.
   · ← → / the wheel / a swipe step between the pictures there (the page
     follows underneath, so closing lands home); Esc or a click closes, and the
     picture flies back to its place.
   · The "+" never moves: it fades out the moment its picture is opened and
     back in once it has returned.
   · Every edge at rest on a whole device pixel (fit(), crispPlus()): inside
     the cursor's square a blurred edge folds through black (CLAUDE.md).
   ============================================================ */
(function () {
  "use strict";
  var root = document.documentElement;
  var gsap = window.gsap;
  var REDUCE = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

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
  var stepEase = cubicBezier(0.3, 0, 0.2, 1);     // zoom step: sets off as the panel wipes do, lands long and soft
  var lift = cubicBezier(0.22, 1, 0.36, 1);       // zoom: answers at once, lands softly

  // the "+" in whole device pixels — its size and its bars' thickness, with the bars exactly
  // centred — so all its edges land on pixels (css/zoom.css)
  function crispPlus() {
    var r = window.devicePixelRatio || 1, k = K();
    var w = Math.max(1, Math.round(0.6 * k * r)), s = Math.round(4.5 * k * r);
    if ((s - w) % 2) s += 1;
    root.style.setProperty("--plus-w", w / r + "px");
    root.style.setProperty("--plus-s", s / r + "px");
  }
  crispPlus();
  window.addEventListener("resize", crispPlus);

  /* ---------- whole device pixels for every moving edge ------------------------
     Inside the cursor's square a half-covered pixel on an edge folds through black
     (css/anim.css), so a wipe's moving edge, and a picture sliding with its edges in view
     (the nudge at either end of the row), land on whole pixels. */
  function dp(v) { var d = window.devicePixelRatio || 1; return Math.round(v * d) / d; }
  // the clip for a wipe that has revealed p (0→1) of el, from its "left" or "right" edge;
  // the still sides on the box's own edges (whole device pixels: fit()), so a picture drifting
  // inside never shows past them — not even the pixel that would linger as the step ends
  function wipeClip(el, p, from) {
    var r = el.getBoundingClientRect();
    return from === "left" ? "inset(0px " + (r.right - dp(r.left + r.width * p)) + "px 0px 0px)"
      : "inset(0px 0px 0px " + (dp(r.right - r.width * p) - r.left) + "px)";
  }
  // GSAP modifiers for a picture sliding sideways by xPercent
  function slideX(f) { return { xPercent: function (v) { var w = parseFloat(f.style.width) || f.offsetWidth || 1; return dp(v / 100 * w) / w * 100; } }; }

  /* A zoom view over the page's dialog (#zoom: its grey, its controls). The page says which
     pictures it can show, each as
       { el:    marked .is-zoomed while its picture is up (the page hides the picture in place),
         box:   what it flies out of and back into,
         img:   the picture (none: the grey holder, in its proportion),
         full:  a larger file to swap to once it can paint (or none),
         title, plus: its "+", focus: what keyboard focus returns to,
         crop:  true when the box shows the picture cropped (object-fit: cover) }
     and how its own scrolling stops and starts while the view is up (lock / unlock), and
     follows a step (follow: the picture's place brought into view under the grey). */
  window.__zoom = function (o) {
    var zoom = o.el, zoomBg = zoom.querySelector(".zoom-bg"), zoomUi = zoom.querySelector(".zoom-ui");
    var zoomTitle = document.getElementById("zoomTitle");
    var Z = { open: false, busy: false, kbd: false, i: -1, list: [], fig: null, warm: {}, wt: 0, acc: 0, used: false, sx: null, sy: 0, swiped: false };

    /* the "+": it never moves, it only fades — out the moment its picture is opened, back in
       once the picture has returned to its place */
    function showPlus(it, delay, dur) {
      if (!it.plus) return;
      if (!gsap || REDUCE) { it.plus.style.opacity = 1; return; }
      gsap.to(it.plus, { opacity: 1, duration: dur || 0.45, delay: delay || 0, ease: "power2.out", overwrite: true });
    }
    function hidePlus(it) {
      if (!it.plus || !gsap || REDUCE) return;
      gsap.to(it.plus, { opacity: 0, duration: 0.25, ease: "power2.out", overwrite: true });
    }
    function setPlus(it, v) { if (it.plus) { if (gsap) gsap.killTweensOf(it.plus); it.plus.style.opacity = v; } }

    // the whole picture's shape: a cropped photo's own; otherwise its place's
    function aspect(it) {
      var im = it.img;
      if (it.crop && im && im.naturalWidth && im.naturalHeight) return im.naturalWidth / im.naturalHeight;
      var r = it.box.getBoundingClientRect();
      return r.height ? r.width / r.height : 1;
    }
    // the picture, centred, with the same margin (12pt) on opposite sides — on whole device
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
    // A photo its place shows cropped: where that part lies in the whole picture laid out at `to`,
    // and the transform (one scale, both ways) and clip that show just it, exactly over `from` — the
    // picture opens out of what its place shows. (object-fit: cover, at its object-position.)
    function cropOf(it, from, to) {
      var im = it.img;
      if (!it.crop || !im || !im.naturalWidth || !im.naturalHeight) return null;
      var iw = im.naturalWidth, ih = im.naturalHeight, c = Math.max(from.width / iw, from.height / ih);
      var at = (getComputedStyle(im).objectPosition || "").split(/\s+/).map(function (v) { return /%$/.test(v) ? parseFloat(v) / 100 : 0.5; });
      var s = to.width / iw, w = from.width / c * s, h = from.height / c * s;
      var x = (iw - from.width / c) * (at[0] == null ? 0.5 : at[0]) * s, y = (ih - from.height / c) * (at[1] == null ? 0.5 : at[1]) * s;
      var u = from.width / w;
      return { move: { x: from.left - to.left - u * x, y: from.top - to.top - u * y, scaleX: u, scaleY: u },
               clip: { t: y, r: to.width - x - w, b: to.height - y - h, l: x } };
    }
    function inset(c) { return "inset(" + c.t + "px " + c.r + "px " + c.b + "px " + c.l + "px)"; }
    function makeFig(it) {
      var f = document.createElement("figure"), src = it.img && (it.img.currentSrc || it.img.getAttribute("src") || it.img.getAttribute("data-src"));
      f.className = "zoom-fig";
      if (src) {
        var im = document.createElement("img");
        im.alt = it.img.alt || it.title;
        im.src = src;                                         // already decoded: no blank frame
        if (it.full) {                                        // the large file, decoded aside: upgrade()
          var hi = new Image(), full = f.__full = { src: it.full, ready: false };
          hi.src = it.full;
          (hi.decode ? hi.decode() : Promise.reject()).then(function () { full.ready = true; if (!Z.busy) upgrade(f); }, function () {});
        }
        f.appendChild(im); f.classList.add("has-img");
      }
      zoom.insertBefore(f, zoomUi);
      return f;
    }
    // a picture's large file in, once it can paint — and only while nothing moves: its first drawing
    // takes long, and mid-motion it would hold up a frame (a visible jump)
    function upgrade(f) {
      var u = f && f.__full, im = u && u.ready && f.querySelector("img");
      if (im && im.getAttribute("src") !== u.src) { im.src = u.src; return true; }
      return false;
    }
    function focusIn(el) { try { el.focus({ preventScroll: true }); } catch (e) {} }
    function nextFrame() { return new Promise(function (r) { requestAnimationFrame(function () { r(); }); }); }
    // The pictures either side of the one up, drawn in their places in the zoom, too faint to see
    // (.is-warm), so a step finds its picture decoded at the size it is shown: its first drawing at that
    // size decodes it (a photo the page shows small, the most), and mid-motion that would hold up a frame.
    // (img.decode() doesn't do it: the browser keeps what that decodes apart from what it draws with.)
    // Kept until a step takes one or the zoom closes.
    function warm(i) {
      var keep = {};
      [i - 1, i + 1].forEach(function (k) {
        var it = Z.list[k];
        if (!it || !it.img) return;
        var f = Z.warm[k];
        if (!f) { f = Z.warm[k] = makeFig(it); f.classList.add("is-warm"); place(f, fit(aspect(it))); }
        keep[k] = true;
        upgrade(f);
      });
      unwarm(keep);
    }
    function unwarm(keep) {
      Object.keys(Z.warm).forEach(function (k) {
        if (keep && keep[k]) return;
        var f = Z.warm[k];
        delete Z.warm[k];
        if (f.parentNode) f.parentNode.removeChild(f);
      });
    }
    // a big image painted for the first time is decoded on that very frame (a visible hitch);
    // decode it off the main thread first — capped, so a slow file never holds the motion
    function ready(f) {
      var im = f.querySelector("img");
      if (!im || !im.decode) return Promise.resolve();
      return Promise.race([im.decode().then(null, function () {}), wait(160)]);
    }

    function open(i, kbd) {
      var list = o.items(), it = list[i];
      if (!it || Z.open || Z.busy) return;
      Z.list = list; Z.open = true; Z.busy = true; Z.i = i; Z.kbd = !!kbd;
      if (o.lock) o.lock();
      var r0 = rectOf(it.box), r1 = fit(aspect(it)), cr = cropOf(it, r0, r1);
      var f = makeFig(it); place(f, r1); Z.fig = f;
      zoomTitle.textContent = it.title;
      zoom.classList.add("is-open"); zoom.setAttribute("aria-hidden", "false");
      focusIn(zoom);                                     // the dialog itself; Tab reaches the controls
      hidePlus(it);                                      // the "+" fades out the moment the picture is opened
      if (!gsap || REDUCE) { it.el.classList.add("is-zoomed"); zoomBg.style.opacity = 1; Z.busy = false; warm(i); return; }
      f.classList.add("flies");                          // (a layer of its own while it flies: css/zoom.css)
      gsap.set(f, cr ? cr.move : flip(r0, r1));          // sits exactly on its place (a crop: only that part)…
      if (cr) f.style.clipPath = inset(cr.clip);
      f.style.visibility = "hidden";
      gsap.fromTo(zoomBg, { opacity: 0 }, { opacity: 1, duration: 0.55, ease: "power2.out" });   // the answer is immediate
      ready(f).then(function () {                        // …and lifts off once its picture can paint
        f.style.visibility = "";
        it.el.classList.add("is-zoomed");
        gsap.to(f, { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: 0.9, ease: lift,
          onComplete: function () { f.classList.remove("flies"); Z.busy = false; upgrade(f); warm(Z.i); } });
        if (cr) gsap.to(cr.clip, { t: 0, r: 0, b: 0, l: 0, duration: 0.9, ease: lift,
          onUpdate: function () { f.style.clipPath = inset(cr.clip); }, onComplete: function () { f.style.clipPath = ""; } });
      });
    }

    function close() {
      if (!Z.open || Z.busy) return;
      var it = Z.list[Z.i], f = Z.fig;
      Z.busy = true;
      zoom.setAttribute("aria-hidden", "true");
      var r1 = { left: parseFloat(f.style.left), top: parseFloat(f.style.top), width: parseFloat(f.style.width), height: parseFloat(f.style.height) };
      var r0 = rectOf(it.box), cr = cropOf(it, r0, r1);
      function done() {
        it.el.classList.remove("is-zoomed");             // the real picture takes over in the same frame
        showPlus(it, 0.05, 0.45);                        // …and then its "+" fades back in
        if (f.parentNode) f.parentNode.removeChild(f);
        Z.fig = null; Z.open = false; Z.busy = false;
        zoom.classList.remove("is-open");
        if (o.unlock) o.unlock();
        // keyboard visitors get their place back (with its focus ring); a mouse visitor
        // gets no ring at all — just the picture landing and its "+" drawing in
        if (Z.kbd) focusIn(it.focus || it.box);
        else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      }
      unwarm();
      if (!gsap || REDUCE) { zoomBg.style.opacity = 0; done(); return; }
      setPlus(it, 0);
      f.classList.add("flies");
      // (xPercent: back from a nudge at either end, if one is under way)
      gsap.to(f, Object.assign(cr ? cr.move : flip(r0, r1), { xPercent: 0, duration: 0.75, ease: lift, overwrite: true, onComplete: done }));
      if (cr) {                                          // (the crop closes back round what its place shows)
        var c = { t: 0, r: 0, b: 0, l: 0 };
        gsap.to(c, { t: cr.clip.t, r: cr.clip.r, b: cr.clip.b, l: cr.clip.l, duration: 0.75, ease: lift,
          onUpdate: function () { f.style.clipPath = inset(c); } });
      }
      gsap.to(zoomBg, { opacity: 0, duration: 0.5, delay: 0.1, ease: "power2.inOut" });
    }

    // Step to the next / previous picture inside the zoom: a sideways wipe in the direction of
    // travel (the old picture sweeps off, the new one sweeps in), each picture drifting a little the
    // same way. The two are kept apart: the wipe cuts the picture's frame, which never moves, so its
    // edge lands on whole device pixels (inside the cursor's square a soft edge folds through black);
    // the picture drifts inside it between pixels — smooth at any speed, from a standstill to a
    // standstill. (Snapped to whole pixels, a slow drift stood still, then hopped.) Drawn in place,
    // as at rest: on a layer of its own it would look a little different while it moves (css/zoom.css).
    // Wipe and drift share one clock and one easing, so the frame never opens past the picture's
    // own edges.
    // Nothing else happens while they move. Everything a step needs is done first — the new picture
    // made, decoded and drawn at its size (warm()), a frame passed with nothing moving — so the motion
    // starts on time from a standstill; and what is left (the page following underneath, the places
    // swapping, all under the grey) waits until everything is still. (A long frame mid-motion is a
    // visible jump.)
    function step(d) {
      if (!Z.open || Z.busy) return;
      var j = Z.i + d;
      if (j < 0 || j >= Z.list.length) {                       // the ends: a small nudge, nothing more
        if (gsap && !REDUCE) gsap.fromTo(Z.fig, { xPercent: 0 }, { xPercent: -1.2 * d, duration: 0.16, ease: "power2.out", yoyo: true, repeat: 1, force3D: false, modifiers: slideX(Z.fig) });
        return;
      }
      Z.busy = true;
      var ow = Z.list[Z.i], nw = Z.list[j], of = Z.fig, nf = Z.warm[j];
      if (nf) delete Z.warm[j];                                // (drawn already, faint: warm())
      else { nf = makeFig(nw); nf.classList.add("is-warm"); }
      place(nf, fit(aspect(nw)));
      Z.fig = nf; Z.i = j; zoomTitle.textContent = nw.title;
      // (under the grey: the page follows, so closing lands home; the places swap)
      function settle() {
        if (of.parentNode) of.parentNode.removeChild(of);
        ow.el.classList.remove("is-zoomed"); nw.el.classList.add("is-zoomed");
        setPlus(ow, 1); setPlus(nw, gsap && !REDUCE ? 0 : 1);
        if (o.follow) o.follow(j);
        Z.busy = false;
        upgrade(nf);
        warm(j);
      }
      if (!gsap || REDUCE) { nf.classList.remove("is-warm"); settle(); return; }
      var a = { p: 0 }, b = { p: 0 }, oi = of.querySelector("img"), ni = nf.querySelector("img");
      var outFrom = d > 0 ? "left" : "right", inFrom = d > 0 ? "right" : "left";
      // (the new picture drawn, too faint to see, until it is decoded and a frame has passed. The drift
      // in 2D, force3D: false — in 3D the picture would be put on a layer of its own for the motion)
      if (ni) gsap.set(ni, { xPercent: 5 * d, force3D: false });
      ready(nf).then(function () { return upgrade(nf) ? ready(nf) : null; })   // (its large file, if in already)
        .then(nextFrame).then(nextFrame).then(function () {
        nf.style.clipPath = wipeClip(nf, 0, inFrom);
        nf.classList.remove("is-warm");
        gsap.to(a, { p: 1, duration: 1, ease: stepEase,
          onUpdate: function () { of.style.clipPath = wipeClip(of, 1 - a.p, outFrom); } });
        if (oi) gsap.to(oi, { xPercent: -5 * d, duration: 1, ease: stepEase, force3D: false });
        gsap.to(b, { p: 1, duration: 1.1, delay: 0.1, ease: stepEase,          // (the new one on a 0.1s cue)
          onUpdate: function () { nf.style.clipPath = wipeClip(nf, b.p, inFrom); },
          onComplete: function () { nf.style.clipPath = ""; nextFrame().then(settle); } });
        if (ni) gsap.to(ni, { xPercent: 0, duration: 1.1, delay: 0.1, ease: stepEase, force3D: false });
      });
    }

    // inside the zoom: the controls, else a click / tap anywhere closes
    zoom.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]");
      if (b) { var a = b.getAttribute("data-act"); if (a === "close") close(); else step(a === "next" ? 1 : -1); return; }
      if (Z.swiped) return;
      close();
    });
    // swipe between pictures (touch / pen)
    zoom.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse") { Z.sx = e.clientX; Z.sy = e.clientY; } });
    zoom.addEventListener("pointerup", function (e) {
      if (Z.sx === null) return;
      var dx = e.clientX - Z.sx, dy = e.clientY - Z.sy;
      Z.sx = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        Z.swiped = true; setTimeout(function () { Z.swiped = false; }, 0);
        step(dx < 0 ? 1 : -1);
      }
    });
    // the wheel steps one picture per gesture (a trackpad flick is one gesture, not ten)
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
      if (Math.abs(Z.acc) > 40) { Z.used = true; step(Z.acc > 0 ? 1 : -1); }
    }, { passive: false });
    // the keyboard, while the view is up (the page's own keys wait: isOpen())
    window.addEventListener("keydown", function (e) {
      if (!Z.open || e.metaKey || e.ctrlKey || e.altKey) return;
      var k = e.key;
      if (k === "Escape") close();
      else if (k === "ArrowRight" || k === "ArrowDown") step(1);
      else if (k === "ArrowLeft" || k === "ArrowUp") step(-1);
      else if (k === "Tab") {                                    // keep focus inside the zoom
        var bs = [].slice.call(zoomUi.querySelectorAll("button")), at = bs.indexOf(document.activeElement);
        focusIn(bs[at < 0 ? (e.shiftKey ? bs.length - 1 : 0) : (at + (e.shiftKey ? bs.length - 1 : 1)) % bs.length]);
      } else return;
      e.preventDefault();
    });
    window.addEventListener("resize", function () {
      if (!Z.open || !Z.fig || Z.busy) return;
      place(Z.fig, fit(aspect(Z.list[Z.i])));
      Object.keys(Z.warm).forEach(function (k) { place(Z.warm[k], fit(aspect(Z.list[k]))); });
    });

    return { open: open, close: close, isOpen: function () { return Z.open; } };
  };

  /* ---------- the front page: its photos with a "+" ----------------------------
     (index.html: a figure[data-slot] holding a button.ph-open, its "+" inside.) The
     whole photo is the button; the zoom shows the whole picture, not the part its
     place crops to, and steps between these photos in the page's order. */
  var zoomEl = document.getElementById("zoom");
  var opens = [].slice.call(document.querySelectorAll("figure[data-slot] > .ph-open"));
  if (!zoomEl || !opens.length) return;
  var view = window.__zoom({
    el: zoomEl,
    items: function () {                     // (asked each time: js/photos.js puts the owner's photos in)
      return opens.map(function (b) {
        var f = b.parentNode, im = f.querySelector("img");
        return { el: f, box: f, img: im, full: null, plus: b.querySelector(".plus"), focus: b, crop: true,
                 title: (im && im.alt) || f.getAttribute("data-slot-name") || "" };
      });
    },
    lock: function () { if (window.__lenis) window.__lenis.stop(); },
    unlock: function () { if (window.__lenis) window.__lenis.start(); },
    follow: function (j) {                   // the photo in the middle of the window
      var r = opens[j].parentNode.getBoundingClientRect();
      var y = Math.max(0, Math.round(window.scrollY + r.top - (window.innerHeight - r.height) / 2));
      if (window.__lenis) window.__lenis.scrollTo(y, { immediate: true, force: true });
      else window.scrollTo(0, y);
    }
  });
  opens.forEach(function (b, i) {
    b.addEventListener("click", function (e) { view.open(i, e.detail === 0); });   // (detail 0: Enter / Space)
  });
})();
