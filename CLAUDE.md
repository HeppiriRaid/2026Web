# Koki Takamatsu — portfolio

Static site, no build step: plain HTML / CSS / JS, with GSAP 3.12.5 and Lenis 1.0.42 in `vendor/`.
Live at https://heppiriraid.github.io/2026Web/ — GitHub Pages serves the **`Main`** branch (capital M).

- `index.html` front page · `illustration.html` the row of works + zoom · `console.html` the owner's editor
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
  lift into the band grey; ← → / the wheel / a swipe step between them, the page following underneath. A photo
  its holder shows cropped opens whole, its crop opening out as it lifts (`cropOf()`). `illustration.js` hands
  its works to `window.__zoom()`; the front page's photos are wired in `js/zoom.js` itself. A new zoomable
  photo is one more `button.ph-open` in its holder (and its states in the check).
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
- The owner commits to `Main` too (every console Save). Before pushing: `git fetch origin Main` and rebase onto it.
  Never force-push `Main`.
- Pages caches the code for 10 minutes: after a deploy, check with a hard refresh.
- **Nothing ships without the outline check** ("Check it", below). Anything new on screen — a page, a panel, a
  test or debug tool, a `?switch`, a hover, focus or error state — gets its states in `tests/fold-check.mjs`
  *before* it is pushed. A push hook enforces the run: `git push` is stopped until a full clean run has passed
  for exactly the code being pushed.

## The flow of motion — every new motion follows it

The owner, on the zoom's step to the next picture as it is now: perfect, and the way every motion should move.

- **From a standstill to a standstill.** A motion sets off gently, with no jump on its first frame. It lands long
  and soft, slower and slower to the very end, so it never seems to stop at once. The zoom's step: `stepEase`,
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
- **Nothing heavy while anything moves.** Prepare before (decode, draw at size: `warm()`) and tidy after
  (`settle()`). A long frame mid-motion is a visible jump.
- **Measured, not guessed.** Check per-frame positions (no hops; the landing's last frames creep), frame
  times while moving (about 20 ms or less at 1x), and the pixels around every edge as the motion ends,
  holding GSAP's clock there. The sandbox has no GPU: at 2x its compositor alone takes about 25 ms a frame,
  so judge 2x timings on a real machine. Its emulated 2x also snaps pictures to whole CSS pixels, which a
  real screen doesn't: check edges with a real scale (`--force-device-scale-factor`).

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

1. **The colour audit**, `tests/colour-audit.mjs` (a second). It reads every colour the cursor pages paint
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
   wiping in and at rest, and the longest caption), `focus` (each kind of keyboard focus ring). The owner's
   `data/front.json` is replaced per flow by a fixed list, and GitHub is never asked (the pages' own copies are
   used), so the check never depends on what was uploaded or on the network.
   (A picture part-way through a fade counts as picture: the scanner tells picture pixels apart with it opaque.)
   How it stays fast without testing less: each flow at each pixel ratio is a job, run side by side (as many as
   the machine has cores, `FOLD_JOBS`; the console's check beside them); screenshots are Chromium's own, encoded
   for speed (the same pixels as `page.screenshot()`, checked once per job); the pixel test runs in worker
   threads (`tests/fold-scan.mjs`). And no state is reached by the clock: `quiet()` waits until the page is at
   rest (no GSAP tween or CSS transition under way, the smooth scrolls still, the scrollbar away, the hamburger
   settled, pictures in — GSAP's tweens hurried there, never CSS: the menu's morph is a chain of transitions
   started by timers), and `stepTo()` reaches a moment part-way through an animation by stopping GSAP's clock
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
