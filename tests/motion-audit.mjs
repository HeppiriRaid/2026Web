/* ============================================================
   The motion audit: no motion ships jaggy (CLAUDE.md, "The flow of motion").
   It reads every motion the site's pages make, from their code: each GSAP tween
   (to / from / fromTo, on gsap or a timeline) and its curve, each cascade
   (stagger), each CSS transition and animation (in the stylesheets, the pages and
   style.transition in scripts), and the smooth scroll's curve (Lenis `easing`).

   A motion passes only on the flow's curve: stepEase, cubic-bezier(0.215, 0.61,
   0.355, 1) — power3.out, the site's own curve before the rework, which the owner
   asked back: it sets off quick and lands long and soft, a contrast in speed —
   defined as exactly that (in CSS: cubic-bezier(.215,.61,.355,1); a smooth scroll
   sent somewhere: easing: stepEase). Anything else fails unless it is in
   REVIEWED, used exactly as often as listed, with the reason it may be so:
     · another curve (power3.out, expo, CSS `ease`...): most start at speed, a jump
       on the first frame;
     · a tween with no curve: GSAP then uses power1.out, which starts at speed;
     · a cascade (stagger) of anything not on the flow's curve: each part of a
       cascade sets off on its own, so each must set off from a standstill;
     · an overshoot (back, elastic, bounce) or steps: something moving on its own.
   Every motion of the site is on the flow's curve but the hamburger's own colour
   fades, listed below as the owner approved the hamburger. Don't add to the list
   to get a motion past the audit: give it the flow's curve. Run from
   tests/fold-check.mjs (its result decides the stamp), or alone:
   node tests/motion-audit.mjs
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { strip, sources } from "./colour-audit.mjs";

const REVIEWED = {
  "css/anim.css": {
    "css ease": [3, "the hamburger's own colour fades, nothing moving (its bars' tint from the picture beneath, its labels' hover " +
      "colour and that colour's mirror): the hamburger as the owner approved it, left as it is"],
  },
  "js/menu.js": {
    "ease curve": [1, "the hamburger's catch on its own two clocks from before the rework, which the owner asked back " +
      "(its leaving the squares and coming back were better then): its place an exponential chase (CATCH_GO), its bars' " +
      "shape cubic-bezier(.4,0,.2,1) (BARS_GO); every other motion of it is on the flow's curve (go()'s default)"],
  },
};

// ---- reading the motions -------------------------------------------------------------------
const FLOW_CSS = /^cubic-bezier\(\s*0?\.215\s*,\s*0?\.61\s*,\s*0?\.355\s*,\s*1\s*\)$/;
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
    const flowDefined = /\bvar\s+stepEase\s*=\s*cubicBezier\(\s*0\.215\s*,\s*0\.61\s*,\s*0\.355\s*,\s*1\s*\)/.test(src);
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
    // (a stagger outside a tween call — handed to a tween elsewhere in the file: a cascade of whatever that tween is,
    // so it passes where every tween in the file is on the flow's curve)
    const offFlow = found.some((f) => f.token !== "stagger");
    for (const m of src.matchAll(/\bstagger\s*:/g)) {
      const inCall = found.some((f) => f.token === "stagger" && f.line === lineAt(src, m.index));
      if (offFlow && !inCall && !/\.(to|from|fromTo)\s*\([^;]*$/.test(src.slice(Math.max(0, m.index - 400), m.index))) add("stagger", src, m.index);
    }
    for (const m of src.matchAll(/\beasing\s*:\s*([A-Za-z_$][\w$]*)?/g)) {      // a smooth scroll's curve
      if (m[1] === "stepEase" && flowDefined) continue;
      add("lenis easing", src, m.index);
    }
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
    if (!want) problems.push(`${f}: ${token} (line ${lines.join(", ")}) — not the flow's curve. Give it stepEase, cubic-bezier(0.215, 0.61, 0.355, 1)` +
      (/stagger/.test(token) ? ", and one clock for whatever moves together" : /back|elastic|bounce|steps/.test(token) ? " (an overshoot or a stepped motion is never smooth)" : ""));
    else if (lines.length !== want[0]) problems.push(`${f}: ${token} used ${lines.length} time${lines.length === 1 ? "" : "s"} (line ${lines.join(", ") || "none"}), reviewed for ${want[0]}` +
      (lines.length > want[0] ? " — a new motion on this curve: give it stepEase instead" : " — fewer than reviewed: take it off REVIEWED in tests/motion-audit.mjs"));
  }
  return { pages, files: [...files.keys()], motions, problems };
}

export function report(r) {
  console.log(`Motion audit: ${r.files.length} files of ${r.pages.join(", ")} — ${r.motions} motions off the flow's curve, ` +
    (r.problems.length ? `${r.problems.length} problem${r.problems.length > 1 ? "s" : ""}:` : "all of them reviewed (the hamburger's colour fades); every other motion is on stepEase."));
  for (const p of r.problems) console.log("  ✗ " + p);
  if (r.problems.length) console.log("  Every new motion sets off quick and lands long and soft: stepEase, cubic-bezier(0.215, 0.61, 0.355, 1), one clock and\n" +
    "  one easing for whatever moves together, no overshoot (CLAUDE.md, \"The flow of motion\"). Measure it frame by frame too.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const r = audit(path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), ".."));
  report(r);
  process.exitCode = r.problems.length ? 1 : 0;
}
