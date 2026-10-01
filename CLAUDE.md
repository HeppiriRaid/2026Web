# Koki Takamatsu — portfolio

Static site, no build step: plain HTML / CSS / JS, with GSAP 3.12.5 and Lenis 1.0.42 in `vendor/`.
Live at https://heppiriraid.github.io/2026Web/ — GitHub Pages serves the **`Main`** branch (capital M).

- `index.html` front page · `illustration.html` the row of works + zoom · `console.html` the owner's editor
  (it commits `data/illustration.json` and `assets/img/illustration/` straight to `Main` through the GitHub API).
- The owner commits to `Main` too (every console Save). Before pushing: `git fetch origin Main` and rebase onto it.
  Never force-push `Main`.
- Pages caches for 10 minutes: after a deploy, check with a hard refresh.

## The inverse cursor, and the one rule that keeps it clean

The cursor's square (`js/cursor.js`, `css/anim.css` "custom cursor") shows every colour beneath it as
|colour − #DCCBC3| (`mix-blend-mode: difference`), like Maison Auge's site. Where a soft, anti-aliased edge
mixes two colours that lie on opposite sides of #DCCBC3, and that mix happens *before* the square inverts it,
the mix passes through #DCCBC3 and the square turns it black: **a dark outline**.

How the site avoids it:

- Two **under-squares** (`.cursor-fold`, z-index 1) follow the cursor beneath the page content and mirror what
  is under them (the paper, the grey bands) about #DCCBC3. So anything painted above them must be **darker
  than #DCCBC3 (220, 203, 195) in every channel wherever it has a soft edge** (text, diagonals, rounded
  corners, anything transformed or on a half pixel). The site's ink #434343 and greys #b3b1b1 / #ccc9c9 are.
- Anything above them that breaks the rule carries its own mirror:
  - the menu's white labels: a mirror-colour copy shown only inside the square (`js/cursor.js`, `.menu-nav a::after`);
  - the white sheet (preloader / page change): its own pair of under-squares, the sheet moved in whole device
    pixels (`js/wipe.js`, the `SHEET` modifiers — use them for any tween of `#preloader`);
  - the zoom's grey (fading in over the page): a mirror-colour patch under the square (`.zoom-bg .cursor-fold`).
- Light colours above them (white, the band grey #f2f1ef, the red #f20000, #d1d1d1, a picture's edge) need
  **crisp edges**: on whole device pixels, no half-pixel transforms. Examples: the illustration "+" is sized in
  device pixels (`crispPlus()` in `js/illustration.js`); the zoom picture is placed on device pixels (`fit()`).
- **Moving edges too**: every wipe's moving edge is snapped to a device pixel (`wipeClip()` in `js/anim.js` and
  `js/illustration.js`; never a percentage `inset()`), and pictures sliding sideways use the `slideX()` modifiers.
- Not fixable, and accepted: detail *inside* photos and artworks (the same happens on Maison Auge's site),
  highlighted (selected) text — the browser paints a selection in one go; only other highlight colours would
  avoid it — and the zoom picture's edges during its 0.9 s flight in and out (it is scaling; its edges are
  rarely under the cursor).

## Check it

`tests/fold-check.mjs` shows every page state twice (plain, and with the square stretched over the whole
window: the `window.__cursorProbe` hook in `js/cursor.js`, only there under automation) and fails on any
outline pixel that isn't inside a picture or a known limit. About 10 minutes.

```
npm install --no-save playwright-core
node tests/fold-check.mjs        # must end with "No outlines"
```

Needs a Chromium: `npx playwright install chromium`, or point at one with
`CHROMIUM=/path/to/chrome` (on a Mac: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`).
`FOLD_SHOTS=some/dir` saves the screenshots of any failing state, with the outline pixels marked in red.

Run it after changing colours, z-order, transforms or motion, the menu, the preloader / page change, or the
illustration page. A new page state worth guarding goes into the list at the bottom of the test.
