import { describe, expect, it } from 'vitest'
import { nextVersion, planRelease, releaseFromLabels } from '../lib/version.ts'

describe('releaseFromLabels', () => {
  it('returns null without a release label', () => {
    expect(releaseFromLabels(['bug', 'needs-human'])).toBeNull()
  })
  it('reads the bump', () => {
    expect(releaseFromLabels(['x', 'release:minor'])).toBe('minor')
  })
  it('reads none', () => {
    expect(releaseFromLabels(['release:none'])).toBe('none')
  })
  it('tolerates the same label twice', () => {
    expect(releaseFromLabels(['release:patch', 'release:patch'])).toBe('patch')
  })
  it('throws on conflicting labels', () => {
    expect(() => releaseFromLabels(['release:minor', 'release:patch'])).toThrow(/Conflicting/)
  })
})

describe('nextVersion', () => {
  it('starts at 1.0.0 when there is no tag', () => {
    expect(nextVersion(null, 'patch')).toBe('1.0.0')
    expect(nextVersion(null, 'major')).toBe('1.0.0')
  })
  it.each([
    ['v1.2.3', 'major', '2.0.0'],
    ['v1.2.3', 'minor', '1.3.0'],
    ['v1.2.3', 'patch', '1.2.4'],
  ] as const)('%s + %s → %s', (tag, bump, expected) => {
    expect(nextVersion(tag, bump)).toBe(expected)
  })
  it('rejects malformed tags', () => {
    expect(() => nextVersion('1.2.3', 'patch')).toThrow(/Unrecognized tag/)
  })
})

describe('planRelease', () => {
  it('skips without a label', () => {
    expect(planRelease({ labels: [], latestTag: 'v1.0.0' })).toEqual({
      publish: false,
      reason: 'No release:* label on the merged PR',
    })
  })
  it('skips release:none', () => {
    expect(planRelease({ labels: ['release:none'], latestTag: 'v1.0.0' }).publish).toBe(false)
  })
  it('publishes the next version from a label', () => {
    expect(planRelease({ labels: ['release:minor'], latestTag: 'v1.0.0' })).toEqual({
      publish: true,
      version: '1.1.0',
    })
  })
  it('an explicit bump overrides labels', () => {
    expect(planRelease({ labels: ['release:none'], latestTag: null, bump: 'patch' })).toEqual({
      publish: true,
      version: '1.0.0',
    })
  })
  it('rejects an invalid explicit bump', () => {
    expect(() => planRelease({ labels: [], latestTag: null, bump: 'huge' })).toThrow(/Invalid bump/)
  })
})
