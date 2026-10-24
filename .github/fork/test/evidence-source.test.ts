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
})
