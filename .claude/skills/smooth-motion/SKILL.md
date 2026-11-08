---
name: smooth-motion
description: How every motion on Koki Takamatsu's portfolio (this repo, 2026Web) is built and proven smooth — the flow's curve (stepEase), one clock per thing, transform-only movement, a layer for good for moving text, velocity-continuous scrolling, and frame-by-frame measurement of the drawn pixels on a held clock. Use it whenever you add or change anything on this site that moves, fades, wipes, scrolls or morphs — a GSAP tween or timeline, a CSS transition or animation, a reveal, a hover or focus fade, the intro or curtain, a page change, the zoom, the smooth scroll or a drag, the hamburger or its menu — and whenever the owner says something looks jaggy, jittery, jiggly, stuttering, snapping, too slow or "not smooth", even if they never say "motion" or "animation".
---

# Smooth motion on this site

The owner judges motion by eye, frame by frame, on a Retina Mac, and has rejected work that "looked
fine" in code. This skill is how motion here is made so that it passes that eye, and how to *prove* it
before saying it is done. It came from real failures (see `references/cases.md`): every rule below is
there because breaking it once showed on screen.

Read CLAUDE.md's "The flow of motion" and "The inverse cursor" first; this skill is the how-to behind
them. The hamburger (`js/menu.js`) is the owner-approved reference implementation of a complex motion.


> **The owner's latest direction (overrides the curve below wherever they differ):** the flow's curve is now
> power3.out, `cubic-bezier(0.215, 0.61, 0.355, 1)`: quick off the mark, with a long soft landing and contrast in
> speed. The owner found the symmetric stepEase `(0.3, 0, 0.2, 1)` read as "line movement". The variable keeps its
> name `stepEase`. The hamburger's catch runs on its old two clocks (an exponential chase, and
> cubic-bezier(.4,0,.2,1) for the bars' shape). Everything else here still holds: layers, whole-pixel edges, one
> clock, measured frame by frame. Where the text below says "sets off gently / from a standstill", read "quick off
> the mark".
## 1. The feel: from a standstill to a standstill

- **The curve is stepEase**, `cubic-bezier(0.3, 0, 0.2, 1)` — in JS
  `var stepEase = cubicBezier(0.3, 0, 0.2, 1);` (each script carries the same bisection solver), in CSS
  `cubic-bezier(.3,0,.2,1)`. It starts with zero speed (no jump on the first frame), peaks at about 31%
  of the time, and lands long and soft (300 ms before the end under 5% is left; the last frames creep).
  Curves that start at speed — `power*.out`, `expo`, CSS `ease`, GSAP's default `power1.out` when no
  ease is given — move several pixels on their very first frame; the owner sees that as a jolt.
- **Keep the pace.** Never make a motion slower than it was; the owner noticed at once ("it got slower,
  timing got worse"). Reuse the old duration when you change a curve. Today: UI answers 0.45–0.8 s
  (menu 0.6, hamburger catch 0.8, scrollbar step-aside 0.45, back after the zoom 0.75), page sheet
  0.45 rise / 0.5 lift, text rises 1.0 (contact 1.1), pop-ins 0.7, ticks 0.5, photo wipes 1.25,
  panel wipes 2.0, zoom flight 0.9 in / 0.75 home, zoom step 1.0 + 1.1.
- **No overshoot, no steps** (`back`, `elastic`, `bounce`, `steps()`): something moving on its own.
- **A cascade** (parts setting off in turn, `stagger` or timeline offsets) is fine only when every part
  is itself on stepEase — each part then sets off from a standstill. Parts of *one* thing never cascade:
  they share one clock.
- **Nothing outside the flow:** when a motion ends, no pixel may pop, linger or move on its own — check
  the last frames and the frame after the end (clearing a transform can move things; see §3).

## 2. The build: one clock, driven, started only when the heading changes

For anything with more than one moving part (the hamburger's bars, panel, labels, shadow), don't
choreograph tweens and CSS transitions against each other. Use a few *progress values* and derive every
part from them each frame:

```js
var M = { o: 0 }, T = { o: 0 };          // where each progress value is, and where it is heading
function go(key, to, dur) {              // start a tween ONLY when the heading changes
  if (T[key] === to) return;
  T[key] = to;
  var v = {}; v[key] = to;
  gsap.to(M, Object.assign({ duration: dur, ease: stepEase, overwrite: "auto" }, v));  // ease written in the call
}
function set(key, v) { gsap.killTweensOf(M, key); M[key] = T[key] = v; }
gsap.ticker.add(function () { /* read M, write every part's transform */ });
```

- Calling `gsap.to` every frame with the same target restarts the curve from rest each frame: the motion
  crawls and stutters (hamburger v1). Track the heading (`T`) and start a tween only when it changes.
- Write `ease: stepEase` inside the tween call itself — the motion audit reads it from there.
- **Sub-choreography from shaping functions** of one progress `o` (each still starts and ends at rest):
  lead `1-(1-o)²`, follow `o²`, late fade `smoothstep((o-0.5)/0.5)`. One clock, so nothing drifts.
- **Hand-over without a jolt:** when a motion takes over from another (riding with the page → going to
  the corner), blend between the *live* positions, `mix(rideWithPage, corner, w)`, rather than starting
  from a snapshot. A follower that is re-aimed while moving must keep its speed (see the scroll, §5).
- **Measure once, compute after.** Read layout (`getBoundingClientRect`) when a motion starts or on
  resize, never between style writes mid-motion (layout thrash, long frames). Skip writes that didn't
  change (memo keys that include state flags). If a CSS state class flips before the motion has moved,
  set inline values for that first frame, or it flashes.
- **Nothing heavy while anything moves:** decode and draw pictures at their size before (`warm()`),
  swap files and tidy after (`settle()`, `upgrade()`). One long frame mid-motion is a visible jump.

## 3. Pixels: how the browser draws a moving thing

These were measured (drawn pixels, held clock), not assumed:

| What moves | Drawn in place | On a layer of its own (`will-change: transform`) |
|---|---|---|
| a box (bar, square) by transform | glides between pixels | glides, but at rest edges can go soft |
| **text** | **letters set on whole device pixels: stands still, then hops** | **glides** (measured exact at 1x and a true 2x) |
| a clipped shape (the triangles) | wavers | glides |
| a picture | crisp; glides inside a still frame | drawn softer; a bright edge folds under the cursor |

So:
- **Move by transform only**, never `top`/`left`/`width`/`height`: layout snaps to whole pixels, so a slow
  motion stands still then hops (the X's bars jiggled a dozen times a morph). Size a box by scaling a
  base box that is a **whole number** of pixels tall (100px) — a 7.5px box was snapped to 7 *before*
  being scaled. Grow a scrollbar thumb by a `clip-path` inset, not by its width.
- **Moving text gets a layer for good** (`css/anim.css`: `.anim .brand, .nav, .h, .copy, .cap, .tri`,
  `.pl-name`, `.cap-in`). Never switch a layer on or off around a motion: on a layer the letters are set
  a hair differently (up to half a pixel across), and the switch shows as it starts and stops. Clearing a
  transform at the end of a motion re-sets in-place text the same way — that was a last hop on every
  reveal until the text got its layer.
- **Shapes that move and must rest crisp rest on whole pixels** (`round(…, 1px)` on their place and size,
  `css/style.css` for `.tri`/`.sq`): then the moment the motion lets go (transform cleared, browser snaps
  it) nothing moves. A triangle hopped 0.7px as it ended before this.
- **Pictures never get a layer at rest.** The zoom's frame takes one only while it flies (`.flies`).
- **2D tweens: `force3D: false`.** GSAP's default may put the element on a layer just for the motion.
- **Light colours' moving edges are snapped to device pixels** (wipes: `wipeClip()`; the white sheet:
  the `SHEET` modifiers; a picture sliding with its edges in view: `slideX()`) because a soft light edge
  folds black under the inverse cursor. Their landing then creeps a whole pixel at a time — accepted;
  the cursor rule wins. A picture moving *inside* a still frame is never snapped (it glides; the frame's
  cut edge is what's snapped).
- **Fades with GSAP, not a CSS transition**, for anything above the under-squares: a CSS opacity
  transition gave the chevrons a layer for the fade and their soft edges folded. CSS transitions are for
  colour/hover fades, on `cubic-bezier(.3,0,.2,1)`.

## 4. Check it — measured, not guessed

Never call a motion smooth from code or from layout numbers (layout values hid the snapping more than
once). Film the drawn pixels:

```
npm install --no-save playwright-core
node .claude/skills/smooth-motion/scripts/probe.mjs .claude/skills/smooth-motion/recipes/front.json
```

`scripts/probe.mjs` stops GSAP's clock and every CSS animation, starts the motion (or, with
`holdFromLoad`, films the page's own intro from its first frame), steps 1/60 s at a time, screenshots
the region and prints each frame's step with ✗ for **stills** (stood still between moving frames),
**hops** (more than twice its neighbours) and **reversals**, plus the first step against the biggest
(gentle start: small) and what was left for the last 300 ms (long landing: a few %). Recipes for the
site's motions are in `recipes/`; copy one for a new motion. `PROBE_ROOT=<worktree>` films an older
commit (`git worktree add <dir> <commit>`) for a before/after.

What good looks like: steps that grow from ~0, peak, and shrink smoothly to a creep, every step a little
more or less than the one before — e.g. the paragraph rise at 2x:
`-0.03 -0.13 -0.25 -0.37 -0.50 … -1.79 -1.78 … -0.10 -0.06`. What bad looks like: `-1.50 -2.00 -1.50 …
-0.50 0 -0.50 0` (whole-pixel snapping) or a first step that is the biggest (starts at speed).

The smooth scroll runs in real time and can't be held; `scripts/scroll-probe.mjs` drives Lenis's frame
loop by hand and sends wheel notches at set frames. Read `references/measuring.md` before measuring —
it lists the confounds that produced false alarms (masks, other parts in the clip, fades on pale shapes,
Playwright's emulated 2x) and how the probe avoids them. Also check real-time frame intervals (~16.7 ms;
over ~25 ms is a long frame) and look at the rest state after the motion against the original.

## 5. The smooth scroll (`js/glide.js`)

Lenis turns input into where the page is heading; `js/glide.js` decides how it gets there. Following the
wheel/trackpad/keys/a fling, the page is an exact overdamped spring (time constants 6 ms and 159 ms,
the second the old easing's own), so a new notch bends the speed instead of restarting it: Lenis's own
way started each notch afresh at full speed — 10px on the first frame, a kick per notch. **Keep the first
constant under a frame.** The page's instant grip on the wheel is the site's "sticky" feel, and the owner
wants it. At 35 ms the page answered a notch with 2% and 6.9% in its first frames, and it floated; the
hamburger, riding with the page back to its squares, lost its stick too. A gentle start belongs to a motion
that sets off on its own, never to one that follows the hand. A scroll *sent
somewhere* (`scrollTo(x, { duration })`) runs on stepEase from the speed it had. A drag let go calls
`lenis.__fling(speed)`: it carries on at the hand's speed and slows to rest. Don't hand Lenis an easing
for the wheel; give `easing: stepEase` (or nothing) to scrolls with a duration.

## 6. Before you push a motion

1. stepEase in the call, the old duration kept, no overshoot; cascades only of stepEase parts.
2. Transform only; text moving has its layer for good; shapes that rest crisp rest on whole pixels;
   2D tweens `force3D: false`; no reads mid-motion; nothing heavy while it moves.
3. Filmed with the probe at 1x **and a true 2x**, before and after: no stills, hops or reversals beyond
   whole-pixel creep of snapped light edges; first step small; nothing moves after the end.
4. `node tests/motion-audit.mjs` passes. It fails on any curve that isn't stepEase; its `REVIEWED` list
   holds only the hamburger's colour fades — never add to it to get a motion past it.
5. The new motion's states are in `tests/fold-check.mjs` (mid-motion and at rest) and the full run is
   clean ("No outlines", the stamp, the console's checks): the push guard needs it.
6. CLAUDE.md updated if the motion adds a rule or a new kind of thing that moves.
7. Tell the owner what changed in plain words, with the before/after numbers — and say what you could
   not check (the sandbox has no GPU: 2x frame *timings* need a real machine).
