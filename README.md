# KOKI TAKAMATSU — Portfolio

A static, **1:1 reproduction** of the Illustrator draft (`Artboard_1.ai`) converted to a
website — the layout foundation. No animation; every element is placed by exact artboard
coordinates so it reads as the same design.

## How it's built

- The artboard is **460.807 × 1037.167 pt**. The page is a single `.stage` container with that
  exact aspect ratio. Every element is positioned in **artboard units** via the custom property
  `--k` (`1 unit = calc(100cqw / 460.807)`), so the whole design scales proportionally to any
  width while staying pixel‑faithful to the draft.
- Element coordinates (image boxes, text frames, bands, the red square, registration crop‑marks,
  link underlines) were **extracted directly from the `.ai`** by decompressing Illustrator's
  private art stream. Headings and the two photos (linked, not embedded in the file) are placed
  from the draft reference.
- **Type:** ITC Avant Garde Gothic → bundled **URW Gothic** (a free metric clone, Book + Demi)
  for display; **Nunito Sans ExtraLight** for body — the families named in the file.
- **Palette from the artboard:** red `#f20000`, image grey `#d1d1d1`, light band `#f2f1ef`.

## Run

ES‑module‑free, but still needs a static server for relative paths:

```bash
python3 -m http.server 8000      # then open http://localhost:8000
```

## Replace the placeholder images

Drop your files into `assets/img/` with these exact names (cropped with `object-fit:cover`):

| File | Section |
|------|---------|
| `about-portrait.jpg` | About me (portrait of you at the brush) |
| `background.jpg`     | Back Ground |
| `work-graphic.jpg`   | Graphic Paint |
| `work-resolve.jpg`   | Ressolve Steps |
| `calligraphy.jpg`    | Calligraphy (the cursive scroll) |

## Tuning the layout

All coordinates are inline on each element as `--x --y --w --h` (artboard units) and font sizes
as `--fs`. To nudge anything, edit those numbers in `index.html` — e.g.
`style="--x:238.5;--y:40;--w:160;--fs:17"`. Background bands, marks and colours live in
`css/style.css`.

## Structure

```
index.html      every element, positioned in artboard units
css/style.css   @font-face, the --k coordinate system, type, bands, crop-marks
assets/fonts/   URW Gothic (display) + Nunito Sans (body)
assets/img/     placeholder images to replace
```

> This is the static foundation only — animation was intentionally left out. Motion (smooth
> scroll, reveals, etc.) can be layered on later once the layout is locked.
