# Koki Takamatsu — portfolio

Static site, no build step: plain HTML / CSS / JS, with GSAP 3.12.5 and Lenis 1.0.42 in `vendor/`.
Live at https://heppiriraid.github.io/2026Web/ — GitHub Pages serves the **`Main`** branch (capital M).

- `index.html` front page · `illustration.html` the row of works + zoom · `contact.html` the address and related
  links (one screen under the illustration page's header; `css/contact.css`, its intro `js/contact.js`) ·
  `console.html` the owner's editor
  (it commits `data/illustration.json` and `assets/img/illustration/` — the works — and `data/front.json` and
  `assets/img/front/` — the front page's photos and caption — straight to `Main` through the GitHub API).
- The front page's photo holders are its `figure[data-slot]` (name in `data-slot-name`, shape from `--w`/`--h`);
  a caption the owner can rewrite is marked `data-caption-for="<holder>"`, its parts in `data-title`, `-date`,
  `-medium`, `-location` (the text in the page must read as they say; it is right-aligned, `.cap-r`, so a longer
  one grows left, then onto a second line). The console reads them from the page itself. `data/front.json` lists
  only what was set there — `photos` (a picture, its description, its crop as `focus`: object-position in %) and
  `captions` — and whatever it doesn't name keeps what `index.html` gives it; `js/photos.js` puts them in, and
  `js/anim.js` waits for that before the curtain lifts. Keep those attributes when changing the layout; a new
  `data-slot` is a new holder.
- **The "+" and the zoom view are one, shared by both pages** (`js/zoom.js`, `css/zoom.css`): a work on the
  illustration page, and a front-page photo holder with a `button.ph-open` inside (the whole photo is the
  button; its `span.plus` is centred `--px` / `--py` points in from the top-left corner, `.r` the top-right),
  lift into the band grey; ← → / the wheel / a swipe / the chevrons beside the picture (`.zoom-nav`, gliding with its edges in a step; part of the grey, so they fade with it; the one at the row's end fades away) step between them, the page following underneath. A photo
  its holder shows cropped opens whole, its crop opening out as it lifts (`cropOf()`). `illustration.js` hands
  its works to `window.__zoom()`; the front page's photos are wired in `js/zoom.js` itself. A new zoomable
  photo is one more `button.ph-open` in its holder (and its states in the check).
- **The hamburger moves on the flow's curve, by transform only** (`js/menu.js`): every part of it is read each frame
  from a few progress values, each a GSAP tween on `stepEase` (a tween starts only when its heading changes) — the
  catch (squares ↔ hamburger: position, size and the bars' shape, 0.8 s; its position blended from riding with the
  page to the corner, so it takes over from the page's own motion), the menu (0.6 s: the panel slides out of the
  middle bar as a line — its place and width lead, `1-(1-o)²` — then drops open, its height following, `o²`; the X,
  the shadow, the labels easing in last), the step aside for the scrollbar (0.45 s; only where the caught bars reach the drawn scrollbar's column, `reach`:
  a window whose height sets the artboard's size, a 16:9 screen, has it centred and the hamburger far in from the
  edge, so it never moves), back after the zoom (0.75 s).
  **Never move or size anything with `top`/`height` in a motion**: the browser snaps those to whole pixels, so a
  slow bar stood still, then hopped (measured: the X's bars jiggled back and forth a dozen times a morph). Each bar
  is a 100px box (a whole number: a 7.5px box was snapped to 7 before being scaled five times into a square)
  shaped by `translateY / rotate / scaleY`; `js/menu-shade.js`'s `barAt()` reads that transform. Nothing is read
  back from the page mid-motion (the panel's start is worked out from the button's numbers).
- **The hamburger's bars invert what lies beneath them, pixel by pixel, like the cursor's square** (the owner's
  choice): once it has caught the corner, the page under a bar shows |colour − #DCCBC3|. `js/menu.js` draws copies
  of the bars in #DCCBC3:
  - `.menu-inv` over the button, blended with `difference`;
  - two `.menu-fold` under the page content, beside the page's own under-squares (`body > .cursor-fold`, not the
    curtain's), mirroring the paper so letters under a bar stay clean.

  **The catch is the grey bars' own glide, untouched.** The inverse fades in once the hamburger rests in the
  corner (`M.i`, 0.3 s). The menu carries it on its own clock both ways (`1 - o / 0.3`): opening, it goes over
  the open's first stretch as the panel slides out of the bar; closing, it comes in over the close's last stretch
  and lands with the bars, never after them as a change of its own (the owner: it "suddenly pops up", "suddenly
  goes back", over a picture). Each is a true crossfade: while it shows, the button's bars are hidden
  (`.menu-btn.covered`, by visibility, so `js/menu-shade.js` keeps their tint) and `.menu-cover`, over the copies,
  is a live clone of the bars and the panel (`mirror()`: their inline styles, the picture's tint and the panel's
  folding line included), fading off as the inverse comes in; inside the cursor's square a second clone, cut to
  `window.__cursorBox` (`js/cursor.js`), each part inverted against #DCCBC3 as the square shows it. Faded as copies
  over part-clear bars, the page and the cursor's square showed through mid-way; plain grey pieces as the cover
  dropped the picture's tint in one frame. The paper's mirrors (`.menu-fold`) show only at rest, on whole pixels:
  between pixels their soft edges under the inverse's left a dark rim round each bar. Back to the squares and the
  step aside it goes at once, in the same frame (on paper the inverse is the bars' own grey, so its going shows
  only on what lies beneath a bar). **Grey as usual, and every pixel beneath lively through it** (the owner: "pixel to pixel"): over the
  inverse lies a lift, `.menu-lift`, blended with `screen` in #a89e9c, a colour worked out so the paper,
  inverted, comes out exactly the bars' grey #b3b1b1 (the band within 4 levels of it). Ink comes out light, and a
  picture shows through, recoloured, pixel by pixel. Cutting the bars at the boxes of text lines (the version
  before) inverted whole blocks, the letters lost in them. `.menu-inv` and `.menu-lift` lie over the cursor's
  square (z 10000, after it in the page, under its point): under it, the lift brought letters out lighter than
  #DCCBC3 and the square, inverting them again, folded their edges; over it, all they are given is below #DCCBC3.
  So they also lie over a page change's white sheet: they go at once as it sets off (`kt:leave`). At rest the copies sit on whole device pixels (a soft
  edge there folded the letters crossing it); moving, they follow the bars' live shape between pixels (100px
  boxes scaled), worked out from the button's numbers each frame. Over the grey squares at the top it is
  off. While the `?shader` test runs (`html.shade-test`) it stays off, so the variations' tints show on the bars;
  visitors no longer see the 墨分五色 tint.
- **Each menu label answers across its whole row of the panel** (`.menu-nav a::before`, `--panel-w` from
  `measurePanel()`): out to the panel's edges, half the gap to its neighbours. The rows tile the panel.
- **The hamburger is always the top layer.** The zoom (z 88) lies beneath it and its menu (89–90), so a
  picture flies in and home under the hamburger, which never vanishes and reappears. While a picture is
  up (`html.zoom-open`) the zoom has the input: a click on the hamburger closes it, as a click anywhere
  does. The hamburger holds still, so the page following a step under the grey doesn't move it
  (`js/menu.js`); as the picture flies home, it eases to wherever the page now puts it. The scrollbar
  (above the menu) steps aside meanwhile (`css/zoom.css`), and the hamburger's tint from the BACK GROUND
  picture fades out and back with the grey (`js/menu-shade.js`).
- A Save is on the site at once: the pages read their data file from GitHub's API as well as from the site
  (`js/fresh.js`, Main the moment it is saved, raced against 1.5 s; the site's copy when GitHub can't answer),
  and a picture the site's copy doesn't name yet comes from raw.githubusercontent.com (with CORS, so the
  hamburger can read it) until Pages has published it. On 127.0.0.1 a `window.__CONSOLE_TEST_API__` stands in
  for GitHub, for the console and the pages alike.
- Page changes (`js/wipe.js`, a white sheet): the cursor's square springs out as the sheet rises and back in, where
  the pointer is, as it lifts (`kt:leave` / `kt:arrive`, `js/cursor.js`). The plain arrow stays hidden throughout:
  the arriving page sets `cursor-ready` from its head, before its stylesheets, when `js/cursor.js` left a note.
- **A page change never opens the next page the usual way.** A page opened the usual way gets a new surface
  from the browser (Chrome gives every page its own), and until that page has drawn its first frame and seen
  the mouse move, the surface shows the system's plain arrow over the sheet (measured 50–130 ms on a fast
  machine; nothing in a page can hide it). So `js/wipe.js` fetches the next page while the sheet rises and
  writes it into the same window (`document.open()` / `write()`; `history.pushState`); Back / Forward between
  the site's pages do the same (`popstate`), and the page comes back where it was left (`history.state.kt`:
  the scroll, the works' row; `js/anim.js`, `js/illustration.js`). Each page's scripts run as on any load, so
  they must be fine run again in one window: no top-level `let`/`const`/`class`; whatever outlives the
  document (a media query's listener, an observer, a smooth scroll, GSAP's ticker, ScrollTrigger) is let go on
  `kt:gone` or in `swap()`, or every page visited would live on. Anything that isn't one of the site's pages,
  or a page that doesn't come, opens the usual way.
- Fonts: the headings' ITC Avant Garde files (`assets/fonts/avantgarde-*.woff2`) were cut from the design PDF and
  draw only the letters it used (Demi: no F, J, digits or lowercase; Book: no E, F, J, V, Y). Any other character
  in a map but drawn blank shows as a gap, with no fallback. New heading words: check them, or set them in URW
  Gothic (complete). Captions are set in URW Gothic for that reason (the console lets the owner write anything). The body face, Nunito Sans ExtraLight, is Google's full Latin set (OFL), same metrics as the
  PDF's cut.
- A word in brackets (Details, Kickstarter, Steam; the contact page's links) is one box, `.bx` (`css/style.css`): its
  marks on the box's corners and the word centred in it **as the eye measures it, at each mark**: up and down, the
  top-left mark to the top of the first letter = the bottom of the last letter to the bottom-right mark; across, the
  top-left mark to the letters at its height = the letters at the bottom-right mark's height to it (an r's foot is
  further in than its top). `js/brackets.js` draws each word on a canvas in the page's font, reads its letters'
  pixels there, and nudges it, then corrects for pixel snapping. Measured to within one pixel each way (an odd
  pixel can't be split).
- Links: CONTACT (top nav and menu) goes to `contact.html`; the front page's sections are `#about`, `#works`,
  `#calligraphy`. `js/wipe.js` knows the site's pages with or without `.html` (Cloudflare Pages serves `/contact`).
- **Narrow screens** (a phone, a tablet upright, a phone on its side) get the pages in one column. Each page's
  head script (`fitK()`) sets `html.narrow` before the first paint when `w < 760`, `w < h && w < 1100` or
  `h < 520 && w < 1000`. Then `--k` is px per point of *type*, fitted to the width: `max(3.6, min(4.4, w / 104))`,
  3.6 on a phone on its side. That gives body copy 14.4–17.6px and captions 12px and up. `window.__fit.narrow` and
  `.k` carry it to the scripts. **The desktop artboard is untouched:** every rule in `css/narrow.css` starts with
  `.narrow`.
  - The front page's parts sit in section wrappers, `.sec[data-sec]` (`display: contents` on the artboard, so each
    part still places itself by its points). On a narrow screen each wrapper is a flex column, its parts in reading
    order (`order`).
  - **Spacing, the owner's rule:** the grey square (12pt) is the unit. A small margin is ½ (6pt) or ¼ (3pt) of it (⅛, 1.5pt, for the tightest: the works on the
    desktop works page, the owner),
    a large one whole squares. The column is ½ in from each side, the same both ways: the hamburger may pass over
    it once caught (it inverts what it lies on). The header's name sits ¼ from the corner, both ways. A heading's
    triangle and the red square end one square in from the window's edge, in line with the grey squares, never
    under the hamburger: its soft bar edge over a shape's soft edge folds in the cursor's square.
  - **A new part on the front page goes inside its `.sec`, and gets its narrow place in `css/narrow.css`.**
  - `js/narrow.js` (front page, contact):
    - lays each grey band under its `.sec[data-band]`; the bands stay beneath the cursor's under-squares;
    - nudges the shapes that pop in (the triangles, the red square) onto whole pixels, as `round()` does on the
      artboard. In the column they fall between pixels, and would hop as their motion let go; their sizes are
      whole.
  - The hamburger and the cursor take `__fit.k` as their unit there (`js/menu.js`, `js/cursor.js`). The hamburger
    sits flush in the top-right corner, over the squares.
  - The works' row:
    - each work is as tall as `--row` allows, but never wider than the column, so a wide one fits the width;
    - its given shape is kept (`--iw` / `--ih` from `js/illustration.js`), so the row never changes as a picture
      loads.
  - Contact is one column under the header.
  - The zoom's chevrons are a quarter of their size (`--nav-s: .25`, the owner); the strip that takes a tap stays
    as it is, and `navAt()` reads `--nav-s` to set them beside the picture.
  - On any touch screen (`hover: none` and `pointer: coarse`) the drawn scrollbar stays away: the screen shows its
    own. So the hamburger never steps aside for it (`TOUCH`, `js/menu.js`). Taps get no grey box of the browser's
    own, and the type isn't enlarged on a phone turned on its side (`css/style.css`).
  - A phone has no cursor (`js/cursor.js` runs for fine pointers only), but a narrow window on a computer has the
    square, so the check covers both shapes (the `narrow` and `sideways` flows).
- The owner commits to `Main` too (every console Save). Before pushing: `git fetch origin Main` and rebase onto it.
  Never force-push `Main`.
- Pages caches the code for 10 minutes: after a deploy, check with a hard refresh.
- **Nothing ships without the outline check** ("Check it", below). Anything new on screen — a page, a panel, a
  test or debug tool, a `?switch`, a hover, focus or error state — gets its states in `tests/fold-check.mjs`
  *before* it is pushed. A push hook enforces the run: `git push` is stopped until a full clean run has passed
  for exactly the code being pushed.

## The flow of motion — every new motion follows it

**The owner's latest word on the curve:** with every motion on the symmetric stepEase, `(0.3, 0, 0.2, 1)`,
everything read as "line movement". The owner wants the old exponential motion back, with contrast in its speed:
quick off the mark, then a long soft landing, and the smoothness kept. So the flow's curve is now **power3.out,
`cubic-bezier(0.215, 0.61, 0.355, 1)`** (the site's own curve before the rework), at each motion's pace. The
variable is still called `stepEase`. The hamburger's catch runs on its own two old clocks (`js/menu.js`):
- its place and size: the original driver itself. For 1.2 s after it changes between riding with the page and
  the corner, it chases its target by 7% of the gap a 60th of a second (`chasing`; while riding, a target moving
  with the page), otherwise it is exactly there. The original cut the chase at 1.2 s and jumped the last 0.5% at
  once, a hop of about a pixel as it landed (the owner: "jaggy"). Now it runs out, ending within 0.02 px. Measured against the original commit (7fd2300~1), frame by frame
  in real time, it now matches both ways;
- its bars' shape: 0.8 s on `cubic-bezier(.4,0,.2,1)` (`BARS_GO`).

**The landing (a first visit) is the original's:** the name rises on power3.out (0.9 s, on the compositor,
`rise()`), then quickens away (`power3.in`, 0.55 s) as the curtain lifts on `power4.inOut` (0.85 s), on all three
pages. The audit's `REVIEWED` holds those two (`LANDING`).

A scroll sent somewhere with no curve of its own (the nav links) runs on Lenis's own exponential,
`1.001 − 2^(−10t)`, as before the rework (`js/glide.js`).

**The owner's standing rule: every new motion uses this style — momentum, an exponential curve** (power3.out:
quick off the mark, a long soft landing; a chase or a spring for what follows the hand). A change that rides on a
motion (a fade, a tint) is read off that motion's own progress, so it lands with it, never a fade of its own
after it ends. The `smooth-motion` skill holds the rule.

The smoothness stays: layers for moving text, whole-pixel edges, no hops, a held clock to film every motion.

**Before you add or change anything that moves, fades, wipes or scrolls, load the `smooth-motion` skill**
(`.claude/skills/smooth-motion/`): how a motion is built here, how to film it frame by frame on a held clock
(`scripts/probe.mjs`, with recipes for the site's motions), and the cases behind each rule below.

- **Quick off the mark, a long soft landing** (power3.out). It lands slower and slower to the very end, so it never
  seems to stop at once. (Before, the rule here was "from a standstill": the owner found that flat.) The zoom's step: `stepEase`,
  `cubic-bezier(0.3, 0, 0.2, 1)` over 1 s (the picture leaving) and 1.1 s (the one arriving, on a 0.1 s cue).
  Its first frames and top speed match the panel wipes'; only the landing is longer: 300 ms before the end,
  under 5% of the way is left, and the last frames creep. The curve it replaced, `(0.38, 0, 0.5, 1)` over
  0.8 s, braked hard over its last 200 ms and read as "suddenly stopped".
- **Nothing outside the flow.** When a motion ends, no pixel lingers, pops in or out, or moves on its own.
  Whatever moves together shares one clock and one easing (the step's wipe and drift), and nothing shows past
  where the motion puts it. The step's clip stops exactly at the frame's edges; letting one more pixel through
  left a 1-px strip of the old picture for 0.2 s after its wipe had ended.
- **Smooth between pixels.** A picture moving slowly is never snapped to whole pixels (it stands still, then
  hops). Only edges in view are snapped (the cursor's rule, below). So the picture glides inside a still
  frame, and only the frame's cut edge is snapped.
- **The same look from start to stop.** Never switch a layer on or off around a motion (`will-change`, or
  GSAP's default `force3D: "auto"`). On a layer the browser draws a picture a little differently, so the
  switch shows as the motion starts and as it stops.
- **Moving text has a layer of its own, for good** (`css/anim.css`: the text that rises in, the triangles, the
  curtain's name, the works' captions). Drawn in place, letters are set on whole pixels: a slow rise stood still,
  then hopped (measured: 17 stills and 12 hops in a heading's rise at 1x; at 2x a device pixel at a time), and as
  the motion let go the letters were set afresh, a last hop. On its layer the same rise glides, exactly, at 1x and
  2x. Shapes that move and rest crisp rest on whole pixels (`round()`, `css/style.css`), so nothing moves as the
  motion lets go of them. Pictures still never get a layer at rest.
- **The smooth scroll follows; it never restarts** (`js/glide.js`). Following the wheel, the trackpad, the keys or a
  fling, the page is an exact overdamped spring (6 ms and 159 ms, the second the old easing's own): a new notch
  bends the speed. The first is under a frame, on purpose: the page takes hold of a notch at once, the old scroll's
  sticky grip, which the owner wants kept (at 35 ms the page floated, and the hamburger riding with it lost its stick).
  A touch screen scrolls natively (no `syncTouch`): driven by the script, a phone lost its pull-to-refresh and
  stuck a little below the top. Native touch scrolling runs a frame ahead of anything the script moves, so while
  the hamburger rides with the page on the grey squares (menu closed, not chasing), its bars step aside
  (`.menu-btn.on-page`, `js/menu.js`) and the page's own squares, the same shape beneath it, show instead. Lenis's own way
  started every notch afresh at full speed: 10% of a notch on the first frame, a kick per notch. A scroll sent
  somewhere (`scrollTo(x, { duration })`) runs on stepEase from the speed it had; the works' row let go mid-drag
  carries on at the hand's speed (`lenis.__fling`).
- **A heading's box reaches 0.1em left of its letters** (`.h`, `css/style.css`): a heading rises on a layer of its
  own, Safari trims a layer to its box, and the A's overhanging foot was cut off.
- **What moves while the page loads moves on the compositor.** The name on the curtain sets off as the page is
  at its busiest, and stalled mid-rise. It also changed face part-way up: its font, not yet loaded, swapped in.
  So it waits for its face (preloaded in each page's head) and rises as a CSS animation of its own layer
  (`js/wipe.js` `rise()`, `.pl-name.rise`), which no long frame on the page can hold up. Measured as drawn, with
  the CPU slowed 4×, it follows stepEase exactly. The outline check's `stepTo()` steps held CSS animations too.
- **Nothing heavy while anything moves.** Prepare before (decode, draw at size: `warm()`) and tidy after
  (`settle()`). A long frame mid-motion is a visible jump.
- **Never jaggy, and checked by machine.** Every motion is on `stepEase` (CSS: `cubic-bezier(.215,.61,.355,1)`; a scroll
  sent somewhere: `easing: stepEase`), one clock and one easing for whatever moves together: no other curve (most
  start at speed, a jump on the first frame), no tween without a curve (GSAP's default `power1.out` starts at speed),
  no overshoot (`back`, `elastic`, `bounce`) or `steps`, and a cascade (parts setting off in turn) only of parts on
  stepEase, each setting off from a standstill. Keep each motion's pace: never make one slower than it was.
  `tests/motion-audit.mjs` reads every motion from the code and fails on any that isn't; its `REVIEWED` holds only
  the hamburger's own colour fades and its catch's two old clocks. Never add a motion to that list to get it past
  the audit: give it the curve.
- **Measured, not guessed.** Film the drawn pixels frame by frame on a held clock (the skill's `scripts/probe.mjs`):
  per-frame steps (no stills, hops or reversals; a small first step; the landing's last frames creep), frame
  times while moving (about 20 ms or less at 1x), and the pixels around every edge as the motion ends.
  Never judge from layout numbers: they hid the snapping. The sandbox has no GPU: at 2x its compositor alone
  takes about 25 ms a frame, so judge 2x timings on a real machine. Playwright's emulated 2x snaps pictures to
  whole CSS pixels, which a real screen doesn't: for a true 2x launch with `--force-device-scale-factor=2` and give
  the page no viewport of its own (`viewport: null`; with one, it draws at 1x inside the 2x window).

## The inverse cursor, and the one rule that keeps it clean

The cursor's square (`js/cursor.js`, `css/anim.css` "custom cursor") shows every colour beneath it as
|colour − #DCCBC3| (`mix-blend-mode: difference`), like Maison Auge's site. Where a soft, anti-aliased edge
mixes two colours that lie on opposite sides of #DCCBC3, and that mix happens *before* the square inverts it,
the mix passes through #DCCBC3 and the square turns it black: **a dark outline**.

How the site avoids it:

- Two **under-squares** (`.cursor-fold`, z-index 1) follow the cursor beneath the page content and mirror what
  is under them (the paper, the grey bands) about #DCCBC3. So anything painted above them must be **darker
  than #DCCBC3 (220, 203, 195) in every channel wherever it has a soft edge** (text, diagonals, rounded
  corners, anything transformed or on a half pixel). The site's ink #434343 and grey #b3b1b1 are; the grey
  #ccc9c9 rises 6 over in blue, too little to show (a fold is never deeper than its colour rises above #DCCBC3,
  and the check counts from 12 levels).
- The same goes for panels and tools that float above the page — the `?shader` test panel is ink with light
  text under #DCCBC3 for that reason; a white panel with dark text folds round every letter.
- Anything above them that breaks the rule carries its own mirror:
  - the menu's white labels: a mirror-colour copy shown only inside the square (`js/cursor.js`, `.menu-nav a::after`);
  - the white sheet (preloader / page change): its own pair of under-squares, the sheet moved in whole device
    pixels (`js/wipe.js`, the `SHEET` modifiers — use them for any tween of `#preloader`);
  - the zoom's grey (fading in over the page): a mirror-colour patch under the square (`.zoom-bg .cursor-fold`).
- Light colours above them (white, the band grey #f2f1ef, the red #f20000, #d1d1d1, a picture's edge) need
  **crisp edges**: on whole device pixels, no half-pixel transforms. Examples: the "+" is sized in device pixels
  and placed by layout, never by a transform (`crispPlus()` in `js/zoom.js`); the zoom picture is placed on
  device pixels (`fit()`).
- **Moving edges too**: every wipe's moving edge is snapped to a device pixel (`wipeClip()` in `js/anim.js`,
  `js/illustration.js` and `js/zoom.js`; never a percentage `inset()`), and a picture sliding with its edges in
  view uses the `slideX()` modifiers (the zoom's nudge at either end of the row). A picture moving slowly *inside*
  a still frame is never snapped, though: snapped, it stands still, then hops (the zoom's step drifted like that).
  So in the zoom's step the wipe cuts the picture's still frame, and the picture glides inside it between pixels,
  drawn in place (no layer, below), the wipe hiding its edges (same clock, same easing). And nothing heavy happens
  while anything moves: what a step needs is done before (the next picture drawn at its size, too faint to see,
  while the one before rests: `warm()` — a picture's first drawing at a new size decodes it, and `img.decode()`
  doesn't help: the browser keeps what that decodes apart from what it draws with), the rest after (the page
  following, the large file swapped in: `upgrade()`) — a long frame mid-motion is a visible jump.
- **No layer of its own for a picture at rest** (`will-change`, or a 3D transform): the browser draws a layer at its
  exact, fractional place, resamples a picture on it a little differently, and a layer that has been scaled can stay
  drawn at not quite its size once still — its edges soft (measured in the zoom: a soft bottom edge at 1x and 2x),
  and a bright photo's soft edge folds. Drawn in place, a photo rests and wipes in on whole device pixels (the front
  page's photos are pre-decoded instead, `js/anim.js`; measured, no less smooth). The zoom's frame takes a layer
  only while it flies in or back (`.flies`); a picture moving in 2D is tweened with `force3D: false` (GSAP's default
  puts anything it moves on a layer of its own for the motion, and the switch shows as it starts and stops).
- **Every 「 mark in whole pixels** (the photos' corner marks, `.fr > i`; the bracketed words, `.bx`): its
  size and line are `round()`ed to whole pixels. The browser snaps each edge of a box to the pixel grid, so a mark
  8.58px square drew one arm 9px and the other 8 (18 and 16 at 2x), uneven from mark to mark; whole, both arms are
  exactly its size wherever it sits.
- Focus rings too: the browser's own ring has a white halo and round corners, so the site draws its own plain,
  square ring for every keyboard focus (`:focus-visible` in `css/style.css`: ink; the menu button and labels in
  `css/anim.css`; a work, red and unmoved, in `css/illustration.css`; a front-page photo (just inside it, where
  the page's edge can't cut it off) and the zoom's buttons, in `css/zoom.css` — those sit in the zoom's top
  margin, never over the picture or its edge).
- Text smoothing too: over an opaque layer (a fixed panel with its own background) the browser may smooth
  letters in colour (subpixel), and those coloured edges fold. Give such text a layer of its own (the zoom's
  buttons: `.zoom-ui{will-change:transform}`), as all the page's text has (`html.cursor-live .stage`).
- Not fixable, and accepted: detail *inside* photos and artworks (the same happens on Maison Auge's site),
  highlighted (selected) text — the browser paints a selection in one go; only other highlight colours would
  avoid it — the zoom picture's edges during its 0.9 s flight in and out (it is scaling; its edges are
  rarely under the cursor), and the hamburger's soft bar edges right next to bright parts of a real picture
  beneath it (deep bars on a bright patch straddle #DCCBC3; the old grey bars did too).

## The hamburger over the BACK GROUND picture

`js/menu-shade.js` (front page only): while the hamburger is over the picture marked `data-menu-shade` (the BACK
GROUND holder: a grey box until the owner gives it a photo in the console, which is then picked up),
the bars take colours from the picture beneath them through Chinese colour harmony: seven variations
(`VARIATIONS`: 阴阳, 相生, 相克, 间色, 墨分五色, 紫气, 青花). **The owner chose 墨分五色, five tones of ink**
(`DEFAULT`): every visitor gets it, and the cursor stays Maison's inverse. Only inline `background-image`s on the
bars, the panel's `background-color` and two `--nav-hover` variables are set, and cleared off the picture.
When the zoom's grey covers the page, the tint mixes into the bars' own grey as far as the grey covers, so it
fades with it, never all at once.
Bar colours are capped at #DCCBC3 per channel (the rule above). `index.html?shader` opens a test panel: point
at a variation to try it on the hamburger, click to keep it (or keys 0–7); P tries a real painting in the
picture's place. A choice there holds only while testing (that visit); the panel's ✕ ends the test and puts the
hamburger and the cursor back as every visitor sees them.

While testing (the rest of that visit, on the works' page too), **the cursor's square is a harmony lens**: it
recolours what is beneath it through the variation shown, as the bars would take each colour. In Chromium
browsers it is an SVG `backdrop-filter`: the variation read at the colour cube's eight corners, tetrahedral
interpolation in between (`lensFilter()`). Safari and Firefox can't use SVG backdrop filters, so there four
blended squares (`.cursor-tone`) make the harmony's two-colour tone, exact on the paper, text and greys; 阴阳
uses CSS filters. The panel's "Cursor" row switches back to Maison's inverse; visitors only ever get Maison's.
A lens works on finished pixels, so nothing folds under it, from any colour to any grey it is a straight line,
and the under-squares rest (hidden). The one catch is letters smoothed *in colour* (subpixel, on an opaque
fixed panel): the lens splits their coloured fringes. So such text gets a layer of its own (`.shade-lab .in`,
`.zoom-ui`).

## Check it

Three layers, so an outline can't ship again — and the console's own check rides in the second:

1. **The motion audit**, `tests/motion-audit.mjs` (a second; "The flow of motion", above): every GSAP tween, cascade,
   CSS transition / animation and smooth-scroll curve in the cursor pages' code is on `stepEase` or in its `REVIEWED`
   list, used exactly as often as listed. Its result decides the stamp, as the others do.
   **The colour audit**, `tests/colour-audit.mjs` (a second). It reads every colour the cursor pages paint
   (their HTML, CSS and scripts, custom properties followed) and fails on any colour 12 or more levels lighter
   than #DCCBC3 in some channel that is not in its `REVIEWED` list, or used more or less often than listed —
   whatever state would show it. A new light colour needs one of the three remedies above, its reason written in
   `REVIEWED`, and a state in the pixel check that shows the reason true. It also fails when the pixel check
   misses a page with the cursor, or a `?switch` the scripts read. It can't see colours scripts compute (the
   hamburger's): cap those where they are made, and check their states.
2. **The pixel check**, `tests/fold-check.mjs` (about 4 minutes on 4 cores; it runs the audit first). It shows
   every state twice (plain, and with the square stretched over the whole window: the `window.__cursorProbe` hook
   in `js/cursor.js`, only there under automation) and fails on any outline pixel that isn't inside a picture or a
   known limit. The states come in flows, at the bottom of the file: `site` (the whole site in one visit, the
   page changes both ways and the browser's Back, and the plain arrow hidden through each: the next page came
   into the same window, and its head hid the arrow before `js/cursor.js` ran — the init scripts don't run again
   in a window a page was written into, so `stepping()` listens again after each `document.open()`), `shader`
   (the test panel, and the harmony cursor in every
   variation, both ways it is drawn), `photos` (a photo in every front-page holder, three cropped off-centre, opened in the zoom,
   wiping in and at rest, the longest caption, and the hamburger above the zoom, its tint half-faded with the
   grey and then gone), `focus` (each kind of keyboard focus ring), `narrow` (a phone held upright, 393×852,
   with the owner's photos: every screen of the front page, photos wiping in, the zoom, the caught hamburger and
   its menu, keyboard focus, the page changes, the works' row, contact) and `sideways` (852×393: every screen,
   the menu, the works' captions all on screen, contact). The owner's
   `data/front.json` and `data/illustration.json` are replaced per flow by fixed lists (`FRONT`, `WORKS`), and GitHub is never asked (the pages' own copies are
   used), so the check never depends on what was uploaded or on the network.
   (A picture part-way through a fade counts as picture: the scanner tells picture pixels apart with it opaque.)
   Inside the hamburger's inverse bars the inverse shot is inverted twice. Across a bar's crisp edge a letter
   steps from twice- to once-inverted with no mixed pixel, so the scanner reads no three pixels across a bar's
   edge (`cuts`, `tests/fold-scan.mjs`). Every pixel inside and outside is still tested.
   How it stays fast without testing less: each flow at each pixel ratio is a job, run side by side (as many as
   the machine has cores, `FOLD_JOBS`; the console's check beside them); screenshots are Chromium's own, encoded
   for speed (the same pixels as `page.screenshot()`, checked once per job); the pixel test runs in worker
   threads (`tests/fold-scan.mjs`). And no state is reached by the clock: `quiet()` waits until the page is at
   rest (no GSAP tween or CSS transition under way, the smooth scrolls still, the scrollbar away, the hamburger
   settled, pictures in — GSAP's tweens hurried there, CSS transitions waited out), and `stepTo()` reaches a moment part-way through an animation by stopping GSAP's clock
   (and the CSS ones with it) where it begins — at a page change (`holdNext()`: `kt:leave` / `kt:arrive`), with a
   scroll (`scrollHeld()`) — and moving it on by hand, 8 ms at a time. So a slow or busy machine only makes the
   run longer, never different. Never add a fixed pause to a flow: if `quiet()` misses something that moves,
   teach it (the job then says "not at rest after 25 s — …").
   **The console's check**, `tests/console-check.mjs` (about a minute, on its own or as part of the full run): the
   console end to end in Chromium against a stand-in GitHub API and Pages, in memory, seeded with this checkout's
   site and fixed data — signing in, every front-page edit (photo, description, crop, caption, back to the
   originals), every works edit, saving (one commit; Main moving before and during a Save; edits elsewhere), and
   the pages after each Save, before Pages has published it and after. Change the console, change it too.
3. **The push guard**, a Claude Code hook (`.claude/settings.json` → `.claude/hooks/push-guard.mjs`). A clean
   full run leaves a stamp for exactly the code it checked (`tests/code-stamp.mjs`: the pages, `css/`, `js/`,
   `vendor/`, `tests/`; not `data/` or `assets/`), kept in `.git`. `git push` is stopped unless the code it
   sends matches that stamp or is what `Main` already serves; code written to GitHub by other means (the
   GitHub tools' file writes, pull-request merges) is stopped outright.

```
npm install --no-save playwright-core
node tests/fold-check.mjs            # must end with "No outlines" and "Stamp: …" (about 4 minutes)
node tests/fold-check.mjs shader     # one flow, while working on it (no stamp)
node tests/console-check.mjs         # the console's check alone (or: node tests/fold-check.mjs console)
node tests/colour-audit.mjs          # the audit alone
```

Needs a Chromium: `npx playwright install chromium`, or point at one with
`CHROMIUM=/path/to/chrome` (on a Mac: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`).
`FOLD_SHOTS=some/dir` saves the screenshots of any failing state, with the outline pixels marked in red.

Anything new on screen goes into a flow before it ships: a new page, panel or tool (its own flow if it needs a
`?switch` or its own visit), and its hover, keyboard-focus and over-a-picture states. Never mark a new
outline a known limit to get past the check; known limits are only the ones listed above.
