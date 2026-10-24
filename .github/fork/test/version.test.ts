import { describe, expect, it } from 'vitest'
import { maxRelease, nextVersion, planRelease, releaseFromLabels } from '../lib/version.ts'

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

describe('maxRelease', () => {
  it('returns null when no PR has a release label', () => {
    expect(maxRelease([])).toBeNull()
    expect(maxRelease([['bug'], []])).toBeNull()
  })
  it('takes the largest bump across PRs (one major + one patch → major)', () => {
    expect(maxRelease([['release:patch'], ['release:major']])).toBe('major')
  })
  it.each([
    [[['release:none'], ['release:patch']], 'patch'],
    [[['release:minor'], ['release:patch'], ['release:none']], 'minor'],
    [[['release:none'], ['bug']], 'none'],
  ] as const)('%j → %s', (sets, expected) => {
    expect(maxRelease(sets.map((l) => [...l]))).toBe(expected)
  })
  it('still throws on conflicting labels within one PR', () => {
    expect(() => maxRelease([['release:patch'], ['release:minor', 'release:major']])).toThrow(/Conflicting/)
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
  it('uses the maximum over labelSets when given, ignoring labels', () => {
    expect(
      planRelease({ labels: ['release:none'], labelSets: [['release:patch'], ['release:major']], latestTag: 'v1.2.3' }),
    ).toEqual({ publish: true, version: '2.0.0' })
  })
  it('skips when no PR in labelSets has a release label', () => {
    expect(planRelease({ labels: ['release:minor'], labelSets: [[], ['bug']], latestTag: 'v1.2.3' })).toEqual({
      publish: false,
      reason: 'No release:* label on any PR merged since the last release',
    })
  })
  it('an explicit bump overrides labelSets', () => {
    expect(planRelease({ labels: [], labelSets: [['release:major']], latestTag: 'v1.2.3', bump: 'patch' })).toEqual({
      publish: true,
      version: '1.2.4',
    })
  })
})
