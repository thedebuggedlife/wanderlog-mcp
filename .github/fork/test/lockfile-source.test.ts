import { describe, expect, it } from 'vitest'
import { lockfileSourceItems } from '../lib/evidence.ts'

describe('lockfileSourceItems', () => {
  it('ignores registry sources, the root entry, bundled entries and a missing lockfile', () => {
    expect(
      lockfileSourceItems({
        lockfileVersion: 3,
        packages: {
          '': { resolved: 'git+ssh://example.com/root.git' },
          'node_modules/a': { version: '1.0.0', resolved: 'https://registry.npmjs.org/a/-/a-1.0.0.tgz' },
          'node_modules/bundled': {},
        },
      }),
    ).toEqual([])
    expect(lockfileSourceItems(null)).toEqual([])
    expect(lockfileSourceItems({ lockfileVersion: 3 })).toEqual([])
  })
  it('flags git, file and registry-lookalike sources and links, sorted by id', () => {
    const items = lockfileSourceItems({
      lockfileVersion: 3,
      packages: {
        'node_modules/zed': { link: true },
        'node_modules/git-dep': { resolved: 'git+ssh://git@github.com/x/y.git#abc' },
        'node_modules/local': { resolved: 'file:../x' },
        'node_modules/fake': { resolved: 'https://registry.npmjs.org.evil.io/fake.tgz' },
      },
    })
    expect(items).toEqual([
      {
        id: 'lockfile-source:node_modules/fake',
        kind: 'lockfile-source',
        detail: 'node_modules/fake resolves from https://registry.npmjs.org.evil.io/fake.tgz',
      },
      {
        id: 'lockfile-source:node_modules/git-dep',
        kind: 'lockfile-source',
        detail: 'node_modules/git-dep resolves from git+ssh://git@github.com/x/y.git#abc',
      },
      {
        id: 'lockfile-source:node_modules/local',
        kind: 'lockfile-source',
        detail: 'node_modules/local resolves from file:../x',
      },
      {
        id: 'lockfile-source:node_modules/zed',
        kind: 'lockfile-source',
        detail: 'node_modules/zed resolves from a local link',
      },
    ])
  })

  it('accepts a registry entry whose URL matches name and version, scoped or aliased', () => {
    expect(
      lockfileSourceItems({
        lockfileVersion: 3,
        packages: {
          'node_modules/is-number': {
            version: '7.0.0',
            resolved: 'https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz',
          },
          'node_modules/a/node_modules/@scope/pkg': {
            version: '1.2.3',
            resolved: 'https://registry.npmjs.org/@scope/pkg/-/pkg-1.2.3.tgz',
          },
          'node_modules/alias': {
            name: 'real',
            version: '2.0.0',
            resolved: 'https://registry.npmjs.org/real/-/real-2.0.0.tgz',
          },
        },
      }),
    ).toEqual([])
  })
  it('flags a registry URL that belongs to a different package or version, or has no version', () => {
    const items = lockfileSourceItems({
      lockfileVersion: 3,
      packages: {
        'node_modules/abbrev': {
          version: '3.0.1',
          resolved: 'https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz',
        },
        'node_modules/nover': { resolved: 'https://registry.npmjs.org/nover/-/nover-1.0.0.tgz' },
      },
    })
    expect(items.map((i) => i.id)).toEqual([
      'lockfile-source:node_modules/abbrev',
      'lockfile-source:node_modules/nover',
    ])
    expect(items[0]!.detail).toBe(
      'node_modules/abbrev resolves to https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz, expected https://registry.npmjs.org/abbrev/-/abbrev-3.0.1.tgz',
    )
  })
  it('flags lockfileVersion 1 or missing, and scans v1 dependencies recursively', () => {
    const items = lockfileSourceItems({
      lockfileVersion: 1,
      dependencies: {
        ok: { version: '1.0.0', resolved: 'https://registry.npmjs.org/ok/-/ok-1.0.0.tgz' },
        rimraf: { version: 'git+ssh://git@github.com/x/rimraf.git#abc' },
        outer: {
          version: '1.0.0',
          dependencies: {
            gh: { version: 'github:x/y#abc' },
            file: { version: '1.0.0', resolved: 'file:../x' },
            alias: { version: 'npm:other@1.0.0' },
            http: { version: '1.0.0', resolved: 'http://registry.npmjs.org/http/-/http-1.0.0.tgz' },
          },
        },
      },
    })
    expect(items.map((i) => i.id)).toEqual([
      'lockfile-source:dependencies/outer/alias',
      'lockfile-source:dependencies/outer/file',
      'lockfile-source:dependencies/outer/gh',
      'lockfile-source:dependencies/outer/http',
      'lockfile-source:dependencies/rimraf',
      'lockfile-source:lockfile-version',
    ])
    expect(items.at(-1)!.detail).toBe('lockfileVersion 1 (expected 2 or 3)')
    expect(lockfileSourceItems({ packages: {} }).map((i) => i.id)).toEqual(['lockfile-source:lockfile-version'])
  })
  it('never throws on malformed input', () => {
    expect(() =>
      lockfileSourceItems({
        lockfileVersion: 3,
        packages: { 'node_modules/x': null, 'node_modules/y': { resolved: 5 } },
        dependencies: { a: null, b: { version: 5, dependencies: 'x' } },
      } as never),
    ).not.toThrow()
    expect(() => lockfileSourceItems({ lockfileVersion: 3, packages: 'x' } as never)).not.toThrow()
  })
})
