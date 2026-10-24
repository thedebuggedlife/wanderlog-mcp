import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const script = fileURLToPath(new URL('../sync-merge.sh', import.meta.url))
const conflictsScript = fileURLToPath(new URL('../merge-conflicts.sh', import.meta.url))
const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
}
let dir: string
let up: string
let work: string

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim()
const write = (root: string, path: string, content: string) => {
  mkdirSync(join(root, path, '..'), { recursive: true })
  writeFileSync(join(root, path), content)
}
const commitAll = (cwd: string, msg: string) => {
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '-m', msg)
}
const sync = (): Record<string, string> => {
  const out = join(dir, 'out.txt')
  writeFileSync(out, '')
  git(work, 'fetch', '-q', 'origin')
  execFileSync('bash', [script, up, 'main', 'sync/upstream'], { cwd: work, env: { ...env, GITHUB_OUTPUT: out } })
  return Object.fromEntries(
    readFileSync(out, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('=') as [string, string]),
  )
}

const mergeConflicts = (head: string, existing = ''): string[] => {
  const out = join(dir, 'conflicts.txt')
  writeFileSync(out, existing)
  execFileSync('bash', [conflictsScript, head, out], { cwd: dir, env })
  return readFileSync(out, 'utf8').split('\n').filter(Boolean)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sync-'))
  up = join(dir, 'upstream')
  mkdirSync(up)
  git(up, 'init', '-q', '-b', 'main')
  write(up, 'src/a.ts', 'export const a = 1\n')
  write(up, 'package.json', '{\n  "name": "wanderlog-mcp"\n}\n')
  write(up, '.github/workflows/ci.yml', 'upstream ci\n')
  write(up, 'CLAUDE.md', 'upstream instructions\n')
  commitAll(up, 'upstream base')

  const origin = join(dir, 'origin.git')
  git(dir, 'clone', '-q', '--bare', up, origin)
  work = join(dir, 'work')
  git(dir, 'clone', '-q', origin, work)
  git(work, 'rm', '-q', '.github/workflows/ci.yml', 'CLAUDE.md')
  write(work, '.github/workflows/ours.yml', 'fork workflow\n')
  write(work, 'package.json', '{\n  "name": "@thedebuggedlife/wanderlog-mcp"\n}\n')
  commitAll(work, 'fork patches')
  git(work, 'push', '-q', 'origin', 'main')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('sync-merge.sh', () => {
  it('reports no change when upstream is already merged', () => {
    expect(sync()).toEqual({ changed: 'false' })
  })

  it('merges upstream and keeps fork-owned paths at the fork state', () => {
    write(up, 'src/a.ts', 'export const a = 2\n')
    write(up, '.github/workflows/ci.yml', 'upstream ci v2\n')
    write(up, '.github/workflows/new.yml', 'sneaky\n')
    write(up, 'CLAUDE.md', 'new instructions\n')
    commitAll(up, 'upstream change')

    const out = sync()
    expect(out.changed).toBe('true')
    expect(out.conflict).toBe('false')
    expect(out.upstream_sha).toBe(git(up, 'rev-parse', 'HEAD'))
    expect(readFileSync(join(work, 'src/a.ts'), 'utf8')).toBe('export const a = 2\n')
    expect(existsSync(join(work, '.github/workflows/ci.yml'))).toBe(false)
    expect(existsSync(join(work, '.github/workflows/new.yml'))).toBe(false)
    expect(existsSync(join(work, '.github/workflows/ours.yml'))).toBe(true)
    expect(existsSync(join(work, 'CLAUDE.md'))).toBe(false)
    expect(git(work, 'rev-list', '--parents', '-n', '1', 'HEAD').split(' ')).toHaveLength(3)
    expect(git(work, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('sync/upstream')
  })

  it('commits conflict markers and reports the conflict', () => {
    write(up, 'package.json', '{\n  "name": "wanderlog-mcp-renamed"\n}\n')
    commitAll(up, 'upstream rename')

    const out = sync()
    expect(out.conflict).toBe('true')
    expect(readFileSync(join(work, 'package.json'), 'utf8')).toContain('<<<<<<< ')
    expect(git(work, 'log', '-1', '--format=%s')).toMatch(/\(CONFLICTS\)$/)
  })

  it('auto-resolves conflicts confined to fork-owned paths', () => {
    write(up, '.github/workflows/ours.yml', 'upstream collides with our file\n')
    commitAll(up, 'upstream touches .github only')

    const out = sync()
    expect(out).toMatchObject({ changed: 'true', conflict: 'false' })
    expect(git(work, 'diff', '--name-only', 'origin/main', 'HEAD')).toBe('')
  })

  it('finds marker-less conflicts with merge-tree (fork modifies, upstream deletes)', () => {
    write(up, 'src/apply.ts', 'export const apply = 1\n')
    commitAll(up, 'upstream adds apply')
    sync()
    git(work, 'switch', '-q', 'main')
    git(work, 'merge', '-q', '--ff-only', 'sync/upstream')
    write(work, 'src/apply.ts', 'export const apply = 2 // fork patch\n')
    commitAll(work, 'fork patches apply')
    git(work, 'push', '-q', 'origin', 'main')
    git(up, 'rm', '-q', 'src/apply.ts')
    commitAll(up, 'upstream deletes apply')

    const out = sync()
    expect(out).toMatchObject({ changed: 'true', conflict: 'true' })
    expect(readFileSync(join(work, 'src/apply.ts'), 'utf8')).not.toContain('<<<<<<<')
    expect(mergeConflicts(work)).toEqual(['src/apply.ts'])
  })

  it('merge-conflicts.sh ignores fork-owned paths and de-duplicates its output', () => {
    write(up, '.github/workflows/ours.yml', 'upstream collides with our file\n')
    write(up, 'package.json', '{\n  "name": "wanderlog-mcp-renamed"\n}\n')
    commitAll(up, 'upstream conflicts in .github and package.json')

    sync()
    expect(mergeConflicts(work, 'package.json\n')).toEqual(['package.json'])
  })

  it('merge-conflicts.sh reports nothing for a clean merge', () => {
    write(up, 'src/a.ts', 'export const a = 2\n')
    commitAll(up, 'upstream change')
    sync()
    expect(mergeConflicts(work)).toEqual([])
  })

  it('merge-conflicts.sh fails closed when head is not a two-parent merge', () => {
    expect(mergeConflicts(work)).toEqual(['(head is not a two-parent merge commit)'])
  })

  it('does not rebuild a sync branch that already merges the same main and upstream', () => {
    write(up, 'src/a.ts', 'export const a = 2\n')
    commitAll(up, 'upstream change')
    expect(sync().changed).toBe('true')
    git(work, 'push', '-q', '--force', 'origin', 'HEAD:refs/heads/sync/upstream')
    const pushed = git(work, 'rev-parse', 'HEAD')

    expect(sync()).toEqual({ changed: 'false' })
    expect(git(dir, '--git-dir', join(dir, 'origin.git'), 'rev-parse', 'refs/heads/sync/upstream')).toBe(pushed)
  })

  it('rebuilds the sync branch when main moved since it was pushed', () => {
    write(up, 'src/a.ts', 'export const a = 2\n')
    commitAll(up, 'upstream change')
    sync()
    git(work, 'push', '-q', '--force', 'origin', 'HEAD:refs/heads/sync/upstream')
    git(work, 'switch', '-q', 'main')
    write(work, 'README.md', 'fork readme\n')
    commitAll(work, 'fork change on main')
    git(work, 'push', '-q', 'origin', 'main')

    const out = sync()
    expect(out.changed).toBe('true')
    expect(git(work, 'rev-parse', 'HEAD^1')).toBe(git(work, 'rev-parse', 'origin/main'))
  })
})
