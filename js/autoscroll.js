/* ============================================================
   KOKI TAKAMATSU — middle-click autoscroll (the front page, the works' row)
   The browser's own (Windows' middle click) didn't take hold here, and a Mac has none: so the
   page carries its own, the same everywhere a mouse has a middle button.
   - A middle click (not on a link: that still opens it in a new tab) sets a mark where it was
     made; the page then scrolls toward the pointer, faster the further it is from the mark (a
     still zone around it). The works' row runs sideways, either way the pointer goes.
   - Any click, the wheel, Esc, or leaving the page stops it; held down and dragged, it stops
     as the button comes up.
   - The flow (CLAUDE.md, the momentum rule): the speed follows the hand on an exponential chase
     (no jump as it starts or turns), and on stopping the page carries on at that speed and slows
     to a standstill on the smooth scroll's own spring (lenis.__fling, js/glide.js).
   The page moves through its Lenis (window.__lenis, the row's window.__rowLenis), so everything
   riding with it (the hamburger, the scrollbar) follows as for the wheel.
   ============================================================ */
(function () {
  "use strict";
  var mm = window.matchMedia;
  if (mm && !mm("(pointer:fine)").matches) return;           // (a touch screen has no middle button)
  var root = document.documentElement;
  var DEAD = 10, GAIN = 6, FOLLOW = 0.12, HOLD = 14;          // px; px/s per px; s; px moved to be a drag
  var on = false, held = false, ax = 0, ay = 0, px = 0, py = 0, v = 0, pos = 0, last = 0, raf = 0, lenis = null;

  var mark = document.createElement("div");
  mark.className = "autoscroll-mark";
  mark.setAttribute("aria-hidden", "true");
  document.body.appendChild(mark);

  function scroller() { return window.__rowLenis || window.__lenis || null; }
  function sideways(l) { return !!l && l.options && l.options.orientation === "horizontal"; }
  function blocked(e) {
    if (root.classList.contains("zoom-open")) return true;    // (the zoom has the input)
    var nav = document.querySelector(".menu-nav");
    if (nav && nav.classList.contains("open")) return true;
    var t = e.target;
    return !!(t && t.closest && t.closest("a[href], input, textarea, select, [contenteditable], .shade-lab"));
  }

  function start(e) {
    lenis = scroller();
    if (!lenis || lenis.isStopped) return false;
    on = true; held = true; ax = px = e.clientX; ay = py = e.clientY; v = 0;
    pos = lenis.animatedScroll; last = performance.now();
    // (the mark on whole device pixels, placed by layout: it rests, and an ink edge between pixels would be soft)
    var r = window.devicePixelRatio || 1, s = mark.offsetWidth || 0;
    mark.style.left = Math.round((ax - s / 2) * r) / r + "px";
    mark.style.top = Math.round((ay - s / 2) * r) / r + "px";
    mark.classList.add("on");
    root.classList.add("autoscrolling");
    if (!raf) raf = requestAnimationFrame(tick);
    return true;
  }
  function stop() {
    if (!on) return;
    on = false; held = false;
    mark.classList.remove("on");
    root.classList.remove("autoscrolling");
    // (let go, the page carries on at the speed it had and slows to rest: js/glide.js)
    if (lenis && Math.abs(v) > 1 && lenis.__fling) lenis.__fling(v);
    v = 0;
  }
  function tick(now) {
    raf = 0;
    if (!on) return;
    var dt = Math.min(0.1, (now - last) / 1000); last = now;
    var dx = px - ax, dy = py - ay;
    var d = sideways(lenis) ? (Math.abs(dx) > Math.abs(dy) ? dx : dy) : dy;
    var want = Math.abs(d) <= DEAD ? 0 : (d - (d > 0 ? DEAD : -DEAD)) * GAIN;
    v += (want - v) * (1 - Math.exp(-dt / FOLLOW));            // (the speed follows the hand: no jump)
    if (Math.abs(v) > 0.5) {
      pos = Math.max(0, Math.min(lenis.limit, pos + v * dt));
      // (the page itself is set on whole pixels, as the browser scrolls; the speed is kept exactly)
      if (lenis.__set) lenis.__set(pos); else lenis.scrollTo(pos, { immediate: true, force: true });
    }
    raf = requestAnimationFrame(tick);
  }

  function down(e) {
    if (on) {                                                  // (any press stops it, and is spent doing so)
      e.preventDefault(); e.stopPropagation();
      stop();
      if (e.button === 0) eatClick = true;
      return;
    }
    if (e.button !== 1 || blocked(e)) return;
    if (start(e)) e.preventDefault();                          // (and no browser autoscroll beside it)
  }
  var eatClick = false;
  function click(e) { if (eatClick) { eatClick = false; e.preventDefault(); e.stopPropagation(); } }
  function up(e) {
    if (!on || e.button !== 1) return;
    // (held and dragged: it ends as the button comes up; a plain click leaves it on)
    if (held && Math.hypot(px - ax, py - ay) > HOLD) stop();
    held = false;
  }
  function move(e) { px = e.clientX; py = e.clientY; }
  function key(e) { if (on && (e.key === "Escape" || e.key === " " || /^(Page|Arrow|Home|End)/.test(e.key))) { stop(); if (e.key === "Escape") e.preventDefault(); } }
  function wheel() { if (on) stop(); }
  function blur() { stop(); }

  window.addEventListener("mousedown", down, true);
  window.addEventListener("mouseup", up, true);
  window.addEventListener("click", click, true);
  window.addEventListener("auxclick", function (e) { if (e.button === 1 && (on || eatClick)) e.preventDefault(); }, true);
  window.addEventListener("mousemove", move, { passive: true });
  window.addEventListener("keydown", key, true);
  window.addEventListener("wheel", wheel, { passive: true });
  window.addEventListener("blur", blur);
  document.addEventListener("kt:leave", stop);
  // (the next page comes into this window, js/wipe.js: what would outlive this one lets go)
  document.addEventListener("kt:gone", function () {
    stop();
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("mousedown", down, true);
    window.removeEventListener("mouseup", up, true);
    window.removeEventListener("click", click, true);
    window.removeEventListener("mousemove", move);
    window.removeEventListener("keydown", key, true);
    window.removeEventListener("wheel", wheel);
    window.removeEventListener("blur", blur);
  });
})();
