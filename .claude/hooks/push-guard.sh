#!/usr/bin/env bash
# Claude Code hook (.claude/settings.json): the push guard, push-guard.mjs. This runs before
# every shell command, so anything that cannot be a push leaves at once, without Node.
input=$(cat)
case "$input" in
  *push*|*create_or_update_file*|*delete_file*|*merge_pull_request*) ;;
  *) exit 0 ;;
esac
if ! command -v node >/dev/null 2>&1; then
  echo "Push guard: Node is needed to check this push against the outline check (CLAUDE.md, \"Check it\")." >&2
  exit 2
fi
printf '%s' "$input" | node "$(dirname "$0")/push-guard.mjs"
