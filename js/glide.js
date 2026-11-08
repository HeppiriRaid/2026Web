/* ============================================================
   KOKI TAKAMATSU — the smooth scroll, on the flow (CLAUDE.md, "The flow of motion")
   Both pages scroll with Lenis (the front page down, the works' row sideways):
   it turns the wheel, the trackpad and the arrow keys into where the page is
   heading. This decides how the page gets there.
   · Following the wheel, the trackpad, the keys or a fling: the page is an exact
     damped spring, set by two time constants — 6 ms, and 159 ms, the old easing's
     own (2^-10t over 1.1 s). A new notch moves where the page is heading; its speed
     carries on, so it never jumps. Lenis's own way started every notch afresh, at
     full speed: a hard kick on each notch (10% of it at once). The page's grip on the
     wheel, though, is the site's sticky feel, and the owner wants it: the old glide
     takes hold of a notch at once. So the first constant is under a frame — only
     the kick's corner is rounded: a notch moves the page 6.7% in its first frame
     (Lenis: 10%), then 15.8%, 24.2% (18.9%, 27.0%) — and after that the old glide,
     as long and as soft. (At 35 ms the page answered 2%, 6.9%: it floated, and the
     hamburger, riding with the page back to its squares, lost its stick.)
   · Sent somewhere (a link to a section: a scroll given a duration): on the flow's
     curve, stepEase, over that duration — and from the speed the page had, if it
     was still moving, so that hand-over doesn't jump either.
   The spring is solved exactly over each frame, the same curve at any frame rate.
   ============================================================ */
(function () {
  "use strict";
  // custom cubic-bezier ease (no plugin) — the same solver as the other scripts
  function cubicBezier(x1, y1, x2, y2) {
    function bz(p, a, b) { var m = 1 - p; return 3 * m * m * p * a + 3 * m * p * p * b + p * p * p; }
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var lo = 0, hi = 1, p = x;
      for (var i = 0; i < 18; i++) { p = (lo + hi) / 2; if (bz(p, x1, x2) < x) lo = p; else hi = p; }
      return bz(p, y1, y2);
    };
  }
  var stepEase = cubicBezier(0.215, 0.61, 0.355, 1);       // the flow's curve: from a standstill, gently, to a long soft landing
  var T1 = 0.006, T2 = 1.1 / (10 * Math.LN2);       // s: the spring's two time constants (T2 = 0.1587 s)
  var R1 = -1 / T1, R2 = -1 / T2;
  var TF = 0.32;                                    // s: a finger's let-go slows on this one, about a phone's own momentum
  // (the mark of a scroll that follows: Lenis passes its own easing for the wheel and for a scroll given no
  // duration. Were it ever run as a curve, it is the old one.)
  function FOLLOW(t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); }

  window.__glide = function (lenis) {
    var A = lenis && lenis.animate, opt = lenis && lenis.options;
    if (!A || !opt || typeof A.advance !== "function" || typeof A.fromTo !== "function" || A.__glide) return;
    A.__glide = true;
    opt.easing = FOLLOW;
    var v = 0, curve = null, drag = false, fling = false, still = 0, stop = A.stop;
    A.stop = function () { if (!drag) v = 0; curve = null; return stop.apply(this, arguments); };   // (a drag's speed is kept for the let-go)
    A.fromTo = function (from, to, o) {
      o = o || {};
      var given = o.easing, curveOf = given && given !== FOLLOW ? given : null;   // (a curve it was given)
      if (!this.isRunning && !drag) v = 0;             // (from a standstill; after a drag, at the finger's speed)
      this.from = this.value = from; this.to = to;
      this.lerp = false; this.duration = o.duration; this.easing = o.easing; this.currentTime = 0;
      // (a finger dragging the page, syncTouch: Lenis asks for no lag, lerp 1 — the page sits under the finger;
      // let go, it heads for where the finger's speed carries it, and the spring takes it there from that speed)
      var wasDrag = drag;
      if (o.lerp >= 1) { drag = true; curve = null; }
      else drag = false;
      // let go mid-drag: it carries on at the finger's speed, slowing on the longer spring, as far as that speed
      // takes it (Lenis aims its fling for its own lerp, 35 steps on: far quicker than the finger, a jump)
      fling = wasDrag && !drag && o.lerp > 0 && o.lerp < 1;
      if (fling) {
        this.to = Math.max(0, Math.min(lenis.limit, from + v * (T1 + TF)));
        lenis.targetScroll = this.to;
      }
      curve = o.easing === FOLLOW && o.duration === opt.duration ? null
        : { x0: from, v0: v, t: 0, d: Math.max(0.001, o.duration || opt.duration || 1), ease: curveOf || FOLLOW };   // (given none: Lenis's own exponential, the original's)
      this.isRunning = true;
      if (o.onStart) o.onStart();
      this.onUpdate = o.onUpdate;
    };
    A.advance = function (dt) {
      if (!this.isRunning) return;
      dt = Math.min(Math.max(dt || 0, 0), 0.064);      // (a long gap, a hidden tab, is one frame: never a leap)
      var x = this.value, done = false;
      if (drag) {                                      // under the finger, exactly; its speed kept for the let-go
        if (Math.abs(this.to - x) < 0.01) {            // (a frame the finger didn't move: not a step — Lenis reads
          still += dt;                                 // the let-go's speed from the last step — until it rests)
          if (still < 0.06) return;
          done = true;
        } else { still = 0; if (dt > 0) v = (this.to - x) / dt; }
        x = this.to;
      } else if (curve) {                              // sent somewhere: the curve, plus the speed it had, fading out
        var c = curve, u, m, nx;
        c.t = Math.min(c.t + dt, c.d); u = c.t / c.d; m = 1 - u;
        nx = c.x0 + (this.to - c.x0) * c.ease(u) + c.v0 * c.d * u * m * m;
        if (dt > 0) v = (nx - x) / dt;
        x = nx;
        if (u >= 1) { x = this.to; v = 0; done = true; }
      } else {                                         // following: the spring, exactly over dt
        var r2 = fling ? -1 / TF : R2;
        var e0 = x - this.to, a = (v - r2 * e0) / (R1 - r2), b = e0 - a, e1 = Math.exp(R1 * dt), e2 = Math.exp(r2 * dt);
        var e = a * e1 + b * e2;
        v = a * R1 * e1 + b * r2 * e2;
        x = this.to + e;
        if (Math.abs(e) < 0.1 && Math.abs(v) < 6) { x = this.to; v = 0; done = true; }
      }
      this.value = x;
      if (this.onUpdate) this.onUpdate(x, done);
      if (done) this.stop();
    };
    // A fling (the works' row let go while it was being dragged): the page carries on at the hand's speed
    // (px per second) and slows to a standstill, with no push: heading exactly as far as the spring takes
    // that speed, v (T1 + T2). (`most`: the farthest it may go.)
    lenis.__fling = function (speed, most) {
      var reach = T1 + T2, lim = most > 0 ? most / reach : Infinity;
      speed = Math.max(-lim, Math.min(lim, speed || 0));
      if (!speed) return;
      lenis.scrollTo(lenis.animatedScroll + speed * reach, { programmatic: false, force: true });
      if (A.isRunning && !curve) v = speed;
    };
  };
})();
