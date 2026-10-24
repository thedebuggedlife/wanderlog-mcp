# Wanderdog — agent instructions

Wanderdog is an MCP server that exposes [Wanderlog](https://wanderlog.com) trip editing to LLM agents. TypeScript, stdio transport, cookie-based auth.

This checkout is the **thedebuggedlife/wanderlog-mcp fork** of `shaikhspeare/wanderlog-mcp` (remote `upstream`). A daily workflow merges upstream into `main` through a reviewed `sync/upstream` PR; `.github/`, `CLAUDE.md`, `.claude/`, `.mcp.json` and `specs/` are fork-owned and always keep the fork's version (`.github/fork/sync-merge.sh`).

## Invariants (do not violate)

1. Never assume block shape. Real trips contain `place`, `note`, `flight`, `train`, and unknown types. Always discriminate on `block.type` with a fallback.
2. Never expose raw IDs (`place_id`, section indices, ShareDB paths) to the LLM by default. Use natural references.
3. Every REST response is `{success, payload}`. Always unwrap.
4. Startup must surface auth errors clearly. The server stays alive (for hosting platform health checks) but every tool returns an auth-required error until valid credentials are provided.
5. Cookie value must never appear in tool responses, logs, or error messages.
6. Section indices are not stable across edits. Always resolve by `date`/`heading`/`type` from a fresh snapshot.
7. Natural language in, natural language out — the LLM shouldn't need to touch ShareDB paths or `ChIJ...` place_ids.
8. **All mutations go through `submitOp` in `src/tools/shared.ts`.** That helper holds the per-trip mutex, wraps the submit in try/catch, and invalidates the cache on failure. Do NOT call `ShareDBClient.submit()` directly from a tool — it bypasses parallel-safety and cache-consistency guarantees.
9. Failed submits must invalidate the cache (`tripCache.invalidate(tripKey)`) so the next read refetches a fresh snapshot.
10. Error frames in `ShareDBClient.handleFrame` must be matched by `seq` first; only fall back to `failAllPending` when the error can't be attributed. One op's error must not kill unrelated in-flight ops.

If a change would require violating one of these, stop and ask the user — don't work around it.

## Dev commands

```bash
npm run build            # compile TS → dist/
npm test                 # unit tests only (no network, fast)
npm run test:integration # live tests against wanderlog.com (requires .env)
npm run typecheck        # tsc --noEmit
npm run lint             # eslint
npm run format:check     # prettier
(cd .github/fork && npm test)  # fork CI tooling (sync / review / release)
```

## Don't

- Don't add dependencies without a reason. We intentionally use native `fetch` over `undici`, vitest without plugins, and zero HTTP client libraries. Justify new deps in the PR description.
- Don't write comments explaining what code does — names should. Only comment _why_ when the reason is non-obvious (hidden constraint, workaround for a specific bug, surprising behavior).
- Don't commit `.env`, HAR captures, or anything containing a `connect.sid` value. `.gitignore` covers `.env` and `*.har` but double-check before `git add`.
- Don't skip the auth probe on startup. It's cheap and it catches the #1 failure mode (expired cookie) immediately.

## Secrets

The `connect.sid` cookie in `.env` is long-lived (~1 year). Treat it as a high-value credential. It's gitignored and should stay that way. If you ever think you need to print it for debugging, you don't — the auth probe tells you whether it's valid without leaking the value.

## Agent workflow (superpowers + Paseo)

These are declared preferences; they override the superpowers skills' defaults.

- **Worktrees are owned by Paseo** (`paseo.json` runs `npm ci && (cd .github/fork && npm ci)` on creation and copies `.env` if the main checkout has one; they live under
  `~/.paseo/worktrees/`). If already in a linked worktree, work there. Never use `EnterWorktree`
  or `git worktree add`. From the main checkout, create a Paseo worktree
  (`paseo worktree create --mode branch-off --new-branch <name> --base origin/main`, or `mcp__paseo__create_workspace`)
  — the main checkout may be shared with other agents. Don't run `npm install`
  in a worktree; if dependencies are missing, run `npm ci`.
- **Baseline / verification** is `npm run typecheck && npm test`; add `(cd .github/fork && npm test)` when touching `.github/fork/**` or `.github/workflows/**`. Run `npm run build && npm run test:integration` for changes to `src/transport/**` or `src/tools/**`.
  It is a **machine-wide singleton** (it mutates the one live trip in `WANDERLOG_TRIP_KEY` on wanderlog.com) — never run two at once. It needs `.env`; if the worktree has none, say so instead of skipping silently.
- **Finishing a branch:** always push to `origin` and open a PR against the fork — `gh pr create --repo thedebuggedlife/wanderlog-mcp --base main`, never against `upstream`; never merge into `main` locally.
  The PR must carry exactly one `release:*` label — `release:none` for chore/docs/ci/test, `release:patch` for fixes, `release:minor` for features, `release:major` for breaking changes — since labels, not commit subjects, decide what the release workflow publishes when `main` moves. Ask if the bump is unclear.
  Archive the worktree through Paseo, then delete the merged branch. Worktrees removed any other way also need `.claude/scripts/lumen-prune.sh <worktree path>`.
- **Specs** go in `specs/YYYY-MM-DD-<feature>.md`, committed as `docs:` on the feature branch (not `docs/`, which upstream's `.gitignore` ignores).
- **Plans** and other agent workflow artifacts **never** get committed into the tree.
- **Docs search:** use the qmd plugin (collection `wanderlog-mcp`) before grepping the markdown docs;
  lumen is for code. qmd keeps ONE index pinned to the main checkout, refreshed on `main`
  commits and pulls — in a worktree it does not see this branch's doc changes: open hits with `Read` at the
  worktree path rather than the qmd `get` tool, and grep for docs the branch added, moved or edited.

### Local qmd refresh hook

`.git/hooks/` is not versioned. On a fresh clone, install this as both `.git/hooks/post-commit` and `.git/hooks/post-merge` (`main` usually advances by `git pull`) and `chmod +x` them:

```bash
#!/bin/bash
[ "$(git symbolic-ref --quiet --short HEAD 2>/dev/null)" = "main" ] || exit 0
if out=$(qmd update 2>&1 && qmd embed -c wanderlog-mcp 2>&1 && qmd cleanup 2>&1); then
  echo "[post-commit] qmd index refreshed"
else
  printf '[post-commit] qmd refresh FAILED (commit is unaffected):\n%s\n' "$out" >&2
fi
exit 0
```

The collection itself is machine-global: `qmd collection add . --name wanderlog-mcp` from the main checkout, then `qmd update && qmd embed -c wanderlog-mcp`.
