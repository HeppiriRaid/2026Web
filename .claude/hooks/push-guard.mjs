/* ============================================================
   The push guard — a Claude Code hook (PreToolUse, .claude/settings.json).
   No code goes to GitHub (and Pages serves the live site from Main) unless
   tests/fold-check.mjs passed for exactly that code, in this clone
   (CLAUDE.md, "Check it"). It stops:
   · a `git push` of commits whose code (tests/code-stamp.mjs) is neither the
     code of the last clean full run nor the code Main already serves;
   · code written to GitHub around git: the GitHub tools' file writes into
     the code (pages, css/, js/, vendor/, tests/), and pull-request merges.
   Exit 2 = stopped; the reason goes to stderr, where Claude Code shows it.
   ============================================================ */
import { execFileSync } from "node:child_process";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "../..");
const stop = (why) => { process.stderr.write(why.trim() + "\n"); process.exit(2); };
const RUN = "Run `node tests/fold-check.mjs` (about 4 minutes; it must end \"No outlines\", and then leaves a stamp for this code), then push again.";

let hook;
try { let s = ""; for await (const c of process.stdin) s += c; hook = JSON.parse(s); }
catch (e) { stop("Push guard: could not read what is being run, so it cannot be checked."); }
const tool = hook.tool_name || "", input = hook.tool_input || {};
let stamps;
try { stamps = await import(url.pathToFileURL(path.join(ROOT, "tests/code-stamp.mjs")).href); }
catch (e) { stop(`Push guard: tests/code-stamp.mjs is missing or broken (${e.message}), so nothing can be checked.`); }

// ---- around git: GitHub's own tools --------------------------------------------------------
if (/^mcp__github__merge_pull_request$/.test(tool))
  stop("Push guard: merging a pull request puts its code on GitHub without the outline check (CLAUDE.md, \"Check it\"). " +
    "Check out its branch here, run `node tests/fold-check.mjs`, and push with git.");
if (/^mcp__github__(push_files|create_or_update_file|delete_file)$/.test(tool)) {
  const files = (Array.isArray(input.files) ? input.files.map((f) => f && f.path) : []).concat(input.path || []).filter(Boolean);
  const code = files.filter(stamps.isCode);
  if (code.length) stop(`Push guard: ${code.join(", ")} ${code.length > 1 ? "are" : "is"} the site's code; it goes to GitHub only with git, ` +
    "after the outline check passed for it (CLAUDE.md, \"Check it\").");
  process.exit(0);
}
if (tool !== "Bash") process.exit(0);

// ---- git push --------------------------------------------------------------------------------
// The words of each simple command (quotes kept together; ; && || | & newlines, brackets and
// $( end one; a leading do / then / … dropped). Rough, but enough for how pushes are written.
function commands(cmd) {
  const out = [];
  let words = [], w = "", has = false, q = null;
  const word = () => { if (has) words.push(w); w = ""; has = false; };
  const end = () => { word(); if (words.length) out.push(words); words = []; };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) { if (c === q) q = null; else if (c === "\\" && q === '"') w += cmd[++i] || ""; else w += c; continue; }
    if (c === "'" || c === '"') { q = c; has = true; }
    else if (c === "\\") { w += cmd[++i] || ""; has = true; }
    else if (c === "&" && (/[<>]$/.test(w) || cmd[i + 1] === ">")) { w += c; has = true; }   // 2>&1, &>file: a redirection
    else if (c === "\n" || ";&|()`{}".includes(c)) end();
    else if (c === "$" && cmd[i + 1] === "(") { end(); i++; }
    else if (/\s/.test(c)) word();
    else { w += c; has = true; }
  }
  end();
  return out.map((ws) => {
    ws = ws.filter((x, k) => !/^(\d*|&)(>>?|<)/.test(x) && !(k > 0 && /^(\d*|&)(>>?|<)&?$/.test(ws[k - 1])));   // redirections (2>&1, > file) out
    while (ws.length && /^(do|then|else|elif|time|!)$/.test(ws[0])) ws.shift();
    return ws;
  }).filter((ws) => ws.length);
}
function pushes(cmd, cwd, found = []) {
  let dir = cwd;
  for (const ws of commands(cmd)) {
    if (ws[0] === "cd") { dir = path.resolve(dir, (ws[1] || process.env.HOME || dir).replace(/^~(?=\/|$)/, process.env.HOME || "~")); continue; }
    // a command handed to another shell: bash -c "…", eval "…"
    const c = ws.indexOf("-c");
    if (/(^|\/)(ba|z|da)?sh$/.test(ws[0]) && c > 0 && ws[c + 1]) { pushes(ws[c + 1], dir, found); continue; }
    if (ws[0] === "eval") { pushes(ws.slice(1).join(" "), dir, found); continue; }
    for (let k = 0; k < ws.length; k++) {
      if (!/(^|\/)git$/.test(ws[k])) continue;
      let j = k + 1, at = dir;
      while (j < ws.length && ws[j].startsWith("-")) {
        if (ws[j] === "-C") { at = path.resolve(at, ws[j + 1] || "."); j += 2; }
        else if (/^(-c|--git-dir|--work-tree|--namespace|--exec-path)$/.test(ws[j])) j += 2;
        else j++;
      }
      if (ws[j] === "push") found.push({ dir: at, args: ws.slice(j + 1) });
      break;
    }
  }
  return found;
}

const git = (dir, ...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const ours = path.resolve(ROOT, git(ROOT, "rev-parse", "--git-common-dir"));
const list = pushes(String(input.command || ""), hook.cwd || ROOT);
if (!list.length) process.exit(0);

const stamp = stamps.readStamp(ROOT);
let live = null;
try { live = stamps.codeAt(ROOT, git(ROOT, "rev-parse", "--verify", "--quiet", "refs/remotes/origin/Main^{commit}")); } catch (e) {}
const late = [];
for (const { dir, args } of list) {
  let common;
  try { common = path.resolve(dir, git(dir, "rev-parse", "--git-common-dir")); } catch (e) { continue; }   // not a repository
  if (common !== ours) continue;                                                                          // someone else's
  const flags = [], refs = [];
  for (let i = 0; i < args.length; i++) {
    if (/^(-o|--push-option|--repo|--receive-pack|--exec)$/.test(args[i])) { i++; continue; }
    (args[i].startsWith("-") ? flags : refs).push(args[i]);
  }
  if (flags.some((f) => /^(-n|--dry-run|-d|--delete)$/.test(f))) continue;                               // sends no code
  if (flags.some((f) => /^(--all|--branches|--mirror|--tags)$/.test(f)))
    stop("Push guard: it checks what it is given; push the branches by name (git push origin <branch>, HEAD:Main).");
  const srcs = refs.length > 1 ? refs.slice(1).map((r) => r.replace(/^\+/, "").split(":")[0]).filter(Boolean) : ["HEAD"];
  for (const src of srcs) {
    let sha;
    try { sha = git(dir, "rev-parse", "--verify", "--quiet", src + "^{commit}"); } catch (e) { stop(`Push guard: cannot tell which commit "${src}" is.`); }
    const code = stamps.codeAt(dir, sha);
    if ((stamp && code === stamp.code) || code === live) continue;
    late.push(`${src} (${sha.slice(0, 7)}, code ${code})`);
  }
}
if (late.length) stop(`Push stopped by the outline guard (.claude/hooks/push-guard.mjs; CLAUDE.md, "Check it").
The code in ${late.join(", ")} has not passed tests/fold-check.mjs in this clone, and is not what Main already serves.
Last clean full run here: ${stamp ? `code ${stamp.code}, ${stamp.at}` : "none"}.
${RUN}`);
process.exit(0);
