# Cases: what went wrong, how it showed, what fixed it

Numbers are steps per frame (CSS px, 1/60 s) from the probe unless said otherwise.

## The zoom's step (the model the owner chose)
The step between pictures in the zoom was the first motion on stepEase (1.0 s out, 1.1 s in on a 0.1 s
cue). The owner: "perfect, the way every motion should move." The curve it replaced, (0.38, 0, 0.5, 1)
over 0.8 s, braked hard in its last 200 ms and read as "suddenly stopped". The picture drifts inside a
still frame between pixels; only the frame's cut edge is snapped; wipe and drift share one clock.

## The hamburger, v1 (rejected: "worse, jittery, jiggly, stuttering, and slower")
- Bars moved and sized with `top`/`height`: layout snapped them to whole pixels — a slow bar stood still,
  then hopped; the X's bars jiggled back and forth a dozen times a morph (13–14 reversals).
- `go("y", …)` called every frame restarted its tween from rest each frame: a crawl and a stutter.
- `getBoundingClientRect` after style writes, each frame: layout thrash.
- Durations lengthened: the owner felt it at once.
- Snapping each bar to whole pixels made the bars uneven (7 vs 8 px).

## The hamburger, v2 (approved: "so much better")
Progress values `M` on GSAP tweens started only when their heading changes; every part derived per frame
by transform only from a 100px base box; panel shaped by lead/follow functions; labels on a late
smoothstep; the panel's start computed from the button's own numbers (no reads mid-motion); the old
durations. Measured: the catch a clean bell (0.04 → 1.56 → 0.00), X ↔ hamburger ≤2 reversals (noise),
rest state within 0.02 px of the original, real-time frames a steady 16.7 ms.

## Text rising in (every reveal, all pages)
Before: power3.out, drawn in place. First step the biggest (2.4 px at once); the landing stood still and
hopped (`0 -0.03 0 0 0 -0.03`); and a last hop of 0.24 px after the motion — clearing the transform
re-set the letters. At a true 2x in place: `-1.50 -2.00 -1.50 -2.00 … -0.50 0 -0.50 0`.
After: stepEase and a layer for good: `-0.03 -0.13 -0.25 -0.37 -0.50 … -1.79 … -0.10 -0.06`, no hop at
the end, the same at 1x and 2x. A text layer moved 0.125 px at a time is drawn moved exactly 0.125 px;
in place it hops 0.5 px (one device pixel) every fourth step.

## The triangles' pop-in
Before: back.out(1.7) — overshoot (reversals as it grew past and back), and a 0.67 px hop at the end.
In place, a clipped shape's moves wavered. After: stepEase, a layer for good, and the triangle placed on
whole pixels (`round()`), so on its layer it looks exactly as in place (0 px differ at 1x) and nothing
moves as the motion ends. The red squares (plain boxes) glide in place and stay there (light colour:
no layer, crisp at rest).

## The smooth scroll
Before (Lenis, expo restarted per notch): one notch from rest moved 10.1 px on its first frame; six notches
80 ms apart kicked the speed up at once each time (`6.5 → 16.0`, `10.4 → 19.5`, …); a link to a section
moved 103 px on its first frame.
After (`js/glide.js`): one notch `2.1 4.9 6.2 6.8 6.8 6.6 …` then the old glide; six notches bend the
speed (`6.8 8.6 11.1 12.0 …`); the link `0.8 2.3 4.1 6.0 … 39.4 … 5.0`; a link taken while still moving
carries the speed on (`5.7 6.1 7.4 8.8 …`).

## The works' row let go mid-drag
Before: the row leapt to 1.7x the hand's speed at release (6 → 10 px/frame). After (`__fling`): it carries
on at the hand's speed (6 → 6 → 5 …) and slows to rest.

## The zoom's flight
Before (0.22, 1, 0.36, 1): the flight home moved 30.6 px on its first frame. After: stepEase, starting at
0.4 px. (A ±0.3 px vertical waver while the picture scales exists before and after: filtering.)

## The chevrons' fade
A CSS opacity transition put them on a layer just for the fade; their soft diagonal edges folded black
under the cursor mid-fade. Fixed with a GSAP fade on the step's clock.

## The page-change sheet
Before: power3.in up (arrives at full speed), power3.out off (starts at full speed). After: stepEase both
ways, snapped to whole device pixels (a light edge): `-5 -17 -31 -49 -68 -80 -85 -82 … -3 -2 -1`.

## The name on the curtain (first visit)
Owner: "stutters, kinda stuck in mid motion". A held-clock film can't show this: it steps the clock by hand.
Filmed as drawn instead (Chromium's screencast, a first visit, the CPU slowed 4x, the font held back 700 ms,
the mask opened so the centroid is the motion alone):
- Before (a GSAP tween on the main thread, starting at once):
  - the first frame came after 236 ms, already 15px up;
  - then uneven steps (`-0.62 -0.38 -1.87 -1.47 -0.41`);
  - with the slow font, a 6.8px jump part-way up, as AvantGarde swapped in.
- After (the face awaited, then a CSS animation of its layer on stepEase): `0 -0.03 -0.27 -0.48 -0.65 -0.94 …
  -2.88 … -0.2 -0.07 0`, with no gap and no jump.
- The rule: a motion that runs while the page loads goes on the compositor (a CSS animation or transition of a
  layer's transform or opacity), and its text waits for its face.

