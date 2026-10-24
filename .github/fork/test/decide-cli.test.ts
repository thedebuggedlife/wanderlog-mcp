import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it } from 'vitest'

const cli = fileURLToPath(new URL('../bin/decide.ts', import.meta.url))
const review = { verdict: 'safe', bump: 'patch', evidenceDispositions: [], concerns: [], summary: 's' }
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'decide-'))
  writeFileSync(
    join(dir, 'gates.json'),
    JSON.stringify({ passed: true, conflict: false, emptyDiff: false, srcDeltaLines: 1, reasons: [] }),
  )
  writeFileSync(join(dir, 'evidence.json'), JSON.stringify({ items: [] }))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const run = (...extra: string[]) => {
  const out = join(dir, 'decision.json')
  execFileSync(
    process.execPath,
    [
      cli,
      '--gates',
      join(dir, 'gates.json'),
      '--evidence',
      join(dir, 'evidence.json'),
      '--head-ref',
      'sync/upstream',
      '--out',
      out,
      '--comment',
      join(dir, 'comment.md'),
      ...extra,
    ],
    { env: { ...process.env, REVIEW: JSON.stringify(review) } },
  )
  return JSON.parse(readFileSync(out, 'utf8'))
}

it('auto-merges with --sticky-needs-human false', () => {
  expect(run('--sticky-needs-human', 'false').automerge).toBe(true)
})

it.each([['true'], ['']])('needs a human with --sticky-needs-human %j', (value) => {
  const d = run('--sticky-needs-human', value)
  expect(d.automerge).toBe(false)
  expect(d.reasons).toEqual(['needs-human label is present (remove it and re-run to re-arm)'])
})

it('fails closed when --sticky-needs-human is omitted', () => {
  expect(run().automerge).toBe(false)
})
