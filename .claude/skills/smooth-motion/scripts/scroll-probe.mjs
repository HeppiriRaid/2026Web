/* ============================================================
   The smooth scroll, frame by frame. Lenis runs in real time on GSAP's ticker, so
   holding GSAP's clock doesn't hold it: here its frame loop is driven by hand on a
   synthetic clock (1/60 s a frame), and wheel notches / scrollTo() calls arrive at
   set frames. Prints the page's step each frame for each scenario. Good: a notch
   from a standstill starts with a small step and grows (no jump on the first
   frame), a later notch bends the speed instead of kicking it, a scroll sent
   somewhere starts near zero and lands long and soft.

   node .claude/skills/smooth-motion/scripts/scroll-probe.mjs [page]   (default index.html)
   PROBE_ROOT=<worktree> films an older commit (before / after).
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import http from "node:http";
import { createRequire } from "node:module";

const HERE = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "../../../..");
const ROOT = path.resolve(process.env.PROBE_ROOT || HERE);
const { chromium } = createRequire(path.join(HERE, "package.json"))("playwright-core");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2" };
const srv = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split("?")[0]); if (u.endsWith("/")) u += "index.html";
  const f = path.join(ROOT, u);
  fs.readFile(f, (e, b) => { if (e || !f.startsWith(ROOT)) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); r.end(b); });
});
await new Promise((res) => srv.listen(0, "127.0.0.1", res));
const page = process.argv[2] || "index.html";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
try {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(/github/, (r) => r.abort());
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${srv.address().port}/${page}`);
  await p.waitForTimeout(7000);
  await p.mouse.move(700, 500);
  const ok = await p.evaluate(() => {
    const L = window.__lenis;
    if (!L) return false;
    const raf = L.raf.bind(L); let t = performance.now();
    L.raf = () => {};                                  // (the page's own loop no longer moves it)
    window.__step = () => { t += 1000 / 60; raf(t); };
    window.__wheel = (dy) => window.dispatchEvent(new WheelEvent("wheel", { deltaY: dy, deltaMode: 0, bubbles: true, cancelable: true }));
    return true;
  });
  if (!ok) throw new Error("no window.__lenis on " + page);
  async function film(name, events, frames) {
    await p.evaluate(() => { window.__lenis.scrollTo(400, { immediate: true, force: true }); });
    for (let i = 0; i < 5; i++) await p.evaluate(() => window.__step());
    const v = [];
    for (let f = 0; f < frames; f++) {
      for (const e of events.filter((e) => e.at === f)) await p.evaluate(e.js);
      await p.evaluate(() => window.__step());
      v.push(await p.evaluate(() => window.__lenis.animatedScroll));
    }
    const st = v.map((x, i) => x - (i ? v[i - 1] : 400));
    console.log(`${name}\n   ${st.map((x) => x.toFixed(1)).join(" ")}`);
  }
  const notch = (at, dy = 100) => ({ at, js: `window.__wheel(${dy})` });
  await film("one notch (100 px) from a standstill", [notch(0)], 60);
  await film("six notches 80 ms apart", [0, 5, 10, 15, 20, 25].map((f) => notch(f)), 80);
  await film("sent somewhere: scrollTo(1600, { duration: 1.3 })", [{ at: 0, js: "window.__lenis.scrollTo(1600, { duration: 1.3 })" }], 82);
  await film("a notch, then sent somewhere while still moving", [notch(0), { at: 8, js: "window.__lenis.scrollTo(1600, { duration: 1.3 })" }], 90);
  await film("a notch back against the motion", [notch(0), notch(0), notch(10, -100)], 60);
} finally {
  await b.close(); srv.close();
}
