import { describe, expect, it } from 'vitest'
import { auditItems, dependencyItems, flattenNpmLs, packageItems } from '../lib/evidence.ts'

const tree = (deps: Record<string, string | [string, Record<string, string>]>) => ({
  dependencies: Object.fromEntries(
    Object.entries(deps).map(([name, v]) =>
      typeof v === 'string'
        ? [name, { version: v }]
        : [
            name,
            {
              version: v[0],
              dependencies: Object.fromEntries(Object.entries(v[1]).map(([n, ver]) => [n, { version: ver }])),
            },
          ],
    ),
  ),
})

describe('flattenNpmLs', () => {
  it('collects every version of every package, transitively', () => {
    const flat = flattenNpmLs(tree({ a: ['1.0.0', { b: '2.0.0' }], b: '3.0.0' }))
    expect([...flat.get('b')!].sort()).toEqual(['2.0.0', '3.0.0'])
    expect([...flat.get('a')!]).toEqual(['1.0.0'])
  })
})

describe('dependencyItems', () => {
  it('reports added, removed and changed packages', () => {
    const items = dependencyItems(
      tree({ ws: '8.18.0', zod: '3.23.8', gone: '1.0.0' }),
      tree({ ws: '8.18.0', zod: '4.4.3', fresh: '0.1.0' }),
    )
    expect(items).toEqual([
      { id: 'dependency:fresh', kind: 'dependency', detail: 'New runtime package fresh@0.1.0' },
      { id: 'dependency:gone', kind: 'dependency', detail: 'Removed runtime package gone@1.0.0' },
      { id: 'dependency:zod', kind: 'dependency', detail: 'zod 3.23.8 → 4.4.3' },
    ])
  })
  it('reports nothing for identical trees', () => {
    expect(dependencyItems(tree({ ws: '8.18.0' }), tree({ ws: '8.18.0' }))).toEqual([])
  })
})

describe('packageItems', () => {
  it('reports lifecycle script changes', () => {
    const items = packageItems({ scripts: { build: 'tsc' } }, { scripts: { build: 'tsc', postinstall: 'node x.js' } })
    expect(items).toEqual([
      { id: 'lifecycle:postinstall', kind: 'lifecycle', detail: 'postinstall: null → "node x.js"' },
    ])
  })
  it('ignores non-lifecycle script changes', () => {
    expect(packageItems({ scripts: { test: 'a' } }, { scripts: { test: 'b' } })).toEqual([])
  })
  it('reports bin changes', () => {
    const items = packageItems(
      { bin: { 'wanderlog-mcp': 'dist/index.js' } },
      { bin: { 'wanderlog-mcp': 'dist/other.js' } },
    )
    expect(items.map((i) => i.id)).toEqual(['bin'])
  })
  it('reports packageManager changes', () => {
    expect(packageItems({ packageManager: 'npm@11.8.0' }, { packageManager: 'npm@11.9.0' })).toEqual([
      {
        id: 'package:packageManager',
        kind: 'package',
        detail: 'packageManager: "npm@11.8.0" → "npm@11.9.0"',
      },
    ])
  })
  it('reports devEngines changes, including additions', () => {
    const devEngines = { packageManager: { name: 'npm', onFail: 'download' } }
    expect(packageItems({}, { devEngines })).toEqual([
      {
        id: 'package:devEngines',
        kind: 'package',
        detail: `devEngines: null → ${JSON.stringify(devEngines)}`,
      },
    ])
  })
  it('ignores unchanged packageManager and devEngines', () => {
    const pkg = { packageManager: 'npm@11.8.0', devEngines: { runtime: { name: 'node' } } }
    expect(packageItems(pkg, structuredClone(pkg))).toEqual([])
  })
})

describe('auditItems', () => {
  it('reports high and critical vulnerabilities only', () => {
    const items = auditItems(
      { vulnerabilities: { a: { severity: 'low' }, b: { severity: 'high' }, c: { severity: 'critical' } } },
      { ok: true, log: '' },
    )
    expect(items.map((i) => i.id)).toEqual(['audit:b', 'audit:c'])
  })
  it('reports failed signature verification', () => {
    const items = auditItems({ vulnerabilities: {} }, { ok: false, log: '1 package has an invalid signature\n' })
    expect(items).toEqual([
      {
        id: 'audit:signatures',
        kind: 'audit',
        detail: 'npm audit signatures failed: 1 package has an invalid signature',
      },
    ])
  })
  it('reports a missing audit report', () => {
    expect(auditItems(null, { ok: true, log: '' }).map((i) => i.id)).toEqual(['audit:unavailable'])
  })
})
