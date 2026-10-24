#!/usr/bin/env bash
# Claude Code hook: steer knowledge-base lookups to the qmd MCP instead of grep/lumen.
#   qmd-nudge.sh session-start   -> SessionStart directive
#   qmd-nudge.sh pre-tool-use    -> PreToolUse hint when a Grep/Glob/Bash search targets the markdown docs
set -u

COLLECTION="wanderlog-mcp"
DOC_DIRS="specs"
DOCS_DESC="design specs, README setup and MCP tool reference, install guide, agent instructions"

QUERY_TOOL="mcp__plugin_qmd_qmd__query"
GET_TOOL="mcp__plugin_qmd_qmd__get"
LOAD_HINT="load it first with ToolSearch \"select:${QUERY_TOOL},${GET_TOOL}\""

emit() {
  jq -cn --arg ev "$1" --arg ctx "$2" '{hookSpecificOutput: {hookEventName: $ev, additionalContext: $ctx}}'
}

# The single qmd index tracks the main checkout as of its last commit on the default branch.
worktree_caveat() {
  local root="${CLAUDE_PROJECT_DIR:-.}"
  [ "$(git -C "$root" rev-parse --git-dir 2>/dev/null)" = "$(git -C "$root" rev-parse --git-common-dir 2>/dev/null)" ] && return 0
  printf ' You are in a worktree: qmd indexes the MAIN checkout, not this branch — open hits with Read at the worktree path (not %s, which returns the main copy), and for docs this branch added, moved or edited (git diff --name-only <default branch>...) use grep.' "$GET_TOOL"
}

session_start() {
  emit SessionStart "Knowledge-base lookups in this repo (${DOCS_DESC}) go to ${QUERY_TOOL} FIRST, collection \"${COLLECTION}\" (${LOAD_HINT}). Give it an intent plus lex+vec sub-queries, then read hits with ${GET_TOOL}. Lumen semantic_search is for code, not these docs. Grep stays right only for an exact string in a file you already know.$(worktree_caveat)"
}

targets_docs() {
  grep -qE -e '\.md\b|\bmd\b|markdown' \
    -e '(^|[[:space:]"'"'"'/=])('"$DOC_DIRS"')/' \
    -e '(^|[[:space:]]|/)('"$DOC_DIRS"')([[:space:]]|$)'
}

pre_tool_use() {
  local input tool text
  input=$(cat)
  tool=$(jq -r '.tool_name // empty' <<<"$input" 2>/dev/null)
  case "$tool" in
    Grep)
      text=$(jq -r '[.tool_input.path, .tool_input.glob, .tool_input.type] | map(select(. != null)) | join(" ")' <<<"$input")
      # A single named .md file is a targeted lookup, not a discovery search.
      jq -e '(.tool_input.path // "") | test("\\.md$")' <<<"$input" >/dev/null && return 0
      ;;
    Glob)
      text=$(jq -r '[.tool_input.pattern, .tool_input.path] | map(select(. != null)) | join(" ")' <<<"$input")
      ;;
    Bash)
      text=$(jq -r '.tool_input.command // empty' <<<"$input")
      # Only multi-file searches: rg/find/fd/ag, or grep with a recursive/include flag or a glob.
      grep -qE '(^|[|;&[:space:]])(rg|find|fd|ag)[[:space:]]|grep[[:space:]]+(-[A-Za-z]*[rR]|.*--include|.*\*)' <<<"$text" || return 0
      ;;
    *) return 0 ;;
  esac
  targets_docs <<<"$text" || return 0
  emit PreToolUse "This searches the markdown knowledge base — prefer ${QUERY_TOOL} (collection \"${COLLECTION}\"; ${LOAD_HINT}) over grep/find/lumen: hybrid keyword+semantic, ranked, and it finds content under different wording. Keep grep only for an exact string you already know."
}

case "${1:-}" in
  session-start) session_start ;;
  pre-tool-use) pre_tool_use ;;
esac
exit 0
