/* ============================================================
   The motion audit: no motion ships jaggy (CLAUDE.md, "The flow of motion").
   It reads every motion the site's pages make, from their code: each GSAP tween
   (to / from / fromTo, on gsap or a timeline) and its curve, each cascade
   (stagger), each CSS transition and animation (in the stylesheets, the pages and
   style.transition in scripts), and the smooth scroll's curve (Lenis `easing`).

   A new motion passes only on the flow's curve: stepEase, cubic-bezier(0.3, 0,
   0.2, 1), defined as exactly that (in CSS: cubic-bezier(.3,0,.2,1)). It sets off
   gently, with no jump on its first frame, and lands long and soft. Anything else
   fails unless it is in REVIEWED, used exactly as often as listed, with the reason
   it may be so:
     · another curve (power3.out, expo, CSS `ease`...): most start at speed, a jump
       on the first frame;
     · a tween with no curve: GSAP then uses power1.out, which starts at speed;
     · a cascade (stagger): the parts don't share one clock;
     · an overshoot (back, elastic, bounce) or steps: something moving on its own.
   The motions listed below were all on the site before these rules, as the owner
   has seen and kept them. Don't add to the list to get a new motion past the
   audit: give it the flow's curve. Run from tests/fold-check.mjs (its result
   decides the stamp), or alone: node tests/motion-audit.mjs
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { strip, sources } from "./colour-audit.mjs";

const OLD = "on the site before the flow rules, as the owner has seen it";
const REVIEWED = {
  "js/anim.js": {
    "lenis easing": [1, "the front page's smooth scroll (1.001 - 2^-10t): " + OLD],
    "ease power3.out": [3, "the front page's intro: text rising in, a photo wiping in, the name; " + OLD],
    "no ease (GSAP's power1.out)": [1, "imageIn(): its curve is power3.out, set in `to` just above the call; " + OLD],
    "ease back.out(1.7)": [1, "the front page's triangles and squares popping in; " + OLD],
    "ease power2.out": [2, "the front page's corner ticks and \"+\" fading in; " + OLD],
    "ease worksEase": [1, "the front page's panel wipes (0.38, 0, 0.5, 1); " + OLD],
    "ease power2.inOut": [1, "the front page's calligraphy wipe; " + OLD],
    "ease power3.in": [1, "the curtain's name sinking away; " + OLD],
    "ease power4.inOut": [1, "the curtain lifting; " + OLD],
    "stagger": [4, "the front page's parts revealed in turn (the photos' fade, and the reveals as they scroll in); " + OLD],
  },
  "css/anim.css": {
    "css ease": [19, "hover colours and fades (menu labels, the menu, the scrollbar) and the hamburger's bars fading; " + OLD],
    "css cubic-bezier(.4,0,.2,1)": [6, "the hamburger's bars moving as it turns into the X and back; " + OLD],
    "css cubic-bezier(.38,0,.5,1)": [1, "the menu labels sliding in; " + OLD],
  },
  "css/illustration.css": {
    "css ease": [1, "the header links' hover colour; " + OLD],
  },
  "css/zoom.css": {
    "css ease": [1, "the \"+\" changing colour under the pointer; " + OLD],
  },
  "js/menu.js": {
    "css ease": [2, "the menu fading out on a jump, its panel fading; " + OLD],
    "style.transition built in code": [4, "the menu panel's morph out of the hamburger's bar and back (tr(): 0.38, 0, 0.5, 1); " + OLD],
  },
  "js/illustration.js": {
    "lenis easing": [1, "the row's smooth scroll, the front page's curve: " + OLD],
    "ease power3.out": [3, "the header rising in, the name, a caption rising; " + OLD],
    "ease power2.out": [1, "a work's \"+\" fading in; " + OLD],
    "ease worksEase": [1, "a work's panel wipe (0.38, 0, 0.5, 1); " + OLD],
    "ease power3.in": [1, "the curtain's name sinking away; " + OLD],
    "ease power4.inOut": [1, "the curtain lifting; " + OLD],
    "stagger": [1, "the header's parts rising in turn; " + OLD],
  },
  "js/contact.js": {
    "ease power3.out": [1, "the curtain's name rising (the same curtain as every page's first visit); " + OLD],
    "ease power3.in": [1, "the curtain's name sinking away; " + OLD],
    "ease power4.inOut": [1, "the curtain lifting; " + OLD],
  },
  "js/wipe.js": {
    "ease power3.in": [1, "the white sheet rising over the page being left; " + OLD],
    "ease power3.out": [2, "the white sheet lifting off the page arrived on (as the page comes in, and alone); " + OLD],
  },
  "js/zoom.js": {
    "ease power2.out": [4, "the \"+\" fading in and out, the grey fading in, the nudge at the row's end; " + OLD],
    "ease lift": [4, "the zoom's flight in and home, its crop opening and closing (0.22, 1, 0.36, 1: answers the click at once); " + OLD],
    "ease power2.inOut": [1, "the grey fading out as the picture flies home; " + OLD],
  },
};

// ---- reading the motions -------------------------------------------------------------------
const FLOW_CSS = /^cubic-bezier\(\s*0?\.3\s*,\s*0\s*,\s*0?\.2\s*,\s*1\s*\)$/;
// the arguments of a call: the text between its parentheses, strings and nesting respected
function args(src, open) {
  let depth = 0, q = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") q = c;
    else if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") { if (--depth === 0) return src.slice(open + 1, i); }
  }
  return src.slice(open + 1);
}
const lineAt = (src, i) => src.slice(0, i).split("\n").length;
// a CSS transition / animation value -> one token per motion in it ("" for none / instant)
function cssTokens(value) {
  const out = [];
  for (const part of value.split(/,(?![^(]*\))/)) {
    const p = part.trim();
    if (!p || /^(none|initial|inherit|unset)$/.test(p)) continue;
    const times = p.match(/(^|\s)(\d*\.?\d+)m?s\b/g) || [];
    if (times.length && times.every((t) => parseFloat(t) === 0)) continue;   // instant: not a motion
    const fn = (p.match(/cubic-bezier\([^)]*\)|steps\([^)]*\)|\b(ease-in-out|ease-in|ease-out|ease|linear|step-start|step-end)\b/) || ["ease"])[0];
    out.push(FLOW_CSS.test(fn) ? "flow" : "css " + fn.replace(/\s+/g, ""));
  }
  return out;
}
function motionsIn(file, text, kind) {
  const found = [];
  const add = (token, src, at) => found.push({ token, line: lineAt(src, at) });
  if (kind === "js") {
    const src = strip(text, true);
    const flowDefined = /\bvar\s+stepEase\s*=\s*cubicBezier\(\s*0\.3\s*,\s*0\s*,\s*0\.2\s*,\s*1\s*\)/.test(src);
    for (const m of src.matchAll(/\.(to|from|fromTo)\s*\(/g)) {
      const a = args(src, m.index + m[0].length - 1);
      const e = /\bease\s*:\s*("[^"]*"|'[^']*'|[A-Za-z_$][\w$.]*(?:\([^)]*\))?)/.exec(a);
      const ease = e ? e[1].replace(/^["']|["']$/g, "") : null;
      const instant = /\bduration\s*:\s*0\s*[,}]/.test(a) && !/\bduration\s*:\s*0\./.test(a);
      if (instant) continue;
      if (ease === "stepEase" && flowDefined) continue;                         // the flow's curve
      add(ease === null ? "no ease (GSAP's power1.out)" : "ease " + ease, src, m.index);
      if (/\bstagger\s*:/.test(a)) add("stagger", src, m.index);
    }
    for (const m of src.matchAll(/\bstagger\s*:/g)) {                           // (a stagger outside a tween call: a cascade too)
      const inCall = found.some((f) => f.token === "stagger" && f.line === lineAt(src, m.index));
      if (!inCall && !/\.(to|from|fromTo)\s*\([^;]*$/.test(src.slice(Math.max(0, m.index - 400), m.index))) add("stagger", src, m.index);
    }
    for (const m of src.matchAll(/\beasing\s*:/g)) add("lenis easing", src, m.index);
    for (const m of src.matchAll(/\.style\.(transition|animation)\s*=\s*([^;\n]+)/g)) {
      const lit = /^\s*(["'])((?:(?!\1).)*)\1\s*$/.exec(m[2]);
      if (lit) for (const t of cssTokens(lit[2])) { if (t !== "flow") add(t, src, m.index); }
      else add("style." + m[1] + " built in code", src, m.index);
    }
  } else {
    const parts = kind === "html"
      ? [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => ({ src: strip(m[1], false), at: m.index }))
        .concat([...text.matchAll(/\sstyle=(["'])([\s\S]*?)\1/gi)].map((m) => ({ src: m[2], at: m.index })))
      : [{ src: strip(text, false), at: 0 }];
    for (const { src, at } of parts)
      for (const m of src.matchAll(/(?:^|[;{\s])(transition|animation)\s*:\s*([^;}]+)/g))
        for (const t of cssTokens(m[2])) if (t !== "flow") found.push({ token: t, line: lineAt(text, at) + lineAt(src, m.index) - 1 });
  }
  return found;
}

// ---- the audit -------------------------------------------------------------------------------
export function audit(root) {
  const { pages, files } = sources(root), problems = [], found = {};
  let motions = 0;
  for (const [f, { kind, text }] of files) {
    for (const { token, line } of motionsIn(f, text, kind)) { ((found[f] = found[f] || {})[token] = found[f][token] || []).push(line); motions++; }
  }
  const keys = new Set([...Object.keys(found), ...Object.keys(REVIEWED)].flatMap((f) =>
    [...Object.keys(found[f] || {}), ...Object.keys(REVIEWED[f] || {})].map((k) => f + "\u0000" + k)));
  for (const key of keys) {
    const [f, token] = key.split("\u0000"), lines = (found[f] || {})[token] || [], want = (REVIEWED[f] || {})[token];
    if (!want) problems.push(`${f}: ${token} (line ${lines.join(", ")}) — not the flow's curve. Give it stepEase, cubic-bezier(0.3, 0, 0.2, 1)` +
      (/stagger/.test(token) ? ", and one clock for whatever moves together" : /back|elastic|bounce|steps/.test(token) ? " (an overshoot or a stepped motion is never smooth)" : ""));
    else if (lines.length !== want[0]) problems.push(`${f}: ${token} used ${lines.length} time${lines.length === 1 ? "" : "s"} (line ${lines.join(", ") || "none"}), reviewed for ${want[0]}` +
      (lines.length > want[0] ? " — a new motion on this curve: give it stepEase instead" : " — fewer than reviewed: take it off REVIEWED in tests/motion-audit.mjs"));
  }
  return { pages, files: [...files.keys()], motions, problems };
}

export function report(r) {
  console.log(`Motion audit: ${r.files.length} files of ${r.pages.join(", ")} — ${r.motions} motions off the flow's curve, ` +
    (r.problems.length ? `${r.problems.length} problem${r.problems.length > 1 ? "s" : ""}:` : "all of them reviewed (older than the rules); every new one is on stepEase."));
  for (const p of r.problems) console.log("  ✗ " + p);
  if (r.problems.length) console.log("  Every new motion sets off gently and lands long and soft: stepEase, cubic-bezier(0.3, 0, 0.2, 1), one clock and\n" +
    "  one easing for whatever moves together, no overshoot (CLAUDE.md, \"The flow of motion\"). Measure it frame by frame too.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const r = audit(path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), ".."));
  report(r);
  process.exitCode = r.problems.length ? 1 : 0;
}
