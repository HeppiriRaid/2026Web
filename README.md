# KOKI TAKAMATSU — Portfolio

A static, pixel‑accurate reproduction of the Illustrator artboard, converted to a website.

## How it's built

- The artboard is **460.807 × 1036.66 pt**. The page is one `.stage` container at that exact
  aspect ratio. Every element is positioned in **artboard points** via the custom property `--k`
  (`1 pt = calc(100cqw / 460.807)`), so the whole design scales proportionally to any width while
  staying faithful to the source.
- Coordinates, font sizes, colours and the copy text were **extracted from the rendered PDF**
  (`Artboard_1_correctone.pdf`) — text spans, image placements and vector rectangles — so positions
  match the source rather than being estimated.
- **Type:** ITC Avant Garde Gothic (Book + Demi, embedded subset extracted from the PDF, with URW
  Gothic as a full‑charset fallback) for display; **Nunito Sans ExtraLight** for body.
- **The portrait and calligraphy photos are the real images from the file.** The Back Ground,
  Graphic Paint and Ressolve Steps panels are **grey placeholder boxes** — that's how they are in
  the source artboard (`#B3B3B3` / `#D1D1D1`). Drop real images in later if you want.

## Animation layer

The motion is **purely additive** — it never changes a single resting position. Every reveal
animates only `opacity`, `transform` and `clip-path`, and on completion the transform/clip are
stripped so each element rasterises **exactly** like the static layout (verified pixel-for-pixel:
the settled page is a 0‑pixel diff against the no‑animation render).

- **Smooth scroll** — [Lenis](https://github.com/darkroomengineering/lenis), wired into GSAP's
  ticker and ScrollTrigger.
- **Preloader** — the `KOKI TAKAMATSU` wordmark wipes up behind a progress bar, then the overlay
  lifts away.
- **Intro** — the first screen cascades in top‑to‑bottom once the preloader clears.
- **Scroll reveals** — below‑fold elements fade/slide and marks pop as they enter view
  ([GSAP](https://gsap.com) + ScrollTrigger, batched by type). Photos wipe in vertically
  (top→down) and the grey panels wipe in sideways (left→right) — the same clip‑path reveal,
  no zoom. A catch‑all reveals the final screen, which sits too low to reach a normal trigger
  line.
- **Custom cursor** — a dot + easing ring on fine‑pointer devices, growing over links.
- **Nav** — `ABOUT / WORK / CONTACT` smooth‑scroll to their sections.

Everything degrades safely: the `.anim` gate is set before paint (no flash), a head‑script
failsafe reveals the static page if the JS never loads, and **`prefers-reduced-motion`** (or
JavaScript disabled) shows the plain static layout with no preloader or cursor.

Libraries are vendored locally in `vendor/` (GSAP 3.12.5, ScrollTrigger, Lenis); the driver is
`js/anim.js` and its styles are `css/anim.css`.

## Run

```bash
python3 -m http.server 8000      # then open http://localhost:8000
```

## Editing

Every element carries its coordinates inline as `--x --y --w --h` (artboard points) and font size
as `--fs`, e.g. `style="--x:239.5;--y:31.8;--fs:18"`. Change those numbers in `index.html` to nudge
anything. Colours, bands and marks live in `css/style.css`.

To replace the grey placeholder panels with images, add an `<img>` inside the relevant
`figure.box` (the same pattern used by the portrait/calligraphy figures).

## Structure

```
index.html      every element, positioned in artboard points
css/style.css   @font-face, the --k coordinate system, type, bands, marks
css/anim.css    pre-hide states (gated by .anim), preloader, cursor, reduced-motion
js/anim.js      Lenis smooth scroll + GSAP/ScrollTrigger reveals + cursor
vendor/         gsap.min.js, ScrollTrigger.min.js, lenis.min.js
assets/fonts/   Avant Garde (display) + Nunito Sans (body)
assets/img/     about-portrait.webp, calligraphy.webp (real, from the file)
```
