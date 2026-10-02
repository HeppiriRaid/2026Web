/* ============================================================
   The console's check: console.html, driven end to end in Chromium against a
   stand-in for GitHub (the part of its REST API the console and the pages use,
   and raw.githubusercontent.com) and for GitHub Pages (the site as the
   stand-in's Main has it, a few seconds after each commit). Both run here, in
   memory, on 127.0.0.1 — the console and the pages honour a stand-in only there
   (window.__CONSOLE_TEST_API__) — and nothing is written to disk. The stand-in
   repository starts as this checkout's site with fixed data (data/front.json,
   data/illustration.json and three works' pictures, made here), so the check
   never depends on what the owner has uploaded.

   It covers signing in (a wrong token, the right one, remembered); the front
   page (a photo into a grey holder and into one with its own, scaled, not
   cropped; descriptions; the crop dragged, moved with the keys, centred; the
   caption rewritten, emptied and back; the originals back; a dropped image);
   the works (edit, add, order, replace, delete, all of them); saving (one
   commit for both; Main moved before and during a Save; a file changed
   somewhere else; a double click); the pages after each Save, at once, before
   Pages has it (js/fresh.js), and after; and the token never in a URL.
   Change the console, change this with it.

   Run alone (Node 18+ and Chromium), about a minute:
     node tests/console-check.mjs
   The full outline check (tests/fold-check.mjs) runs it too, so the push
   guard's stamp covers it. Options as there: CHROMIUM, PLAYWRIGHT_CORE.
   ============================================================ */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const HERE = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const TOKEN = "test-token";
// ms from a commit on Main to the stand-in Pages serving it: long enough that every page looked at
// right after a Save is looked at before Pages has it (the site must show it at once: js/fresh.js)
const DELAY = 4000;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".otf": "font/otf", ".ttf": "font/ttf" };

// the works the stand-in starts with (a Japanese title with markup: it must stay plain text)
const WORKS = { saveId: "", works: [
  { id: "wfix1", title: "夜の庭 <i>x</i>", date: "2024", medium: "Ink", width: 900, height: 1200, image: "assets/img/illustration/fixture-1.webp" },
  { id: "wfix2", title: "Harbour", date: "2025", medium: "Oil", width: 1200, height: 900, image: "assets/img/illustration/fixture-2.webp" },
  { id: "wfix3", title: "Still life", date: "2026", medium: "Gouache", width: 1000, height: 1000, image: "assets/img/illustration/fixture-3.webp" }] };
// a caption as long as the console allows (60 characters a part): still two lines, inside the picture
const LONG = { title: "The house on the hill in the evening, after a day of rain", date: "June 15 to July 2, 2026, over three long weekends",
  medium: "Graphic Paint: the Morph brush, GP-Mix, a scanned ink wash", location: "Redmond, Washington, the studio at the back of the house" };

// ---- the stand-in GitHub: a repository in memory ----------------------------------------------
const sha1 = (b) => crypto.createHash("sha1").update(b).digest("hex");
class Repo {
  constructor(seed) { this.seed = seed; this.gen = 0; this.reset(); }
  reset() {
    this.gen++;
    this.blobs = new Map(); this.trees = new Map(); this.commits = new Map();
    this.log = []; this.preflights = 0; this.patchOk = 0; this.patch422 = 0; this.race = false; this.held = false; this.waiting = null;
    const files = {};
    for (const [p, data] of this.seed) files[p] = this.blob(data);
    this.ref = { Main: this.commit(this.tree(files), [], "initial") };
    this.live = files;                                          // what Pages serves
  }
  blob(data) { const s = sha1(Buffer.concat([Buffer.from(`blob ${data.length}\0`), data])); this.blobs.set(s, data); return s; }
  tree(files) { const s = sha1(JSON.stringify(Object.entries(files).sort((a, b) => (a[0] < b[0] ? -1 : 1)))); this.trees.set(s, { ...files }); return s; }
  commit(tree, parents, message) {
    const s = sha1(`${tree}|${parents.join()}|${message}|${this.commits.size}|${Math.random()}`);
    this.commits.set(s, { tree, parents, message }); return s;
  }
  head() { return this.trees.get(this.commits.get(this.ref.Main).tree); }
  files() { return Object.keys(this.head()).sort(); }
  file(p) { const s = this.head()[p]; return s ? this.blobs.get(s) : null; }
  json(p) { const b = this.file(p); return b ? JSON.parse(b.toString("utf8")) : null; }
  // Pages publishes Main a moment later — or, while held, not until let go (so a check can look at
  // the site in the gap for as long as it needs)
  publish() {
    const files = { ...this.head() }, gen = this.gen;
    setTimeout(() => { if (gen !== this.gen) return; if (this.held) this.waiting = files; else this.live = files; }, DELAY);
  }
  hold(on) { this.held = on; if (!on && this.waiting) { this.live = this.waiting; this.waiting = null; } }
  async published() { while (this.live["data/front.json"] !== this.head()["data/front.json"] || this.live["data/illustration.json"] !== this.head()["data/illustration.json"]) await new Promise((r) => setTimeout(r, 100)); }
  // someone else's commit on Main
  put(changes, message) {
    const files = { ...this.head() };
    for (const [p, data] of Object.entries(changes)) files[p] = this.blob(Buffer.from(data));
    this.ref.Main = this.commit(this.tree(files), [this.ref.Main], message);
    this.publish();
  }
}

// GitHub's REST API, the part the console and the pages (js/fresh.js) use, as GitHub answers it:
// a CORS preflight for the Authorization header, 401 for a bad token, reads open to anyone (a
// public repository), file contents in base64 wrapped at 60 characters (or raw, when asked),
// trees with deletions (sha null; deleting a missing path is a 422), a ref update that is no
// fast-forward refused with a 422, branch names that care about case, and replies the browser
// may cache (the console must ask past its cache). And raw.githubusercontent.com, at /raw/.
function api(repo) {
  const PREFIX = "/repos/heppiriraid/2026web";
  return (req, res) => {
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "ETag, Link, X-GitHub-Request-Id" };
    if (req.method === "OPTIONS") {
      repo.preflights++;
      res.writeHead(204, { ...cors, "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE",
        "Access-Control-Allow-Headers": req.headers["access-control-request-headers"] || "Authorization", "Access-Control-Max-Age": "0" });
      return res.end();
    }
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const reply = (code, obj, raw) => {
        const body = raw || Buffer.from(obj === undefined ? "" : JSON.stringify(obj));
        res.writeHead(code, { ...cors, "Content-Type": raw ? "application/octet-stream" : "application/json",
          "Content-Length": body.length, "Cache-Control": "private, max-age=60" });
        res.end(body);
      };
      const u = new URL(req.url, "http://x"), p = decodeURIComponent(u.pathname), m = req.method;
      let b = null;
      try { b = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null; } catch (e) { return reply(400, { message: "Problems parsing JSON" }); }
      repo.log.push(`${m} ${req.url}`);
      if (m === "GET" && p.startsWith("/raw/")) {                 // raw.githubusercontent.com/<owner>/<repo>/Main/…
        const s = repo.head()[p.slice("/raw/".length)], data = s && repo.blobs.get(s);
        if (!data) return reply(404, { message: "404: Not Found" });
        res.writeHead(200, { ...cors, "Content-Type": TYPES[path.extname(p)] || "text/plain", "Content-Length": data.length, "Cache-Control": "max-age=300" });
        return res.end(data);
      }
      const auth = req.headers.authorization;
      if (auth !== undefined && auth !== "Bearer " + TOKEN && auth !== "token " + TOKEN) return reply(401, { message: "Bad credentials", documentation_url: "https://docs.github.com/rest" });
      if (auth === undefined && m !== "GET") return reply(401, { message: "Requires authentication" });
      if (!p.toLowerCase().startsWith(PREFIX)) return reply(404, { message: "Not Found" });
      const rest = p.slice(PREFIX.length);
      if (m === "GET" && rest.startsWith("/contents/")) {
        if ((u.searchParams.get("ref") || "Main") !== "Main") return reply(404, { message: "No commit found for the ref" });
        const path_ = rest.slice("/contents/".length), s = repo.head()[path_];
        if (!s) return reply(404, { message: "Not Found" });
        const data = repo.blobs.get(s);
        if (/raw/.test(req.headers.accept || "")) return reply(200, null, data);
        const b64 = data.toString("base64");
        return reply(200, { type: "file", encoding: "base64", size: data.length, path: path_, sha: s, content: b64.replace(/.{60}/g, "$&\n") + "\n" });
      }
      if (m === "GET" && rest.startsWith("/git/ref/heads/")) {
        const br = rest.slice("/git/ref/heads/".length);
        return repo.ref[br] ? reply(200, { ref: "refs/heads/" + br, object: { sha: repo.ref[br], type: "commit" } }) : reply(404, { message: "Not Found" });
      }
      if (m === "GET" && rest.startsWith("/git/commits/")) {
        const sha = rest.split("/").pop(), c = repo.commits.get(sha);
        return c ? reply(200, { sha, tree: { sha: c.tree }, parents: c.parents.map((x) => ({ sha: x })), message: c.message }) : reply(404, { message: "Not Found" });
      }
      if (m === "GET" && rest.startsWith("/git/trees/")) {
        const sha = rest.split("/").pop(), t = repo.trees.get(sha);
        if (!t) return reply(404, { message: "Not Found" });
        return reply(200, { sha, truncated: false, tree: Object.keys(t).sort().map((x) => ({ path: x, mode: "100644", type: "blob", sha: t[x] })) });
      }
      if (m === "POST" && rest === "/git/blobs") {
        return reply(201, { sha: repo.blob(b.encoding === "base64" ? Buffer.from(b.content, "base64") : Buffer.from(b.content, "utf8")) });
      }
      if (m === "POST" && rest === "/git/trees") {
        const base = repo.trees.get(b.base_tree);
        if (!base) return reply(422, { message: "Invalid tree info" });
        const files = { ...base };
        for (const e of b.tree) {
          if (e.sha === null) {
            if (!(e.path in files)) return reply(422, { message: `GitHub validation failed: path '${e.path}' not in tree` });
            delete files[e.path];
          } else {
            if (!repo.blobs.has(e.sha)) return reply(422, { message: "Invalid sha" });
            files[e.path] = e.sha;
          }
        }
        return reply(201, { sha: repo.tree(files) });
      }
      if (m === "POST" && rest === "/git/commits") {
        if (!repo.trees.has(b.tree)) return reply(422, { message: "Tree not found" });
        return reply(201, { sha: repo.commit(b.tree, b.parents, b.message) });
      }
      if (m === "PATCH" && rest.startsWith("/git/refs/heads/")) {
        const br = rest.slice("/git/refs/heads/".length), c = repo.commits.get(b.sha);
        if (!repo.ref[br]) return reply(422, { message: "Reference does not exist" });
        if (!c) return reply(422, { message: "Object does not exist" });
        if (repo.race) { repo.race = false; repo.put({ "notes/race-change.txt": "pushed mid-save\n" }, "concurrent push"); }   // someone pushes meanwhile
        if (!b.force && !c.parents.includes(repo.ref[br])) { repo.patch422++; return reply(422, { message: "Update is not a fast forward" }); }
        repo.ref[br] = b.sha; repo.patchOk++;
        repo.publish();
        return reply(200, { ref: "refs/heads/" + br, object: { sha: b.sha, type: "commit" } });
      }
      return reply(404, { message: `Not Found (stand-in: ${m} ${rest})` });
    });
  };
}
// GitHub Pages: the site as Main had it a moment ago, never cached
function pages(repo) {
  return (req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
    if (!p || p.endsWith("/")) p += "index.html";
    const s = repo.live[p], data = s && repo.blobs.get(s);
    if (!data) { res.writeHead(404, { "Cache-Control": "no-store" }); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream", "Content-Length": data.length, "Cache-Control": "no-store" });
    res.end(data);
  };
}
// this checkout's site, but the data and the owner's uploads: fixtures stand in for them
function seed(root, fixtures) {
  const out = new Map();
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "tests") continue;
      const abs = path.join(dir, e.name), rel = path.relative(root, abs).split(path.sep).join("/");
      if (e.isDirectory()) { if (!/^assets\/img\/(front|illustration)$/.test(rel)) walk(abs); }
      else if (e.isFile() && !/^data\/(front|illustration)\.json$/.test(rel)) out.set(rel, fs.readFileSync(abs));
    }
  })(root);
  for (const [p, data] of Object.entries(fixtures)) out.set(p, Buffer.from(data));
  return out;
}
const listen = (handler) => new Promise((r) => { const s = http.createServer(handler); s.listen(0, "127.0.0.1", () => r(s)); });

// test pictures, drawn here: four quarters in four colours and their name
async function pictures(browser) {
  const ctx = await browser.newContext(), p = await ctx.newPage();
  const b64 = await p.evaluate(async (list) => {
    const out = {};
    for (const [name, w, h, type, alpha, p3] of list) {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const g = c.getContext("2d", p3 ? { colorSpace: "display-p3" } : {});
      g.globalAlpha = alpha ? 0.6 : 1;
      [["#b8432f", 0, 0], ["#2f6db8", 1, 0], ["#3c9a5a", 0, 1], ["#7a4bb0", 1, 1]].forEach(([col, i, j]) => { g.fillStyle = col; g.fillRect(i * w / 2, j * h / 2, w / 2, h / 2); });
      g.globalAlpha = 1; g.fillStyle = "#ffffff"; g.font = Math.round(Math.min(w, h) / 8) + "px sans-serif"; g.fillText(name, w * 0.08, h * 0.5);
      const blob = await new Promise((r) => c.toBlob(r, type, 0.85)), u = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      out[name] = btoa(s);
    }
    return out;
  }, [["big", 3000, 4000, "image/jpeg"], ["alpha", 1600, 900, "image/png", true], ["replace", 2000, 1500, "image/jpeg"], ["small", 400, 300, "image/png", false, true],
    ["fixture-1", 900, 1200, "image/webp"], ["fixture-2", 1200, 900, "image/webp"], ["fixture-3", 1000, 1000, "image/webp"]]);
  await ctx.close();
  return Object.fromEntries(Object.entries(b64).map(([k, v]) => [k, Buffer.from(v, "base64")]));
}

// a front page photo's file, as the console makes it: the whole picture, scaled so the part its
// holder shows is at most 2000 px on its long side (js/console.js, processPhoto)
function photoSize(W, H, slot) {
  const ar = slot.w / slot.h, cw = Math.min(W, H * ar), ch = cw / ar, k = Math.min(1, 2000 / Math.max(cw, ch));
  return [Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k))];
}
const capText = (c) => [["Title: “", c.title, "”"], ["Date: ", c.date, ""], ["Made with: ", c.medium, ""], ["Location: ", c.location, ""]]
  .filter((x) => x[1]).map((x) => x.join("")).join(" | ");

// the front page as a visitor gets it: each holder's photo and crop, each caption's words, lines and right end (pt)
function frontInfo() {
  const k = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--k")) || 1;
  const stage = document.querySelector(".stage").getBoundingClientRect(), slots = {}, caps = {};
  for (const f of document.querySelectorAll("figure[data-slot]")) {
    const i = f.querySelector("img");
    slots[f.getAttribute("data-slot")] = { name: f.getAttribute("data-slot-name"), w: parseFloat(f.style.getPropertyValue("--w")), h: parseFloat(f.style.getPropertyValue("--h")),
      src: i ? i.getAttribute("src") : null, alt: i ? i.alt : null, ok: !!i && i.complete && i.naturalWidth > 0,
      pos: i ? getComputedStyle(i).objectPosition : null, right: (f.getBoundingClientRect().right - stage.left) / k };
  }
  for (const c of document.querySelectorAll("[data-caption-for]")) {
    const r = document.createRange(); r.selectNodeContents(c);
    const rects = [...r.getClientRects()].filter((x) => x.width > 0), tops = [...new Set(rects.map((x) => Math.round(x.top)))];
    caps[c.getAttribute("data-caption-for")] = { text: c.textContent,
      parts: { title: c.getAttribute("data-title"), date: c.getAttribute("data-date"), medium: c.getAttribute("data-medium"), location: c.getAttribute("data-location") },
      lines: tops.length, rights: tops.map((t) => Math.max(...rects.filter((x) => Math.round(x.top) === t).map((x) => (x.right - stage.left) / k))) };
  }
  return { slots, caps };
}
// a page as published, once its curtain has lifted
async function published(env, fn, page = "index.html") {
  const p = await env.ctx.newPage(), errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  try {
    await p.goto(`${env.SITE}/${page}?t=${Date.now()}`);
    await p.waitForFunction(() => getComputedStyle(document.getElementById("preloader")).display === "none", null, { timeout: 30000 });
    await p.waitForTimeout(600);
    return { ...(await p.evaluate(fn)), errors };
  } finally { await p.close(); }
}
// the console, signed in
async function console_(env, signIn = true) {
  const p = await env.ctx.newPage();
  p.on("dialog", (d) => { env.dialogs.push(d.type() + ": " + d.message().slice(0, 120)); d.accept(); });
  p.on("pageerror", (e) => env.errors.push(String(e)));
  await p.goto(env.SITE + "/console.html");
  if (signIn) { await p.fill("#token", TOKEN); await p.click("#connectBtn"); await p.waitForSelector("#editor:not([hidden])"); }
  return p;
}
const waitStatus = (p, re, t = 60000) => p.waitForFunction((s) => new RegExp(s).test(document.getElementById("status").textContent), re.source, { timeout: t });
async function save(p) { await p.click("#saveBtn"); await waitStatus(p, /Live on the site/); }
const idle = (p) => p.waitForFunction(() => !document.querySelector(".slot.is-busy, .w.is-busy"), null, { timeout: 60000 });

/* ---------- the front page: photos, crops, captions ------------------------------------------ */
async function front(env) {
  const { repo, check, file } = env;
  const page0 = await published(env, frontInfo);
  const ids = Object.keys(page0.slots), own = ids.filter((id) => page0.slots[id].src), grey = ids.filter((id) => !page0.slots[id].src);
  const CAPT = Object.keys(page0.caps)[0];
  if (own.length < 2 || grey.length < 2 || !CAPT) return check(false, "the front page has two holders with photos of their own, two grey ones and a caption", { own, grey, CAPT });
  const [G, G2] = grey, O = own[0], O2 = own[own.length - 1], cap0 = page0.caps[CAPT];
  check(cap0.text === capText(cap0.parts), "the page's caption reads as its parts (data-title …) say", cap0);

  const p = await console_(env);
  const json = () => repo.json("data/front.json");
  const card = (id) => `.slot[data-slot="${id}"]`;
  const cards = () => p.$$eval(".slot", (els) => Object.fromEntries(els.map((e) => { const i = e.querySelector("img"), t = e.querySelector(".tag");
    return [e.getAttribute("data-slot"), { name: e.querySelector(".name").textContent, src: i ? i.src : "", pos: i ? i.style.objectPosition : "", tag: t ? t.textContent : "" }]; })));
  const pos = () => p.$eval("#slotPv .frame img", (i) => i.style.objectPosition.split(" ").map(parseFloat));
  const near = (a, b) => Math.abs(a[0] - b[0]) < 0.15 && Math.abs(a[1] - b[1]) < 0.15;
  const parts = () => p.$$eval("#capFields input", (els) => els.map((e) => e.value));
  async function replace(id, f) {
    await p.click(card(id));
    const [fc] = await Promise.all([p.waitForEvent("filechooser"), p.click("#slotReplace")]);
    await fc.setFiles([f]);
    await p.waitForFunction(() => !!document.querySelector(".slot.is-busy"), null, { timeout: 5000 }).catch(() => {});
    await idle(p);
  }

  // the holders, read from the page
  let c = await cards();
  check(Object.keys(c).join() === ids.join() && ids.every((id) => c[id].name === page0.slots[id].name), "the console lists the front page's holders, in its order", Object.keys(c));
  check(ids.every((id) => (page0.slots[id].src ? c[id].src.endsWith(page0.slots[id].src) : !c[id].src)), "the page's own photos show, the grey holders are grey", c);
  check(new RegExp(`Loaded: ${ids.length} front page photos`).test(await p.textContent("#status")), "the status says what loaded", await p.textContent("#status"));

  // 1 a grey holder gets a photo
  await p.click(card(G));
  check(await p.isDisabled("#slotReset") && await p.isDisabled("#fAlt") && await p.isDisabled("#slotCentre") && (await p.textContent("#slotReset")) === "Remove photo",
    "a grey holder: nothing to remove, describe or centre yet");
  const fr = await p.$eval("#slotPv .frame", (e) => [e.offsetWidth, e.offsetHeight]);
  check(Math.abs(fr[0] / fr[1] - page0.slots[G].w / page0.slots[G].h) < 0.02, "the large view has the holder's own shape", fr);
  await replace(G, file("big.jpg"));
  c = await cards();
  check(c[G].tag === "New photo" && /^blob:/.test(c[G].src), "a new photo shows at once, marked new", c[G]);
  check(!(await p.isDisabled("#saveBtn")), "Save turns on");
  repo.hold(true);                                              // (Pages, behind until let go)
  await save(p);
  let f = json(), pub;
  const g1 = f.photos[G], want1 = photoSize(3000, 4000, page0.slots[G]);
  check(g1 && new RegExp(`^assets/img/front/${G}-\\w+\\.webp$`).test(g1.image) && g1.width === want1[0] && g1.height === want1[1] && !g1.focus && repo.files().includes(g1.image),
    `saved: a 3000 × 4000 photo scaled, not cropped, to ${want1.join(" × ")}, in the middle`, g1);
  check(/index\.html/.test(await p.getAttribute("#viewLink", "href")), "View page now opens the front page");
  pub = await published(env, frontInfo);
  check(pub.slots[G].src === env.RAW + g1.image && pub.slots[G].ok && pub.slots[O].src === page0.slots[O].src,
    "on the site at once: the photo in its holder, from the repository until Pages has it; the others as they were", pub.slots[G]);
  {                                                             // …and arriving from the works' page menu
    const ip = await env.ctx.newPage(), ierr = [];
    ip.on("pageerror", (e) => ierr.push(String(e)));
    await ip.goto(env.SITE + "/illustration.html");
    await ip.waitForFunction(() => getComputedStyle(document.getElementById("preloader")).display === "none", null, { timeout: 30000 });
    await ip.click("#menuBtn");
    await ip.waitForFunction(() => document.getElementById("menuNav").classList.contains("open"));
    await ip.waitForTimeout(900);
    await ip.click("#menuNav a[href='index.html#about']");
    await ip.waitForURL(/index\.html/);
    await ip.waitForFunction(() => getComputedStyle(document.getElementById("preloader")).display === "none", null, { timeout: 30000 });
    const info = await ip.evaluate((id) => { const i = document.querySelector(`[data-slot="${id}"] img`);
      return { src: i && i.getAttribute("src"), ok: !!i && i.complete && i.naturalWidth > 0, fetched: performance.getEntriesByType("resource").filter((e) => /front\.json/.test(e.name)).length }; }, G);
    check(info.src === env.RAW + g1.image && info.ok && info.fetched === 0 && ierr.length === 0, "from the works' page menu: the same, from the photos fetched on the way", info);
    await ip.close();
  }
  repo.hold(false);
  await repo.published();
  pub = await published(env, frontInfo);
  check(pub.slots[G].src === g1.image && pub.slots[G].ok, "…and from the site itself once Pages has published it", pub.slots[G]);

  // 2 its crop: dragged, moved with the keys, centred, to the edge
  await p.click(card(G));
  await p.$eval("#slotPv .frame", (e) => e.scrollIntoView({ block: "center" }));
  await p.waitForSelector("#slotPv .frame.can-crop");
  const box = await p.$eval("#slotPv .frame", (fr) => {
    const r = fr.getBoundingClientRect(), im = fr.querySelector("img"), k = Math.max(fr.clientWidth / im.naturalWidth, fr.clientHeight / im.naturalHeight);
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), over: [im.naturalWidth * k - fr.clientWidth, im.naturalHeight * k - fr.clientHeight] };
  });
  const ax = box.over[1] > box.over[0] ? 1 : 0, at = (v) => { const a = [50, 50]; a[ax] = v; return a; }, r1 = (v) => Math.round(v * 10) / 10;
  check(box.over[ax] > 20 && box.over[1 - ax] < 0.5, "a photo of another shape has room to move one way", box.over);
  async function drag(by) {
    await p.mouse.move(box.x, box.y); await p.mouse.down();
    await p.mouse.move(box.x + (ax ? 0 : by / 2), box.y + (ax ? by / 2 : 0), { steps: 3 });
    await p.mouse.move(box.x + (ax ? 0 : by), box.y + (ax ? by : 0), { steps: 3 });
    await p.mouse.up();
  }
  await drag(-60);
  let want = at(r1(50 + 60 / box.over[ax] * 100));
  check(near(await pos(), want), "dragging the photo moves the crop with it", { got: await pos(), want });
  c = await cards();
  check(near(c[G].pos.split(" ").map(parseFloat), want), "…its card follows", c[G].pos);
  check(!(await p.isDisabled("#slotCentre")) && !(await p.isDisabled("#saveBtn")), "…Centre the crop and Save turn on");
  const fwd = ax ? "ArrowDown" : "ArrowRight", across = ax ? "ArrowLeft" : "ArrowUp";
  await p.focus("#slotPv .frame");
  await p.keyboard.press(fwd); want = at(r1(want[ax] - 1));
  check(near(await pos(), want), "an arrow key moves it 1% of its room", await pos());
  await p.keyboard.press("Shift+" + fwd); want = at(r1(want[ax] - 10));
  check(near(await pos(), want), "…Shift and an arrow 10%", await pos());
  await p.keyboard.press(across);
  check(near(await pos(), want), "…and not the way it has no room", await pos());
  await p.click("#slotCentre");
  check(near(await pos(), [50, 50]) && await p.isDisabled("#slotCentre"), "Centre the crop: back in the middle");
  await drag(-Math.round(box.over[ax] / 2 + 80));
  check(near(await pos(), at(100)), "dragged past its edge, it stops at the edge", await pos());
  await p.focus("#slotPv .frame");
  for (let i = 0; i < 3; i++) await p.keyboard.press(fwd);
  want = at(97);
  check(near(await pos(), want), "…and the keys bring it back", await pos());
  await save(p);
  f = json();
  check(JSON.stringify(f.photos[G].focus) === JSON.stringify(want), "saved: the crop with the photo", f.photos[G]);
  pub = await published(env, frontInfo);
  check(pub.slots[G].pos === `${want[0]}% ${want[1]}%`, "published: the holder shows that part", pub.slots[G].pos);

  // 3 the caption rewritten, as long as it can be
  await p.click(card(CAPT));
  check(!(await p.isHidden("#capFields")) && JSON.stringify(await parts()) === JSON.stringify([cap0.parts.title, cap0.parts.date, cap0.parts.medium, cap0.parts.location]),
    "the holder with a caption shows its parts, as the page gives them", await parts());
  check(await p.isDisabled("#capReset") && (await p.textContent("#capPv")) === "On the page: " + cap0.text, "…its words as on the page; Original caption off", await p.textContent("#capPv"));
  check(Object.values(LONG).every((v) => v.length <= 60), "(the long caption's parts fit the fields)");
  for (const [k, v] of Object.entries(LONG)) await p.fill("#c" + k[0].toUpperCase() + k.slice(1), v);
  check((await p.textContent("#capPv")) === "On the page: " + capText(LONG) && !(await p.isDisabled("#capReset")), "the preview reads as the page will; Original caption on", await p.textContent("#capPv"));
  await save(p);
  f = json();
  check(f.captions && JSON.stringify(f.captions[CAPT]) === JSON.stringify(LONG), "saved: the caption's parts", f.captions);
  pub = await published(env, frontInfo);
  const pc = pub.caps[CAPT], edge = pub.slots[CAPT] ? pub.slots[CAPT].right : 1e9;
  check(pc.text === capText(LONG), "published: the new caption", pc.text);
  check(pc.lines === 2 && pc.rights.every((r) => r <= edge + 0.05 && r >= edge - 3 && Math.abs(r - cap0.rights[0]) < 0.6),
    "…on two lines, each ending where the page's own did, inside the picture's right edge", { lines: pc.lines, rights: pc.rights, own: cap0.rights, edge });

  // 4 a holder with its own photo gets a new one, described; the caption emptied
  await replace(O, file("alpha.png"));
  await p.fill("#fAlt", "Koki at work");
  await p.click(card(CAPT));
  for (const k of ["Title", "Date", "Medium", "Location"]) await p.fill("#c" + k, "");
  check((await p.textContent("#capPv")) === "No caption: the line under the photo stays empty.", "an emptied caption: the preview says so");
  await save(p);
  f = json();
  const want4 = photoSize(1600, 900, page0.slots[O]);
  check(f.photos[O] && f.photos[O].width === want4[0] && f.photos[O].height === want4[1] && f.photos[O].alt === "Koki at work" && repo.files().includes(page0.slots[O].src),
    "saved: the new photo (small enough to keep its size), described; the page's own file kept", f.photos[O]);
  check(f.captions && Object.values(f.captions[CAPT]).every((v) => v === ""), "saved: the caption emptied", f.captions);
  pub = await published(env, frontInfo);
  check(pub.slots[O].src.endsWith(f.photos[O].image) && pub.slots[O].alt === "Koki at work" && pub.slots[O].ok, "published: the new photo, described, in before the curtain lifts", pub.slots[O]);
  check(pub.caps[CAPT].text === "" && pub.caps[CAPT].lines === 0, "published: no caption", pub.caps[CAPT]);

  // 5 the first photo replaced again: its old file leaves, the new one starts in the middle
  const gOld = f.photos[G].image;
  await replace(G, file("replace.jpg"));
  check(near(await pos(), [50, 50]), "a new photo starts in the middle", await pos());
  await save(p);
  f = json();
  const want5 = photoSize(2000, 1500, page0.slots[G]);
  check(f.photos[G].image !== gOld && !repo.files().includes(gOld) && repo.files().includes(f.photos[G].image) && f.photos[G].width === want5[0] && f.photos[G].height === want5[1] && !f.photos[G].focus,
    "replaced again: the old file deleted, the new one in, in the middle", f.photos[G]);

  // 6 the page's own photo, described anew
  await p.click(card(O2));
  await p.fill("#fAlt", "Calligraphy, cursive");
  await save(p);
  f = json();
  check(f.photos[O2] && f.photos[O2].image === page0.slots[O2].src && f.photos[O2].alt === "Calligraphy, cursive" && !("width" in f.photos[O2]), "saved: a description for the page's own photo", f.photos[O2]);
  pub = await published(env, frontInfo);
  check(pub.slots[O2].src === page0.slots[O2].src && pub.slots[O2].alt === "Calligraphy, cursive", "published: the same photo, described anew", pub.slots[O2]);

  // 7 the originals back: the photo, the grey holder, the caption
  const oFile = f.photos[O].image, gFile = f.photos[G].image;
  await p.click(card(O));
  check((await p.textContent("#slotReset")) === "Use the original" && !(await p.isDisabled("#slotReset")), "a holder with its own photo offers the original");
  await p.click("#slotReset");
  await p.click(card(G)); await p.click("#slotReset");
  await p.click(card(CAPT)); await p.click("#capReset");
  check(JSON.stringify(await parts()) === JSON.stringify([cap0.parts.title, cap0.parts.date, cap0.parts.medium, cap0.parts.location]) && await p.isDisabled("#capReset"),
    "Original caption: the page's own parts back", await parts());
  c = await cards();
  check(c[O].src.endsWith(page0.slots[O].src) && c[O].tag === "Original" && !c[G].src && c[G].tag === "Removed", "before Save: the original back, the holder grey, both marked", [c[O], c[G]]);
  await save(p);
  f = json();
  check(!f.photos[O] && !f.photos[G] && !f.captions && !repo.files().includes(oFile) && !repo.files().includes(gFile) &&
    repo.files().includes(page0.slots[O].src) && repo.files().includes(page0.slots[O2].src), "saved: their entries and the caption gone, their files deleted, the page's own untouched", f);
  pub = await published(env, frontInfo);
  check(pub.slots[O].src === page0.slots[O].src && pub.slots[O].alt === page0.slots[O].alt && pub.slots[G].src === null && pub.caps[CAPT].text === cap0.text,
    "published: the original photo and description, the holder grey, the page's own caption", { [O]: pub.slots[O], [G]: pub.slots[G], caption: pub.caps[CAPT].text });

  // 8 an image dropped on a holder, saved with a works edit: one commit
  const ok0 = repo.patchOk;
  await p.evaluate(async ([b64, id]) => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const dt = new DataTransfer(); dt.items.add(new File([u], "dropped.png", { type: "image/png" }));
    const c = document.querySelector(`.slot[data-slot="${id}"]`), r = c.getBoundingClientRect();
    const at = { clientX: r.left + 20, clientY: r.top + 20, bubbles: true, cancelable: true, dataTransfer: dt };
    c.dispatchEvent(new DragEvent("dragover", at)); c.dispatchEvent(new DragEvent("drop", at));
  }, [env.img.small.toString("base64"), G2]);
  await p.waitForFunction(() => !!document.querySelector(".slot.is-busy"), null, { timeout: 5000 }).catch(() => {});
  await idle(p);
  c = await cards();
  check(c[G2].tag === "New photo", "an image dropped on a holder goes into it", c[G2]);
  await p.click('.w[data-i="0"]'); await p.fill("#fTitle", "Saved with the photos");
  await save(p);
  f = json();
  const want8 = photoSize(400, 300, page0.slots[G2]);
  check(repo.patchOk === ok0 + 1 && f.photos[G2] && f.photos[G2].width === want8[0] && repo.json("data/illustration.json").works[0].title === "Saved with the photos",
    "the photo and the works saved in one commit", { commits: repo.patchOk - ok0, photo: f.photos[G2] });
  pub = await published(env, frontInfo);
  check(pub.slots[G2].ok && pub.slots[G2].src.endsWith(f.photos[G2].image) && pub.errors.length === 0, "published: the dropped photo, no page errors", { slot: pub.slots[G2], errors: pub.errors });

  // 9 the front page's file changed somewhere else: asked before it is replaced
  env.dialogs.length = 0;
  repo.put({ "data/front.json": JSON.stringify({ saveId: "elsewhere", photos: {} }, null, 2) + "\n" }, "put elsewhere");
  await p.click(card(G2)); await p.fill("#fAlt", "Graphic Paint, a study");
  await save(p);
  check(env.dialogs.some((d) => /front page's photos and captions were changed somewhere else/.test(d)), "changed somewhere else: asked first", env.dialogs);
  f = json();
  check(f.photos[G2] && f.photos[G2].alt === "Graphic Paint, a study", "…and saved after the yes", f.photos[G2]);

  // 10 unsaved changes keep the tab
  await p.click(card(O2)); await p.fill("#fAlt", "unsaved");
  env.dialogs.length = 0;
  await p.close({ runBeforeUnload: true });
  await new Promise((r) => setTimeout(r, 800));
  check(env.dialogs.some((d) => /^beforeunload/.test(d)), "leaving with unsaved changes asks first", env.dialogs);
}

/* ---------- the works -------------------------------------------------------------------------- */
async function works(env) {
  const { repo, check, file } = env;
  let p = await console_(env, false);
  const titles = () => p.$$eval(".w .t", (els) => els.map((e) => e.textContent));
  const list = () => repo.json("data/illustration.json").works;
  const cardBox = (i) => p.$eval(`.w[data-i="${i}"] .pic`, (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.right }; });
  const N0 = WORKS.works.length;

  // 1 a wrong token, then the right one
  await p.fill("#token", "not-the-token"); await p.click("#connectBtn");
  await p.waitForFunction(() => document.getElementById("loginError").textContent.length > 0);
  check(/401/.test(await p.textContent("#loginError")), "a wrong token: refused, with GitHub's 401", await p.textContent("#loginError"));
  await p.fill("#token", TOKEN); await p.click("#connectBtn");
  await p.waitForSelector("#editor:not([hidden])");
  let t = await titles();
  check(t.length === N0 && t[0] === WORKS.works[0].title, "the works load; a Japanese title with markup shows as plain text", t);
  check(!(await p.$(".w i")), "no markup comes in with a title");

  // 2 a title edited
  await p.click('.w[data-i="1"]'); await p.fill("#fTitle", "Edited one");
  check(!(await p.isDisabled("#saveBtn")), "Save turns on after an edit");
  await save(p);
  let w = list();
  check(w[1].title === "Edited one" && w[0].title === WORKS.works[0].title, "saved (the Japanese title intact)", w.map((x) => x.title));

  // 3 three pictures added at the third place
  let [fc] = await Promise.all([p.waitForEvent("filechooser"), p.click(".ins >> nth=2")]);
  await fc.setFiles([file("big.jpg"), file("alpha.png"), file("small.png")]);
  await p.waitForFunction(() => !document.querySelector(".w.is-busy") && document.querySelectorAll(".w .tag").length === 3, null, { timeout: 60000 });
  t = await titles();
  check(t[2] === "big" && t[3] === "alpha" && t[4] === "small" && t.length === N0 + 3, "three new works, in at the third place", t);
  repo.hold(true);                                              // (Pages, behind until let go)
  await save(p);
  w = list();
  const W = (n) => w.find((x) => x.title === n), big = W("big"), alpha = W("alpha"), small = W("small"), files = repo.files();
  check(big && big.image && big.full && big.width === 900 && big.height === 1200, "a big picture: a row file (900 × 1200) and a zoom file", big);
  check(alpha && alpha.image && !alpha.full && alpha.width === 1600 && alpha.height === 900, "a 1600 × 900 picture: one file (it fits the row)", alpha);
  check(small && small.image && !small.full && small.width === 400, "a small wide-colour picture: one file, its own size", small);
  check([big.image, big.full, alpha.image, small.image].every((x) => files.includes(x)), "all the new files are in the repository");

  // 4 the illustration page as published: every work, and the big one zooms to its own file
  {
    const ip = await env.ctx.newPage(), ierr = [];
    ip.on("pageerror", (e) => ierr.push(String(e)));
    await ip.goto(env.SITE + "/illustration.html");
    await ip.waitForFunction(() => getComputedStyle(document.getElementById("preloader")).display === "none", null, { timeout: 30000 });
    await ip.waitForTimeout(1200);
    const info = await ip.evaluate((raw) => ({ n: document.querySelectorAll(".work").length,
      ok: [...document.querySelectorAll(".work-btn img")].filter((i) => i.complete && i.naturalWidth > 0).length,
      repo: [...document.querySelectorAll(".work-btn img")].filter((i) => (i.getAttribute("data-src") || "").startsWith(raw)).length }), env.RAW);
    check(info.n === N0 + 3 && info.ok >= 3, "the illustration page at once: every work, pictures in", info);
    check(info.repo === 3, "…the three new pictures from the repository until Pages has them", info);
    const idx = await ip.evaluate(() => [...document.querySelectorAll(".work")].findIndex((x) => x.querySelector("img[data-full]")));
    for (let k = 0; k < idx; k++) { await ip.keyboard.press("ArrowRight"); await ip.waitForTimeout(250); }
    await ip.waitForTimeout(900);
    const r = await ip.evaluate((i) => { const b = document.querySelectorAll(".work-btn")[i].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, idx);
    await ip.mouse.click(r.x, r.y);
    await ip.waitForTimeout(2200);
    const z = await ip.evaluate(() => ({ open: document.getElementById("zoom").classList.contains("is-open"), src: (document.querySelector(".zoom-fig img") || { getAttribute: () => null }).getAttribute("src") }));
    check(z.open && typeof z.src === "string" && z.src.endsWith(big.full), "…the big work zooms to its zoom file", z);
    check(ierr.length === 0, "…no page errors", ierr);
    await ip.close();
  }
  // …and arriving there from the front page's menu: the list the page change fetched on the way
  // (js/wipe.js), as new, with no second fetch
  {
    const ip = await env.ctx.newPage(), ierr = [];
    ip.on("pageerror", (e) => ierr.push(String(e)));
    await ip.goto(env.SITE + "/index.html");
    await ip.waitForFunction(() => getComputedStyle(document.getElementById("preloader")).display === "none", null, { timeout: 30000 });
    await ip.click("#menuBtn");
    await ip.waitForFunction(() => document.getElementById("menuNav").classList.contains("open"));
    await ip.waitForTimeout(900);
    await ip.click("#menuNav a[href*='illustration']");
    await ip.waitForURL(/illustration\.html/);
    await ip.waitForFunction(() => getComputedStyle(document.getElementById("preloader")).display === "none", null, { timeout: 30000 });
    const info = await ip.evaluate((raw) => ({ n: document.querySelectorAll(".work").length,
      repo: [...document.querySelectorAll(".work-btn img")].filter((i) => (i.getAttribute("data-src") || "").startsWith(raw)).length,
      fetched: performance.getEntriesByType("resource").filter((e) => /illustration\.json/.test(e.name)).length }), env.RAW);
    check(info.n === N0 + 3 && info.repo === 3 && info.fetched === 0 && ierr.length === 0, "from the front page's menu: the same, from the list fetched on the way", info);
    await ip.close();
  }
  repo.hold(false);

  // 5 dragged: the first work to fourth place
  const before = await titles();
  const a = await cardBox(0), c3 = await cardBox(3);
  await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(a.x + 20, a.y, { steps: 3 });
  await p.mouse.move(c3.r + 6, a.y, { steps: 12 }); await p.waitForTimeout(150); await p.mouse.up();
  t = await titles();
  check(t[3] === before[0] && t[0] === before[1], "dragging moves the first work to fourth place", t.slice(0, 5));
  await save(p);
  check(list().map((x) => x.title).join("|") === t.join("|"), "the new order is saved");

  // 6 the big work's picture replaced: its old files leave, the new ones come
  const bigIdx = t.indexOf("big"), oldFiles = [big.image, big.full];
  await p.click(`.w[data-i="${bigIdx}"]`);
  [fc] = await Promise.all([p.waitForEvent("filechooser"), p.click("#replaceBtn")]);
  await fc.setFiles([file("replace.jpg")]);
  await p.waitForFunction(() => !document.querySelector(".w.is-busy") && !document.getElementById("saveBtn").disabled, null, { timeout: 30000 });
  await save(p);
  const nb = list()[bigIdx];
  check(oldFiles.every((x) => !repo.files().includes(x)) && repo.files().includes(nb.image) && nb.width === 1600 && nb.height === 1200, "replaced: the old files deleted, the new 1600 × 1200 picture in", nb);

  // 7 a work deleted: its file leaves
  const alphaIdx = (await titles()).indexOf("alpha");
  await p.click(`.w[data-i="${alphaIdx}"]`); await p.click("#deleteBtn");
  await save(p);
  check(!list().some((x) => x.title === "alpha") && !repo.files().includes(alpha.image), "deleted: the work and its file gone");

  // 8 Main moved on before a Save, then during one: built on it, nothing lost
  repo.put({ "notes/other-change.txt": "another commit\n" }, "other work");
  await p.click('.w[data-i="0"]'); await p.fill("#fMedium", "After someone else's commit");
  await save(p);
  check(repo.files().includes("notes/other-change.txt") && list()[0].medium === "After someone else's commit", "Main moved before a Save: built on top, both kept");
  const n422 = repo.patch422;
  repo.race = true;
  await p.fill("#fMedium", "Saved through a race");
  await save(p);
  check(repo.patch422 === n422 + 1 && repo.files().includes("notes/race-change.txt") && list()[0].medium === "Saved through a race",
    "Main moved during a Save: refused once, built again on the new Main, all kept", { refused: repo.patch422 - n422 });

  // 9 the list changed somewhere else: asked before it is replaced
  env.dialogs.length = 0;
  const other = repo.json("data/illustration.json"); other.works[2].title = "changed elsewhere";
  repo.put({ "data/illustration.json": JSON.stringify(other, null, 2) + "\n" }, "edit elsewhere");
  await p.click('.w[data-i="0"]'); await p.fill("#fDate", "1999");
  await save(p);
  check(env.dialogs.some((d) => /changed somewhere else/.test(d)), "a list changed somewhere else: asked first", env.dialogs);

  // 10 Save double-clicked: one commit
  const ok0 = repo.patchOk;
  await p.fill("#fDate", "2001"); await p.dblclick("#saveBtn"); await waitStatus(p, /Live on the site/);
  check(repo.patchOk === ok0 + 1, "a double-clicked Save makes one commit", { commits: repo.patchOk - ok0 });

  // 11 unsaved changes keep the tab
  await p.fill("#fDate", "2002");
  env.dialogs.length = 0;
  await p.close({ runBeforeUnload: true });
  await new Promise((r) => setTimeout(r, 800));
  check(env.dialogs.some((d) => /^beforeunload/.test(d)), "leaving with unsaved changes asks first", env.dialogs);

  // 12 signed in again from memory; every work deleted
  p = await env.ctx.newPage();
  p.on("dialog", (d) => { env.dialogs.push(d.type() + ": " + d.message().slice(0, 120)); d.accept(); });
  p.on("pageerror", (e) => env.errors.push(String(e)));
  await p.goto(env.SITE + "/console.html");
  await p.waitForSelector("#editor:not([hidden])", { timeout: 15000 });
  check(true, "a remembered token signs straight in");
  for (let n = (await titles()).length; n > 0; n--) { await p.focus('.w[data-i="0"]'); await p.keyboard.press("Delete"); }
  check((await titles()).length === 0 && !!(await p.$(".empty")), "every work can be deleted (the empty row says so)");
  await save(p);
  check(list().length === 0 && !repo.files().some((x) => x.startsWith("assets/img/illustration/")), "saved empty: every work's picture removed", list());
  {
    const ip = await env.ctx.newPage(), ierr = [];
    ip.on("pageerror", (e) => ierr.push(String(e)));
    await ip.goto(env.SITE + "/illustration.html");
    await ip.waitForFunction(() => getComputedStyle(document.getElementById("preloader")).display === "none", null, { timeout: 30000 });
    await ip.keyboard.press("ArrowRight"); await ip.keyboard.press("End"); await ip.waitForTimeout(400);
    check((await ip.$$(".work")).length === 0 && ierr.length === 0, "the illustration page with no works: the curtain lifts, no errors", ierr);
    await ip.close();
  }
  await p.close();
}

/* ---------- the check ----------------------------------------------------------------------- */
export async function consoleCheck(browser, { root = HERE, log = (s) => console.log(s) } = {}) {
  const t0 = Date.now(), fails = [];
  let passed = 0;
  const check = (ok, label, extra) => {
    if (ok) passed++; else fails.push(label);
    log(`  ${ok ? "ok  " : "FAIL"}  ${label}${!ok && extra !== undefined ? "\n          " + (typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 600) : ""}`);
    return ok;
  };
  const img = await pictures(browser);
  const fixtures = { "data/front.json": JSON.stringify({ saveId: "", photos: {} }, null, 2) + "\n", "data/illustration.json": JSON.stringify(WORKS, null, 2) + "\n" };
  for (const n of [1, 2, 3]) fixtures[`assets/img/illustration/fixture-${n}.webp`] = img["fixture-" + n];
  const repo = new Repo(seed(root, fixtures));
  const apiServer = await listen(api(repo)), siteServer = await listen(pages(repo));
  const API = `http://127.0.0.1:${apiServer.address().port}`, SITE = `http://127.0.0.1:${siteServer.address().port}`;
  const file = (name) => ({ name, mimeType: name.endsWith(".png") ? "image/png" : "image/jpeg", buffer: img[name.replace(/\.\w+$/, "")] });
  try {
    for (const [name, part] of [["The front page", front], ["The works", works]]) {
      log(`${name}:`);
      repo.reset();
      const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
      await ctx.addInitScript((a) => { window.__CONSOLE_TEST_API__ = a; }, API);
      const env = { ctx, repo, SITE, RAW: API + "/raw/", check, file, img, dialogs: [], errors: [] };
      try { await part(env); }
      catch (e) { check(false, `${name.toLowerCase()}: the check ran to its end`, e.message.split("\n")[0]); }
      check(env.errors.length === 0, `${name.toLowerCase()}: no errors in the console`, env.errors);
      await ctx.close();
    }
    check(repo.preflights > 0, "requests to GitHub are cross-origin, preflighted as on api.github.com", { preflights: repo.preflights });
    check(!repo.log.some((l) => l.includes(TOKEN)), "the token never appears in a request's URL");
  } finally {
    for (const s of [apiServer, siteServer]) { s.closeAllConnections?.(); s.close(); }
  }
  return { passed, fails, seconds: Math.round((Date.now() - t0) / 1000) };
}

// run alone
if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const { chromium } = await import(process.env.PLAYWRIGHT_CORE ? url.pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, "index.mjs")).href : "playwright-core");
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  console.log("The console (tests/console-check.mjs)");
  const r = await consoleCheck(browser);
  await browser.close();
  console.log(r.fails.length ? `\nTHE CONSOLE: ${r.fails.length} of ${r.passed + r.fails.length} checks failed.` : `\nThe console: all ${r.passed} checks passed (${r.seconds} s).`);
  process.exitCode = r.fails.length ? 1 : 0;
}
