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
   visit, the colour test panel (index.html?shader), the front page's photos
   as the console sets them, keyboard focus. Anything new on screen — a page,
   a panel, a ?switch, a test tool — gets its states here before it ships.
   Before them, once, the console's own check (tests/console-check.mjs: the
   console end to end against a stand-in GitHub). A full run that is clean —
   the audit, the console and every state — leaves a stamp for exactly this
   code (tests/code-stamp.mjs); without it the push guard
   (.claude/hooks/push-guard.mjs) stops a `git push`.

   Fast, without testing less: each flow at each pixel ratio, and the
   console's check, is a job of its own, run side by side (as many at once as
   the machine has cores); the screenshots are Chromium's own, encoded for
   speed (the very same pixels); the pixel test runs in worker threads
   (tests/fold-scan.mjs), and the two shots that tell picture pixels apart are
   only taken when a state has anything to tell apart.

   Run (Node 18+ and Chromium), a few minutes:
     npm install --no-save playwright-core
     node tests/fold-check.mjs            # exits 1 if any outline is found (or the console's check fails)
     node tests/fold-check.mjs shader     # only the flows named — or "console" (quicker; no stamp)
   Options (environment): CHROMIUM=/path/to/chromium   PLAYWRIGHT_CORE=/path/to/playwright-core
                          FOLD_SHOTS=dir  (saves both screenshots of every state with an outline)
                          FOLD_JOBS=n     (jobs at once; the number of cores by default)
   ============================================================ */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import { Worker } from "node:worker_threads";
import { audit, report, DIP } from "./colour-audit.mjs";
import { codeHere, writeStamp } from "./code-stamp.mjs";
import { consoleCheck } from "./console-check.mjs";
import { decode } from "./fold-scan.mjs";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const ONLY = process.argv.slice(2);
const MIN_PX = 3;    // an outline: at least this many pixels on one element, each DIP (0-255) darker than both sides of its edge
const SHOTS = process.env.FOLD_SHOTS;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const CORES = Math.max(1, os.availableParallelism ? os.availableParallelism() : os.cpus().length);
const JOBS = Math.max(1, Math.round(+process.env.FOLD_JOBS) || CORES);
const T0 = Date.now();

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

// ---- the pixel test, in worker threads (tests/fold-scan.mjs) ------------------------
// folds(plain, inverse): the fold pixels [x, y, how much darker, the edge's dx, dy];
// own(bare, black, px): how much of each is a picture's own (bare: the same state with its
// pictures hidden; black: with them painted black — 1 = all of it, 0 = none)
const scan = (() => {
  const all = [], idle = [], queue = [], open = new Map();
  let id = 0;
  for (let i = 0; i < CORES; i++) {
    const w = new Worker(new URL("./fold-scan.mjs", import.meta.url));
    w.on("message", (m) => {
      const t = open.get(m.id); open.delete(m.id);
      idle.push(w); pump();
      if (m.error) t.reject(new Error(m.error)); else t.resolve(m.result);
    });
    w.on("error", (e) => { for (const t of open.values()) t.reject(e); open.clear(); });
    all.push(w); idle.push(w);
  }
  function pump() {
    while (idle.length && queue.length) { const t = queue.shift(), w = idle.pop(); open.set(t.msg.id, t); w.postMessage(t.msg); }
  }
  const run = (msg) => new Promise((resolve, reject) => { msg.id = ++id; queue.push({ msg, resolve, reject }); pump(); });
  return {
    folds: (plain, inverse) => run({ op: "folds", plain, inverse, DIP }),
    own: (bare, black, px) => run({ op: "own", bare, black, px }),
    close: () => Promise.all(all.map((w) => w.terminate())),
  };
})();

// Chromium's own screenshot, encoded for speed: the very same pixels as page.screenshot()
// (checked once per job, against it) in about a third of the time. Its session is given the
// same screen as Playwright gives the page; if anything differs, page.screenshot() it is.
async function shooter(ctx, p, viewport, dpr) {
  const slow = () => p.screenshot();
  let cdp;
  try {
    cdp = await ctx.newCDPSession(p);
    await cdp.send("Emulation.setDeviceMetricsOverride", { mobile: false, width: viewport.width, height: viewport.height,
      screenWidth: viewport.width, screenHeight: viewport.height, deviceScaleFactor: dpr, screenOrientation: { angle: 0, type: "landscapePrimary" } });
  } catch (e) { return { shot: slow, verify: async () => {} }; }
  let fast = async () => Buffer.from((await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true })).data, "base64");
  return {
    shot: () => fast(),
    // (on the first state, held still: both ways, decoded, must be the same pixels)
    async verify() {
      if (this.verified) return;
      this.verified = true;
      const a = await fast().catch(() => null), b = await slow();
      if (!a || !pixelsEqual(a, b)) { fast = slow; console.log("  (the fast screenshots differ from page.screenshot() here: using page.screenshot())"); }
    },
  };
}
function pixelsEqual(a, b) {
  const x = decode(a), y = decode(b);
  return x.w === y.w && x.h === y.h && Buffer.compare(Buffer.from(x.data.buffer), Buffer.from(y.data.buffer)) === 0;
}

// the plain shot, faded, with each outline pixel in red (ours), blue (inside a picture) or amber (a known limit)
let lab = null;
async function marks(plain, px, kinds) {
  lab = lab || await (await browser.newContext()).newPage();
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
// (a frame drawn since whatever was just changed: a screenshot now shows it)
const frame = (p) => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
async function check(p, state, dpr) {
  const job = p.__job, c0 = Date.now();
  await p.evaluate(() => {
    window.__held = document.getAnimations().filter((a) => a.playState === "running");
    window.__held.forEach((a) => a.pause());                     // CSS transitions / animations
    if (window.gsap) window.gsap.globalTimeline.pause();          // GSAP tweens
    if (window.__lenis) window.__lenis.stop();
  });
  const dot = await p.addStyleTag({ content: ".cursor-dot{visibility:hidden!important}" });
  const S = await p.evaluate(() => Math.max(innerWidth, innerHeight) + 4);
  await p.evaluate(() => { window.__cursorProbe(0, 0, 0); });
  await frame(p);
  await job.verify();                                             // (once a job: the fast shots are the same pixels)
  const plain = await job.shot();
  await p.evaluate((S) => { window.__cursorProbe(-2, -2, S); }, S);  // the square over the whole window
  await frame(p);
  const inverse = await job.shot();
  await p.evaluate(() => { window.__cursorProbe(0, 0, 0); });
  let px = await scan.folds(plain, inverse);
  // Which of those pixels are a picture's own: the same state with its pictures hidden, then painted
  // black (only when there are any to tell). A picture part-way through a fade is all picture still,
  // so whatever holds a visible picture is shown opaque for these two.
  if (px.length) {
    await p.evaluate(() => {
      for (const im of document.images) {
        const chain = [];
        let e = im;
        for (; e && e.nodeType === 1; e = e.parentElement) {
          const o = +getComputedStyle(e).opacity;
          if (o < 0.01) break;
          if (o < 1) chain.push(e);
        }
        if (!e || e.nodeType !== 1) chain.forEach((c) => {
          if (c.hasAttribute("data-fold-lift")) return;
          c.setAttribute("data-fold-lift", c.style.getPropertyValue("opacity") + "|" + c.style.getPropertyPriority("opacity"));
          c.style.setProperty("opacity", "1", "important");
        });
      }
    });
    const shoot = async (css) => { const t = await p.addStyleTag({ content: css }); await frame(p); const b = await job.shot(); await t.evaluate((e) => e.remove()); return b; };
    const bare = await shoot("img{opacity:0!important}");
    const black = await shoot("img{filter:brightness(0)!important}");
    await p.evaluate(() => {
      for (const c of document.querySelectorAll("[data-fold-lift]")) {
        const [v, pr] = c.getAttribute("data-fold-lift").split("|");
        if (v) c.style.setProperty("opacity", v, pr); else c.style.removeProperty("opacity");
        c.removeAttribute("data-fold-lift");
      }
    });
    const own = await scan.own(bare, black, px);
    px = px.map((v, i) => v.concat(own[i]));
  }
  await p.evaluate(() => { window.__cursorProbe(null); });
  await dot.evaluate((e) => e.remove());
  // A pixel that is wholly a picture's own is the picture's detail, inverted (the effect itself): it is
  // counted, not looked into. Anything else — a picture's blurred border, or anything over or beside
  // it — is ours, unless the page marks it a known limit (data-fold-known): what is on top there is
  // looked up (everything made hit-testable for the moment, pictures included; the cursor's own
  // squares excluded).
  const rest = px.filter((v) => v[5] < 0.97), inPictures = px.length - rest.length;
  let who = [], restKinds = [];
  if (rest.length) {
    const probe = await p.addStyleTag({ content: "*{pointer-events:auto!important}.cursor-lens,.cursor-dot,.cursor-fold,.cursor-tone{pointer-events:none!important}" });
    ({ who, kinds: restKinds } = await p.evaluate(([px, dpr]) => {
      const by = {}, kinds = [], at = (x, y) => document.elementFromPoint((x + 0.5) / dpr, (y + 0.5) / dpr);
      const marked = [...document.querySelectorAll("[data-fold-known]")].map((k) => [k, k.getBoundingClientRect()]);
      for (const [x, y, d] of px) {
        const el = at(x, y), cx = Math.round(x / dpr), cy = Math.round(y / dpr);
        // (by what is under the pixel, or by place: something see-through can lie on top of it)
        const near = marked.find(([, r]) => cx >= r.left - 2 && cx <= r.right + 2 && cy >= r.top - 2 && cy <= r.bottom + 2);
        const known = (el && el.closest && el.closest("[data-fold-known]")) || (near && near[0]);
        kinds.push(known ? 3 : 1);
        if (!el) continue;
        let key = el.tagName.toLowerCase() + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).join(".") : "");
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (t && !el.children.length) key += ` "${t.slice(0, 24)}"`;
        if (known) key += ` (${known.getAttribute("data-fold-known")})`;
        key = (known ? "known:" : "ui:") + key;
        const b = by[key] || (by[key] = { key, kind: known ? "known" : "ui", n: 0, max: 0, at: [cx, cy] });
        b.n++; if (d > b.max) b.max = d;
      }
      return { who: Object.values(by), kinds };
    }, [rest, dpr]));
    await probe.evaluate((e) => e.remove());
  }
  const bad = who.filter((w) => w.kind === "ui" && w.n >= MIN_PX);
  const known = who.filter((w) => w.kind === "known");
  results.push({ state: `${state} @${dpr}x`, bad, inPictures, known });
  job.log(`  ${bad.length ? "OUTLINE" : "clean  "}  ${state} @${dpr}x` + (inPictures ? `   (inside pictures: ${inPictures} px)` : "") +
    (known.length ? `   (known limit: ${known.reduce((s, w) => s + w.n, 0)} px)` : ""));
  if (bad.length && SHOTS) {
    const f = `${state} ${dpr}x`.replace(/[^a-z0-9]+/gi, "-");
    let r = 0;
    const kinds = px.map((v) => (v[5] >= 0.97 ? 2 : restKinds[r++]));
    fs.writeFileSync(path.join(SHOTS, f + "-plain.png"), plain);
    fs.writeFileSync(path.join(SHOTS, f + "-inverse.png"), inverse);
    fs.writeFileSync(path.join(SHOTS, f + "-marks.png"), await marks(plain, px, kinds));
  }
  await p.evaluate(() => {
    (window.__held || []).forEach((a) => { try { a.play(); } catch (e) {} });
    (window.__foldCss || []).forEach((a) => { try { a.play(); } catch (e) {} });   // (those stepTo() held)
    window.__foldCss = null;
    if (window.gsap) window.gsap.globalTimeline.resume();
    if (window.__lenis) window.__lenis.start();
  });
  job.states++; job.checks += Date.now() - c0;
}

// ---- getting the pages into each state ----------------------------------------------------
// Every state is reached by what is on the page, never by the clock: a slow or busy machine (or
// the jobs running beside this one) only makes it take longer, never changes what is checked.
const settled = (p) => p.waitForFunction(() => { const e = document.getElementById("preloader"); return e && getComputedStyle(e).display === "none"; }, null, { timeout: 30000 });
// The page at rest: nothing moving or about to — no GSAP tween playing or waiting to, no CSS
// transition or animation running, the smooth scroll still, the scrollbar's thumb and rail away,
// the hamburger where it stays (menu.js eases it by hand, frame by frame), no work on screen still
// to wipe in, the pictures on screen and the fonts in — for 120 ms and 3 frames running (on a busy
// machine frames come slowly: 8 of them could take seconds). GSAP's tweens are
// hurried there (100 ms further on each frame): where they end is the same, only sooner. CSS
// transitions keep their own pace — the menu's morph is a chain of them, each started by a timer,
// and hurried, its pauses would pass for rest — as does whatever runs on timers or eases by hand.
// If it never gets there, the job says what was still moving (and the state is checked as it is).
async function quiet(p) {
  const t0 = Date.now();
  const why = await p.waitForFunction(() => {
    const s = window.__quiet || (window.__quiet = { n: 0, sig: "", why: "" });
    const g = window.gsap, W = innerWidth, H = innerHeight;
    const seen = (r) => Math.max(0, Math.min(r.right, W) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, 0)) / Math.max(1, r.width * r.height);
    const tweens = g ? g.globalTimeline.getChildren(true, true, false).filter((t) => !t.paused() && t.progress() < 1) : [];
    if (tweens.length && !g.globalTimeline.paused()) g.globalTimeline.time(g.globalTimeline.time() + 0.1);
    let why = "";
    if (tweens.length) why = "a GSAP tween";
    else if (document.getAnimations().some((a) => a.playState === "running")) why = "a CSS transition or animation";
    else if (window.__lenis && window.__lenis.isScrolling) why = "the smooth scroll";
    else if (document.querySelector(".cscroll-thumb.show, .cscroll-rail.show")) why = "the scrollbar";
    else if ([...document.querySelectorAll(".work-btn")].some((b) => seen(b.getBoundingClientRect()) > 0.15 && getComputedStyle(b).clipPath !== "none")) why = "a work still to wipe in";
    else if ([...document.images].some((i) => (i.getAttribute("src") ? !i.complete : i.hasAttribute("data-src")) && seen(i.getBoundingClientRect()) > 0)) why = "a picture loading";   // (or still to: data-src)
    else if (document.fonts && document.fonts.status !== "loaded") why = "the fonts";
    // (what moves by hand or by its own smooth scroll: the hamburger, the page, the works' row)
    const b = document.getElementById("menuBtn"), r = b && b.getBoundingClientRect(), row = document.getElementById("strip");
    const sig = [r ? [r.left, r.top, r.width, r.height, getComputedStyle(b).transform].join() : "", row ? row.scrollLeft : "", scrollX, scrollY].join("|");
    if (!why && sig !== s.sig) why = "the hamburger, the page or the row moving";
    s.sig = sig; s.why = why; s.n = why ? 0 : s.n + 1;
    if (why || s.n === 1) s.since = performance.now();
    if (s.n < 3 || performance.now() - s.since < 120) return false;
    window.__quiet = null;
    return true;
  }, null, { polling: "raf", timeout: 25000 }).then(() => "", () => p.evaluate(() => (window.__quiet && window.__quiet.why) || "?").catch(() => "?"));
  await p.evaluate(() => { window.__quiet = null; }).catch(() => {});
  p.__job.rest += Date.now() - t0;
  if (why) p.__job.log(`  (not at rest after 25 s — ${why} — checked as it was)`);
}
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
  await quiet(p);
  return r;
}
async function click(p, sel, i = 0) { await hover(p, sel, i); await p.mouse.down(); await p.mouse.up(); }
async function menuLink(p, text) {
  return p.evaluate((t) => { const a = [...document.querySelectorAll("#menuNav a")].find((a) => a.textContent.trim() === t), r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, text);
}
// a state the check needs, reached (or the run stops here: a skipped state would pass for the wrong reason)
async function expect(p, fn, arg, what) {
  try { await p.waitForFunction(fn, arg, { timeout: 20000 }); }
  catch (e) { throw new Error("could not reach the state: " + what); }
}
// Tab (as a keyboard visitor does) until something matching `sel` has the keyboard's focus ring
async function tabTo(p, sel) {
  for (let i = 0; i < 80; i++) {
    if (await p.evaluate((sel) => { const a = document.activeElement; return !!a && a.matches(sel) && a.matches(":focus-visible"); }, sel)) {
      await quiet(p);
      return;
    }
    await p.keyboard.press("Tab");
  }
  throw new Error("could not reach the state: keyboard focus on " + sel);
}

// Part-way through an animation, exactly: GSAP's clock is stopped and moved on by hand, 8 ms at a
// time (25 steps a drawn frame, and only while a tween is under way or waiting, so whatever the page
// starts on a frame — a scroll's reveals, the next page's intro — still starts), until the moment
// holds. No frame, however slow, can skip it. The clock is stopped where the animation begins when
// the flow can say so — at a page change (holdNext()), with a scroll (scrollHeld()) — or else now;
// check() lets it run on. (The moments themselves, TESTS, live in the page: the init script below.)
async function stepTo(p, test, arg, what) {
  const r = await p.waitForFunction(([test, arg]) => {
    const g = window.gsap, t = window.__foldTests && window.__foldTests[test];
    if (!g || !t) return false;
    const tl = g.globalTimeline, s = window.__foldStep || (window.__foldStep = { n: 0 });
    // (CSS transitions and animations keep in step with it: held, and moved on with each step — a menu
    // fading out as the sheet rises is as far out as it would be)
    const css = window.__foldCss || (window.__foldCss = new Set());
    const hold = () => { for (const a of document.getAnimations()) if (a.playState === "running") { a.pause(); css.add(a); } };
    tl.pause(); hold();
    const under = () => tl.getChildren(true, true, false).some((x) => !x.paused() && x.progress() < 1);
    for (let i = 0; i < 25; i++) {
      if (t(arg)) { window.__foldStep = null; return "ok"; }
      if (!under()) return false;                       // (nothing to move on yet: wait for the page)
      if (++s.n > 2500) return "stepped through 20 s of animation";
      tl.time(tl.time() + 0.008);
      hold();
      for (const a of css) if (a.playState === "paused") a.currentTime = (a.currentTime || 0) + 8;
    }
    if (t(arg)) { window.__foldStep = null; return "ok"; }
    return false;
  }, [test, arg], { polling: "raf", timeout: 45000 }).then((h) => h.jsonValue(), () => "45 s passed");
  if (r !== "ok") throw new Error(`could not reach the state: ${what} (${r})`);
}
// the white sheet part-way across the screen (yPercent between a and b)
const sheetAt = (p, a, b) => stepTo(p, "sheet", [a, b], `the white sheet between ${a}% and ${b}%`);
// something matching `sel` part-way through wiping in
const wipeAt = (p, sel) => stepTo(p, "wipe", sel, `${sel} wiping in`);
// the first match of `sel` part-way through a fade, its opacity between a and b
const fadeAt = (p, sel, a, b) => stepTo(p, "fade", [sel, a, b], `${sel} between ${a} and ${b} opaque`);
// stop GSAP's clock as the next page change starts: as the sheet starts to rise ("leave"), and/or
// as it starts to lift off the next page ("arrive") — js/wipe.js's kt:leave / kt:arrive
const holdNext = (p, ...what) => p.evaluate((what) => { for (const w of what) sessionStorage.setItem("fold-hold-" + w, "1"); }, what);
// scroll there with GSAP's clock stopped, so what the scroll sets off waits at its start for stepTo()
const scrollHeld = (p, y) => p.evaluate((y) => { window.__lenis.scrollTo(y, { immediate: true, force: true }); window.gsap.globalTimeline.pause(); }, y);
// (in every page of every job, before its own scripts: the moments stepTo() can step to, and the holds)
function stepping() {
  const share = (e) => {                               // how far in each side of e's clip is, as a share of the box
    const m = /inset\(([^)]*)\)/.exec(e.style.clipPath || "");
    if (!m) return [];
    const v = m[1].trim().split(/\s+/), side = [v[0], v[1] || v[0], v[2] || v[0], v[3] || v[1] || v[0]];
    return side.map((x, k) => (/%$/.test(x) ? parseFloat(x) / 100 : parseFloat(x) / (k % 2 ? e.offsetWidth : e.offsetHeight)));
  };
  window.__foldTests = {
    sheet: ([a, b]) => {
      const e = document.getElementById("preloader");
      if (!e || getComputedStyle(e).display === "none") return false;
      const y = window.gsap.getProperty(e, "yPercent");
      return y > Math.min(a, b) && y < Math.max(a, b);
    },
    wipe: (sel) => [...document.querySelectorAll(sel)].some((e) => share(e).some((f) => f > 0.3 && f < 0.7)),
    fade: ([sel, a, b]) => {                            // something part-way through fading in or out
      const e = document.querySelector(sel), o = e ? parseFloat(getComputedStyle(e).opacity) : NaN;
      return o > a && o < b;
    },
    name: () => {                                      // the name risen on the curtain, a first visit
      const n = document.querySelector(".pl-name"), t = n && getComputedStyle(n).transform;
      return !!t && (t === "none" || Math.abs(new DOMMatrix(t).m42) < 0.5);
    },
  };
  const hold = (w) => () => { try { if (sessionStorage.getItem("fold-hold-" + w) && window.gsap) { sessionStorage.removeItem("fold-hold-" + w); window.gsap.globalTimeline.pause(); } } catch (e) {} };
  const listen = () => {
    document.addEventListener("kt:leave", hold("leave"));
    document.addEventListener("kt:arrive", hold("arrive"));
  };
  listen();
  // A page change brings the next page into this same window (js/wipe.js): document.open() takes
  // the page's listeners with it, and no init script runs again. So: listen again, and what is
  // noted per page starts afresh (arrowHidden()). This window's own mark stays: it shows that the
  // page changed in this window.
  window.__foldWindow = Math.random();
  const open = Document.prototype.open;
  Document.prototype.open = function () {
    const r = open.apply(this, arguments);
    listen();
    window.__arrowHidden = undefined;
    window.__quiet = window.__foldStep = window.__foldCss = null;
    delete window.__cursorProbe;
    return r;
  };
}
// arriving from another page with the cursor's square out, the plain arrow must not show under the
// white sheet. The page came into the same window (js/wipe.js; `win`, this window's mark from before
// the change): a page opened the usual way gets a new surface from the browser, and that shows the
// system's own arrow until the page has drawn and seen the mouse move — nothing in a page can hide
// it. And the page's head hid the arrow before js/cursor.js ran (the init script in the main loop
// notes when it was hidden).
async function arrowHidden(p, page, win) {
  if ((await p.evaluate(() => window.__foldWindow)) !== win)
    throw new Error(`the ${page} page was opened the usual way, not brought into the same window: the browser's plain arrow shows on its new surface (js/wipe.js)`);
  await expect(p, () => window.__arrowHidden !== undefined, null, `the plain arrow hidden, arriving at the ${page} page`);
  const when = await p.evaluate(() => window.__arrowHidden);
  if (when !== "before js/cursor.js ran") throw new Error(`the plain arrow showed while arriving at the ${page} page: it was hidden only ${when}`);
}

// ---- the states ---------------------------------------------------------------------------
const FLOWS = {
  // the whole site in one visit: arriving, scrolling, the hamburger's colours, the menu, the
  // page changes both ways, the illustration page and its zoom
  async site(p, dpr) {
    // -- the front page: a first visit, while the name is up
    await p.goto(SITE + "/index.html");
    await stepTo(p, "name", null, "the name risen on a first visit");
    await check(p, "front page: first visit, the name", dpr);
    await settled(p);
    await quiet(p);

    // -- the front page, top to bottom
    const H = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    for (let y = 0; ; y = Math.min(H, y + 700)) {
      await p.evaluate((y) => { window.__lenis.scrollTo(y, { immediate: true, force: true }); }, y);
      await quiet(p);
      await check(p, `front page: scrolled to ${y}px`, dpr);
      if (y >= H) break;
    }

    // -- text selected. A KNOWN LIMIT, reported but not failed: the browser paints the
    // highlight and the letters on it in one go, on both sides of #DCCBC3, and nothing can
    // mirror a text selection; only other highlight colours would avoid it.
    await p.evaluate(() => { window.__lenis.scrollTo(0, { immediate: true, force: true }); });
    await quiet(p);
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
        await quiet(p);                                  // (the first time, the hamburger catches the corner)
        await expect(p, coloured, null, `the hamburger coloured over the picture (${shades[m]})`);
        await check(p, `front page: hamburger over the picture, ${shades[m]}`, dpr);
        await click(p, "#menuBtn");
        await expect(p, () => document.getElementById("menuNav").classList.contains("open"), null, "the menu open");
        await quiet(p);
        const lw = await menuLink(p, "WORK");
        await p.mouse.move(lw.x, lw.y, { steps: 4 });
        await expect(p, () => !!document.querySelector("#menuNav a:hover"), null, "the pointer on a menu label");
        await quiet(p);
        await check(p, `front page: menu open over the picture, pointer on WORK, ${shades[m]}`, dpr);
        await p.keyboard.press("Escape");
        await expect(p, () => !document.getElementById("menuNav").classList.contains("open"), null, "the menu closed");
        await p.mouse.move(700, 500);
        await quiet(p);
      }
      await p.evaluate((was) => { window.__menuShade.set(was); }, was);
      // A KNOWN LIMIT, reported but not failed: over a real painting, a deep bar's soft edge
      // next to a bright part of the painting straddles #DCCBC3 (as today's grey bars would).
      // (A real work stands in for the picture here, as the test panel's preview does.)
      const src = await p.evaluate(async () => { const d = await (await fetch("data/illustration.json")).json(); const w = (d.works || []).find((w) => w.image); return w ? w.image : null; });
      if (src) {
        await p.evaluate((src) => new Promise((res) => {
          const im = new Image(); im.alt = ""; im.id = "fold-check-picture"; im.onload = res; im.onerror = res; im.src = src;
          im.style.cssText = "position:absolute;left:0;top:0";            // (over any photo the holder has)
          document.querySelector("[data-menu-shade]").appendChild(im);
          document.getElementById("menuBtn").setAttribute("data-fold-known", "the hamburger over a painting");
        }), src);
        await p.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
        await quiet(p);                        // (and the scrollbar's thumb fades)
        await check(p, "front page: hamburger over a painting in the picture's place", dpr);
        await p.evaluate(() => { document.getElementById("fold-check-picture").remove(); document.getElementById("menuBtn").removeAttribute("data-fold-known"); });
      }
    }

    // -- the menu, open, and a label under the pointer
    await p.evaluate(() => { window.__lenis.scrollTo(900, { immediate: true, force: true }); });
    await quiet(p);
    await click(p, "#menuBtn");
    await expect(p, () => document.getElementById("menuNav").classList.contains("open"), null, "the menu open");
    await quiet(p);
    await check(p, "front page: menu open", dpr);
    const work = await menuLink(p, "WORK");
    await p.mouse.move(work.x, work.y, { steps: 4 });
    await expect(p, () => !!document.querySelector("#menuNav a:hover"), null, "the pointer on a menu label");
    await quiet(p);
    await check(p, "front page: menu open, pointer on WORK", dpr);

    // -- leaving: the sheet half-way up over the page
    const il = await menuLink(p, "ILLUSTRATION");
    await p.mouse.move(il.x, il.y, { steps: 2 });
    let win = await p.evaluate(() => window.__foldWindow);
    await holdNext(p, "leave", "arrive");
    await p.mouse.down(); await p.mouse.up();
    await sheetAt(p, 60, 30);
    await check(p, "page change: the sheet rising (front page)", dpr);

    // -- arriving at the illustration page: the sheet half-way off, the intro rising in
    await p.waitForURL(/illustration\.html/, { waitUntil: "commit" });
    await sheetAt(p, -35, -70);
    await check(p, "page change: the sheet lifting, the intro rising (illustration)", dpr);
    await arrowHidden(p, "illustration", win);
    await wipeAt(p, ".work-btn");
    await check(p, "illustration page: a work wiping in", dpr);
    await settled(p);
    await quiet(p);

    // -- the illustration page
    await check(p, "illustration page", dpr);
    await hover(p, ".work .plus", 0);
    await expect(p, () => !!document.querySelector(".work .plus:hover"), null, "the pointer on a +");
    await check(p, "illustration page: pointer on a +", dpr);
    for (const k of [3, 6]) {
      await p.keyboard.press("Home"); await quiet(p);
      for (let i = 0; i < k; i++) { await p.keyboard.press("ArrowRight"); await p.waitForTimeout(60); }
      await quiet(p);
      await expect(p, (k) => { const w = document.querySelectorAll(".work")[k]; return w && Math.abs(w.getBoundingClientRect().left - parseFloat(getComputedStyle(document.getElementById("track")).paddingLeft)) < 2; }, k, `the row at work ${k + 1}`);
      await check(p, `illustration page: the row at work ${k + 1}`, dpr);
    }
    await click(p, ".work-btn", 0);
    await expect(p, () => document.getElementById("zoom").classList.contains("is-open"), null, "a work zoomed");
    await quiet(p);
    await check(p, "illustration page: a work zoomed", dpr);
    await p.keyboard.press("ArrowRight");
    await wipeAt(p, ".zoom-fig");
    await check(p, "illustration page: the zoom, half-way to the next work", dpr);
    await expect(p, () => !!document.querySelector(".work.is-zoomed") && document.querySelectorAll(".zoom-fig:not(.is-warm)").length === 1, null, "the next work in the zoom");
    await quiet(p);
    await p.keyboard.press("Escape");
    await expect(p, () => !document.getElementById("zoom").classList.contains("is-open"), null, "the zoom closed");
    await quiet(p);
    await click(p, "#menuBtn");
    await expect(p, () => document.getElementById("menuNav").classList.contains("open"), null, "the menu open");
    await quiet(p);
    await check(p, "illustration page: menu open", dpr);

    // -- back to the front page: arriving there
    const ab = await menuLink(p, "ABOUT");
    await p.mouse.move(ab.x, ab.y, { steps: 2 });
    win = await p.evaluate(() => window.__foldWindow);
    await holdNext(p, "arrive");
    await p.mouse.down(); await p.mouse.up();
    await p.waitForURL(/index\.html/, { waitUntil: "commit" });
    await sheetAt(p, -35, -70);
    await check(p, "page change: the sheet lifting, the intro rising (front page)", dpr);
    await arrowHidden(p, "front", win);
    await settled(p);
    await quiet(p);
    await scrollHeld(p, 2000);
    await wipeAt(p, ".ph img");
    await check(p, "front page: a photo wiping in", dpr);

    // -- the browser's Back: the illustration page comes in the same way, the row where it was
    // left; and Back again, the front page where it was left (900px down, js/wipe.js noted both)
    for (const [page, at, there, where] of [
      ["illustration", /illustration\.html$/, () => { const x = history.state && history.state.kt && history.state.kt.x; return x > 0 && Math.abs(document.getElementById("strip").scrollLeft - x) < 2; }, "the row where it was left"],
      ["front", /index\.html$/, () => Math.abs(scrollY - 900) < 2, "900px down, where it was left"],
    ]) {
      await p.mouse.move(700, 450, { steps: 2 });
      win = await p.evaluate(() => window.__foldWindow);
      await holdNext(p, "arrive");
      await p.evaluate(() => history.back());
      await p.waitForURL((u) => at.test(u.pathname));
      await sheetAt(p, -35, -70);
      await check(p, `page change, Back: the sheet lifting (${page} page)`, dpr);
      await arrowHidden(p, page, win);
      await settled(p);
      await quiet(p);
      await expect(p, there, null, `Back at the ${page} page: ${where}`);
      await check(p, `${page} page, Back: ${where}`, dpr);
    }
  },

  // the colour test panel (index.html?shader, js/menu-shade.js): a panel above the
  // under-squares, tried with the cursor and the keyboard, over the page and over photos
  async shader(p, dpr) {
    await p.goto(SITE + "/index.html?shader");
    await settled(p);
    await quiet(p);
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
    await quiet(p);                                    // (the scroll there)
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
    await quiet(p);
    await check(p, "test panel: a painting in the picture's place", dpr);
    await click(p, ".shade-lab .pics button", 0);
    await p.evaluate(() => { document.getElementById("menuBtn").removeAttribute("data-fold-known"); });

    // -- keyboard focus in the panel (its own ring, not the browser's)
    await p.focus(".shade-lab li button");
    await p.keyboard.press("Tab");
    await expect(p, () => !!document.querySelector(".shade-lab li button:focus-visible"), null, "keyboard focus on a colour");
    await p.mouse.move(720, 300, { steps: 4 });
    await quiet(p);
    await check(p, "test panel: keyboard focus on a colour", dpr);
    await p.evaluate(() => { document.activeElement.blur(); });

    // -- folded small
    await click(p, ".shade-lab .hd b");
    await expect(p, () => document.querySelector(".shade-lab").classList.contains("small"), null, "the panel folded small");
    await p.mouse.move(720, 300, { steps: 4 });
    await quiet(p);
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
      await quiet(p);
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
    await quiet(p);
    for (let m = 1; m < names.length; m++) {
      await lensAt(m, "harmony");
      await check(p, `harmony cursor, ${names[m]}: the page top`, dpr);
    }
    for (let m = 1; m < names.length; m++) {          // (every variation: each lifts or darkens other channels)
      await lensAt(m, "fallback");
      await check(p, `harmony cursor as Safari / Firefox draw it, ${names[m]}: the page top`, dpr);
    }
    await click(p, ".shade-lab .go");
    await quiet(p);
    await click(p, ".shade-lab .pics button", 1);
    await expect(p, () => { const i = document.querySelector("[data-menu-shade] img[data-shade-preview]"); return !!i && i.complete && i.naturalWidth > 0; }, null, "a painting in the picture's place");
    await p.evaluate(() => { document.getElementById("menuBtn").setAttribute("data-fold-known", "the hamburger over a painting"); });
    await p.mouse.move(720, 300, { steps: 2 });
    await quiet(p);
    for (let m = 1; m < names.length; m++) {
      await lensAt(m, "harmony");
      await check(p, `harmony cursor, ${names[m]}: over a painting in the picture's place`, dpr);
    }
    await p.evaluate(() => { document.getElementById("menuBtn").removeAttribute("data-fold-known"); });
    // the menu open under the lens, a label under the pointer
    await click(p, "#menuBtn");
    await expect(p, () => document.getElementById("menuNav").classList.contains("open"), null, "the menu open");
    await quiet(p);
    const lw = await menuLink(p, "WORK");
    await p.mouse.move(lw.x, lw.y, { steps: 4 });
    await expect(p, () => !!document.querySelector("#menuNav a:hover"), null, "the pointer on a menu label");
    for (const m of [2, 7]) {
      await lensAt(m, "harmony");
      await quiet(p);
      await check(p, `harmony cursor, ${names[m]}: the menu open, pointer on WORK`, dpr);
    }
    await p.keyboard.press("Escape");
    await expect(p, () => !document.getElementById("menuNav").classList.contains("open"), null, "the menu closed");
    await p.mouse.move(720, 300, { steps: 2 });
    await quiet(p);

    // -- the works' page while testing: the panel, small, with the usual square; then the
    // harmony lens over the works, in every variation
    await p.evaluate(() => { window.__menuShade.cursor("maison"); });
    await p.goto(SITE + "/illustration.html");
    await settled(p);
    await quiet(p);
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
    await quiet(p);
    await check(p, "test ended (✕): the usual square back, works' page", dpr);
  },

  // the front page's photos as the owner sets them in the console (data/front.json, js/photos.js):
  // every holder given one (two pictures the site has stand in), each wiping in with its holder,
  // then at rest. The hamburger over the BACK GROUND photo is the known limit (CLAUDE.md).
  async photos(p, dpr) {
    await p.goto(SITE + "/index.html");
    await wipeAt(p, ".ph img");
    await check(p, "front page photos: the new portrait wiping in", dpr);
    await settled(p);
    await quiet(p);
    await expect(p, () => {
      const im = [...document.querySelectorAll("figure[data-slot] img")], pos = (id) => getComputedStyle(document.querySelector(`[data-slot="${id}"] img`)).objectPosition;
      return im.length === 5 && im.every((i) => i.complete && i.naturalWidth > 0) &&
        document.querySelector('[data-slot="about"] img').getAttribute("src") === "assets/img/calligraphy.webp" &&
        pos("background") === "50% 15%" && pos("about") === "50% 80%" && pos("calligraphy") === "25% 50%";
    }, null, "every holder with its photo, three of them cropped off-centre");
    await check(p, "front page photos: the top", dpr);
    const known = (on) => p.evaluate((on) => {
      const b = document.getElementById("menuBtn");
      if (on) b.setAttribute("data-fold-known", "the hamburger over a painting"); else b.removeAttribute("data-fold-known");
    }, on);
    // (whenever the hamburger lies over the BACK GROUND photo — not only when that holder is the one in
    // the middle: a tall photo, or a crop showing its bright part, reaches up under it from below)
    const underMenu = async () => known(await p.evaluate(() => {
      const b = document.getElementById("menuBtn").getBoundingClientRect(), f = document.querySelector("[data-menu-shade]"), r = f.getBoundingClientRect();
      return !!f.querySelector("img") && r.bottom > b.top && r.top < b.bottom && r.right > b.left && r.left < b.right;
    }));
    // each holder brought to the middle of the window, so it wipes in on its own
    for (const [name, sel, wiping] of [["BACK GROUND", '[data-slot="background"]', '[data-slot="background"]'],
      ["Graphic Paint", '[data-slot="graphic"]', '[data-slot="graphic"]'], ["Resolve Steps", '[data-slot="resolve"]', '[data-slot="resolve"]'],
      ["Calligraphy", '[data-slot="calligraphy"]', '[data-slot="calligraphy"] img']]) {
      const y = await p.evaluate((sel) => Math.max(0, Math.round(document.querySelector(sel).getBoundingClientRect().top + scrollY - innerHeight * 0.45)), sel);
      await scrollHeld(p, y);
      await underMenu();
      await wipeAt(p, wiping);
      await check(p, `front page photos: ${name} wiping in`, dpr);
      await quiet(p);
      await check(p, `front page photos: ${name} at rest`, dpr);
    }
    // the BACK GROUND caption, as long as the console lets it be: on screen, on two lines
    const yCap = await p.evaluate(() => Math.max(0, Math.round(document.querySelector('[data-caption-for="background"]').getBoundingClientRect().top + scrollY - innerHeight * 0.6)));
    await p.evaluate((y) => { window.__lenis.scrollTo(y, { immediate: true, force: true }); }, yCap);
    await quiet(p);
    await underMenu();
    await expect(p, (want) => {
      const c = document.querySelector('[data-caption-for="background"]'), r = document.createRange(), b = c.getBoundingClientRect();
      r.selectNodeContents(c);
      const tops = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top)));
      return c.textContent === want && tops.size === 2 && getComputedStyle(c).opacity === "1" && b.top > 0 && b.bottom < innerHeight;
    }, CAPTION, "the BACK GROUND caption rewritten, on screen, on two lines");
    await check(p, "front page photos: the BACK GROUND caption, rewritten (two lines)", dpr);
    // the photos open in the zoom (js/zoom.js), as a work does on the illustration page: the "+" under
    // the pointer; the BACK GROUND photo up, whole (its place shows it cropped); the next photo; and
    // back home, its "+" drawn in again. (The hamburger stays above the zoom: here, off the photo, plain.)
    const yBg = await p.evaluate(() => Math.max(0, Math.round(document.querySelector('[data-slot="background"]').getBoundingClientRect().top + scrollY - innerHeight * 0.2)));
    await p.evaluate((y) => { window.__lenis.scrollTo(y, { immediate: true, force: true }); }, yBg);
    await quiet(p);
    await underMenu();
    await hover(p, '[data-slot="background"] .plus');
    await expect(p, () => !!document.querySelector('[data-slot="background"] .plus:hover'), null, "the pointer on the BACK GROUND photo's +");
    await check(p, "front page photos: pointer on a +", dpr);
    await p.mouse.down(); await p.mouse.up();
    await expect(p, () => document.getElementById("zoom").classList.contains("is-open"), null, "the BACK GROUND photo zoomed");
    await known(false);
    await quiet(p);
    await expect(p, () => {
      const f = document.querySelector(".zoom-fig:not(.is-warm)"), im = f && f.querySelector("img"), r = f && f.getBoundingClientRect();
      return !!im && Math.abs(r.width / r.height - im.naturalWidth / im.naturalHeight) < 0.01 && !f.style.clipPath;
    }, null, "the whole BACK GROUND picture in the zoom, not its crop");
    await check(p, "front page photos: a photo zoomed, whole", dpr);
    // (half-way there: the wipe's edge on whole pixels, the photo gliding between them inside its still frame)
    await p.keyboard.press("ArrowRight");
    await wipeAt(p, ".zoom-fig");
    await check(p, "front page photos: the zoom, half-way to the next photo", dpr);
    await expect(p, () => document.querySelector('[data-slot="graphic"]').classList.contains("is-zoomed"), null, "the next photo in the zoom");
    await quiet(p);
    await check(p, "front page photos: the zoom, the next photo", dpr);
    await p.keyboard.press("Escape");
    await expect(p, () => !document.getElementById("zoom").classList.contains("is-open"), null, "the zoom closed");
    await p.mouse.move(700, 450, { steps: 2 });
    await quiet(p);
    await expect(p, () => [...document.querySelectorAll(".ph-open .plus")].every((x) => getComputedStyle(x).opacity === "1"), null, "every photo's + drawn in again");
    await underMenu();
    await check(p, "front page photos: back home from the zoom", dpr);
    // the hamburger over the BACK GROUND photo, then the menu open over it
    const yPic = await p.evaluate(() => Math.round(document.querySelector("[data-menu-shade]").getBoundingClientRect().top + scrollY - 6));
    await known(true);
    await p.evaluate((y) => { window.__lenis.scrollTo(y, { immediate: true, force: true }); }, yPic);
    await quiet(p);
    await check(p, "front page photos: the hamburger over the BACK GROUND photo", dpr);
    await click(p, "#menuBtn");
    await expect(p, () => document.getElementById("menuNav").classList.contains("open"), null, "the menu open");
    await quiet(p);
    const lw = await menuLink(p, "WORK");
    await p.mouse.move(lw.x, lw.y, { steps: 4 });
    await expect(p, () => !!document.querySelector("#menuNav a:hover"), null, "the pointer on a menu label");
    await quiet(p);
    await check(p, "front page photos: the menu open over the BACK GROUND photo, pointer on WORK", dpr);
    // the BACK GROUND photo opening in the zoom from there: the hamburger stays the top layer, its tint
    // giving way with the grey (js/menu-shade.js) — half-way, then up (plain on the grey), then home
    // (the tint back). Half-way, the hamburger is the known limit only where a real picture is beneath
    // it: the page's photo, or the zoom's copy of it in flight (whose own edges are the flight's limit).
    await p.keyboard.press("Escape");
    await expect(p, () => !document.getElementById("menuNav").classList.contains("open"), null, "the menu shut");
    await quiet(p);
    await hover(p, '[data-slot="background"] .ph-open');
    await p.evaluate(() => window.gsap.globalTimeline.pause());          // (the zoom's grey waits at its start)
    await p.mouse.down(); await p.mouse.up();
    await fadeAt(p, "#zoom .zoom-bg", 0.35, 0.65);
    await p.evaluate(() => {
      const b = document.getElementById("menuBtn").getBoundingClientRect(), f = document.querySelector(".zoom-fig:not(.is-warm)");
      const over = (r) => r.right > b.left && r.left < b.right && r.bottom > b.top && r.top < b.bottom;
      const page = document.querySelector('[data-slot="background"]');
      if (f && getComputedStyle(f).visibility !== "hidden") f.setAttribute("data-fold-known", "the zoom picture in flight");
      if ((f && getComputedStyle(f).visibility !== "hidden" && over(f.getBoundingClientRect())) || (!page.classList.contains("is-zoomed") && over(page.getBoundingClientRect())))
        document.getElementById("menuBtn").setAttribute("data-fold-known", "the hamburger over a painting");
      else document.getElementById("menuBtn").removeAttribute("data-fold-known");
    });
    await check(p, "front page photos: the BACK GROUND photo coming up, the hamburger above it, its tint half-faded", dpr);
    await p.evaluate(() => { const f = document.querySelector('.zoom-fig[data-fold-known]'); if (f) f.removeAttribute("data-fold-known"); });
    await known(false);
    await expect(p, () => document.getElementById("zoom").classList.contains("is-open"), null, "the BACK GROUND photo zoomed again");
    await quiet(p);
    await check(p, "front page photos: the BACK GROUND photo up, the hamburger above the zoom, plain", dpr);
    await p.keyboard.press("Escape");
    await expect(p, () => !document.documentElement.classList.contains("zoom-open"), null, "the zoom closed again");
    await quiet(p);
    await underMenu();
    await expect(p, () => !!document.getElementById("menuBtn").children[0].style.backgroundImage, null, "the hamburger's tint back");
    await check(p, "front page photos: home from the zoom, the hamburger's tint back over the BACK GROUND photo", dpr);
    await known(false);
  },

  // keyboard focus: each kind of focus ring the cursor pages draw (the browser's own has a
  // white halo, which the square folds — so each must be the site's own)
  async focus(p, dpr) {
    await p.goto(SITE + "/index.html");
    await settled(p);
    await quiet(p);
    await tabTo(p, "#menuBtn");
    await p.keyboard.press("Enter");
    await expect(p, () => document.getElementById("menuNav").classList.contains("open"), null, "the menu open");
    await quiet(p);
    await tabTo(p, "#menuNav a");
    await check(p, "front page: keyboard focus on a menu label", dpr);
    await p.keyboard.press("Escape");
    await expect(p, () => !document.getElementById("menuNav").classList.contains("open"), null, "the menu closed");
    await quiet(p);
    await tabTo(p, ".ph-open");
    await check(p, "front page: keyboard focus on a photo", dpr);
    await p.keyboard.press("Enter");
    await expect(p, () => document.getElementById("zoom").classList.contains("is-open"), null, "a photo zoomed from the keyboard");
    await quiet(p);
    await tabTo(p, ".zoom-ui button");
    await check(p, "front page: keyboard focus on a zoom button", dpr);

    await p.goto(SITE + "/illustration.html");
    await settled(p);
    await quiet(p);
    await tabTo(p, "a.brand");
    await check(p, "illustration page: keyboard focus on a link", dpr);
    await tabTo(p, ".work-btn");
    await check(p, "illustration page: keyboard focus on a work", dpr);
    await p.keyboard.press("Enter");
    await expect(p, () => document.getElementById("zoom").classList.contains("is-open"), null, "a work zoomed from the keyboard");
    await quiet(p);
    await tabTo(p, ".zoom-ui button");
    await check(p, "illustration page: keyboard focus on a zoom button", dpr);
  },
};

// The front page's photos and captions are the owner's (data/front.json, set in the console): every
// flow gets a fixed list instead, so the check never depends on what was uploaded — none (the
// page's own), or, in "photos", a photo in every holder, three cropped off-centre, and the
// BACK GROUND caption rewritten, as long as the console lets it be (two lines).
const CAPTION_PARTS = { title: "The house on the hill in the evening, after a day of rain", date: "June 15 to July 2, 2026, over three long weekends",
  medium: "Graphic Paint: the Morph brush, GP-Mix, a scanned ink wash", location: "Redmond, Washington, the studio at the back of the house" };
const CAPTION = `Title: “${CAPTION_PARTS.title}” | Date: ${CAPTION_PARTS.date} | Made with: ${CAPTION_PARTS.medium} | Location: ${CAPTION_PARTS.location}`;
const FRONT = {
  photos: { saveId: "fold-check", photos: {
    about: { image: "assets/img/calligraphy.webp", alt: "", focus: [50, 80] }, background: { image: "assets/img/about-portrait.webp", alt: "", focus: [50, 15] },
    graphic: { image: "assets/img/about-portrait.webp", alt: "" }, resolve: { image: "assets/img/calligraphy.webp", alt: "" },
    calligraphy: { image: "assets/img/about-portrait.webp", alt: "", focus: [25, 50] } },
    captions: { background: CAPTION_PARTS } },
};
for (const f of ONLY) if (!FLOWS[f] && f !== "console") { console.log(`No flow "${f}" (flows: ${Object.keys(FLOWS).join(", ")}, and console).`); process.exit(2); }

// ---- the jobs, side by side: the console's check, and each flow at each pixel ratio ----------
// (longest first, so the last to start isn't the last to finish; each job's lines are printed
// together once it is done)
const VIEW = { width: 1440, height: 810 };
const LENGTH = { site: 4, shader: 4, photos: 2, focus: 1 };       // (roughly how long each flow takes)
const stopped = [];
let consoleFails = [];
const jobs = [];
// (the console's check mostly waits — on its stand-in GitHub, on the pages it opens — so it runs beside
// the others rather than in one of their places)
if (!ONLY.length || ONLY.includes("console")) jobs.push({ name: "the console (tests/console-check.mjs)", beside: true, run: async (log) => {
  const r = await consoleCheck(browser, { root: ROOT, log });
  consoleFails = r.fails;
  log(r.fails.length ? `THE CONSOLE: ${r.fails.length} of ${r.passed + r.fails.length} checks failed.` : `The console: all ${r.passed} checks passed.`);
} });
for (const dpr of [1, 2]) for (const [name, flow] of Object.entries(FLOWS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  jobs.push({ name: `${name} @${dpr}x`, size: (LENGTH[name] || 2) * (dpr === 2 ? 1.5 : 1), run: async (log, job) => {
    const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: dpr });
    try {
      await ctx.route("**/data/front.json*", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(FRONT[name] || { photos: {} }) }));
      // (the pages ask GitHub for their newest data too, js/fresh.js: never here — the check goes by the
      // site's own copies, never by the network or what the owner has saved there. Last registered, so
      // it wins for GitHub's own address of data/front.json.)
      await ctx.route(/^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\//, (r) => r.abort());
      await ctx.addInitScript(stepping);                        // (the moments stepTo() steps to, and the holds)
      // (arriving from another page: note when the plain arrow was hidden — before js/cursor.js ran, from
      // the page's head, or only once it ran: arrowHidden())
      await ctx.addInitScript(() => {
        new MutationObserver(() => {
          if (window.__arrowHidden === undefined && document.documentElement && document.documentElement.classList.contains("cursor-ready"))
            window.__arrowHidden = window.__cursorProbe ? "once js/cursor.js ran" : "before js/cursor.js ran";
        }).observe(document, { subtree: true, attributes: true, attributeFilter: ["class"] });
      });
      const p = await ctx.newPage();
      p.__job = Object.assign(job, { log }, await shooter(ctx, p, VIEW, dpr));
      await flow(p, dpr);
    } finally { await ctx.close().catch(() => {}); }
  } });
}
jobs.sort((a, b) => (b.size || 0) - (a.size || 0));
console.log(`${jobs.length} jobs, ${Math.min(JOBS, jobs.filter((j) => !j.beside).length)} at a time beside the console's (${CORES} cores): ${jobs.map((j) => j.name.replace(/ \(.*/, "")).join(", ")}\n`);
const run = (job) => {
  const lines = [], t = Date.now(), stats = { states: 0, rest: 0, checks: 0 };
  return job.run((s) => lines.push(s), stats)
    .catch((e) => { const why = `${job.name}: ${e.message.split("\n")[0]}`; stopped.push(why); lines.push(`  STOPPED  ${why}`); })
    .then(() => {
      const took = Math.round((Date.now() - t) / 1000), how = stats.states ? ` (${stats.states} states: ${Math.round(stats.rest / 1000)} s waiting for the page to rest, ${Math.round(stats.checks / 1000)} s checking)` : "";
      console.log(`${job.name} — ${took} s${how}\n${lines.join("\n")}\n`);
    });
};
await Promise.all([
  ...jobs.filter((j) => j.beside).map(run),
  new Promise((done) => {
    const queue = jobs.filter((j) => !j.beside);
    let running = 0;
    const start = () => {
      if (!queue.length && !running) return done();
      while (running < JOBS && queue.length) { running++; run(queue.shift()).then(() => { running--; start(); }); }
    };
    start();
  }),
]);
await scan.close();
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
console.log(`(${Math.floor((Date.now() - T0) / 60000)} min ${Math.round((Date.now() - T0) / 1000) % 60} s)`);
if (stopped.length) console.log(`\nNOT CHECKED — a flow stopped before its states:\n  ${stopped.join("\n  ")}`);
if (colours.problems.length) console.log(`\nThe colour audit failed (at the top).`);
if (consoleFails.length) console.log(`\nThe console's check failed (near the top): ${consoleFails.join("; ")}.`);
process.exitCode = bad.length || stopped.length || colours.problems.length || consoleFails.length ? 1 : 0;
if (ONLY.length) console.log(`(Only ${ONLY.join(", ")}: no stamp — the push guard wants a full run.)`);
else if (!process.exitCode) {
  if (codeHere(ROOT) !== code) console.log("The code changed during the run: no stamp. Run it again.");
  else console.log(`Stamp: this code (${writeStamp(ROOT, results.length).code}) passed; .claude/hooks/push-guard.mjs lets a push of it through.`);
}
