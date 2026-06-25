/* ============================================================
   Illustration page — full-screen horizontal gallery.
   There is NO vertical scroll: the wheel / trackpad / drag drives a
   smooth sideways pan of the frame row (lerped transform). Each frame
   settles in as it enters, tied to the pan position. The header
   (name / nav / corner squares) is a fixed overlay; with no vertical
   scroll the camouflage menu simply stays as the squares (click to open).
   Falls back to a native sideways scroll under reduced-motion / touch.
   ============================================================ */
(function () {
  "use strict";
  var root = document.documentElement;
  var gsap = window.gsap;
  var REDUCE = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var COARSE = window.matchMedia && window.matchMedia("(hover:none),(pointer:coarse)").matches;
  var track = document.querySelector(".hgal-track");
  var frames = [].slice.call(document.querySelectorAll(".frame"));

  function reveal() { root.classList.remove("anim"); }

  // ---------- preloader -> reveal header ----------------------------------
  function headerIn() {
    var els = [].slice.call(document.querySelectorAll(".brand, .istage .nav"));
    if (!gsap || REDUCE) { els.forEach(function (e) { e.style.opacity = ""; }); return; }
    gsap.fromTo(els, { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", stagger: 0.06, clearProps: "transform" });
  }
  function intro() {
    var pre = document.getElementById("preloader"), name = document.querySelector(".pl-name");
    if (!gsap || REDUCE || !pre) { if (pre) pre.style.display = "none"; reveal(); headerIn(); return; }
    gsap.timeline({ onComplete: function () { pre.style.display = "none"; } })
      .set(pre, { autoAlpha: 1 })
      .from(name, { yPercent: 110, duration: 0.9, ease: "power3.out" })
      .to(name, { yPercent: -115, duration: 0.6, ease: "power3.in" }, "+=0.3")
      .to(pre, { yPercent: -100, duration: 0.85, ease: "power4.inOut" }, "-=0.2")
      .add(function () { reveal(); headerIn(); }, "-=0.55");
  }

  // ---------- horizontal pan (fine pointers) ------------------------------
  var fd = frames.map(function (f) {
    return { box: f.querySelector(".frame-box, .end"), meta: f.querySelector(".frame-meta"), left: 0, w: 0 };
  });
  var targetX = 0, curX = 0, maxX = 0;
  function measure() {
    maxX = track ? Math.max(0, track.scrollWidth - window.innerWidth) : 0;
    targetX = Math.max(0, Math.min(maxX, targetX));
    frames.forEach(function (f, i) { fd[i].left = f.offsetLeft; fd[i].w = f.offsetWidth; });
  }
  function paint() {
    if (track) track.style.transform = "translate3d(" + (-curX).toFixed(2) + "px,0,0)";
    var vw = window.innerWidth;
    for (var i = 0; i < fd.length; i++) {
      var d = fd[i], cx = d.left - curX + d.w / 2;     // frame centre in the viewport
      var p = (vw - cx) / (vw * 0.5);                  // 0 at the right edge -> 1 once well in
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      if (d.box) { d.box.style.opacity = p.toFixed(3); d.box.style.transform = "scale(" + (0.975 + 0.025 * p).toFixed(4) + ")"; }
      if (d.meta) d.meta.style.opacity = p.toFixed(3);
    }
  }

  if (track && !REDUCE && !COARSE) {
    measure();
    window.addEventListener("resize", measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    window.addEventListener("load", measure);

    // wheel / trackpad -> sideways. Take the dominant axis so a vertical wheel
    // pans too. preventDefault keeps the page from scrolling (there's nothing to).
    window.addEventListener("wheel", function (e) {
      var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      targetX = Math.max(0, Math.min(maxX, targetX + d));
      e.preventDefault();
    }, { passive: false });

    // keyboard
    window.addEventListener("keydown", function (e) {
      var step = window.innerWidth * 0.7;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") targetX = Math.min(maxX, targetX + step);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") targetX = Math.max(0, targetX - step);
      else if (e.key === "Home") targetX = 0;
      else if (e.key === "End") targetX = maxX;
      else return;
      e.preventDefault();
    });

    // pointer drag (mouse / pen)
    var dragX = null, dragStart = 0;
    window.addEventListener("pointerdown", function (e) { if (e.button === 0) { dragX = e.clientX; dragStart = targetX; } });
    window.addEventListener("pointermove", function (e) {
      if (dragX !== null) { targetX = Math.max(0, Math.min(maxX, dragStart + (dragX - e.clientX))); }
    });
    window.addEventListener("pointerup", function () { dragX = null; });

    function tick() {
      curX += (targetX - curX) * 0.09;
      if (Math.abs(targetX - curX) < 0.06) curX = targetX;
      paint();
    }
    if (gsap && gsap.ticker) gsap.ticker.add(tick);
    else (function loop() { tick(); requestAnimationFrame(loop); })();
  }

  // ---------- custom cursor (fine pointers only) --------------------------
  function cursor() {
    var dot = document.querySelector(".cursor-dot"), ring = document.querySelector(".cursor-ring");
    if (!dot || !ring || !gsap || !window.matchMedia("(pointer:fine)").matches) return;
    root.classList.add("cursor-ready");
    var mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    function setDot() { dot.style.transform = "translate3d(" + mx + "px," + my + "px,0) translate(-50%,-50%)"; }
    function setRing() { ring.style.transform = "translate3d(" + rx.toFixed(1) + "px," + ry.toFixed(1) + "px,0) translate(-50%,-50%)"; }
    setDot(); setRing();
    window.addEventListener("mousemove", function (e) { mx = e.clientX; my = e.clientY; setDot(); }, { passive: true });
    gsap.ticker.add(function () {
      var nrx = rx + (mx - rx) * 0.18, nry = ry + (my - ry) * 0.18;
      if (Math.abs(mx - nrx) < 0.05) nrx = mx;
      if (Math.abs(my - nry) < 0.05) nry = my;
      if (nrx === rx && nry === ry) return;
      rx = nrx; ry = nry; setRing();
    });
    document.addEventListener("mouseover", function (e) { if (e.target.closest("a, .frame")) ring.classList.add("is-hover"); });
    document.addEventListener("mouseout", function (e) { if (e.target.closest("a, .frame")) ring.classList.remove("is-hover"); });
  }

  // ---------- go ----------------------------------------------------------
  try {
    cursor();
    if (document.readyState === "complete") intro();
    else window.addEventListener("load", intro, { once: true });
    setTimeout(function () {
      if (root.classList.contains("anim")) { reveal(); headerIn(); var p = document.getElementById("preloader"); if (p) p.style.display = "none"; }
    }, 4500);
  } catch (err) {
    if (window.console) console.error("gallery.js failed, showing static page:", err);
    reveal();
    var p = document.getElementById("preloader"); if (p) p.style.display = "none";
  }
})();
