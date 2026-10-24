#!/usr/bin/env bash
# Append paths that conflict when re-merging the sync commit's parents (incl. marker-less conflicts) to <out-file>.
set -euo pipefail

head=$1
out=$2
tree=$(mktemp)
trap 'rm -f "$tree"' EXIT

if [ "$(git -C "$head" rev-list --parents -n 1 HEAD | wc -w)" -ne 3 ]; then
  echo "(head is not a two-parent merge commit)" >>"$out"
else
  attrs=$(git -C "$head" rev-parse --path-format=absolute --git-path info/attributes)
  mkdir -p "$(dirname "$attrs")"
  echo '* merge=text' >>"$attrs"
  status=0
  git -C "$head" -c core.quotepath=false merge-tree --write-tree --name-only --no-messages HEAD^1 HEAD^2 >"$tree" ||
    status=$?
  if [ "$status" -gt 1 ]; then
    echo "(git merge-tree failed with exit code $status)" >>"$out"
  fi
  tail -n +2 "$tree" | grep -vE '^(\.github/|CLAUDE\.md$|\.claude/|\.mcp\.json$)' >>"$out" || true
fi
sort -u -o "$out" "$out"
