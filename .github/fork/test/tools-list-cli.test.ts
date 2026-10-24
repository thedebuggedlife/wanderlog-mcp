import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it } from 'vitest'

const cli = fileURLToPath(new URL('../bin/tools-list.ts', import.meta.url))
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
let dir: string

const tree = (side: string, entry: string) => {
  mkdirSync(join(dir, side, 'dist'), { recursive: true })
  writeFileSync(join(dir, side, 'package.json'), JSON.stringify({ type: 'module' }))
  cpSync(fixture(entry), join(dir, side, 'dist', 'index.js'))
}
const run = () => {
  const out = join(dir, 'tools.json')
  execFileSync(process.execPath, [cli, '--base', join(dir, 'base'), '--head', join(dir, 'head'), '--out', out])
  return JSON.parse(readFileSync(out, 'utf8'))
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tools-list-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

it('lists both sides and diffs them', () => {
  tree('base', 'fake-mcp.mjs')
  tree('head', 'fake-mcp.mjs')
  expect(run()).toEqual({
    base: ['alpha', 'beta'],
    head: ['alpha', 'beta'],
    toolsDiff: { added: [], removed: [], newlyRequired: [], removedParams: [] },
    errors: [],
  })
})

it('records a failing side as null with one error and no diff', () => {
  tree('base', 'fake-mcp.mjs')
  tree('head', 'exit-mcp.mjs')
  const result = run()
  expect(result.base).toEqual(['alpha', 'beta'])
  expect(result.head).toBeNull()
  expect(result.toolsDiff).toBeNull()
  expect(result.errors).toHaveLength(1)
  expect(result.errors[0]).toMatch(/head/)
})
