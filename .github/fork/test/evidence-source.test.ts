import { describe, expect, it } from 'vitest'
import { addedLines, hostItems, isAllowedHost, riskyApiItems, sensitiveFileItems } from '../lib/evidence.ts'

const diff = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,2 +1,4 @@',
  ' const keep = 1',
  '+import { exec } from "node:child_process"',
  '-const removed = eval("1")',
  '+const port = process.env.PORT',
  '+const cookie = process.env.WANDERLOG_COOKIE',
  ' const tail = 2',
  '+const mod = await import(name)',
  'diff --git a/README.md b/README.md',
  '--- a/README.md',
  '+++ b/README.md',
  '@@ -1 +1 @@',
  '+eval("in docs is ignored")',
].join('\n')

describe('isAllowedHost', () => {
  it.each(['wanderlog.com', 'help.wanderlog.com', 'localhost', '127.0.0.1'])('allows %s', (h) => {
    expect(isAllowedHost(h)).toBe(true)
  })
  it.each(['evil.com', 'wanderlog.com.evil.com', 'notwanderlog.com'])('rejects %s', (h) => {
    expect(isAllowedHost(h)).toBe(false)
  })
})

describe('hostItems', () => {
  const base = [{ path: 'src/a.ts', content: 'fetch("https://wanderlog.com/api")' }]
  it('reports new hosts and non-Wanderlog hosts, not unchanged allowlisted ones', () => {
    const head = [
      { path: 'src/a.ts', content: 'fetch("https://wanderlog.com/api"); new WebSocket("wss://help.wanderlog.com")' },
      { path: 'src/b.ts', content: 'fetch(`https://Collector.Example.net/x`)' },
    ]
    expect(hostItems(base, head)).toEqual([
      {
        id: 'host:collector.example.net',
        kind: 'host',
        detail: 'New non-Wanderlog host collector.example.net in src/b.ts',
      },
      { id: 'host:help.wanderlog.com', kind: 'host', detail: 'New allowlisted host help.wanderlog.com in src/a.ts' },
    ])
  })
  it('keeps reporting an existing non-Wanderlog host', () => {
    const files = [{ path: 'src/a.ts', content: 'https://example.org' }]
    expect(hostItems(files, files).map((i) => i.detail)).toEqual([
      'Existing non-Wanderlog host example.org in src/a.ts',
    ])
  })
})

describe('addedLines', () => {
  it('tracks file and new-file line numbers for added lines only', () => {
    expect(addedLines(diff).map((l) => `${l.file}:${l.line}`)).toEqual([
      'src/a.ts:2',
      'src/a.ts:3',
      'src/a.ts:4',
      'src/a.ts:6',
      'README.md:1',
    ])
  })
  it('does not mistake an added "++" line for a file header', () => {
    const d = ['--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1 +1,2 @@', ' x', '+++ i'].join('\n')
    expect(addedLines(d)).toEqual([{ file: 'src/a.ts', line: 2, text: '++ i' }])
  })
})

describe('riskyApiItems', () => {
  it('flags risky APIs and non-WANDERLOG env reads in added src/ lines', () => {
    expect(riskyApiItems(diff)).toEqual([
      {
        id: 'risky-api:src/a.ts:2',
        kind: 'risky-api',
        detail: 'child_process: import { exec } from "node:child_process"',
      },
      { id: 'risky-api:src/a.ts:3', kind: 'risky-api', detail: 'env read PORT: const port = process.env.PORT' },
      { id: 'risky-api:src/a.ts:6', kind: 'risky-api', detail: 'dynamic import: const mod = await import(name)' },
    ])
  })
  it('flags dynamic env reads', () => {
    const d = ['--- a/src/a.ts', '+++ b/src/a.ts', '@@ -0,0 +1 @@', '+const v = process.env[key]'].join('\n')
    expect(riskyApiItems(d)[0]!.detail).toBe('dynamic env read: const v = process.env[key]')
  })
})

describe('sensitiveFileItems', () => {
  it('reports only the sensitive files that changed', () => {
    expect(sensitiveFileItems(['src/config.ts', 'src/tools/a.ts', '.npmrc']).map((i) => i.id)).toEqual([
      'sensitive-file:.npmrc',
      'sensitive-file:src/config.ts',
    ])
  })
  it('reports agent instruction and config files at any depth', () => {
    const changed = [
      'src/CLAUDE.md',
      'docs/deep/CLAUDE.local.md',
      'tools/.mcp.json',
      'src/.claude/settings.json',
      '.claude/commands/x.md',
      'src/claude.ts',
      'src/NOTCLAUDE.md',
      'src/x.claude/y.ts',
    ]
    expect(sensitiveFileItems(changed)).toEqual([
      {
        id: 'sensitive-file:.claude/commands/x.md',
        kind: 'sensitive-file',
        detail: '.claude/commands/x.md changed (Claude agent instructions or MCP config)',
      },
      {
        id: 'sensitive-file:docs/deep/CLAUDE.local.md',
        kind: 'sensitive-file',
        detail: 'docs/deep/CLAUDE.local.md changed (Claude agent instructions or MCP config)',
      },
      {
        id: 'sensitive-file:src/.claude/settings.json',
        kind: 'sensitive-file',
        detail: 'src/.claude/settings.json changed (Claude agent instructions or MCP config)',
      },
      {
        id: 'sensitive-file:src/CLAUDE.md',
        kind: 'sensitive-file',
        detail: 'src/CLAUDE.md changed (Claude agent instructions or MCP config)',
      },
      {
        id: 'sensitive-file:tools/.mcp.json',
        kind: 'sensitive-file',
        detail: 'tools/.mcp.json changed (Claude agent instructions or MCP config)',
      },
    ])
  })
})

const addedSrc = (text: string): string => ['--- a/src/a.ts', '+++ b/src/a.ts', '@@ -0,0 +1 @@', `+${text}`].join('\n')

describe('isAllowedHost evasions', () => {
  it.each(['wanderlog.com_.evil.com', 'wanderlog.com%2eevil.com', 'wanderlog.com。evil.com', '[2001:db8::1]'])(
    'rejects %s',
    (h) => {
      expect(isAllowedHost(h)).toBe(false)
    },
  )
})

describe('hostItems authority parsing', () => {
  const base = [{ path: 'src/a.ts', content: 'https://wanderlog.com' }]
  const head = (content: string) => [{ path: 'src/a.ts', content }]
  it('takes the host after userinfo', () => {
    expect(hostItems(base, head('https://wanderlog.com@evil.com/x')).map((i) => i.id)).toEqual(['host:evil.com'])
  })
  it('does not allow a lookalike with an underscore', () => {
    const items = hostItems(base, head('https://wanderlog.com_.evil.com/'))
    expect(items.map((i) => i.id)).toEqual(['host:wanderlog.com_.evil.com'])
    expect(items[0]!.detail).toContain('non-Wanderlog')
  })
  it('does not allow a percent-encoded dot', () => {
    const items = hostItems(base, head('https://wanderlog.com%2eevil.com/'))
    expect(items.map((i) => i.id)).toEqual(['host:wanderlog.com%2eevil.com'])
    expect(items[0]!.detail).toContain('non-Wanderlog')
  })
  it('reads a host from JS-escaped slashes', () => {
    expect(hostItems(base, head('https:\\/\\/evil.com/x')).map((i) => i.id)).toEqual(['host:evil.com'])
  })
  it('keeps a bracketed IPv6 literal whole and strips its port', () => {
    expect(hostItems(base, head('http://[2001:db8::1]:8080/')).map((i) => i.id)).toEqual(['host:[2001:db8::1]'])
  })
  it('strips userinfo before a bracketed IPv6 literal', () => {
    expect(hostItems(base, head('http://[::1]@evil.com/')).map((i) => i.id)).toEqual(['host:evil.com'])
  })
  it('ignores the port on an allowlisted host', () => {
    const files = [{ path: 'src/a.ts', content: 'http://localhost:3000/' }]
    expect(hostItems(files, files)).toEqual([])
  })
})

describe('addedLines hunk parsing', () => {
  it('reads hunk content that looks like headers as content', () => {
    const d = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,2 +1,3 @@',
      ' keep',
      '--- removed',
      '+++ b/docs/x.md',
      '+const z = eval("x")',
    ].join('\n')
    expect(addedLines(d)).toEqual([
      { file: 'src/a.ts', line: 2, text: '++ b/docs/x.md' },
      { file: 'src/a.ts', line: 3, text: 'const z = eval("x")' },
    ])
    expect(riskyApiItems(d).map((i) => i.id)).toEqual(['risky-api:src/a.ts:3'])
  })
  it('counts an empty line inside a hunk as context', () => {
    const d = ['--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1,2 +1,2 @@', ' a', '', '+x'].join('\n')
    expect(addedLines(d)).toEqual([{ file: 'src/a.ts', line: 3, text: 'x' }])
  })
  it('unquotes a C-quoted UTF-8 path', () => {
    const d = ['--- a/src/x.ts', '+++ "b/src/caf\\303\\251.ts"', '@@ -0,0 +1 @@', '+const a = 1'].join('\n')
    expect(addedLines(d)).toEqual([{ file: 'src/café.ts', line: 1, text: 'const a = 1' }])
  })
  it('strips a trailing tab from the path', () => {
    const d = ['--- a/src/with space.ts', '+++ b/src/with space.ts\t', '@@ -0,0 +1 @@', '+const a = 1'].join('\n')
    expect(addedLines(d)).toEqual([{ file: 'src/with space.ts', line: 1, text: 'const a = 1' }])
  })
})

describe('riskyApiItems whole-environment and named env reads', () => {
  const details = (text: string) => riskyApiItems(addedSrc(text)).map((i) => i.detail)
  it('flags destructuring of process.env', () => {
    expect(details('const { HOME, TOKEN } = process.env')).toEqual([
      'process.env access: const { HOME, TOKEN } = process.env',
    ])
  })
  it('flags serialising process.env', () => {
    expect(details('send(JSON.stringify(process.env))')).toEqual([
      'process.env access: send(JSON.stringify(process.env))',
    ])
  })
  it('reads a named variable through optional chaining', () => {
    expect(details('const x = process?.env?.FOO')).toEqual(['env read FOO: const x = process?.env?.FOO'])
  })
  it('reads a named variable through bracket notation', () => {
    expect(details("const y = process['env'].BAR")).toEqual(["env read BAR: const y = process['env'].BAR"])
  })
  it('flags an unknown WANDERLOG_ variable', () => {
    expect(details('const z = process.env.WANDERLOG_EXFIL_URL')).toEqual([
      'env read WANDERLOG_EXFIL_URL: const z = process.env.WANDERLOG_EXFIL_URL',
    ])
  })
  it('allows the known WANDERLOG_COOKIE', () => {
    expect(details('const c = process.env.WANDERLOG_COOKIE')).toEqual([])
  })
  it('reports each label once per line', () => {
    expect(details('const p = process.env.A + process.env.A')).toEqual([
      'env read A: const p = process.env.A + process.env.A',
    ])
  })
})

describe('riskyApiItems dynamic import', () => {
  const details = (text: string) => riskyApiItems(addedSrc(text)).map((i) => i.detail)
  it('allows a static string import', () => {
    expect(details("const m = await import('./x.ts')")).toEqual([])
  })
  it('flags a concatenated specifier', () => {
    expect(details('const m = await import("./" + name)')).toEqual([
      'dynamic import: const m = await import("./" + name)',
    ])
  })
  it('flags a template specifier', () => {
    expect(details('const m = await import(`${base}/x.js`)')).toEqual([
      'dynamic import: const m = await import(`${base}/x.js`)',
    ])
  })
  it('flags an argument on the next line', () => {
    expect(details('const m = await import(')).toEqual(['dynamic import: const m = await import('])
  })
})

describe('riskyApiItems extended labels', () => {
  it.each([
    ['Function("return 1")()', 'Function constructor'],
    ['(0, eval)(code)', 'eval'],
    ["globalThis['eval'](code)", 'eval'],
    ["import vm from 'node:vm'", 'sensitive module'],
    ["process.binding('fs')", 'native binding'],
    ['await fs.rm(p)', 'filesystem write'],
    ['fs.writeSync(fd, data)', 'filesystem write'],
  ])('flags %s as %s', (text, label) => {
    expect(riskyApiItems(addedSrc(text)).map((i) => i.detail)).toEqual([`${label}: ${text}`])
  })
})

describe('riskyApiItems env reads off any object', () => {
  const details = (text: string) => riskyApiItems(addedSrc(text)).map((i) => i.detail)
  it('flags a named read off a required module', () => {
    expect(details('const a = require("node:process").env.FOO')).toEqual([
      'env read FOO: const a = require("node:process").env.FOO',
    ])
  })
  it('flags a named read off another object', () => {
    expect(details('const b = proc.env.SECRET')).toEqual(['env read SECRET: const b = proc.env.SECRET'])
  })
  it('flags a named read off import.meta', () => {
    expect(details('const c = import.meta.env.X')).toEqual(['env read X: const c = import.meta.env.X'])
  })
  it('does not match a longer identifier after process', () => {
    expect(details('const d = process.environment')).toEqual([])
  })
  it('reports process.env.NAME once', () => {
    expect(details('const e = process.env.FOO')).toEqual(['env read FOO: const e = process.env.FOO'])
  })
})
