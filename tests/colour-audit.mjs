/* ============================================================
   The colour audit: the outline rule, read straight from the code.
   Inside the cursor's square a dark outline needs a colour lighter than
   #DCCBC3 painted above the under-squares with a soft edge (CLAUDE.md): only
   a colour that rises above #DCCBC3 can fold through it, and no deeper than it
   rises. So every colour the cursor pages paint that rises DIP or more above
   it, in any channel, is listed in REVIEWED with the reason it cannot fold —
   painted beneath the under-squares, crisp edges, its own mirror, or never
   painted as it is. A colour that is new, or used more or less often than
   listed, fails: whatever state would show it, whether tests/fold-check.mjs
   visits that state or not. It also fails when the pixel check misses a page
   that has the cursor, or one of the site's ?switches.
   It cannot see colours the scripts compute (the hamburger's): those are
   capped at #DCCBC3 where they are made, and their states are in the pixel check.
     node tests/colour-audit.mjs        (a second; tests/fold-check.mjs runs it too)
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

export const C = [220, 203, 195];   // #DCCBC3, the square's colour
export const DIP = 12;              // the least fold that shows (tests/fold-check.mjs flags dips this deep)

/* Every light colour the cursor pages use: file -> colour -> [how many times, why it cannot fold].
   ("var(--x)": a use of a custom property that holds a light colour.) A new entry needs a reason
   that a state in tests/fold-check.mjs shows to be true. */
const REVIEWED = {
  "css/style.css": {
    "#fffefc": [1, "--paper, the paper"],
    "var(--paper)": [1, "html/body: the paper lies beneath the under-squares, which mirror it"],
    "#f2f1ef": [1, "--band, the band grey"],
    "var(--band)": [1, ".band: the grey section backgrounds lie beneath the under-squares (z-index 0), which mirror them"],
    "#d1d1d1": [1, ".box's own grey (the --c fallback)"],
    "var(--c)": [1, ".box: light grey boxes are plain, unmoved boxes (whole pixels); their wipe-in edge is snapped (wipeClip, js/anim.js)"],
    "#f20000": [2, "--red, the site's red; .sq: the red squares are plain, unmoved boxes (whole pixels)"],
  },
  "css/anim.css": {
    "var(--paper)": [1, ".preloader: the white sheet carries its own under-squares and moves in whole device pixels (js/wipe.js)"],
    "#ffffff": [1, ".menu-nav a: the white menu labels; inside the square only their mirror copy shows (::after, js/cursor.js)"],
  },
  "css/illustration.css": {
    "var(--red)": [2, "::selection (a known limit, CLAUDE.md); a work's focus ring: a plain, unmoved outline (whole pixels)"],
    "#ffffff": [1, "::selection's letters (a known limit, CLAUDE.md)"],
  },
  "css/zoom.css": {
    "var(--band)": [3, "the + on hover / keyboard focus: sized in whole device pixels (crispPlus, js/zoom.js), placed by layout, never moved; .zoom-bg: carries its own mirror patch (.zoom-bg .cursor-fold)"],
    "var(--red)": [2, "the focus rings of a front-page photo and of the zoom's buttons: plain, unmoved outlines (whole pixels)"],
  },
  "index.html": {
    "#d1d1d1": [2, "two light grey .box placeholders (see css/style.css, var(--c))"],
  },
  "js/menu-shade.js": {
    "#b0a4e3": [2, "palette colours: inputs to the hamburger's harmony, never painted as they are; every colour it paints is capped at #DCCBC3 (fit)"],
    "#d6ecf0": [1, "palette colour (as above)"],
    "#e4c6d0": [1, "palette colour (as above)"],
    "#ef7a82": [1, "palette colour (as above)"],
  },
};

// the CSS named colours that are light (each checked in Chromium against #DCCBC3 and DIP)
const NAMED = Object.fromEntries(("aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4 " +
  "blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 chartreuse:7fff00 coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc cyan:00ffff " +
  "darkorange:ff8c00 darksalmon:e9967a darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff dodgerblue:1e90ff " +
  "floralwhite:fffaf0 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 greenyellow:adff2f honeydew:f0fff0 hotpink:ff69b4 " +
  "ivory:fffff0 khaki:f0e68c lavender:e6e6fa lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 " +
  "lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1 lightsalmon:ffa07a " +
  "lightskyblue:87cefa lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 linen:faf0e6 magenta:ff00ff mediumorchid:ba55d3 " +
  "mediumpurple:9370db mediumslateblue:7b68ee mediumspringgreen:00fa9a mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 " +
  "navajowhite:ffdead oldlace:fdf5e6 orange:ffa500 orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 " +
  "paleturquoise:afeeee papayawhip:ffefd5 peachpuff:ffdab9 pink:ffc0cb plum:dda0dd powderblue:b0e0e6 red:ff0000 royalblue:4169e1 " +
  "salmon:fa8072 sandybrown:f4a460 seashell:fff5ee skyblue:87ceeb snow:fffafa springgreen:00ff7f thistle:d8bfd8 tomato:ff6347 " +
  "turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00").split(" ").map((p) => p.split(":")));

/* ---- reading the code --------------------------------------------------------------------- */
// comments out (kept as spaces, so line numbers stay true): CSS /* */, and in scripts // too,
// minding strings and regular expressions
function strip(src, js) {
  let out = "", i = 0, q = null, prev = "";
  const blank = (s) => s.replace(/[^\n]/g, " ");
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (q) {
      out += c; i++;
      if (c === "\\") { out += src[i] || ""; i++; } else if (c === q) q = null;
      continue;
    }
    if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2), end = e < 0 ? src.length : e + 2; out += blank(src.slice(i, end)); i = end; continue; }
    if (js && c === "/" && d === "/") { const e = src.indexOf("\n", i), end = e < 0 ? src.length : e; out += blank(src.slice(i, end)); i = end; continue; }
    if (js && c === "/" && /[(,=:[!&|?{};+\-*%<>~^]|^$/.test(prev)) {         // a regular expression literal
      let j = i + 1, cls = false;
      for (; j < src.length && src[j] !== "\n"; j++) {
        if (src[j] === "\\") { j++; continue; }
        if (src[j] === "[") cls = true; else if (src[j] === "]") cls = false; else if (src[j] === "/" && !cls) break;
      }
      out += src.slice(i, j + 1); i = j + 1; prev = "/"; continue;
    }
    if (c === '"' || c === "'" || c === "`") q = c;
    out += c; i++;
    if (!/\s/.test(c)) prev = c;
  }
  return out;
}

const hex2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
function parse(token) {                                          // -> [r, g, b, a] or null
  let m = /^#([0-9a-f]+)$/i.exec(token);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = h.split("").map((x) => x + x).join("");
    return [0, 2, 4].map((k) => parseInt(h.substr(k, 2), 16)).concat(h.length === 8 ? parseInt(h.substr(6, 2), 16) / 255 : 1);
  }
  m = /^(rgba?|hsla?)\((.*)\)$/i.exec(token);
  if (m) {
    const v = m[2].split(/[\s,/]+/).filter(Boolean);
    if (v.length < 3 || v.some((x) => !/^-?[\d.]+(%|deg)?$/.test(x))) return null;
    const n = (x, k) => (/%$/.test(x) ? parseFloat(x) * k / 100 : parseFloat(x));
    const a = v[3] === undefined ? 1 : n(v[3], 1);
    if (/^rgb/i.test(m[1])) return [n(v[0], 255), n(v[1], 255), n(v[2], 255), a];
    const h = parseFloat(v[0]) / 360, s = n(v[1], 1) / (/%$/.test(v[1]) ? 1 : 100), l = n(v[2], 1) / (/%$/.test(v[2]) ? 1 : 100);
    const f = (t) => { t = (t % 1 + 1) % 1; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p); };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3), a];
  }
  m = NAMED[token.toLowerCase()];
  return m ? [0, 2, 4].map((k) => parseInt(m.substr(k, 2), 16)).concat(1) : null;
}
export const isLight = (c) => !!c && c[3] > 0 && Math.max(c[0] - C[0], c[1] - C[1], c[2] - C[2]) >= DIP;
const name = (c) => "#" + c.slice(0, 3).map(hex2).join("") + (c[3] < 1 ? hex2(c[3] * 255) : "");

const HEX = /(?<![&\w#$.-])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi;
const FUNC = /\b(?:rgba?|hsla?)\([^()"'`]*\)/gi;
const WORD = new RegExp(`(?<![-\\w#.$@'"])(?:${Object.keys(NAMED).join("|")})(?![-\\w])`, "gi");
// where a named colour can be one: CSS (in a stylesheet, a style attribute, or a string of it);
// in a script, a string handed to a style property (el.style.color = "white", setProperty("--x", "white"))
const CSS_VALUE = /(?:^|[{;\s"'`])(?:--[\w-]+|color|background(?:-color|-image)?|border(?:-[a-z]+)*|outline(?:-color)?|fill|stroke|(?:box|text)-shadow|caret-color|text-decoration(?:-color)?|column-rule(?:-color)?|accent-color|scrollbar-color)\s*:\s*([^;{}"'`]*)/gi;
const JS_VALUE = /(?:\.style\.\w+\s*=\s*|\.setProperty\(\s*["'`][^"'`]*["'`]\s*,\s*)(["'`])([^"'`]*)\1/g;

// the light colours in one source, with where they are; `css`: all of it is CSS
function scan(text, css) {
  const found = [], lineAt = (k) => text.slice(0, k).split("\n").length;
  const add = (token, at) => { const c = parse(token); if (isLight(c)) found.push({ colour: name(c), token, line: lineAt(at) }); };
  for (const m of text.matchAll(HEX)) add(m[0], m.index);
  for (const m of text.matchAll(FUNC)) add(m[0], m.index);
  const values = css ? [{ v: text, at: 0 }] : [...text.matchAll(CSS_VALUE), ...text.matchAll(JS_VALUE)].map((m) => ({ v: m[m.length - 1], at: m.index + m[0].length - m[m.length - 1].length }));
  const seen = new Set();
  for (const { v, at } of values) for (const m of v.matchAll(WORD)) {
    if (seen.has(at + m.index)) continue;
    seen.add(at + m.index); add(m[0], at + m.index);
  }
  return found;
}

/* ---- the audit ---------------------------------------------------------------------------- */
// the pages with the cursor, and every stylesheet and script of theirs that is ours (not vendor/)
export function sources(root) {
  const pages = fs.readdirSync(root).filter((f) => /\.html$/.test(f)).sort()
    .filter((f) => /<script[^>]*\bsrc=["']js\/cursor\.js["']/.test(fs.readFileSync(path.join(root, f), "utf8")));
  const files = new Map();
  for (const pg of pages) {
    const html = fs.readFileSync(path.join(root, pg), "utf8").replace(/<!--[\s\S]*?-->/g, (s) => s.replace(/[^\n]/g, " "));
    files.set(pg, { kind: "html", text: html });
    for (const m of html.matchAll(/<(?:link[^>]*\bhref|script[^>]*\bsrc)=["']([^"'?#]+)/gi)) {
      const f = m[1];
      if (/^(?:[a-z]+:)?\/\//i.test(f) || /^vendor\//.test(f) || files.has(f) || !/\.(css|js)$/.test(f)) continue;
      const p = path.join(root, f);
      if (fs.existsSync(p)) files.set(f, { kind: path.extname(f).slice(1), text: fs.readFileSync(p, "utf8") });
    }
  }
  return { pages, files };
}

export function audit(root) {
  const { pages, files } = sources(root), problems = [], found = {};   // found: file -> colour -> [{line, token}]
  const note = (f, key, line, token) => ((found[f] = found[f] || {})[key] = found[f][key] || []).push({ line, token });
  const props = new Set();                                             // custom properties that hold a light colour
  const texts = new Map();
  for (const [f, { kind, text }] of files) {
    let parts;
    if (kind === "html") {                                              // only its CSS and scripts, not its words
      parts = [];
      for (const m of text.matchAll(/(<style[^>]*>)([\s\S]*?)<\/style>/gi)) parts.push({ at: m.index + m[1].length, src: strip(m[2], false), css: true });
      for (const m of text.matchAll(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)<\/script>/gi)) parts.push({ at: m.index + m[1].length, src: strip(m[2], true), css: false });
      for (const m of text.matchAll(/(\sstyle=)(["'])([\s\S]*?)\2/gi)) parts.push({ at: m.index + m[1].length + 1, src: m[3], css: true });
    } else parts = [{ at: 0, src: strip(text, kind === "js"), css: kind === "css" }];
    texts.set(f, parts);
    for (const { at, src, css } of parts) {
      const base = text.slice(0, at).split("\n").length - 1;
      for (const h of scan(src, css)) note(f, h.colour, base + h.line, h.token);
      // custom properties set to a light colour, in CSS (--x: …) or from a script (setProperty("--x", "…"))
      for (const m of src.matchAll(/(--[\w-]+)\s*:\s*([^;{}"'`]+)/g)) if (scan(m[2], true).length) props.add(m[1]);
      for (const m of src.matchAll(/setProperty\(\s*["'`](--[\w-]+)["'`]\s*,\s*(["'`])([^"'`]*)\2/g)) if (scan(m[3], true).length) props.add(m[1]);
    }
  }
  for (const [f, parts] of texts) for (const { at, src } of parts) {
    const base = files.get(f).text.slice(0, at).split("\n").length - 1;
    for (const m of src.matchAll(/var\(\s*(--[\w-]+)/g)) if (props.has(m[1])) note(f, `var(${m[1]})`, base + src.slice(0, m.index).split("\n").length, m[0]);
  }
  // against the reviewed list, both ways
  const keys = new Set([...Object.keys(found), ...Object.keys(REVIEWED)].flatMap((f) =>
    [...Object.keys(found[f] || {}), ...Object.keys(REVIEWED[f] || {})].map((k) => f + "\u0000" + k)));
  for (const fk of [...keys].sort()) {
    const [f, k] = fk.split("\u0000"), at = (found[f] || {})[k] || [], want = (REVIEWED[f] || {})[k];
    const n = want ? want[0] : 0;
    if (at.length === n) continue;
    const where = at.map((h) => `      ${f}:${h.line}  ${(files.get(f).text.split("\n")[h.line - 1] || "").trim().slice(0, 150)}`).join("\n");
    problems.push(!want ? `${f}: ${k} is lighter than #DCCBC3 and not reviewed (used ${at.length}×)\n${where}`
      : at.length > n ? `${f}: ${k} is used ${at.length}×, reviewed ${n}× — a new use\n${where}`
      : `${f}: ${k} is reviewed ${n}× but used ${at.length}× — update REVIEWED in tests/colour-audit.mjs` + (where ? "\n" + where : ""));
  }
  // the pixel check visits every page with the cursor, and every ?switch the scripts read
  const check = fs.readFileSync(path.join(root, "tests/fold-check.mjs"), "utf8");
  for (const pg of pages) if (!check.includes("/" + pg)) problems.push(`tests/fold-check.mjs never opens ${pg}, a page with the cursor`);
  for (const [f, { kind, text }] of files) {
    if (kind !== "js" && kind !== "html") continue;
    for (const line of text.split("\n")) {
      if (!/location\.search|URLSearchParams/.test(line)) continue;
      for (const m of line.matchAll(/\[\?&\]\(?([\w-]+)|\.(?:get|has)\(\s*["'`]([\w-]+)/g)) {
        const sw = m[1] || m[2];
        if (!new RegExp(`[?&]${sw}\\b`).test(check)) problems.push(`${f} reads the switch ?${sw}, but tests/fold-check.mjs never opens a page with it`);
      }
    }
  }
  const light = Object.values(found).reduce((s, o) => s + Object.values(o).reduce((t, a) => t + a.length, 0), 0);
  return { pages, files: [...files.keys()], light, problems };
}

export function report(r) {
  console.log(`Colour audit: ${r.files.length} files of ${r.pages.join(", ")} — ${r.light} uses of light colours, ` +
    (r.problems.length ? `${r.problems.length} problem${r.problems.length > 1 ? "s" : ""}:` : "all reviewed."));
  for (const p of r.problems) console.log("  ✗ " + p);
  if (r.problems.length) console.log("  A light colour above the under-squares needs one of: #DCCBC3 or darker in every channel, crisp edges\n" +
    "  (whole device pixels, never moved by fractions), or its own mirror (CLAUDE.md). Then list it in REVIEWED with that reason,\n" +
    "  and put the state that shows it in tests/fold-check.mjs.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const r = audit(path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), ".."));
  report(r);
  process.exitCode = r.problems.length ? 1 : 0;
}
