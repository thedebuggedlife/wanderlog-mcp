import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it } from 'vitest'

const cli = fileURLToPath(new URL('../bin/evidence.ts', import.meta.url))
const fakeMcp = fileURLToPath(new URL('./fixtures/fake-mcp.mjs', import.meta.url))
let dir: string

const tree = (root: string, src: string, scripts: Record<string, string> = {}) => {
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'dist'), { recursive: true })
  writeFileSync(join(root, 'src', 'a.ts'), src)
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ type: 'module', scripts, bin: { 'wanderlog-mcp': 'dist/index.js' } }),
  )
  cpSync(fakeMcp, join(root, 'dist', 'index.js'))
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'evidence-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

it('assembles a report from the inputs, tolerating missing files', () => {
  tree(join(dir, 'base'), 'fetch("https://wanderlog.com")')
  tree(join(dir, 'head'), 'fetch("https://evil.example")', { postinstall: 'node x' })
  writeFileSync(join(dir, 'changed.txt'), 'src/a.ts\nsrc/config.ts\n')
  writeFileSync(join(dir, 'sig-status'), 'ok\n')
  execFileSync(process.execPath, [
    cli,
    '--base',
    join(dir, 'base'),
    '--head',
    join(dir, 'head'),
    '--diff',
    join(dir, 'missing.patch'),
    '--changed',
    join(dir, 'changed.txt'),
    '--base-ls',
    join(dir, 'missing.json'),
    '--head-ls',
    join(dir, 'missing.json'),
    '--audit',
    join(dir, 'missing.json'),
    '--sig-status',
    join(dir, 'sig-status'),
    '--sig-log',
    join(dir, 'missing.txt'),
    '--out',
    join(dir, 'evidence.json'),
  ])
  const report = JSON.parse(readFileSync(join(dir, 'evidence.json'), 'utf8'))
  expect(report.items.map((i: { id: string }) => i.id)).toEqual([
    'lifecycle:postinstall',
    'audit:unavailable',
    'host:evil.example',
    'sensitive-file:src/config.ts',
  ])
  expect(report.toolsDiff).toEqual({ added: [], removed: [], newlyRequired: [], removedParams: [] })
  expect(report.tools.head).toEqual(['alpha', 'beta'])
})

it('--no-tools never executes dist/index.js and emits no tool evidence', () => {
  const marker = join(dir, 'marker')
  for (const side of ['base', 'head']) {
    tree(join(dir, side), 'export {}')
    writeFileSync(
      join(dir, side, 'dist', 'index.js'),
      `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(marker)}, 'ran')\n`,
    )
  }
  execFileSync(process.execPath, [
    cli,
    '--base',
    join(dir, 'base'),
    '--head',
    join(dir, 'head'),
    '--no-tools',
    '--out',
    join(dir, 'evidence.json'),
  ])
  const report = JSON.parse(readFileSync(join(dir, 'evidence.json'), 'utf8'))
  expect(report.items.filter((i: { id: string }) => i.id.startsWith('tool'))).toEqual([])
  expect(report.toolsDiff).toBeNull()
  expect(report.tools).toEqual({ base: [], head: [] })
  expect(existsSync(marker)).toBe(false)
})

it('--head-lock reports non-registry lockfile sources, and unparseable lockfiles', () => {
  tree(join(dir, 'base'), 'export {}')
  tree(join(dir, 'head'), 'export {}')
  const run = (lock: string) => {
    writeFileSync(join(dir, 'package-lock.json'), lock)
    execFileSync(process.execPath, [
      cli,
      '--base',
      join(dir, 'base'),
      '--head',
      join(dir, 'head'),
      '--head-lock',
      join(dir, 'package-lock.json'),
      '--no-tools',
      '--out',
      join(dir, 'evidence.json'),
    ])
    return JSON.parse(readFileSync(join(dir, 'evidence.json'), 'utf8')).items.map((i: { id: string }) => i.id)
  }
  const git = { packages: { '': {}, 'node_modules/evil': { resolved: 'git+ssh://git@example.com/evil.git#abc' } } }
  expect(run(JSON.stringify(git))).toContain('lockfile-source:node_modules/evil')
  expect(run('{not json')).toContain('lockfile-source:unparseable')
})
