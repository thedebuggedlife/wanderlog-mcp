#!/usr/bin/env bash
# Apply a verdict decision to a sync PR: labels, comment, commit statuses, auto-merge.
set -euo pipefail

decision=$1
comment=$2
field() { jq -r "$1" "$decision"; }
status() {
  gh api --silent "repos/$REPO/statuses/$SHA" -f state="$1" -f context="$2" -f description="$3"
}
pr_edit() { gh pr edit "$PR" --repo "$REPO" "$@"; }

for label in needs-human release:major release:minor release:patch release:none; do
  pr_edit --remove-label "$label" >/dev/null 2>&1 || true
done
label=$(field '.releaseLabel // empty')
if [ -n "$label" ]; then pr_edit --add-label "$label"; fi

gh pr comment "$PR" --repo "$REPO" --body-file "$comment"

if [ "$(field .gatesPassed)" = "true" ]; then
  status success fork/gates "Build, tests, size cap and conflict checks passed"
else
  status failure fork/gates "Gate failure, see the fork review comment"
fi

if [ "$(field .automerge)" = "true" ]; then
  if [ "$(field .dryRun)" != "true" ]; then
    gh pr merge "$PR" --repo "$REPO" --auto --merge
  fi
  status success fork/verdict "Automated review: safe"
else
  status failure fork/verdict "Needs a human review"
  pr_edit --add-label needs-human
  if [ -n "${REVIEWER:-}" ]; then pr_edit --add-reviewer "$REVIEWER" || true; fi
fi
