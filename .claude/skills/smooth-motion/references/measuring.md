# Measuring a motion

How to prove a motion smooth on this site, and the traps that produced false alarms or false passes.

## The tools

- `scripts/probe.mjs recipe.json [...]` — films a motion on a held clock (GSAP's global timeline paused,
  every `document.getAnimations()` paused, both moved on by hand 1/60 s per frame) and measures the
  drawn pixels of a region each frame. Recipe fields are documented at the top of the script. Measures:
  - `y`, `x` — the ink's centroid (sub-pixel), in CSS px. Darkness is taken against the region's own
    paper (the median of its border in the last frame), so a fade alone doesn't move it.
  - `sy`, `sx` — the ink's spread: a shape growing or a morph (the X's bars).
  - `mass` — how much ink: a fade.
  - `rest` — how far the region still is from its last frame (1 → 0): anything, crudely.
  - `cover` — the share of pixels not yet as they end: a wipe's or a sheet's edge (`axis` x/y; steps
    under one row/column don't count, as such edges are snapped to whole pixels on purpose).
  - `read` — a JS expression read each frame, where pixels can't tell (the white sheet over the white
    page: read its transform).
- `scripts/scroll-probe.mjs` — the smooth scroll: Lenis's frame loop driven by hand on a synthetic
  clock, wheel notches and `scrollTo()` calls at set frames, the page's position each frame.
- Real time, when a clock can't be held (a drag, a fling): record `scrollLeft`/positions each
  `requestAnimationFrame` with its timestamp and turn them into px per frame (see `cases.md`, the fling).
- Before / after: `git worktree add <dir> <commit>` and `PROBE_ROOT=<dir>` (the probe and node_modules
  stay in this checkout). Remove the worktree after (`git worktree remove <dir>`).
- Frame times: record rAF intervals while the motion runs in real time; about 16.7 ms each is right, and
  anything over ~25 ms is a long frame (a visible jump). At 2x the sandbox (no GPU) is slow by itself.
- The rest state: screenshot the region at rest after the motion and compare it pixel for pixel with
  the same region before the change (or with the element's static look).

## Reading the numbers

Good: steps grow from about zero, peak near a third of the way, then shrink to a creep, each a little
more or less than its neighbours; the first step is a small share of the biggest; a few % left for the
last 300 ms; nothing after the last moving frame.

Bad:
- Whole-pixel snapping — steps like `-1.50 -2.00 -1.50 -2.00 … -0.50 0 -0.50 0` (at 2x a device pixel is
  0.5 CSS px). Something is drawn in place that should be on a layer, or moved by layout.
- A first step that is the biggest — a curve that starts at speed.
- A step after the motion ended — a pop as the motion lets go (a transform cleared, a class removed).
- Alternating big/small steps — two clocks or two quantisations fighting (check for a restart each frame).
- Reversals — overshoot, or two parts moving against each other.

## Traps (each one fooled a measurement here once)

- **Playwright's emulated 2x is not a real 2x.** `newContext({ deviceScaleFactor: 2 })` sets pictures on
  whole CSS pixels; and launching with `--force-device-scale-factor=2` while also giving `newContext` a
  viewport draws at 1x inside a 2x window (movement measured at half its size, irregular). For a true 2x:
  launch with `--force-device-scale-factor=2 --window-size=W,H+87` and `newContext({ viewport: null })`
  (the probe does this for `"dpr": 2`). Check `devicePixelRatio` in the page.
- **Measure from the rest place.** A reveal's `fromTo` renders its start state at once (`immediateRender`),
  so an element's box may already be moved when the clip is taken; the probe sets transforms aside while
  it measures the clip. Pad the clip in the direction of travel.
- **Only the subject in the clip.** Hide everything else with `hide` CSS (neighbouring text rising into
  the clip, the hamburger, the scrollbar, the curtain, the zoom's grey) or the centroid wanders.
- **Masks.** Text rising out of an `overflow: hidden` mask changes how much of it shows, so its centroid
  speeds up and slows down by itself. Open the mask in the recipe (`overflow: visible !important`) to see
  the motion itself.
- **Pale shapes on pale paper** (the #ccc9c9 triangle) measure noisily (±0.1 px): darkness against the
  paper is small. Judge them by the moving axis, and compare variants side by side.
- **Fades are 8-bit.** A fade between two close colours (the zoom's grey over the paper: 4 levels) has
  only a few distinct steps; stills there are the colour depth, not the motion.
- **A scaling picture** (the zoom's flight) shows ±0.3 px sub-pixel noise from its filtering in the
  sandbox's software compositor; compare with the old commit before blaming the change.
- **Never return a GSAP object from `page.evaluate`** (wrap the body in braces) — it hung the run.
- **Lenis runs in real time** on GSAP's ticker; holding GSAP's clock doesn't hold it. Replace `lenis.raf`
  and drive it yourself (scroll-probe does).
- Run with `CHROMIUM=/opt/pw-browsers/chromium` in this sandbox (the probe defaults to that path).

## When the outline check changes after a motion's timing changes

`tests/fold-check.mjs` reaches part-way states by holding GSAP's clock until, say, the sheet is between 60%
and 30%. Change a curve and that moment moves in time, and the state can land in the middle of *another*
motion. That is what happened with the page-change sheet on stepEase: held 0.12 s after the click
instead of 0.35 s, the menu was still folding shut, and a few pixels of a half-faded label folded — in
some runs and not others. Before touching anything, find out which it is:
1. Bisect: the old curve held at the same *moment in time* as the new one (edit the hold in a worktree of
   the old commit). Compare the plain shots — make sure the other motions really are at the same stage.
2. Hold the other motion alone at those moments (a temporary state in the flow: pause GSAP's clock, start
   it, step the clock by hand, `check()`), in the old and the new code.
3. A result that flips from run to run under a held clock points at parts of the page that run in real
   time (the cursor's spring and its 0.8 s bookkeeping, the hamburger's tint): a visitor's real time keeps
   them in step, the hold doesn't.
Only then move the hold, keep what the state is for (here: the sheet's moving edge), and write down why in
the flow. Never mark a fold a known limit to get past the check.
