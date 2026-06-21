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
- No animation. This is the layout foundation.

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
assets/fonts/   Avant Garde (display) + Nunito Sans (body)
assets/img/     about-portrait.jpg, calligraphy.jpg (real, from the file)
```
