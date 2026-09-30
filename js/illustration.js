/* ============================================================
   Illustration page — gallery engine + choreography.

   · A pointer-driven horizontal pan (wheel / trackpad / drag / arrow keys) with
     inertia, a soft snap so every resting state is composed, and velocity-linked
     skew. Plates dim with distance and their images drift (parallax) inside the
     frame. On touch / phones / reduced motion it steps aside for a plain native
     scroller and the same effects follow the scroll position.
   · The info column (title · details · counter) follows the ACTIVE plate — the
     one the pan has settled nearest to — and swaps with masked rises; a red square
     glides along the index to mark it.
   · A click opens a plate large (FLIP, slow→fast→slow like the front page wipes);
     ← → step between works, Esc / click outside closes.
   · Hard rule from the front page: every tween settles to the exact static state.
   ============================================================ */
(function () {
  "use strict";

  var root = document.documentElement;
  var gsap = window.gsap;
  function mq(q) { return !!(window.matchMedia && window.matchMedia(q).matches); }
  var REDUCE = mq("(prefers-reduced-motion: reduce)");
  var FINE = mq("(pointer:fine)");
  if (window.__revealFailsafe) clearTimeout(window.__revealFailsafe);

  var hgal = document.getElementById("hgal");
  var track = document.getElementById("track");
  var iTitle = document.getElementById("iTitle");
  var iBody = document.getElementById("iBody");
  var hudNum = document.getElementById("hudNum");
  var hudDots = document.getElementById("hudDots");
  var plateUi = document.getElementById("plateUi");
  var menuNav = document.getElementById("menuNav");
  var live = document.getElementById("iLive");
  if (!hgal || !track || !iTitle || !iBody || !hudNum || !hudDots) return;

  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function isMobile() { return root.classList.contains("m"); }

  // slow → fast → slow: the front page's "works" ease (see anim.js)
  function cubicBezier(x1, y1, x2, y2) {
    function bz(p, a, b) { var m = 1 - p; return 3 * m * m * p * a + 3 * m * p * p * b + p * p * p; }
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var lo = 0, hi = 1, p = x;
      for (var i = 0; i < 18; i++) { p = (lo + hi) / 2; if (bz(p, x1, x2) < x) lo = p; else hi = p; }
      return bz(p, y1, y2);
    };
  }
  var worksEase = cubicBezier(0.38, 0, 0.5, 1);

  /* ---------- data -------------------------------------------------------- */
  var frames = $$(".frame", track);
  var N = frames.length;
  var items = frames.map(function (el, i) {
    var d = el.dataset, inner = el.querySelector(".frame-inner");
    return {
      i: i, el: el, end: el.hasAttribute("data-end"),
      media: el.querySelector(".frame-media"), inner: inner,
      plus: el.querySelector(".plus"), cap: el.querySelector(".frame-cap"),
      hasImg: !!(inner && inner.querySelector("img")),
      title: d.title || "", date: d.date || "", medium: d.medium || "", loc: d.loc || "",
      note: d.note || "", link: d.link || "", linkText: d.linktext || "",
      left: 0, w: 0, mtop: 0, mw: 0, mh: 0,     // geometry (layout px, from measure())
      m: 0, hide: 0                               // plate mix 0..1 / hidden-in-plate 0..1
    };
  });
  var WORKS = items.filter(function (it) { return !it.end; }).length;

  var S = {
    pos: 0, target: 0, max: 0, vel: 0, skew: 0,
    active: -1, focus: -1,
    pan: false, ready: false, intro: true,
    dragging: false, moved: false, lastInput: 0, snapped: true, gestureStart: 0,
    plateBusy: false, lastPlateWheel: 0, sig: ""
  };
  var K = 4, RW = 0, snaps = [], padL = 0;
  var box = { l: 0, t: 0, w: 0, h: 0 };            // plate viewing box (region px)

  /* ---------- engine selection + geometry ------------------------------------ */
  function wantPan() { return FINE && !REDUCE && !isMobile() && !!gsap; }
  function setEngine() {
    var want = wantPan();
    if (want === S.pan && S.ready) return;
    var p = S.pan ? S.pos : hgal.scrollLeft;
    S.pan = want;
    root.classList.toggle("pan", want);
    track.style.transform = "";
    if (want) { hgal.scrollLeft = 0; S.pos = S.target = p; }
    else { S.pos = p; requestAnimationFrame(function () { hgal.scrollLeft = p; }); }
  }
  function measure() {
    K = parseFloat(getComputedStyle(root).getPropertyValue("--k")) || 4;
    RW = hgal.getBoundingClientRect().width;
    var cs = getComputedStyle(track), trackTop = track.offsetTop;
    padL = parseFloat(cs.paddingLeft) || 0;
    items.forEach(function (it) {
      it.left = it.el.offsetLeft; it.w = it.el.offsetWidth;
      if (it.media && !it.end) {
        it.mtop = trackTop + it.el.offsetTop + it.media.offsetTop;
        it.mw = it.media.offsetWidth; it.mh = it.media.offsetHeight;
      }
    });
    S.max = S.pan ? Math.max(0, track.scrollWidth - RW) : Math.max(0, hgal.scrollWidth - hgal.clientWidth);
    snaps = items.map(function (it) { return clamp(it.left - padL, 0, S.max); });
    box.w = Math.min(272.3 * K, RW); box.h = 187.2 * K; box.l = 0; box.t = trackTop;
    S.target = clamp(S.target, 0, S.max); S.pos = clamp(S.pos, 0, S.max);
    S.sig = "";
  }
  function nearest(pos) {
    var best = 0, bd = Infinity;
    for (var i = 0; i < snaps.length; i++) {
      var d = Math.abs(snaps[i] - pos);
      if (d < bd || (d === bd && i > best)) { bd = d; best = i; }
    }
    return best;
  }

  /* ---------- HUD: index squares + the gliding red square -------------------- */
  var dots = items.map(function (it, i) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "dot" + (it.end ? " end" : ""); b.tabIndex = -1;
    b.style.setProperty("--i", i);
    b.setAttribute("data-t", it.end ? "More to come" : it.title);
    b.setAttribute("aria-label", it.end ? "Closing plate" : "Go to " + pad2(i + 1) + ", " + it.title);
    b.addEventListener("click", function () { goTo(i); });
    hudDots.appendChild(b);
    return b;
  });
  var glide = document.createElement("span");
  glide.className = "glide"; glide.setAttribute("aria-hidden", "true");
  hudDots.appendChild(glide);
  hudDots.style.setProperty("--gi", 0);

  /* ---------- info column: title · details · counter ------------------------- */
  // Titles are split per WORD (not per letter): splitting letters would switch off the
  // font's kerning pairs. Each word sits in a mask and rises, then rests in place.
  function titleNode(text) {
    var el = document.createElement("span");
    el.className = "tl on"; el.setAttribute("aria-hidden", "true");
    text.split(/(\s+)/).forEach(function (tok) {
      if (!tok) return;
      if (/^\s+$/.test(tok)) { el.appendChild(document.createTextNode(" ")); return; }
      var w = document.createElement("span"), s = document.createElement("span");
      w.className = "w"; s.textContent = tok; w.appendChild(s); el.appendChild(w);
    });
    return el;
  }
  function row(label, value) {
    var r = document.createElement("div"), a = document.createElement("dt"), b = document.createElement("dd");
    r.className = "i-row"; a.textContent = label; b.textContent = value; r.appendChild(a); r.appendChild(b);
    return r;
  }
  function bodyNode(it) {
    var el;
    if (it.end) {
      el = document.createElement("div");
      var p = document.createElement("p"); p.className = "i-note"; p.textContent = it.note; el.appendChild(p);
      if (it.link) {
        var a = document.createElement("a"); a.className = "tk"; a.href = it.link;
        a.appendChild(document.createElement("i")); a.appendChild(document.createTextNode(it.linkText || "Get in touch"));
        el.appendChild(a);
      }
    } else {
      el = document.createElement("dl"); el.className = "i-meta";
      if (it.date) el.appendChild(row("Date", it.date));
      if (it.medium) el.appendChild(row("Made with", it.medium));
      if (it.loc) el.appendChild(row("Location", it.loc));
      if (it.note) {                                            // optional data-note on a work
        var np = document.createElement("p"); np.className = "i-note"; np.textContent = it.note;
        el.appendChild(np);
      }
    }
    el.classList.add("on");
    return el;
  }
  function swapText(host, nu, dir, instant, words) {
    var old = host.querySelector(":scope > .on");
    if (old) old.classList.remove("on");
    host.insertBefore(nu, host.firstChild);
    var gone = function () { if (old && old.parentNode) old.parentNode.removeChild(old); };
    if (instant || !gsap || REDUCE) { gone(); return; }
    if (old) {
      if (words) {
        var ow = $$(".w > span", old); gsap.killTweensOf(ow);
        gsap.to(ow, { yPercent: -110 * dir, duration: 0.5, ease: "power3.in", stagger: 0.05, onComplete: gone });
      } else {
        gsap.killTweensOf(old);
        gsap.to(old, { opacity: 0, y: -K * 3 * dir, duration: 0.32, ease: "power2.in", onComplete: gone });
      }
    }
    var delay = old ? 0.16 : 0;
    if (words) {
      var nw = $$(".w > span", nu);
      gsap.fromTo(nw, { yPercent: 110 * dir }, { yPercent: 0, duration: 0.95, ease: "power3.out", stagger: 0.08, delay: delay,
        onComplete: function () { gsap.set(nw, { clearProps: "transform" }); } });
    } else {
      var kids = nu.children;
      gsap.fromTo(kids, { opacity: 0, y: K * 4 * dir }, { opacity: 1, y: 0, duration: 0.85, ease: "power3.out", stagger: 0.07, delay: delay + 0.08,
        onComplete: function () { gsap.set(kids, { clearProps: "transform,opacity" }); } });
    }
  }
  function swapNum(text, dir, instant) {
    var nu = document.createElement("span");
    nu.className = "hn on"; nu.textContent = text;
    var old = hudNum.querySelector(".hn.on");
    if (old) old.classList.remove("on");
    hudNum.insertBefore(nu, hudNum.firstChild);
    var gone = function () { if (old && old.parentNode) old.parentNode.removeChild(old); };
    if (instant || !gsap || REDUCE) { gone(); return; }
    if (old) { gsap.killTweensOf(old); gsap.to(old, { yPercent: -105 * dir, duration: 0.5, ease: "power3.in", onComplete: gone }); }
    gsap.fromTo(nu, { yPercent: 105 * dir }, { yPercent: 0, duration: 0.8, ease: "power3.out", delay: old ? 0.12 : 0,
      onComplete: function () { gsap.set(nu, { clearProps: "transform" }); } });
  }
  function renderInfo(it, dir, instant) {
    iTitle.setAttribute("aria-label", it.title);
    swapText(iTitle, titleNode(it.title), dir, instant, true);
    swapText(iBody, bodyNode(it), dir, instant, false);
    swapNum(it.end ? "+" : pad2(it.i + 1), dir, instant);
  }
  function setActive(a, instant) {
    var prev = S.active, dir = a >= prev ? 1 : -1;
    S.active = a;
    items.forEach(function (it, i) { it.el.classList.toggle("is-active", i === a); });
    dots.forEach(function (d, i) { if (i === a) d.setAttribute("aria-current", "true"); else d.removeAttribute("aria-current"); });
    renderInfo(items[a], dir, instant || prev < 0);
    if (live && prev >= 0 && !instant) {
      var cur = items[a];
      live.textContent = cur.end ? cur.title : cur.title + ", " + (a + 1) + " of " + WORKS + (cur.medium ? ", " + cur.medium : "") + (cur.date ? ", " + cur.date : "");
    }
    if (gsap && !REDUCE && prev >= 0 && !instant) gsap.to(hudDots, { "--gi": a, duration: 0.95, ease: "power3.out", overwrite: true });
    else hudDots.style.setProperty("--gi", a);
  }

  /* ---------- painting (per frame) ---------------------------------------------- */
  function sstep(t) { return t * t * (3 - 2 * t); }
  function paint() {
    var pos = S.pos, sk = S.focus >= 0 ? 0 : S.skew;
    var sig = pos.toFixed(2) + "|" + sk.toFixed(3) + "|" + S.focus;
    for (var q = 0; q < N; q++) sig += "|" + items[q].m.toFixed(3) + "," + items[q].hide.toFixed(3);
    if (sig === S.sig) return;
    S.sig = sig;
    if (S.pan) track.style.transform = "translate3d(" + (-pos).toFixed(2) + "px,0,0)";
    for (var i = 0; i < N; i++) {
      var it = items[i];
      if (it.end) continue;
      var x = it.left - padL - pos, cx = x + padL + it.mw * 0.5;
      if (it.m === 0 && it.hide === 0 && (x + padL + it.mw < -RW * 0.3 || x + padL > RW * 1.3)) continue;   // off-screen: nothing to show
      // x is the plate's left edge relative to its REST position (0 when the pan has settled on it).
      // The image is shown exactly — scale 1, no shift — at rest; while it moves it zooms a little and
      // drifts against the pan, the drift always smaller than the zoom's overscan so no edge can show.
      var o = 1, px = 0, ps = 1;
      if (!REDUCE) {
        var d = Math.abs(x) / (RW * 0.42); if (d > 1) d = 1;
        o = 1 - 0.5 * sstep(d);
        var tt = clamp(x / (RW * 0.6), -1, 1);
        ps = 1 + 0.10 * Math.abs(tt);
        px = -tt * 0.045 * it.mw;
      }
      var m = it.m;
      o = (o + (1 - o) * m) * (1 - it.hide);
      it.el.style.setProperty("--o", o.toFixed(3));
      if (it.inner) {
        it.inner.style.setProperty("--px", (px * (1 - m)).toFixed(2) + "px");
        it.inner.style.setProperty("--ps", (1 + (ps - 1) * (1 - m)).toFixed(4));
      }
      it.el.style.setProperty("--sx", clamp(100 - (cx / RW) * 100, -30, 130).toFixed(1) + "%");
      var tf = "", ct = "";
      if (m > 0) {
        var s = Math.min(box.w / it.mw, box.h / it.mh);
        // anchored to the box's bottom-left — the gallery's own baseline and the 176.5 column edge
        var bcx = box.l + it.mw * s * 0.5, bcy = box.t + box.h - it.mh * s * 0.5;
        var dx = bcx - cx, dy = bcy - (it.mtop + it.mh * 0.5);
        tf = "translate3d(" + (dx * m).toFixed(2) + "px," + (dy * m).toFixed(2) + "px,0) scale(" + (1 + (s - 1) * m).toFixed(4) + ")";
        // the caption rides along to sit under the plate's bottom-left corner
        var cdx = box.l - (cx - it.mw * 0.5), cdy = (box.t + box.h) - (it.mtop + it.mh);
        ct = "translate3d(" + (cdx * m).toFixed(2) + "px," + (cdy * m).toFixed(2) + "px,0)";
      }
      if (sk) tf += " skewX(" + (sk * (1 - m)).toFixed(3) + "deg)";
      it.media.style.transform = tf;
      if (it.cap) it.cap.style.transform = ct;
    }
  }

  /* ---------- pan engine ------------------------------------------------------------ */
  function input() {
    if (S.snapped) { S.gestureStart = S.target; S.snapped = false; }
    S.lastInput = performance.now();
  }
  function tick(time, dtms) {
    var dt = Math.min(0.05, (dtms || 16.7) / 1000);
    if (S.pan) {
      var prev = S.pos;
      S.pos += (S.target - S.pos) * (1 - Math.exp(-dt * (S.dragging ? 22 : 7.5)));
      if (Math.abs(S.target - S.pos) < 0.05) S.pos = S.target;
      S.vel = (S.pos - prev) / dt;
      var want = clamp(-S.vel / K * 0.0032, -1.5, 1.5);
      S.skew += (want - S.skew) * (1 - Math.exp(-dt * 14));
      if (Math.abs(S.skew) < 0.003) S.skew = 0;
      // soft snap: once input has stopped, settle on a composed position. A deliberate
      // nudge (even one wheel notch) steps to the next plate rather than springing back.
      if (!S.snapped && !S.dragging && S.focus < 0 && !S.intro && performance.now() - S.lastInput > 170) {
        S.snapped = true;
        var base = nearest(S.gestureStart), cand = nearest(S.target), delta = S.target - S.gestureStart;
        if (cand === base && Math.abs(delta) > 14 * K) cand = clamp(base + (delta > 0 ? 1 : -1), 0, N - 1);
        S.target = snaps[cand];
      }
    }
    var a = S.focus >= 0 ? S.focus : nearest(S.pos);
    if (a !== S.active && S.ready) setActive(a);
    paint();
    setBand(S.focus < 0 && S.active === N - 1 && S.max - S.pos < 2);
    if (++ringTick > 6) { ringTick = 0; refreshRing(); }   // content moves under a still pointer
  }
  var ringTick = 0;

  // the closing plate's grey continues under the info column once the pan has arrived
  var bandLeft = document.getElementById("bandLeft"), bandOn = false;
  function setBand(on) {
    if (!bandLeft || on === bandOn || S.intro) return;
    bandOn = on;
    if (!gsap || REDUCE) { bandLeft.style.transform = on ? "none" : "scaleX(0)"; return; }
    gsap.to(bandLeft, { scaleX: on ? 1 : 0, duration: on ? 1.3 : 0.6, ease: worksEase, overwrite: true });
  }

  function goTo(i, instant) {
    i = clamp(i, 0, N - 1);
    if (S.focus >= 0) { plateGo(i); return; }
    if (S.pan) { S.target = snaps[i]; S.snapped = true; if (instant) S.pos = S.target; }
    else hgal.scrollTo({ left: snaps[i], behavior: REDUCE || instant ? "auto" : "smooth" });
  }

  /* ---------- plate (a work opened large) ------------------------------------------- */
  function wipeClip(el, dur) {       // left → right, slow → fast → slow (the front page's panel wipe)
    var s = { p: 0 };
    return gsap.to(s, { p: 1, duration: dur, ease: worksEase,
      onUpdate: function () { el.style.clipPath = "inset(0px " + ((1 - s.p) * 100) + "% 0px 0px)"; },
      onComplete: function () { el.style.clipPath = "none"; } });
  }
  function openPlate(i) {
    var it = items[i];
    if (S.focus >= 0 || S.plateBusy || isMobile() || !it || it.end) return;
    S.focus = i; S.plateBusy = true;
    root.classList.add("plate");
    it.el.classList.add("is-focus");
    plateUi.removeAttribute("aria-hidden");
    if (S.pan) { S.target = S.pos; }                  // freeze the pan under the plate
    var others = items.filter(function (o) { return o !== it && !o.end; });
    if (!gsap || REDUCE) { it.m = 1; others.forEach(function (o) { o.hide = 1; }); S.plateBusy = false; return; }
    gsap.to(it, { m: 1, duration: 1.25, ease: worksEase, onComplete: function () { S.plateBusy = false; } });
    gsap.to(others, { hide: 1, duration: 0.6, ease: "power2.inOut" });
    var end = items[N - 1]; if (end.end) gsap.to(end.el, { opacity: 0, duration: 0.5, ease: "power2.inOut" });
  }
  function closePlate() {
    if (S.focus < 0 || S.plateBusy) return;
    var it = items[S.focus];
    S.focus = -1; S.plateBusy = true;
    root.classList.remove("plate");
    plateUi.setAttribute("aria-hidden", "true");
    if (S.pan) { S.target = snaps[it.i]; S.snapped = true; }
    else hgal.scrollLeft = snaps[it.i];
    var others = items.filter(function (o) { return o !== it && !o.end; });
    function done() { it.el.classList.remove("is-focus"); S.plateBusy = false; }
    if (!gsap || REDUCE) { it.m = 0; others.forEach(function (o) { o.hide = 0; o.m = 0; }); done(); return; }
    gsap.to(it, { m: 0, duration: 1.05, ease: worksEase, onComplete: done });
    gsap.to(others, { hide: 0, duration: 0.8, ease: "power2.out", delay: 0.3 });
    var end = items[N - 1]; if (end.end) gsap.to(end.el, { opacity: 1, duration: 0.6, ease: "power2.out", delay: 0.4 });
  }
  function plateGo(j) {
    if (j < 0 || j >= WORKS || j === S.focus || S.plateBusy) return;
    var o = items[S.focus], n = items[j];
    S.focus = j;
    if (S.pan) S.target = snaps[j]; else hgal.scrollLeft = snaps[j];
    n.el.classList.add("is-focus"); o.el.classList.remove("is-focus");
    if (!gsap || REDUCE) { n.m = 1; n.hide = 0; o.hide = 1; o.m = 0; return; }
    n.m = 1; n.hide = 1;
    gsap.to(o, { hide: 1, duration: 0.6, ease: "power2.inOut", onComplete: function () { o.m = 0; } });
    gsap.to(n, { hide: 0, duration: 0.75, ease: "power2.out", delay: 0.3 });
    n.media.style.clipPath = "inset(0px 100% 0px 0px)";
    gsap.delayedCall(0.3, function () { wipeClip(n.media, 1.0); });
  }

  /* ---------- input --------------------------------------------------------------------- */
  window.addEventListener("wheel", function (e) {
    if (e.ctrlKey) return;                                           // pinch-zoom
    var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (e.deltaMode === 1) d *= 32; else if (e.deltaMode === 2) d *= RW;
    if (S.focus >= 0) {                                              // in a plate: wheel steps between works
      e.preventDefault();
      var now = performance.now();
      if (Math.abs(d) > 8 && now - S.lastPlateWheel > 800) { S.lastPlateWheel = now; plateGo(S.focus + (d > 0 ? 1 : -1)); }
      return;
    }
    if (!S.pan || S.intro) return;
    input();
    S.target = clamp(S.target + d, 0, S.max);
    e.preventDefault();
  }, { passive: false });

  var dragX = 0, dragT = 0, lastX = 0, lastTm = 0, dragV = 0;
  hgal.addEventListener("pointerdown", function (e) {
    if (!S.pan || S.intro || S.focus >= 0 || e.button !== 0 || e.pointerType === "touch") return;
    S.dragging = true; S.moved = false;
    dragX = lastX = e.clientX; dragT = S.target; lastTm = performance.now(); dragV = 0;
    input();
  });
  window.addEventListener("pointermove", function (e) {
    if (!S.dragging) return;
    var dx = e.clientX - dragX;
    if (Math.abs(dx) > 5 && !S.moved) { S.moved = true; root.classList.add("dragging"); ringState("drag", "Drag"); }
    S.target = clamp(dragT - dx, 0, S.max);
    var now = performance.now(), dtm = now - lastTm;
    if (dtm > 0) dragV = dragV * 0.6 + ((lastX - e.clientX) / dtm * 1000) * 0.4;
    lastX = e.clientX; lastTm = now; S.lastInput = now;
  });
  function endDrag() {
    if (!S.dragging) return;
    S.dragging = false; root.classList.remove("dragging");
    if (S.moved) { S.target = clamp(S.target + dragV * 0.22, 0, S.max); ringState("", ""); }
    S.lastInput = performance.now();
    setTimeout(function () { S.moved = false; }, 0);                 // after the click that follows pointerup
  }
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  track.addEventListener("click", function (e) {
    var f = e.target.closest(".frame");
    if (!f || S.moved) return;
    var it = items[frames.indexOf(f)];
    if (it && !it.end && e.target.closest(".frame-media")) openPlate(it.i);
  });
  hgal.addEventListener("click", function (e) {
    if (S.focus >= 0 && !e.target.closest(".frame-media")) closePlate();
  });
  plateUi.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b) return;
    var act = b.getAttribute("data-act");
    if (act === "close") closePlate(); else if (act === "next") plateGo(S.focus + 1); else if (act === "prev") plateGo(S.focus - 1);
  });
  // keep the transform-driven layout honest if the browser scrolls a focused plate into view
  hgal.addEventListener("scroll", function () {
    if (S.pan) { if (hgal.scrollLeft !== 0) hgal.scrollLeft = 0; return; }
    S.pos = hgal.scrollLeft;
  }, { passive: true });
  track.addEventListener("focusin", function (e) {
    var f = e.target.closest && e.target.closest(".frame");
    if (!f || S.focus >= 0 || S.intro) return;
    var i = frames.indexOf(f);
    if (i >= 0 && i !== S.active) goTo(i);
  });

  window.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || S.intro) return;
    var k = e.key;
    if (menuNav && menuNav.classList.contains("open")) return;
    var inControl = e.target && e.target.closest && e.target.closest("a, .tk, .dot");
    if (S.focus >= 0) {
      if (k === "Escape") closePlate();
      else if (k === "ArrowRight" || k === "ArrowDown") plateGo(S.focus + 1);
      else if (k === "ArrowLeft" || k === "ArrowUp") plateGo(S.focus - 1);
      else return;
      e.preventDefault(); return;
    }
    if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown" || (k === " " && !inControl && !e.shiftKey)) goTo(S.active + 1);
    else if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp" || (k === " " && !inControl && e.shiftKey)) goTo(S.active - 1);
    else if (k === "Home") goTo(0);
    else if (k === "End") goTo(N - 1);
    else return;
    e.preventDefault();
  });

  var rsT = 0;
  window.addEventListener("resize", function () {
    clearTimeout(rsT);
    rsT = setTimeout(function () {
      var keep = S.focus >= 0 ? S.focus : Math.max(0, S.active);
      setEngine(); measure();                        // a new scale moves every plate edge: re-seat on the active work
      if (S.pan) { S.target = S.pos = snaps[keep]; S.snapped = true; } else hgal.scrollLeft = snaps[keep];
      S.sig = ""; paint();
    }, 60);
  });

  /* ---------- leaving the page: the paper curtain rises (the preloader's own element) -------- */
  var pre = document.getElementById("preloader");
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== "_self") return;
    var href = a.getAttribute("href");
    if (!href || href.charAt(0) === "#" || /^(mailto:|tel:|javascript:)/i.test(href)) return;
    var url; try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
    if (!gsap || REDUCE || !pre) return;
    e.preventDefault();
    pre.style.display = "flex";
    gsap.fromTo(pre, { yPercent: 100 }, { yPercent: 0, duration: 0.75, ease: "power4.inOut", onComplete: function () { location.href = url.href; } });
  }, true);
  window.addEventListener("pageshow", function (ev) {       // back/forward cache: never restore a covered page
    if (ev.persisted && pre) { pre.style.display = "none"; if (gsap) gsap.set(pre, { clearProps: "transform" }); }
  });

  /* ---------- custom cursor (fine pointers) ------------------------------------------------ */
  var ringEl = document.querySelector(".cursor-ring"), ringLabel = document.querySelector(".cursor-label");
  var ringNow = "", ptrX = -1, ptrY = -1;
  function refreshRing() {
    if (!ringEl || ptrX < 0 || (S.dragging && S.moved)) return;
    var t = document.elementFromPoint(ptrX, ptrY);
    if (!t) return ringState("", "");
    if (S.focus >= 0) {
      if (t.closest(".plate-ui, .tk, a, .dot")) ringState("hover", "");
      else if (t.closest(".frame-media")) ringState("", "");
      else if (t.closest(".hgal")) ringState("view", "Close");
      else ringState("", "");
    } else if (t.closest(".frame-media")) ringState("view", "View");
    else if (t.closest("a, .tk, .dot, .plus")) ringState("hover", "");
    else ringState("", "");
  }
  function ringState(state, text) {
    if (!ringEl || ringNow === state + text) return;
    ringNow = state + text;
    ringEl.classList.toggle("is-view", state === "view");
    ringEl.classList.toggle("is-drag", state === "drag");
    ringEl.classList.toggle("is-hover", state === "hover");
    if (ringLabel && text) ringLabel.textContent = text;
  }
  function cursor() {
    var dot = document.querySelector(".cursor-dot");
    if (!dot || !ringEl || !FINE || !gsap) return;
    root.classList.add("cursor-ready");
    var mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    function setDot() { dot.style.transform = "translate3d(" + mx + "px," + my + "px,0) translate(-50%,-50%)"; }
    function setRing() { ringEl.style.transform = "translate3d(" + rx.toFixed(1) + "px," + ry.toFixed(1) + "px,0) translate(-50%,-50%)"; }
    setDot(); setRing();
    window.addEventListener("mousemove", function (e) { mx = ptrX = e.clientX; my = ptrY = e.clientY; setDot(); }, { passive: true });
    gsap.ticker.add(function () {
      var nx = rx + (mx - rx) * 0.18, ny = ry + (my - ry) * 0.18;
      if (Math.abs(mx - nx) < 0.05) nx = mx;
      if (Math.abs(my - ny) < 0.05) ny = my;
      if (nx === rx && ny === ry) return;
      rx = nx; ry = ny; setRing();
    });
    document.addEventListener("mouseover", refreshRing);
    document.addEventListener("mouseleave", function () { ptrX = ptrY = -1; ringState("", ""); });
  }

  /* ---------- images: fade in once decoded (never pop) ---------------------------------------- */
  function whenReady(img) {
    var decode = function () { return img.decode ? img.decode().then(null, function () {}) : Promise.resolve(); };
    if (img.complete && img.naturalWidth) return decode();
    return new Promise(function (res) {
      img.addEventListener("load", res, { once: true });
      img.addEventListener("error", res, { once: true });
    }).then(decode);
  }
  $$("img", track).forEach(function (img) { whenReady(img).then(function () { img.classList.add("on"); }); });

  /* ---------- intro (after the preloader) ---------------------------------------------------- */
  function restScale() { return 1; }   // artwork is shown in full at rest (drift lives in paint())
  function revealAll() {
    // static, settled state — used when there is no animation layer / reduced motion
    items.forEach(function (it) {
      if (it.inner) it.inner.style.setProperty("--sc", restScale(it));
      it.el.style.setProperty("--ci", 1);
    });
    if (gsap) gsap.set([".brand", ".nav", ".tri", ".plus", ".i-title", ".i-body", ".hud", ".end-sq", ".frame.end"], { opacity: 1, clearProps: "transform" });
    items.forEach(function (it) { if (it.media) it.media.style.clipPath = "none"; });
  }
  function buildIntro() {
    var tl = gsap.timeline({ paused: true, onComplete: function () { S.intro = false; } });
    var inRegion = items.filter(function (it) { return !it.end && it.left - padL - S.pos < RW + 4; });
    var later = items.filter(function (it) { return inRegion.indexOf(it) < 0; });

    // plates: panel wipes (L→R), staggered, each settling from a slight zoom
    inRegion.forEach(function (it, k) {
      var at = k * 0.12;
      it.media.style.clipPath = "inset(0px 100% 0px 0px)";
      var s = { p: 0 };
      tl.add(gsap.to(s, { p: 1, duration: 1.9, ease: worksEase,
        onUpdate: function () { it.media.style.clipPath = "inset(0px " + ((1 - s.p) * 100) + "% 0px 0px)"; },
        onComplete: function () { it.media.style.clipPath = "none"; } }), at);
      tl.fromTo(it.inner, { "--sc": restScale(it) * 1.16 }, { "--sc": restScale(it), duration: 2.3, ease: "power3.out" }, at);
      if (it.plus) tl.fromTo(it.plus, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power2.out" }, at + 1.0);
      tl.fromTo(it.el, { "--ci": 0 }, { "--ci": 1, duration: 0.9, ease: "power2.out" }, at + 0.95);
    });
    later.forEach(function (it) {
      if (it.media) it.media.style.clipPath = "none";
      if (it.inner) it.inner.style.setProperty("--sc", restScale(it));
      if (it.plus) it.plus.style.opacity = 1;
      it.el.style.setProperty("--ci", 1);
    });
    tl.to(".frame.end", { opacity: 1, duration: 0.9, ease: "power2.out" }, 0.4);
    tl.to(".end-sq", { opacity: 1, duration: 0.6, ease: "power2.out" }, 0.9);

    // info column: triangle pops (back.out, like the front page), the title rises, details + HUD follow
    tl.fromTo(".info .tri", { opacity: 0, y: K * 3, scale: 0.6 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: "back.out(1.7)", clearProps: "transform" }, 0.15);
    tl.set(".i-title", { opacity: 1 }, 0);
    var tw = $$(".w > span", iTitle);
    tl.fromTo(tw, { yPercent: 110 }, { yPercent: 0, duration: 1.0, ease: "power3.out", stagger: 0.08, clearProps: "transform" }, 0.25);
    tl.set(".i-body", { opacity: 1 }, 0);
    tl.fromTo(iBody.children[0].children, { opacity: 0, y: K * 4 }, { opacity: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.08, clearProps: "transform,opacity" }, 0.5);
    tl.set(".hud", { opacity: 1 }, 0);
    tl.fromTo(".hud-num", { yPercent: 105 }, { yPercent: 0, duration: 0.9, ease: "power3.out", clearProps: "transform" }, 0.55);
    tl.fromTo(".dot", { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.7)", stagger: 0.05, clearProps: "transform,opacity" }, 0.6);
    tl.fromTo(".glide", { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.7, ease: "back.out(1.7)", clearProps: "transform,opacity" }, 0.85);

    // header
    tl.fromTo(".brand, .nav", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", stagger: 0.06, clearProps: "transform" }, 0.1);
    return tl;
  }
  function start() {
    setTimeout(function () { S.intro = false; }, 12000);            // failsafe: input is never blocked for good
    if (!gsap || REDUCE) { S.intro = false; revealAll(); return; }
    var pre = document.getElementById("preloader"), name = pre && pre.querySelector(".pl-name");
    var intro = buildIntro();
    // hide the title words until their turn (the masks clip them)
    gsap.set($$(".w > span", iTitle), { yPercent: 110 });
    if (!pre || !name) { intro.play(); return; }
    var fontsReady = (document.fonts && document.fonts.ready) ? Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 2500); })]) : Promise.resolve();
    // the curtain only lifts once the plates in view can actually paint (as the front page does for its hero)
    var firstImgs = items.filter(function (it) { return !it.end && it.left - padL - S.pos < RW + 4 && it.inner && it.inner.querySelector("img"); })
      .map(function (it) { return whenReady(it.inner.querySelector("img")); });
    var imagesReady = Promise.race([Promise.all(firstImgs), new Promise(function (r) { setTimeout(r, 6000); })]);
    var enter = gsap.timeline();
    enter.to(name, { y: "0%", duration: 0.9, ease: "power3.out" });
    var entered = new Promise(function (res) { enter.eventCallback("onComplete", res); });
    Promise.all([entered, fontsReady, imagesReady]).then(function () {
      var exit = gsap.timeline();
      exit.to(name, { y: "-115%", duration: 0.55, ease: "power3.in" }, "+=0.15")
          .to(pre, { yPercent: -100, duration: 0.85, ease: "power4.inOut" }, "-=0.25")
          .add(function () { pre.style.display = "none"; })
          .add(function () { intro.play(); }, "-=0.45");
    });
  }

  /* ---------- go ---------------------------------------------------------------------------------- */
  function init() {
    setEngine();
    measure();
    setActive(0, true);
    if (gsap && gsap.ticker) gsap.ticker.add(tick);
    else (function loop() { tick(0, 16.7); requestAnimationFrame(loop); })();
    S.ready = true;
    cursor();
    start();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); paint(); });
    window.addEventListener("load", function () { measure(); });
  }
  try { init(); }
  catch (err) {
    if (window.console) console.error("illustration.js failed, showing the static page:", err);
    root.classList.remove("anim"); root.classList.remove("pan");
    var p = document.getElementById("preloader"); if (p) p.style.display = "none";
  }
})();
