# KOKI TAKAMATSU — Portfolio

A faithful, animated rebuild of the Illustrator artboard (`Artboard_1.ai`) as a
modern, single-page website — with smooth scrolling and motion inspired by
[minhpham.design](https://minhpham.design/).

The layout, typography, palette, alternating section bands, crop-mark framing and
red accents were reconstructed directly from the source file (artboard geometry +
embedded font list + fill colours were extracted from the `.ai`).

---

## ✨ What's included

**Faithful to the draft**
- Display type set in **URW Gothic** — a metric-compatible clone of the
  *ITC Avant Garde Gothic* used in the original file (Book + Demi).
- Body copy in **Nunito Sans ExtraLight** (the exact family named in the file).
- Palette pulled from the artboard: red `#f0271a`, image grey `#d1d1d1`,
  light band `#f2f1ec`, ink `#1b1b1b`.
- Registration / crop-mark corners, `+` motifs, the red accent square and the
  bracketed `[ Details ]` link style — all rebuilt as live CSS/SVG vectors.

**Smooth modern motion**
- **Lenis** smooth scrolling, synced to **GSAP ScrollTrigger**.
- Intro **preloader** (name reveal + counter + curtain wipe).
- Line-by-line **text reveals**, **clip-path image reveals**, and **parallax**.
- **Custom cursor**, **magnetic** nav/links, hide-on-scroll header, scroll-progress bar.
- A **Three.js** hover effect on images (ripple + RGB-split that follows the cursor) —
  loaded lazily and isolated, so the page is fully functional even if WebGL is off.
- Respects `prefers-reduced-motion` and falls back gracefully on touch devices.

Everything is **vendored locally** (`/vendor`, `/assets/fonts`) — no CDN, no build
step, works offline.

---

## ▶️ Run locally

ES modules require a server (opening `index.html` from `file://` will not work):

```bash
# any static server is fine, e.g.
python3 -m http.server 8000
# then open http://localhost:8000
```

---

## 🖼 Replace the placeholder images  ← do this

The grey boxes are placeholders. Drop your real images into `assets/img/` using
these exact names (any common ratio works — they're cropped with `object-fit:cover`):

| File                            | Where it appears        | Suggested ratio |
|---------------------------------|-------------------------|-----------------|
| `assets/img/about-portrait.jpg` | About me (portrait)     | 3 : 4 (vertical)|
| `assets/img/background.jpg`     | Back Ground             | 16 : 10         |
| `assets/img/work-graphic.jpg`   | Graphic Paint           | 4 : 3           |
| `assets/img/work-resolve.jpg`   | Ressolve Steps          | 4 : 3           |
| `assets/img/calligraphy.jpg`    | Calligraphy (tall)      | ~1 : 1.9        |

> The two photos you shared (the portrait at the brush, and the cursive
> calligraphy scroll) are the intended `about-portrait.jpg` and `calligraphy.jpg`.
> If an image is missing the site shows a clean grey panel instead of a broken
> icon, so it always looks intentional.

## ✍️ Edit the text

- All copy lives in `index.html`. The **About** section is real; the project
  blurbs and contact email (`hello@example.com`) are placeholders — swap them.
- Section labels (`GRAPHIC PAINT`, `RESSOLVE STEPS`, links to *Kickstarter* /
  *Steam*, etc.) match the draft; change freely.

---

## 🚀 Deploy

It's a static site — host the folder anywhere:

- **GitHub Pages**: push, then enable Pages on the branch (a `.nojekyll` file is
  already included so `vendor/` and friends are served as-is).
- **Netlify / Vercel / Cloudflare Pages**: drag-and-drop or connect the repo;
  no build command, publish directory = project root.

---

## 📁 Structure

```
index.html              markup for every section
css/style.css           @font-face, tokens, layout, motifs, responsive
js/main.js              Lenis + GSAP reveals, cursor, header, preloader
js/webgl.js             Three.js hover distortion (lazy, optional)
assets/fonts/           URW Gothic (Avant Garde clone) + Nunito Sans (woff2)
assets/img/             your images (placeholders for now)
vendor/                 gsap, ScrollTrigger, lenis, three (vendored)
```

## 🔤 Fonts & licensing

- **URW Gothic** (AGPL/GPL+font-exception, URW++) stands in for *ITC Avant Garde
  Gothic*, which is commercial. If you own ITC Avant Garde Gothic, drop its webfonts
  in `assets/fonts/` and update the `@font-face` `src` in `css/style.css`.
- **Nunito Sans** — SIL Open Font License.
- **GSAP**, **Lenis**, **Three.js** — their respective standard licenses.
