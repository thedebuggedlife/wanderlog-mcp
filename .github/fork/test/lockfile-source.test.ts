import { describe, expect, it } from 'vitest'
import { lockfileSourceItems } from '../lib/evidence.ts'

describe('lockfileSourceItems', () => {
  it('ignores registry sources, the root entry, bundled entries and a missing lockfile', () => {
    expect(
      lockfileSourceItems({
        packages: {
          '': { resolved: 'git+ssh://example.com/root.git' },
          'node_modules/a': { resolved: 'https://registry.npmjs.org/a/-/a-1.0.0.tgz' },
          'node_modules/bundled': {},
        },
      }),
    ).toEqual([])
    expect(lockfileSourceItems(null)).toEqual([])
    expect(lockfileSourceItems({})).toEqual([])
  })
  it('flags git, file and registry-lookalike sources and links, sorted by id', () => {
    const items = lockfileSourceItems({
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
})
