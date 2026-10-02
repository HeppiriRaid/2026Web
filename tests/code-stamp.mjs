/* ============================================================
   What a passing outline check vouches for, and where it says so.
   tests/fold-check.mjs writes a stamp here when a full run is clean; the push
   guard (.claude/hooks/push-guard.mjs) lets a `git push` through only when the
   code it sends is exactly the code that passed (CLAUDE.md, "Check it").
   "The code" is everything that draws the site — the pages, css/, js/,
   vendor/ — and the checks themselves (tests/). Not the works the owner adds
   through the console (data/, assets/), and not notes (*.md, .claude/).
   Both sides fingerprint the same way: git's own id of each file's content,
   so the working tree the check served and the commit being pushed compare.
   ============================================================ */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const isCode = (f) => /^[^/]+\.html$/.test(f) || /^(css|js|vendor|tests)\//.test(f);
const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 });
const print = (rows) => crypto.createHash("sha256").update(rows.sort().join("\n")).digest("hex").slice(0, 16);

// the code as committed in `commit` (what a push sends)
export function codeAt(root, commit) {
  return print(git(root, "ls-tree", "-r", "-z", commit).split("\0").filter(Boolean).map((e) => {
    const tab = e.indexOf("\t");
    return [e.slice(0, tab).split(" ")[2], e.slice(tab + 1)];
  }).filter(([, f]) => isCode(f)).map(([id, f]) => id + " " + f));
}

// the code in the working tree, as served (what the check just looked at)
export function codeHere(root) {
  const files = new Set(git(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard").split("\0").filter(isCode));
  return print([...files].filter((f) => fs.existsSync(path.join(root, f))).map((f) => {
    const b = fs.readFileSync(path.join(root, f));
    return crypto.createHash("sha1").update(`blob ${b.length}\0`).update(b).digest("hex") + " " + f;
  }));
}

// kept inside .git (never committed): each clone, each session, has to earn its own
export const stampFile = (root) => path.resolve(root, git(root, "rev-parse", "--git-path", "fold-check-pass").trim());
export function readStamp(root) {
  try { return JSON.parse(fs.readFileSync(stampFile(root), "utf8")); } catch (e) { return null; }
}
export function writeStamp(root, states) {
  const s = { code: codeHere(root), states, at: new Date().toISOString() };
  fs.writeFileSync(stampFile(root), JSON.stringify(s, null, 2) + "\n");
  return s;
}
