#!/usr/bin/env bash
# Merge an upstream ref into <branch> (reset from origin/main), keeping fork-owned paths at main's state.
set -euo pipefail

url=$1
ref=$2
branch=$3
out=${GITHUB_OUTPUT:-/dev/stdout}
fork_owned=(.github CLAUDE.md .claude .mcp.json)

git fetch --quiet --no-tags "$url" "$ref"
up_sha=$(git rev-parse FETCH_HEAD)

if git merge-base --is-ancestor "$up_sha" origin/main; then
  echo "changed=false" >>"$out"
  exit 0
fi

if prev=$(git rev-parse -q --verify "refs/remotes/origin/$branch^{commit}"); then
  prev_main=$(git rev-parse -q --verify "$prev^1" || true)
  prev_up=$(git rev-parse -q --verify "$prev^2" || true)
  if [ "$prev_main" = "$(git rev-parse origin/main)" ] && [ "$prev_up" = "$up_sha" ]; then
    echo "changed=false" >>"$out"
    exit 0
  fi
fi

merge_base=$(git merge-base origin/main "$up_sha")
git switch --quiet -C "$branch" origin/main
attrs=$(git rev-parse --git-path info/attributes)
mkdir -p "$(dirname "$attrs")"
echo '* merge=text' >>"$attrs"
git merge --no-ff --no-commit "$up_sha" >/dev/null 2>&1 || true
if ! git rev-parse -q --verify MERGE_HEAD >/dev/null; then
  echo "error: merge of $up_sha did not start" >&2
  exit 1
fi

for path in "${fork_owned[@]}"; do
  git rm -r -q -f --ignore-unmatch -- "$path" >/dev/null
  rm -rf -- "$path"
  if git cat-file -e "origin/main:$path" 2>/dev/null; then
    git checkout origin/main -- "$path"
  fi
done

conflict=false
if [ -n "$(git diff --name-only --diff-filter=U)" ]; then
  conflict=true
fi

git add -A
msg="chore(sync): merge upstream ${up_sha:0:12}"
if [ "$conflict" = true ]; then
  msg="$msg (CONFLICTS)"
fi
git commit --quiet --no-verify -m "$msg"

{
  echo "changed=true"
  echo "conflict=$conflict"
  echo "upstream_sha=$up_sha"
  echo "merge_base=$merge_base"
} >>"$out"
