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
  // the flow's curve (CLAUDE.md): sets off from a standstill, gently, and lands long and soft — the zoom's
  // step was the first on it; every motion here is now (the flight in and home, the grey, the "+", the nudge)
  var stepEase = cubicBezier(0.215, 0.61, 0.355, 1);

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
    var zoomTitle = document.getElementById("zoomTitle"), navs = zoom.querySelectorAll(".zoom-nav");
    var Z = { open: false, busy: false, kbd: false, i: -1, list: [], fig: null, figs: {}, pos: 0, v: 0, tgt: 0, clock: null, lt: 0, q: [], flying: null, dir: true, peak: 0, low: Infinity, wt: 0, acc: 0, used: false, sx: null, sy: 0, swiped: false };

    /* the "+": it never moves, it only fades — out the moment its picture is opened, back in
       once the picture has returned to its place */
    function showPlus(it, delay, dur) {
      if (!it.plus) return;
      if (!gsap || REDUCE) { it.plus.style.opacity = 1; return; }
      gsap.to(it.plus, { opacity: 1, duration: dur || 0.45, delay: delay || 0, ease: stepEase, overwrite: true });
    }
    function hidePlus(it) {
      if (!it.plus || !gsap || REDUCE) return;
      gsap.to(it.plus, { opacity: 0, duration: 0.25, ease: stepEase, overwrite: true });
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
    // Every picture the zoom has made is kept in Z.figs, by its place in the row; at rest, only the one up and
    // its two neighbours.
    function figFor(k) {
      var f = Z.figs[k], it = Z.list[k];
      if (f || !it) return f || null;
      f = Z.figs[k] = makeFig(it); f.classList.add("is-warm"); place(f, fit(aspect(it)));
      return f;
    }
    function warm(i) {
      [i - 1, i + 1].forEach(function (k) { var it = Z.list[k]; if (it && it.img) upgrade(figFor(k)); });
      unwarm(function (k) { return Math.abs(k - i) <= 1; });
    }
    function unwarm(keep) {
      Object.keys(Z.figs).forEach(function (k) {
        var f = Z.figs[k];
        if (f === Z.fig || (keep && keep(+k))) return;
        delete Z.figs[k];
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

    // the chevrons: the one with no picture past it fades away — in a step, with the picture arriving
    function ends(fade) {
      [Z.i <= 0, Z.i >= Z.list.length - 1].forEach(function (end, k) {
        navs[k].classList.toggle("is-end", end);
        if (fade) gsap.to(navs[k], { opacity: end ? 0 : 1, duration: 1.1, delay: 0.1, ease: stepEase, overwrite: true });
        else { if (gsap) gsap.killTweensOf(navs[k]); navs[k].style.opacity = end ? 0 : 1; }
      });
    }

    // …each one hamburger box's width (12 --mk) out from the picture's edge, or, where the margin is
    // too narrow for that, centred in it; the 12pt strip that takes its clicks centred on it
    function navAt(r) {
      var mk = parseFloat(getComputedStyle(root).getPropertyValue("--mk")) || 4, s = 12 * K();
      var w = 9.4 * mk * (parseFloat(getComputedStyle(navs[0]).getPropertyValue("--nav-s")) || 1);   // (a quarter on a phone: css/narrow.css)
      var gl = Math.min(12 * mk, (r.left - w) / 2), gr = Math.min(12 * mk, (window.innerWidth - r.left - r.width - w) / 2);
      navs[0].style.left = r.left - gl - (w + s) / 2 + "px";
      navs[1].style.left = r.left + r.width + gr + (w - s) / 2 + "px";
    }

    function open(i, kbd) {
      var list = o.items(), it = list[i];
      if (!it || Z.open || Z.busy) return;
      Z.list = list; Z.open = true; Z.busy = true; Z.flying = "open"; Z.i = i; Z.kbd = !!kbd;
      root.classList.add("zoom-open");                   // (the zoom has the input till it has closed: css/zoom.css)
      if (o.lock) o.lock();
      var r0 = rectOf(it.box), r1 = fit(aspect(it)), cr = cropOf(it, r0, r1);
      var f = makeFig(it); place(f, r1); Z.fig = f; navAt(r1);
      Z.figs = {}; Z.figs[i] = f; Z.pos = Z.tgt = i; Z.v = 0; Z.q = [];
      zoomTitle.textContent = it.title; ends();
      zoom.classList.add("is-open"); zoom.setAttribute("aria-hidden", "false");
      focusIn(zoom);                                     // the dialog itself; Tab reaches the controls
      hidePlus(it);                                      // the "+" fades out the moment the picture is opened
      if (!gsap || REDUCE) { it.el.classList.add("is-zoomed"); zoomBg.style.opacity = 1; Z.busy = false; Z.flying = null; warm(i); return; }
      f.classList.add("flies");                          // (a layer of its own while it flies: css/zoom.css)
      gsap.set(f, cr ? cr.move : flip(r0, r1));          // sits exactly on its place (a crop: only that part)…
      if (cr) f.style.clipPath = inset(cr.clip);
      f.style.visibility = "hidden";
      gsap.fromTo(zoomBg, { opacity: 0 }, { opacity: 1, duration: 0.55, ease: stepEase });   // the answer starts at once
      ready(f).then(function () {                        // …and lifts off once its picture can paint
        f.style.visibility = "";
        it.el.classList.add("is-zoomed");
        gsap.to(f, { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: 0.9, ease: stepEase,
          onComplete: function () {
            f.classList.remove("flies"); Z.busy = false; Z.flying = null; upgrade(f); warm(Z.i);
            // (asked for during the flight: taken now — after GSAP's pass, as the spring's are)
            Promise.resolve().then(function () { if (Z.q.length && Z.open && !Z.busy) step(Z.q.shift()); });
          } });
        if (cr) gsap.to(cr.clip, { t: 0, r: 0, b: 0, l: 0, duration: 0.9, ease: stepEase,
          onUpdate: function () { f.style.clipPath = inset(cr.clip); }, onComplete: function () { f.style.clipPath = ""; } });
      });
    }

    function close() {
      if (!Z.open || Z.busy) return;
      if (moving()) {                                          // (mid-step: only once it has all but landed)
        if (Math.abs(Z.pos - Z.tgt) > 0.02) return;
        var c = Z.clock; Z.clock = null; if (c) c.kill();
        Z.pos = Z.tgt; Z.v = 0; draw(); settle();
      }
      var it = Z.list[Z.i], f = Z.fig;
      Z.busy = true; Z.flying = "close"; Z.q = [];
      zoom.setAttribute("aria-hidden", "true");
      var r1 = { left: parseFloat(f.style.left), top: parseFloat(f.style.top), width: parseFloat(f.style.width), height: parseFloat(f.style.height) };
      var r0 = rectOf(it.box), cr = cropOf(it, r0, r1);
      function done() {
        it.el.classList.remove("is-zoomed");             // the real picture takes over in the same frame
        showPlus(it, 0.05, 0.45);                        // …and then its "+" fades back in
        if (f.parentNode) f.parentNode.removeChild(f);
        Z.fig = null; Z.open = false; Z.busy = false;
        zoom.classList.remove("is-open"); root.classList.remove("zoom-open");
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
      gsap.to(f, Object.assign(cr ? cr.move : flip(r0, r1), { xPercent: 0, duration: 0.75, ease: stepEase, overwrite: true, onComplete: done }));
      if (cr) {                                          // (the crop closes back round what its place shows)
        var c = { t: 0, r: 0, b: 0, l: 0 };
        gsap.to(c, { t: cr.clip.t, r: cr.clip.r, b: cr.clip.b, l: cr.clip.l, duration: 0.75, ease: stepEase,
          onUpdate: function () { f.style.clipPath = inset(c); } });
      }
      gsap.to(zoomBg, { opacity: 0, duration: 0.5, delay: 0.1, ease: stepEase });
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
    // The pictures move on one position, Z.pos: 0 the first in the row, 1 the second, and so on, every frame drawn
    // from it (draw()). Between two of them, k and k+1, at k + t: k shows from its left edge to (1 - t) of its
    // width, k+1 from t of its width in from its right edge, over it — so going on, k+1 sweeps in from the right
    // over k as k's right edge draws back, and going back the same, backwards; each drifts 5% inside its frame
    // the same way (the frame never moves: its cut edge lands on whole device pixels; the picture glides between
    // pixels). Each picture is whole as the position passes it.
    // The position follows where it is heading (Z.tgt, a whole picture) on the smooth scroll's kind of spring: an
    // exact overdamped spring (glide.js), its slow time 0.25 s — quick off the mark, a long soft landing, close to
    // the old 1.1 s step on the flow's curve (60% at 0.3 s, 88% at 0.6 s). A step only moves where it is heading,
    // at any moment: the speed carries on and bends, so turning back slows the pictures, stops them and takes them
    // back the other way, smoothly, and steps asked for one after another pass each picture in turn, in order.
    // (Before, each step was a wipe of its own: one turned back started from a standstill on the other side, after
    // its picture was got ready, while the other wipe ran on — a stutter: the owner.)
    // The spring runs on GSAP's clock (the time of its global timeline), carried by a tween on the flow's curve
    // that is alive only while it moves (Z.clock): held or stepped by hand, as in the outline check, it holds and
    // steps with everything else.
    var T1 = 0.06, T2 = 0.25;
    // (under automation only: where the pictures are, for the checks)
    if (navigator.webdriver) window.__zoomAt = function () { return { pos: Z.pos, v: Z.v, tgt: Z.tgt, moving: moving() }; };
    function moving() { return !!Z.clock; }
    function draw() {
      var k = Math.floor(Z.pos + 1e-6), t = Z.pos - k;
      if (t < 1e-4) t = 0;
      Object.keys(Z.figs).forEach(function (key) {
        var f = Z.figs[key], i = +key, im = f.querySelector("img"), on = true, clip = "", x = 0, z = "";
        if (i === k) { clip = clipLR(f, 0, t); x = -5 * t; z = "1"; }
        else if (i === k + 1 && t > 0) { clip = clipLR(f, 1 - t, 0); x = 5 * (1 - t); z = "2"; }
        else on = false;
        if (f.classList.contains("is-warm") === on) f.classList.toggle("is-warm", !on);
        if (f.style.clipPath !== clip) f.style.clipPath = clip;
        if (f.style.zIndex !== z) f.style.zIndex = z;
        // (the drift in 2D, set here: a 3D move would put the picture on a layer of its own for the motion)
        var tf = x ? "translate(" + x.toFixed(4) + "%, 0px)" : "";
        if (im && im.style.transform !== tf) im.style.transform = tf;
      });
      // the chevrons, beside the picture as it changes
      var a = Z.figs[k], b = Z.figs[k + 1];
      if (a) {
        var l = parseFloat(a.style.left), w = parseFloat(a.style.width);
        if (b && t > 0) { var l2 = parseFloat(b.style.left), w2 = parseFloat(b.style.width); l += (l2 - l) * t; w += (w2 - w) * t; }
        navAt({ left: l, width: w });
      }
    }
    function clipLR(f, L, R) {
      if (L <= 0 && R <= 0) return "";
      var r = f.getBoundingClientRect();
      if (L + R >= 1) return "inset(0px 0px 0px " + r.width + "px)";
      return "inset(0px " + (r.right - dp(r.right - r.width * R)) + "px 0px " + (dp(r.left + r.width * L) - r.left) + "px)";
    }
    // one frame of the spring: exact, for any frame time
    function spring(dt) {
      var e = Z.pos - Z.tgt, v = Z.v;
      var a = (v + e / T2) / (1 / T2 - 1 / T1), b = e - a, e1 = Math.exp(-dt / T1), e2 = Math.exp(-dt / T2);
      Z.pos = Z.tgt + a * e1 + b * e2;
      Z.v = -a / T1 * e1 - b / T2 * e2;
    }
    function tick() {
      var now = gsap.globalTimeline.time(), dt = Math.max(0, Math.min(0.1, now - Z.lt));
      Z.lt = now;
      if (dt > 0) spring(dt);
      if (Math.abs(Z.pos - Z.tgt) < 0.0015 && Math.abs(Z.v) < 0.01) {
        Z.pos = Z.tgt; Z.v = 0;
        draw();
        // (at rest: after GSAP's pass — never kill or start a tween from inside one of its callbacks)
        var c = Z.clock; Z.clock = null;
        Promise.resolve().then(function () { if (c) c.kill(); if (!Z.clock) settle(); });
        return;
      }
      draw();
    }
    function run() {
      if (Z.clock) return;
      Z.lt = gsap.globalTimeline.time();
      var c = { t: 0 };
      Z.clock = gsap.to(c, { t: 1, duration: 60, ease: stepEase, onUpdate: tick,
        onComplete: function () { Promise.resolve().then(function () { if (Z.clock) { Z.clock = null; run(); } }); } });
    }
    // (once nothing moves: the places swap under the grey, the page follows, the neighbours drawn ready)
    function settle() {
      if (moving() || !Z.open) return;
      Z.fig = Z.figs[Z.i];
      Z.list.forEach(function (it, k) { it.el.classList.toggle("is-zoomed", k === Z.i); setPlus(it, k === Z.i ? 0 : 1); });
      if (o.follow) o.follow(Z.i);
      upgrade(Z.fig);
      warm(Z.i);
    }
    function step(d) {
      if (!Z.open) return;
      // (asked for while the picture is still flying open: it is taken as that lands, not lost)
      if (Z.busy) { if (Z.flying === "open" && Z.q.length < 6) Z.q.push(d); return; }
      var j = Z.tgt + d;
      if (j < 0 || j >= Z.list.length) {                       // the ends: a small nudge, out and back, nothing more
        if (gsap && !REDUCE && !moving()) gsap.fromTo(Z.fig, { xPercent: 0 }, { xPercent: -1.2 * d, duration: 0.16, ease: stepEase, yoyo: true, repeat: 1, force3D: false, modifiers: slideX(Z.fig) });
        return;
      }
      Z.tgt = Z.i = j; zoomTitle.textContent = Z.list[j].title;
      // every picture it will pass, ready (drawn faint where it is not already)
      for (var k = Math.min(Math.floor(Z.pos), j); k <= Math.max(Math.ceil(Z.pos), j); k++) figFor(k);
      Z.fig = Z.figs[j];
      if (!gsap || REDUCE) { Z.pos = j; Z.v = 0; draw(); ends(); settle(); return; }
      ends(true);
      run();
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
      var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY, a = Math.abs(d);
      var t = performance.now(), gap = t - Z.wt;
      Z.wt = t;
      // One picture a gesture — and a new gesture is known the moment it starts, so none has to wait (the owner):
      //  · a pause (220 ms without the wheel), as before;
      //  · a mouse wheel's click: a big step on its own (a trackpad's come every frame), so each click is a picture;
      //  · a new flick on a trackpad still coasting from the last: the coast only ever dies away, so a turn the
      //    other way, or the wheel picking up again after it has died down, is the hand.
      function fresh() { Z.acc = 0; Z.used = false; }
      if (gap > 220 || (a >= 50 && gap > 50)) fresh();
      else if (Z.used) {
        Z.peak = Math.max(Z.peak, a);
        if (a < Z.peak * 0.5) Z.low = Math.min(Z.low, a);
        if (((d > 0) !== Z.dir && a > 12) || (Z.low < Infinity && a > Z.low * 3 + 15)) fresh();
      }
      if (Z.used) return;
      Z.acc += d;
      if (Math.abs(Z.acc) > 40) { Z.used = true; Z.dir = d > 0; Z.peak = a; Z.low = Infinity; step(Z.acc > 0 ? 1 : -1); }
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
      if (!Z.open || !Z.fig || Z.busy || moving()) return;
      var r = fit(aspect(Z.list[Z.i]));
      Object.keys(Z.figs).forEach(function (k) { place(Z.figs[k], fit(aspect(Z.list[k]))); });
      navAt(r);
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
