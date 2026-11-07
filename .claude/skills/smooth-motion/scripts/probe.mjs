/* ============================================================
   The motion probe: a motion as it is DRAWN, frame by frame, on a held clock.
   GSAP's clock and every CSS animation / transition are stopped, the motion is
   started, then moved on by hand 1/60 s at a time; each frame the region is
   screenshot and measured from its pixels (never from layout numbers: those hide
   the snapping). For each measure it prints the steps frame to frame and flags
     · still   — a frame where it stood still between moving frames (snapped),
     · hop     — a frame that jumped more than twice its neighbours,
     · reverse — a step backwards (jiggle),
   and the shape of the motion: the first step against the biggest (a gentle start
   is small), and how much was left for the last 300 ms (a long soft landing).

   node .claude/skills/smooth-motion/scripts/probe.mjs recipe.json [more.json ...]
   A recipe (JSON):
     { "name": "front page: a paragraph rising in",
       "page": "index.html",                 (served from the repo root)
       "viewport": [1440, 900], "dpr": 1,     (dpr 2 is a real 2x: --force-device-scale-factor)
       "wait": 6000,                          (ms after load, for the intro to finish)
       "setup": "js run before the clocks stop (scroll somewhere, open something)",
       "start": "js run with the clocks stopped: starts the motion",
       "clip": ".copy" | [x, y, w, h],        (a selector: its box, + "pad" px, measured after setup)
       "pad": 8 | [left, top, right, bottom], "frames": 70,
       "holdFromLoad": true,                  (GSAP's clock stopped as the page's scripts have run, so
                                               the page's own sequence — curtain, intro — is filmed from
                                               its first frame; "skip" frames are stepped first, unfilmed)
       "hide": "css injected to hide what would confuse the measure",
       "measure": ["y", "x", "rest", "cover", "mass", "read"],
       "read": "js returning a number, read each frame (where pixels can't tell: a sheet the page's own colour)",
       "axis": "y" | "x",                     (cover: the direction a wipe runs; its resolution is a row / column)
       "quantum": { "cover": 0.004 } }        (steps under a measure's resolution don't count as stills)
   Measures: y / x — the ink's centroid (darkness-weighted, sub-pixel, CSS px);
   sy / sx — its spread; mass — how much ink; rest — how far the region still is from
   its last frame (1 → 0); cover — the share of pixels not yet as they end (a wipe's edge).
   Needs playwright-core (npm install --no-save playwright-core) and a Chromium
   (CHROMIUM=/path, default /opt/pw-browsers/chromium).
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import http from "node:http";
import { createRequire } from "node:module";

// (the site served: this checkout, or another — an older commit's worktree, to film the motion as it was:
// PROBE_ROOT=/path/to/worktree)
const HERE = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "../../../..");
const ROOT = path.resolve(process.env.PROBE_ROOT || HERE);
const require = createRequire(path.join(HERE, "package.json"));
const { chromium } = require("playwright-core");
const { decode } = await import(url.pathToFileURL(path.join(HERE, "tests/fold-scan.mjs")).href);

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
function serve() {
  const srv = http.createServer((q, r) => {
    let u = decodeURIComponent(q.url.split("?")[0]);
    if (u.endsWith("/")) u += "index.html";
    const f = path.join(ROOT, u);
    if (!f.startsWith(ROOT)) { r.writeHead(403); r.end(); return; }
    fs.readFile(f, (err, b) => { if (err) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); r.end(b); });
  });
  return new Promise((res) => srv.listen(0, "127.0.0.1", () => res(srv)));
}

// The ink's centroid, measured against the background: each pixel's darkness below the region's own
// paper (the median of its border in the last frame), so a fade alone — every pixel darkening alike —
// doesn't move it, and a pale shape on a pale page is measured as well as black ink.
function lum(d, i) { return (d[i] + d[i + 1] + d[i + 2]) / 3; }
function paperOf(im) {
  const d = im.data, W = im.w, H = im.h, v = [];
  for (let x = 0; x < W; x++) { v.push(lum(d, x * 4), lum(d, ((H - 1) * W + x) * 4)); }
  for (let y = 0; y < H; y++) { v.push(lum(d, y * W * 4), lum(d, (y * W + W - 1) * 4)); }
  v.sort((a, b) => a - b);
  return v[v.length >> 1];
}
function measure(im, dpr, paper) {
  const d = im.data, W = im.w, H = im.h;
  let s = 0, sx = 0, sy = 0, sxx = 0, syy = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = Math.max(0, paper - 1.5 - lum(d, (y * W + x) * 4));
    s += k; sx += k * x; sy += k * y; sxx += k * x * x; syy += k * y * y;
  }
  const mx = s ? sx / s : 0, my = s ? sy / s : 0;
  return { x: mx / dpr, y: my / dpr, sx: s ? Math.sqrt(Math.max(0, sxx / s - mx * mx)) / dpr : 0, sy: s ? Math.sqrt(Math.max(0, syy / s - my * my)) / dpr : 0, mass: s / 1000 };
}
function apart(a, b) {          // how far two frames are apart (sum of channel differences), and how many pixels differ
  let t = 0, n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const e = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    t += e; if (e > 12) n++;
  }
  return { t, n: n / (a.data.length / 4) };
}

export function judge(v, quantum = 0, fps = 60) {
  // (frames where the thing can't be measured — a centroid while nothing is drawn — are left out)
  const at = v.map((x, i) => (x == null ? -1 : i)).filter((i) => i >= 0), w = at.map((i) => v[i]);
  const st = w.slice(1).map((x, i) => x - w[i]), m = st.map(Math.abs), peak = Math.max(...m, 1e-9);
  const moving = m.map((x) => x > 0.01 * peak), first = moving.indexOf(true), last = moving.lastIndexOf(true);
  // steps below the measure's own resolution (an edge kept on whole pixels creeping a row at a time) don't count
  const floor = Math.max(0.02 * peak, 1.5 * quantum);
  let still = 0, hops = 0, back = 0;
  const sign = Math.sign(w[w.length - 1] - w[0]), marks = [];
  for (let i = Math.max(1, first); i < last; i++) {
    const a = m[i - 1], c = m[i + 1], here = m[i], near = Math.max(a, c);
    if (near > floor && here < 0.1 * near) { still++; marks.push("still at step " + i); }
    if (here > floor && here > 2 * near) { hops++; marks.push("hop at step " + i); }
    if (sign && Math.sign(st[i]) === -sign && here > Math.max(0.01 * peak, quantum)) { back++; marks.push("back at step " + i); }
  }
  const total = Math.abs(w[w.length - 1] - w[0]) || 1e-9, endAt = last + 1, k = Math.max(0, endAt - Math.round(0.3 * fps));
  return { steps: st, marks, still, hops, back, firstStep: first >= 0 ? m[first] / peak : 0, left300: Math.abs(w[endAt] - w[k]) / total, frames: endAt - Math.max(0, first) };
}

async function film(browser, R) {
  const dpr = R.dpr || 1;
  // (at 2x a real window of that scale, not Playwright's emulated one: emulated, a picture is set on whole
  // CSS pixels, and a viewport given on a scaled window draws at 1x inside it)
  const ctx = await browser.newContext(dpr === 1 ? { viewport: { width: (R.viewport || [1440, 900])[0], height: (R.viewport || [1440, 900])[1] } } : { viewport: null });
  await ctx.route(/github/, (r) => r.abort());
  if (R.holdFromLoad) await ctx.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => { if (window.gsap) window.gsap.globalTimeline.pause(); for (const a of document.getAnimations()) a.pause(); });
  });
  const p = await ctx.newPage();
  await p.goto(`${R.base}/${R.page || "index.html"}`);
  await p.waitForTimeout(R.wait == null ? 6000 : R.wait);
  await p.mouse.move(2, (R.viewport || [1440, 900])[1] - 2);
  if (R.hide) await p.addStyleTag({ content: R.hide });
  if (R.setup) { await p.evaluate(`(async () => { ${R.setup} })()`); await p.waitForTimeout(R.settle == null ? 1500 : R.settle); }
  const pad = R.pad == null ? [8, 8, 8, 8] : Array.isArray(R.pad) ? R.pad : [R.pad, R.pad, R.pad, R.pad];
  const clip = Array.isArray(R.clip) ? { x: R.clip[0], y: R.clip[1], width: R.clip[2], height: R.clip[3] }
    : await p.evaluate(([s, pad]) => {
      // (its place at rest: a reveal already holds it at its start, moved — that set aside for the measure)
      const el = document.querySelector(s), t = el.style.transform, tr = el.style.translate, sc = el.style.scale;
      el.style.setProperty("transform", "none", "important"); el.style.translate = "none"; el.style.scale = "none";
      const r = el.getBoundingClientRect();
      el.style.removeProperty("transform"); el.style.transform = t; el.style.translate = tr; el.style.scale = sc;
      return { x: Math.max(0, Math.floor(r.left - pad[0])), y: Math.max(0, Math.floor(r.top - pad[1])), width: Math.ceil(r.width + pad[0] + pad[2]), height: Math.ceil(r.height + pad[1] + pad[3]) };
    }, [R.clip, pad]);
  const hold = () => p.evaluate(() => { window.gsap && window.gsap.globalTimeline.pause(); for (const a of document.getAnimations()) a.pause(); });
  const tick = () => p.evaluate(() => { const tl = window.gsap && window.gsap.globalTimeline; if (tl) tl.time(tl.time() + 1 / 60); for (const a of document.getAnimations()) a.currentTime = (a.currentTime || 0) + 1000 / 60; });
  await hold();
  if (R.start) await p.evaluate(`(() => { ${R.start}; })()`);
  for (let f = 0; f < (R.skip || 0); f++) { await tick(); await p.evaluate(() => new Promise((r) => setTimeout(r, 0))); }
  const shots = [];
  for (let f = 0; f <= (R.frames || 70); f++) {
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => { for (const a of document.getAnimations()) if (a.playState === "running") a.pause(); r(); }))));
    const read = R.read ? await p.evaluate(`(() => (${R.read}))()`) : null;
    shots.push({ im: decode(await p.screenshot({ clip })), read });
    await tick();
  }
  await ctx.close();
  const end = shots[shots.length - 1].im, from = apart(shots[0].im, end).t || 1, paper = paperOf(end);
  for (const s of shots) { const r = s.read; Object.assign(s, measure(s.im, dpr, paper)); s.read = r; }
  const most = Math.max(...shots.map((s) => s.mass));
  for (const s of shots) {
    const a = apart(s.im, end); s.rest = a.t / from; s.cover = a.n;
    if (s.mass < 0.05 * most) s.x = s.y = s.sx = s.sy = null;          // (nothing drawn yet: no centroid)
  }
  shots.clip = clip;
  return shots;
}

const fmt = (x) => (Math.abs(x) < 0.005 ? "0" : x.toFixed(2));
export async function run(recipes) {
  const srv = await serve(), base = `http://127.0.0.1:${srv.address().port}`;
  const exe = process.env.CHROMIUM || "/opt/pw-browsers/chromium", out = [];
  const browsers = {};
  try {
    for (const R of recipes) {
      const dpr = R.dpr || 1;
      const vp = R.viewport || [1440, 900];
      // (a headless window's page is 87px shorter than the window)
      browsers[dpr] = browsers[dpr] || await chromium.launch({ executablePath: exe, args: dpr === 1 ? [] : ["--force-device-scale-factor=" + dpr, `--window-size=${vp[0]},${vp[1] + 87}`] });
      const shots = await film(browsers[dpr], Object.assign({ base }, R));
      console.log(`\n== ${R.name || R.page} (${dpr}x)`);
      const res = { name: R.name, dpr, measures: {} };
      for (const k of R.measure || ["y", "rest"]) {
        // a measure's resolution: an edge on whole device pixels moves the cover a row (or column) at a time
        const q = (R.quantum && R.quantum[k] != null) ? R.quantum[k] : k === "cover" ? 1 / ((R.axis === "x" ? shots.clip.width : shots.clip.height) * dpr) : 0;
        const v = shots.map((s) => s[k]), j = judge(v, q);
        res.measures[k] = Object.assign({ values: v }, j);
        const flag = j.still || j.hops || j.back ? "  ✗" : "  ✓";
        const vv = v.filter((x) => x != null);
        console.log(`${flag} ${k.padEnd(5)} ${fmt(vv[0])} → ${fmt(vv[vv.length - 1])}  stills ${j.still}, hops ${j.hops}, reversals ${j.back} · first step ${(100 * j.firstStep).toFixed(0)}% of the biggest · ${(100 * j.left300).toFixed(1)}% left for the last 300 ms · ${j.frames} frames`);
        console.log(`       steps ${j.steps.map(fmt).join(" ")}`);
        if (j.marks.length) console.log(`       (${j.marks.slice(0, 12).join(", ")}${j.marks.length > 12 ? ", …" : ""}; steps counted from 0 among the frames measured)`);
      }
      out.push(res);
    }
  } finally {
    for (const b of Object.values(browsers)) await b.close();
    srv.close();
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) { console.log("node probe.mjs recipe.json [more.json ...]  (see the top of this file)"); process.exit(1); }
  const recipes = files.flatMap((f) => { const j = JSON.parse(fs.readFileSync(f, "utf8")); return Array.isArray(j) ? j : [j]; });
  const res = await run(recipes);
  const bad = res.filter((r) => Object.values(r.measures).some((m) => m.still || m.hops || m.back));
  console.log(bad.length ? `\n${bad.length} of ${res.length} motions stand still, hop or reverse somewhere (✗ above).` : `\nAll ${res.length} motions glide.`);
}
