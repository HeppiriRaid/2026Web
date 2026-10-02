/* ============================================================
   The inverse cursor's "outline" check.
   The cursor's square shows |colour - #DCCBC3| (mix-blend-mode: difference).
   Wherever two colours on opposite sides of #DCCBC3 meet at a soft edge
   (anti-aliased text, a diagonal, a picture's edge) and are mixed BEFORE the
   square inverts them, the mixed edge pixels fold through black: a dark
   outline. (How the site avoids it: css/anim.css, "custom cursor", and
   CLAUDE.md.)

   First the colour audit (tests/colour-audit.mjs): every colour the cursor
   pages paint that could fold has to be on its reviewed list. Then this puts
   every page state on screen twice, held still — plainly, and with the
   cursor's square stretched over the whole window — and flags each pixel
   where the plain page runs smoothly across an edge but the inverse dips
   darker than both sides of it. Pixels inside a picture are counted apart:
   a picture's own soft edges fold the same way on Maison Auge's site; that is
   the effect itself, not this bug.

   The states come in flows (FLOWS, at the bottom): the whole site in one
   visit, the colour test panel (index.html?shader), keyboard focus. Anything
   new on screen — a page, a panel, a ?switch, a test tool — gets its states
   here before it ships. A full run that is clean leaves a stamp for exactly
   this code (tests/code-stamp.mjs); without it the push guard
   (.claude/hooks/push-guard.mjs) stops a `git push`.

   Run (Node 18+ and Chromium), about 12 minutes:
     npm install --no-save playwright-core
     node tests/fold-check.mjs            # exits 1 if any outline is found
     node tests/fold-check.mjs shader     # only the flows named (quicker; no stamp)
   Options (environment): CHROMIUM=/path/to/chromium   PLAYWRIGHT_CORE=/path/to/playwright-core
                          FOLD_SHOTS=dir  (saves both screenshots of every state with an outline)
   ============================================================ */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { audit, report, DIP } from "./colour-audit.mjs";
import { codeHere, writeStamp } from "./code-stamp.mjs";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const ONLY = process.argv.slice(2);
const MIN_PX = 3;    // an outline: at least this many pixels on one element, each DIP (0-255) darker than both sides of its edge
const SHOTS = process.env.FOLD_SHOTS;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

// ---- the colours, read from the code --------------------------------------------------------
const colours = audit(ROOT);
report(colours);
console.log("");
const code = codeHere(ROOT);   // (the stamp is for this code: a file changed during the run, and there is none)
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ? url.pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, "index.mjs")).href : "playwright-core");

// ---- the site, served from this checkout -----------------------------------------
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".otf": "font/otf", ".ttf": "font/ttf" };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const SITE = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

// ---- the pixel test (run in a blank page, on the two screenshots) -----------------
const lab = await (await browser.newContext()).newPage();
// (bare: the same page with its pictures hidden; black: with them painted black — together
// they tell, per pixel, how much of it is a picture's own: 1 = all of it, 0 = none)
function folds(plain, inverse, bare, black) {
  return lab.evaluate(async ([a, b, c0, c1, DIP]) => {
    const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64," + s; });
    const [ia, ib, ic, id] = await Promise.all([load(a), load(b), load(c0), load(c1)]);
    const W = ia.width, H = ia.height, c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d", { willReadFrequently: true });
    const read = (i) => { g.drawImage(i, 0, 0); return g.getImageData(0, 0, W, H).data; };
    const P = read(ia), L = read(ib), B = read(ic), K = read(id);
    const own = (q) => { let m = 0; for (let k = 0; k < 3; k++) if (B[q + k] > 16) m = Math.max(m, (B[q + k] - K[q + k]) / B[q + k]); return m; };
    // across and down only: a blurred edge blurs along both, while diagonals would mistake the
    // corner where three flat colours meet for one
    const out = [], dirs = [[1, 0], [0, 1], [2, 0], [0, 2]];
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      const q = (y * W + x) * 4;
      let worst = 0, wx = 0, wy = 0;
      for (const [dx, dy] of dirs) {
        const s = ((y - dy) * W + x - dx) * 4, e = ((y + dy) * W + x + dx) * 4;
        for (let k = 0; k < 3; k++) {
          const pa = P[s + k], pb = P[e + k], pq = P[q + k];
          if (Math.abs(pa - pb) < 24) continue;                                  // no edge across this pixel
          if (pq < Math.min(pa, pb) - 2 || pq > Math.max(pa, pb) + 2) continue;  // not a smooth edge (a thin line, say)
          const d = Math.min(L[s + k], L[e + k]) - L[q + k];                     // the inverse dips below both sides
          if (d > worst) { worst = d; wx = dx; wy = dy; }
        }
      }
      if (worst >= DIP) out.push([x, y, worst, wx, wy, Math.round(own(q) * 100) / 100]);   // (the edge it lies across; how much is picture)
    }
    return out;
  }, [plain, inverse, bare, black].map((x) => x.toString("base64")).concat(DIP));
}

// the plain shot, faded, with each outline pixel in red (ours), blue (inside a picture) or amber (a known limit)
async function marks(plain, px, kinds) {
  const url = await lab.evaluate(async ([a, px, kinds]) => {
    const i = new Image();
    await new Promise((r) => { i.onload = r; i.src = "data:image/png;base64," + a; });
    const c = document.createElement("canvas"); c.width = i.width; c.height = i.height;
    const g = c.getContext("2d");
    g.globalAlpha = 0.35; g.drawImage(i, 0, 0); g.globalAlpha = 1;
    px.forEach(([x, y], k) => { g.fillStyle = ["#ff0000", "#ff0000", "#0050ff", "#ffb000"][kinds[k]]; g.fillRect(x - 1, y - 1, 3, 3); });
    return c.toDataURL("image/png");
  }, [plain.toString("base64"), px, kinds]);
  return Buffer.from(url.split(",")[1], "base64");
}

// ---- one state: hold everything still, shoot it plain and inverted, name the culprits --
const results = [];
async function check(p, state, dpr) {
  await p.evaluate(() => {
    window.__held = document.getAnimations().filter((a) => a.playState === "running");
    window.__held.forEach((a) => a.pause());                     // CSS transitions / animations
    if (window.gsap) window.gsap.globalTimeline.pause();          // GSAP tweens
    if (window.__lenis) window.__lenis.stop();
  });
  const dot = await p.addStyleTag({ content: ".cursor-dot{visibility:hidden!important}" });
  const S = await p.evaluate(() => Math.max(innerWidth, innerHeight) + 4);
  await p.evaluate(() => { window.__cursorProbe(0, 0, 0); });
  await p.waitForTimeout(100);
  const plain = await p.screenshot();
  await p.evaluate((S) => { window.__cursorProbe(-2, -2, S); }, S);  // the square over the whole window
  await p.waitForTimeout(100);
  const inverse = await p.screenshot();
  await p.evaluate(() => { window.__cursorProbe(0, 0, 0); });
  const shoot = async (css) => { const t = await p.addStyleTag({ content: css }); await p.waitForTimeout(100); const b = await p.screenshot(); await t.evaluate((e) => e.remove()); return b; };
  const bare = await shoot("img{opacity:0!important}");
  const black = await shoot("img{filter:brightness(0)!important}");
  await p.evaluate(() => { window.__cursorProbe(null); });
  await dot.evaluate((e) => e.remove());
  const px = await folds(plain, inverse, bare, black);
  // what is on top at each of those pixels (everything made hit-testable for the moment,
  // pictures included; the cursor's own squares excluded)
  const probe = await p.addStyleTag({ content: "*{pointer-events:auto!important}.cursor-lens,.cursor-dot,.cursor-fold,.cursor-tone{pointer-events:none!important}" });
  const { who, kinds } = await p.evaluate(([px, dpr]) => {
    const by = {}, kinds = [], at = (x, y) => document.elementFromPoint((x + 0.5) / dpr, (y + 0.5) / dpr);
    for (const [x, y, d, dx, dy, own] of px) {
      const el = at(x, y), cx = Math.round(x / dpr), cy = Math.round(y / dpr);
      // a pixel that is wholly a picture's own is the picture's detail, inverted (the effect
      // itself); anything else — a picture's blurred border, or anything over or beside it —
      // is ours, unless the page marks it a known limit (data-fold-known)
      let kind = own >= 0.97 ? "picture" : "ui";
      // (by what is under the pixel, or by place: something see-through can lie on top of it)
      const known = (el && el.closest && el.closest("[data-fold-known]")) || [...document.querySelectorAll("[data-fold-known]")].find((k) => {
        const r = k.getBoundingClientRect();
        return cx >= r.left - 2 && cx <= r.right + 2 && cy >= r.top - 2 && cy <= r.bottom + 2;
      });
      if (kind === "ui" && known) kind = "known";
      kinds.push(kind === "ui" ? 1 : kind === "picture" ? 2 : 3);
      const e = el;
      if (!e) continue;
      let key = e.tagName.toLowerCase() + (typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\s+/).join(".") : "");
      const t = (e.textContent || "").replace(/\s+/g, " ").trim();
      if (t && !e.children.length) key += ` "${t.slice(0, 24)}"`;
      if (kind === "known") key += ` (${known.getAttribute("data-fold-known")})`;
      key = kind + ":" + key;
      const b = by[key] || (by[key] = { key, kind, n: 0, max: 0, at: [cx, cy] });
      b.n++; if (d > b.max) b.max = d;
    }
    return { who: Object.values(by), kinds };
  }, [px, dpr]);
  await probe.evaluate((e) => e.remove());
  const bad = who.filter((w) => w.kind === "ui" && w.n >= MIN_PX);
  const inPictures = who.filter((w) => w.kind === "picture").reduce((s, w) => s + w.n, 0);
  const known = who.filter((w) => w.kind === "known");
  results.push({ state: `${state} @${dpr}x`, bad, inPictures, known });
  console.log(`  ${bad.length ? "OUTLINE" : "clean  "}  ${state} @${dpr}x` + (inPictures ? `   (inside pictures: ${inPictures} px)` : "") +
    (known.length ? `   (known limit: ${known.reduce((s, w) => s + w.n, 0)} px)` : ""));
  if (bad.length && SHOTS) {
    const f = `${state} ${dpr}x`.replace(/[^a-z0-9]+/gi, "-");
    fs.writeFileSync(path.join(SHOTS, f + "-plain.png"), plain);
    fs.writeFileSync(path.join(SHOTS, f + "-inverse.png"), inverse);
    fs.writeFileSync(path.join(SHOTS, f + "-marks.png"), await marks(plain, px, kinds));
  }
  await p.evaluate(() => {
    (window.__held || []).forEach((a) => { try { a.play(); } catch (e) {} });
    if (window.gsap) window.gsap.globalTimeline.resume();
    if (window.__lenis) window.__lenis.start();
  });
}

// ---- getting the pages into each state ----------------------------------------------------
const settled = (p) => p.waitForFunction(() => { const e = document.getElementById("preloader"); return e && getComputedStyle(e).display === "none"; }, null, { timeout: 30000 });
// the middle of the i-th match whose middle is on screen
async function center(p, sel, i = 0) {
  return p.evaluate(([sel, i]) => {
    const mid = (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; };
    return [...document.querySelectorAll(sel)].map(mid).filter((m) => m.w && m.x > 0 && m.x < innerWidth && m.y > 0 && m.y < innerHeight)[i] || null;
  }, [sel, i]);
}
async function hover(p, sel, i = 0) {
  const r = await center(p, sel, i);
  if (!r) throw new Error("nothing on screen matches " + sel);
  await p.mouse.move(r.x, r.y, { steps: 4 });
  await p.waitForTimeout(900);
  return r;
}
async function click(p, sel, i = 0) { await hover(p, sel, i); await p.mouse.down(); await p.mouse.up(); }
async function menuLink(p, text) {
  return p.evaluate((t) => { const a = [...document.querySelectorAll("#menuNav a")].find((a) => a.textContent.trim() === t), r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, text);
}
// a state the check needs, reached (or the run stops here: a skipped state would pass for the wrong reason)
async function expect(p, fn, arg, what) {
  try { await p.waitForFunction(fn, arg, { timeout: 8000 }); }
  catch (e) { throw new Error("could not reach the state: " + what); }
}
// Tab (as a keyboard visitor does) until something matching `sel` has the keyboard's focus ring
async function tabTo(p, sel) {
  for (let i = 0; i < 80; i++) {
    if (await p.evaluate((sel) => { const a = document.activeElement; return !!a && a.matches(sel) && a.matches(":focus-visible"); }, sel)) {
      await p.waitForTimeout(700);
      return;
    }
    await p.keyboard.press("Tab");
  }
  throw new Error("could not reach the state: keyboard focus on " + sel);
}
// hold everything still once something matching `sel` is half-way through wiping in
function wipeAt(p, sel) {
  return p.waitForFunction((sel) => {
    const mid = [...document.querySelectorAll(sel)].some((e) => {
      const m = /inset\(([^)]*)\)/.exec(e.style.clipPath || "");
      if (!m) return false;
      const v = m[1].trim().split(/\s+/), side = [v[0], v[1] || v[0], v[2] || v[0], v[3] || v[1] || v[0]];
      return side.some((x, k) => {                    // how far in that side is cut, as a share of the box
        const f = /%$/.test(x) ? parseFloat(x) / 100 : parseFloat(x) / (k % 2 ? e.offsetWidth : e.offsetHeight);
        return f > 0.3 && f < 0.7;
      });
    });
    if (mid) { window.gsap.globalTimeline.pause(); return true; }
    return false;
  }, sel, { polling: "raf", timeout: 20000 });
}
// hold the white sheet (and everything else) still once it is part-way across the screen
function sheetAt(p, from, to) {
  return p.waitForFunction(([from, to]) => {
    const e = document.getElementById("preloader");
    if (!window.gsap || !e || getComputedStyle(e).display === "none") return false;
    const y = window.gsap.getProperty(e, "yPercent");
    if (y > Math.min(from, to) && y < Math.max(from, to)) { window.gsap.globalTimeline.pause(); return true; }
    return false;
  }, [from, to], { polling: "raf", timeout: 20000 });
}

// ---- the states ---------------------------------------------------------------------------
const FLOWS = {
  // the whole site in one visit: arriving, scrolling, the hamburger's colours, the menu, the
  // page changes both ways, the illustration page and its zoom
  async site(p, dpr) {
    // -- the front page: a first visit, while the name is up
    await p.goto(SITE + "/index.html");
    await p.waitForFunction(() => {
      const n = document.querySelector(".pl-name"), t = n && getComputedStyle(n).transform;
      return !!t && (t === "none" || Math.abs(new DOMMatrix(t).m42) < 0.5);
    }, null, { polling: "raf", timeout: 15000 });
    await p.evaluate(() => { window.gsap.globalTimeline.pause(); });
    await check(p, "front page: first visit, the name", dpr);
    await settled(p);
    await p.waitForTimeout(2600);

    // -- the front page, top to bottom
    const H = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    for (let y = 0; ; y = Math.min(H, y + 700)) {
      await p.evaluate((y) => { window.__lenis.scrollTo(y, { immediate: true, force: true }); }, y);
      await p.waitForTimeout(2600);
      await check(p, `front page: scrolled to ${y}px`, dpr);
      if (y >= H) break;
    }

    // -- text selected. A KNOWN LIMIT, reported but not failed: the browser paints the
    // highlight and the letters on it in one go, on both sides of #DCCBC3, and nothing can
    // mirror a text selection; only other highlight colours would avoid it.
    await p.evaluate(() => { window.__lenis.scrollTo(0, { immediate: true, force: true }); });
    await p.waitForTimeout(1200);
    await p.evaluate(() => {
      const t = [...document.querySelectorAll("p")].find((e) => { const r = e.getBoundingClientRect(); return r.top > 0 && r.bottom < innerHeight && e.textContent.trim().length > 40; });
      if (!t) return;
      t.setAttribute("data-fold-known", "selected text");
      const r = document.createRange(); r.selectNodeContents(t);
      getSelection().removeAllRanges(); getSelection().addRange(r);
    });
    await expect(p, () => String(getSelection()).length > 40, null, "some text selected");
    await check(p, "front page: text selected", dpr);
    await p.evaluate(() => { getSelection().removeAllRanges(); document.querySelector("[data-fold-known]").removeAttribute("data-fold-known"); });

    // -- the hamburger over the BACK GROUND picture, in each of its colour variations
    // (js/menu-shade.js): the bars alone, then the menu open over it with a label under the pointer
    const shades = await p.evaluate(() => (window.__menuShade ? window.__menuShade.names : []));
    if (shades.length) {
      const was = await p.evaluate(() => window.__menuShade.get());
      const yPic = await p.evaluate(() => Math.round(document.querySelector("[data-menu-shade]").getBoundingClientRect().top + scrollY - 6));
      const coloured = () => [...document.getElementById("menuBtn").children].some((s) => s.style.backgroundImage);
      for (let m = 1; m < shades.length; m++) {
        await p.evaluate((m) => { window.__menuShade.set(m); }, m);
        await p.evaluate((y) => { window.__lenis.scrollTo(y, { immediate: true, force: true }); }, yPic);
        await p.waitForTimeout(m === 1 ? 2200 : 700);   // (the first time, the hamburger catches the corner)
        await expect(p, coloured, null, `the hamburger coloured over the picture (${shades[m]})`);
        await check(p, `front page: hamburger over the picture, ${shades[m]}`, dpr);
        await click(p, "#menuBtn");
        await expect(p, () => document.getElementById("menuNav").classList.contains("open"), null, "the menu open");
        await p.waitForTimeout(1600);
        const lw = await menuLink(p, "WORK");
        await p.mouse.move(lw.x, lw.y, { steps: 4 });
        await expect(p, () => !!document.querySelector("#menuNav a:hover"), null, "the pointer on a menu label");
        await p.waitForTimeout(900);
        await check(p, `front page: menu open over the picture, pointer on WORK, ${shades[m]}`, dpr);
        await p.keyboard.press("Escape");
        await expect(p, () => !document.getElementById("menuNav").classList.contains("open"), null, "the menu closed");
        await p.mouse.move(700, 500);
        await p.waitForTimeout(1300);
      }
      await p.evaluate((was) => { window.__menuShade.set(was); }, was);
      // A KNOWN LIMIT, reported but not failed: over a real painting, a deep bar's soft edge
      // next to a bright part of the painting straddles #DCCBC3 (as today's grey bars would).
      // (A real work stands in for the picture here, as the test panel's preview does.)
      const src = await p.evaluate(async () => { const d = await (await fetch("data/illustration.json")).json(); const w = (d.works || []).find((w) => w.image); return w ? w.image : null; });
      if (src) {
        await p.evaluate((src) => new Promise((res) => {
          const im = new Image(); im.alt = ""; im.id = "fold-check-picture"; im.onload = res; im.onerror = res; im.src = src;
          document.querySelector("[data-menu-shade]").appendChild(im);
          document.getElementById("menuBtn").setAttribute("data-fold-known", "the hamburger over a painting");
        }), src);
        await p.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
        await p.waitForTimeout(1500);                        // (and the scrollbar's thumb fades)
        await check(p, "front page: hamburger over a painting in the picture's place", dpr);
        await p.evaluate(() => { document.getElementById("fold-check-picture").remove(); document.getElementById("menuBtn").removeAttribute("data-fold-known"); });
      }
    }

    // -- the menu, open, and a label under the pointer
    await p.evaluate(() => { window.__lenis.scrollTo(900, { immediate: true, force: true }); });
    await p.waitForTimeout(1500);
    await click(p, "#menuBtn");
    await expect(p, () => document.getElementById("menuNav").classList.contains("open"), null, "the menu open");
    await p.waitForTimeout(1600);
    await check(p, "front page: menu open", dpr);
    const work = await menuLink(p, "WORK");
    await p.mouse.move(work.x, work.y, { steps: 4 });
    await expect(p, () => !!document.querySelector("#menuNav a:hover"), null, "the pointer on a menu label");
    await p.waitForTimeout(900);
    await check(p, "front page: menu open, pointer on WORK", dpr);

    // -- leaving: the sheet half-way up over the page
    const il = await menuLink(p, "ILLUSTRATION");
    await p.mouse.move(il.x, il.y, { steps: 2 });
    await p.mouse.down(); await p.mouse.up();
    await sheetAt(p, 60, 30);
    await check(p, "page change: the sheet rising (front page)", dpr);

    // -- arriving at the illustration page: the sheet half-way off, the intro rising in
    await p.waitForURL(/illustration\.html/, { waitUntil: "commit" });
    await sheetAt(p, -35, -70);
    await check(p, "page change: the sheet lifting, the intro rising (illustration)", dpr);
    await wipeAt(p, ".work-btn");
    await check(p, "illustration page: a work wiping in", dpr);
    await settled(p);
    await p.waitForTimeout(2800);

    // -- the illustration page
    await check(p, "illustration page", dpr);
    await hover(p, ".work .plus", 0);
    await expect(p, () => !!document.querySelector(".work .plus:hover"), null, "the pointer on a +");
    await check(p, "illustration page: pointer on a +", dpr);
    for (const k of [3, 6]) {
      await p.keyboard.press("Home"); await p.waitForTimeout(1500);
      for (let i = 0; i < k; i++) { await p.keyboard.press("ArrowRight"); await p.waitForTimeout(60); }
      await p.waitForTimeout(2600);
      await expect(p, (k) => { const w = document.querySelectorAll(".work")[k]; return w && Math.abs(w.getBoundingClientRect().left - parseFloat(getComputedStyle(document.getElementById("track")).paddingLeft)) < 2; }, k, `the row at work ${k + 1}`);
      await check(p, `illustration page: the row at work ${k + 1}`, dpr);
    }
    await click(p, ".work-btn", 0);
    await expect(p, () => document.getElementById("zoom").classList.contains("is-open"), null, "a work zoomed");
    await p.waitForTimeout(2200);
    await check(p, "illustration page: a work zoomed", dpr);
    await p.keyboard.press("Escape");
    await expect(p, () => !document.getElementById("zoom").classList.contains("is-open"), null, "the zoom closed");
    await p.waitForTimeout(1200);
    await click(p, "#menuBtn");
    await expect(p, () => document.getElementById("menuNav").classList.contains("open"), null, "the menu open");
    await p.waitForTimeout(1600);
    await check(p, "illustration page: menu open", dpr);

    // -- back to the front page: arriving there
    const ab = await menuLink(p, "ABOUT");
    await p.mouse.move(ab.x, ab.y, { steps: 2 });
    await p.mouse.down(); await p.mouse.up();
    await p.waitForURL(/index\.html/, { waitUntil: "commit" });
    await sheetAt(p, -35, -70);
    await check(p, "page change: the sheet lifting, the intro rising (front page)", dpr);
    await settled(p);
    await p.waitForTimeout(1500);
    await p.evaluate(() => { window.__lenis.scrollTo(2000, { immediate: true, force: true }); });
    await wipeAt(p, ".ph img");
    await check(p, "front page: a photo wiping in", dpr);
  },

  // the colour test panel (index.html?shader, js/menu-shade.js): a panel above the
  // under-squares, tried with the cursor and the keyboard, over the page and over photos
  async shader(p, dpr) {
    await p.goto(SITE + "/index.html?shader");
    await settled(p);
    await p.waitForTimeout(2600);
    await expect(p, () => { const b = document.querySelector(".shade-lab"); return !!b && b.getBoundingClientRect().height > 100; }, null, "the test panel open");
    // (first with the usual inverting square: the panel lies above its under-squares)
    await p.evaluate(() => { window.__menuShade.cursor("maison"); });
    await expect(p, () => !document.documentElement.classList.contains("cursor-harmony"), null, "the usual square");
    await check(p, "test panel (?shader): open", dpr);
    await hover(p, ".shade-lab li button", 3);
    await expect(p, () => !!document.querySelector(".shade-lab li button:hover"), null, "the pointer on a colour");
    await check(p, "test panel: pointer on a colour", dpr);

    // -- at the picture: a colour tried on the hamburger with the cursor, then kept with a click
    await click(p, ".shade-lab .go");
    await p.waitForTimeout(1600);                                    // (the scroll there)
    await expect(p, () => [...document.getElementById("menuBtn").children].some((s) => s.style.backgroundImage), null, "the hamburger coloured over the picture");
    await check(p, "test panel: the hamburger over the picture", dpr);
    await hover(p, ".shade-lab li button", 5);
    await expect(p, () => window.__menuShade.get() === 5, null, "a colour tried on the hamburger, the pointer on it");
    await check(p, "test panel: a colour tried on the hamburger, the pointer on it", dpr);
    await p.mouse.down(); await p.mouse.up();
    await p.mouse.move(720, 300, { steps: 4 });
    await expect(p, () => window.__menuShade.get() === 5, null, "the colour kept after the click");

    // -- a painting in the picture's place (the hamburger over it is a known limit, as above)
    await expect(p, () => document.querySelectorAll(".shade-lab .pics button").length > 1, null, "the works offered as pictures");
    await click(p, ".shade-lab .pics button", 1);
    await expect(p, () => { const i = document.querySelector("[data-menu-shade] img[data-shade-preview]"); return !!i && i.complete && i.naturalWidth > 0; }, null, "a painting in the picture's place");
    await p.evaluate(() => { document.getElementById("menuBtn").setAttribute("data-fold-known", "the hamburger over a painting"); });
    await p.mouse.move(720, 300, { steps: 4 });
    await p.waitForTimeout(1500);
    await check(p, "test panel: a painting in the picture's place", dpr);
    await click(p, ".shade-lab .pics button", 0);
    await p.evaluate(() => { document.getElementById("menuBtn").removeAttribute("data-fold-known"); });

    // -- keyboard focus in the panel (its own ring, not the browser's)
    await p.focus(".shade-lab li button");
    await p.keyboard.press("Tab");
    await expect(p, () => !!document.querySelector(".shade-lab li button:focus-visible"), null, "keyboard focus on a colour");
    await p.mouse.move(720, 300, { steps: 4 });
    await p.waitForTimeout(700);
    await check(p, "test panel: keyboard focus on a colour", dpr);
    await p.evaluate(() => { document.activeElement.blur(); });

    // -- folded small
    await click(p, ".shade-lab .hd b");
    await expect(p, () => document.querySelector(".shade-lab").classList.contains("small"), null, "the panel folded small");
    await p.mouse.move(720, 300, { steps: 4 });
    await p.waitForTimeout(600);
    await check(p, "test panel: folded small", dpr);
    await click(p, ".shade-lab .hd b");

    // -- over a photo: the panel's edges against a bright picture
    const spots = await p.evaluate(() => {
      const b = document.querySelector(".shade-lab").getBoundingClientRect(), H = document.documentElement.scrollHeight - innerHeight;
      return [...document.querySelectorAll(".stage img")].map((im) => {
        const r = im.getBoundingClientRect();
        if (r.width < 40 || r.left >= b.right || r.right <= b.left) return null;            // never beside the panel
        return Math.max(0, Math.min(H, Math.round(r.top + scrollY + r.height / 2 - b.top)));  // its middle at the panel's top edge
      }).filter((y) => y !== null);
    });
    let overPhoto = 0;
    for (const y of [...new Set(spots)]) {
      await p.evaluate((y) => { window.__lenis.scrollTo(y, { immediate: true, force: true }); }, y);
      await p.mouse.move(720, 300, { steps: 2 });
      await p.waitForTimeout(2600);
      const on = await p.evaluate(() => {
        const b = document.querySelector(".shade-lab").getBoundingClientRect();
        return [...document.querySelectorAll(".stage img")].some((im) => {
          const r = im.getBoundingClientRect();
          return im.complete && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top && !(r.top >= b.top && r.bottom <= b.bottom && r.left >= b.left && r.right <= b.right);
        });
      });
      if (!on) continue;
      await check(p, `test panel over a photo (scrolled to ${y}px)`, dpr);
      if (++overPhoto === 2) break;
    }
    if (!overPhoto) throw new Error("could not reach the state: the test panel over a photo");

    // -- the cursor as a harmony lens (the panel's "Cursor: Harmony"), in every variation: over
    // the top of the page (text, the portrait, the panel), then over a painting in the picture's
    // place; and as Safari and Firefox draw it (four blended squares; 阴阳 by CSS filters)
    const names = await p.evaluate(() => window.__menuShade.names);
    const lensAt = async (m, kind) => {
      await p.evaluate(([m, kind]) => { window.__menuShade.set(m); window.__menuShade.cursor(kind); }, [m, kind]);
      await expect(p, (kind) => document.documentElement.classList.contains("cursor-harmony") &&
        document.documentElement.classList.contains("cursor-tones") === (kind === "fallback" && window.__menuShade.get() !== 1), kind, `the cursor a harmony lens (${kind})`);
    };
    await p.evaluate(() => { window.__lenis.scrollTo(0, { immediate: true, force: true }); });
    await p.mouse.move(720, 300, { steps: 2 });
    await p.waitForTimeout(1500);
    for (let m = 1; m < names.length; m++) {
      await lensAt(m, "harmony");
      await check(p, `harmony cursor, ${names[m]}: the page top`, dpr);
    }
    for (let m = 1; m < names.length; m++) {          // (every variation: each lifts or darkens other channels)
      await lensAt(m, "fallback");
      await check(p, `harmony cursor as Safari / Firefox draw it, ${names[m]}: the page top`, dpr);
    }
    await click(p, ".shade-lab .go");
    await p.waitForTimeout(1600);
    await click(p, ".shade-lab .pics button", 1);
    await expect(p, () => { const i = document.querySelector("[data-menu-shade] img[data-shade-preview]"); return !!i && i.complete && i.naturalWidth > 0; }, null, "a painting in the picture's place");
    await p.evaluate(() => { document.getElementById("menuBtn").setAttribute("data-fold-known", "the hamburger over a painting"); });
    await p.mouse.move(720, 300, { steps: 2 });
    await p.waitForTimeout(1500);
    for (let m = 1; m < names.length; m++) {
      await lensAt(m, "harmony");
      await check(p, `harmony cursor, ${names[m]}: over a painting in the picture's place`, dpr);
    }
    await p.evaluate(() => { document.getElementById("menuBtn").removeAttribute("data-fold-known"); });
    // the menu open under the lens, a label under the pointer
    await click(p, "#menuBtn");
    await expect(p, () => document.getElementById("menuNav").classList.contains("open"), null, "the menu open");
    await p.waitForTimeout(1600);
    const lw = await menuLink(p, "WORK");
    await p.mouse.move(lw.x, lw.y, { steps: 4 });
    await expect(p, () => !!document.querySelector("#menuNav a:hover"), null, "the pointer on a menu label");
    for (const m of [2, 7]) {
      await lensAt(m, "harmony");
      await p.waitForTimeout(600);
      await check(p, `harmony cursor, ${names[m]}: the menu open, pointer on WORK`, dpr);
    }
    await p.keyboard.press("Escape");
    await expect(p, () => !document.getElementById("menuNav").classList.contains("open"), null, "the menu closed");
    await p.mouse.move(720, 300, { steps: 2 });
    await p.waitForTimeout(1300);

    // -- the works' page while testing: the panel, small, with the usual square; then the
    // harmony lens over the works, in every variation
    await p.evaluate(() => { window.__menuShade.cursor("maison"); });
    await p.goto(SITE + "/illustration.html");
    await settled(p);
    await p.waitForTimeout(2800);
    await expect(p, () => !!document.querySelector(".shade-lab.small") && !document.documentElement.classList.contains("cursor-harmony"), null, "the test panel, small, on the works' page");
    await check(p, "test panel on the works' page (the usual square)", dpr);
    for (let m = 1; m < names.length; m++) {
      await lensAt(m, "harmony");
      await check(p, `harmony cursor, ${names[m]}: the works' page`, dpr);
    }

    // -- the test ended (the panel's ✕): the panel gone, the usual square back
    await click(p, ".shade-lab .x");
    await expect(p, () => getComputedStyle(document.querySelector(".shade-lab")).display === "none" &&
      !document.documentElement.classList.contains("cursor-harmony"), null, "the test ended, the usual square back");
    await p.mouse.move(720, 300, { steps: 2 });
    await p.waitForTimeout(600);
    await check(p, "test ended (✕): the usual square back, works' page", dpr);
  },

  // keyboard focus: each kind of focus ring the cursor pages draw (the browser's own has a
  // white halo, which the square folds — so each must be the site's own)
  async focus(p, dpr) {
    await p.goto(SITE + "/index.html");
    await settled(p);
    await p.waitForTimeout(2600);
    await tabTo(p, "#menuBtn");
    await p.keyboard.press("Enter");
    await expect(p, () => document.getElementById("menuNav").classList.contains("open"), null, "the menu open");
    await p.waitForTimeout(1600);
    await tabTo(p, "#menuNav a");
    await check(p, "front page: keyboard focus on a menu label", dpr);
    await p.keyboard.press("Escape");

    await p.goto(SITE + "/illustration.html");
    await settled(p);
    await p.waitForTimeout(2800);
    await tabTo(p, "a.brand");
    await check(p, "illustration page: keyboard focus on a link", dpr);
    await tabTo(p, ".work-btn");
    await check(p, "illustration page: keyboard focus on a work", dpr);
    await p.keyboard.press("Enter");
    await expect(p, () => document.getElementById("zoom").classList.contains("is-open"), null, "a work zoomed from the keyboard");
    await p.waitForTimeout(2200);
    await tabTo(p, ".zoom-ui button");
    await check(p, "illustration page: keyboard focus on a zoom button", dpr);
  },
};

for (const f of ONLY) if (!FLOWS[f]) { console.log(`No flow "${f}" (flows: ${Object.keys(FLOWS).join(", ")}).`); process.exit(2); }
const stopped = [];
for (const dpr of [1, 2]) {
  for (const [name, flow] of Object.entries(FLOWS)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: dpr });
    try { await flow(await ctx.newPage(), dpr); }
    catch (e) { stopped.push(`${name} @${dpr}x: ${e.message.split("\n")[0]}`); console.log(`  STOPPED  ${name} @${dpr}x: ${e.message.split("\n")[0]}`); }
    await ctx.close();
  }
}

await browser.close();
server.close();
const bad = results.filter((r) => r.bad.length);
const pics = results.reduce((s, r) => s + r.inPictures, 0);
if (pics) console.log(`\nInside pictures: ${pics} px over all states — their own soft edges, inverted as on Maison Auge's site (not this bug).`);
for (const r of results) for (const w of r.known) console.log(`Known limit: ${r.state} — ${w.key.slice(6)}: ${w.n} px, up to ${w.max} levels darker`);
if (bad.length) {
  console.log(`\nOUTLINES in ${bad.length} of ${results.length} states:`);
  for (const r of bad) for (const w of r.bad) console.log(`  ${r.state} — ${w.key.slice(3)}: ${w.n} px, up to ${w.max} levels darker (near x ${w.at[0]}, y ${w.at[1]})`);
} else console.log(`\nNo outlines: all ${results.length} states are clean.`);
if (stopped.length) console.log(`\nNOT CHECKED — a flow stopped before its states:\n  ${stopped.join("\n  ")}`);
if (colours.problems.length) console.log(`\nThe colour audit failed (at the top).`);
process.exitCode = bad.length || stopped.length || colours.problems.length ? 1 : 0;
if (ONLY.length) console.log(`(Only ${ONLY.join(", ")}: no stamp — the push guard wants a full run.)`);
else if (!process.exitCode) {
  if (codeHere(ROOT) !== code) console.log("The code changed during the run: no stamp. Run it again.");
  else console.log(`Stamp: this code (${writeStamp(ROOT, results.length).code}) passed; .claude/hooks/push-guard.mjs lets a push of it through.`);
}
