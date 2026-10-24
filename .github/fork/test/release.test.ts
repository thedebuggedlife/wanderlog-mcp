import { describe, expect, it } from 'vitest'
import { VERDICT_MARKER } from '../lib/decide.ts'
import {
  findVerdictComment,
  forkReleaseTags,
  parseUpstreamCommit,
  renderReleaseNotes,
  stampPackage,
} from '../lib/release.ts'

const sha = (c: string) => c.repeat(40)

describe('stampPackage', () => {
  it('sets version and upstream without touching other fields', () => {
    expect(
      stampPackage(
        { name: 'x', version: '0.3.2', bin: {} },
        { version: '1.1.0', upstreamRepository: 'o/r', upstreamCommit: sha('a') },
      ),
    ).toEqual({
      name: 'x',
      version: '1.1.0',
      bin: {},
      upstream: { repository: 'o/r', commit: sha('a') },
    })
  })
})

describe('parseUpstreamCommit', () => {
  it('reads the upstream commit from a tag message', () => {
    expect(parseUpstreamCommit(`upstream-commit: ${sha('b')}\n`)).toBe(sha('b'))
  })
  it('returns null otherwise', () => {
    expect(parseUpstreamCommit('lightweight')).toBeNull()
  })
})

describe('findVerdictComment', () => {
  it('returns the last verdict comment', () => {
    expect(findVerdictComment(['hi', `${VERDICT_MARKER}\nold`, `${VERDICT_MARKER}\nnew`, 'bye'])).toBe(
      `${VERDICT_MARKER}\nnew`,
    )
  })
  it('returns null when there is none', () => {
    expect(findVerdictComment(['hi'])).toBeNull()
  })
})

describe('renderReleaseNotes', () => {
  const input = {
    version: '1.1.0',
    upstreamRepository: 'shaikhspeare/wanderlog-mcp',
    prevUpstreamCommit: sha('a'),
    upstreamCommit: sha('b'),
    verdictComment: `${VERDICT_MARKER}\n## Fork review: safe — auto-merge enabled\n\nReviewer model: \`claude-opus-5-5\``,
    commits: ['chore(sync): merge upstream bbbbbbbbbbbb'],
  }
  it('links the upstream compare range and embeds the review', () => {
    const notes = renderReleaseNotes(input)
    expect(notes).toContain(`https://github.com/shaikhspeare/wanderlog-mcp/compare/${sha('a')}...${sha('b')}`)
    expect(notes).toContain('- chore(sync): merge upstream bbbbbbbbbbbb')
    expect(notes).toContain('Reviewer model: `claude-opus-5-5`')
    expect(notes).not.toContain(VERDICT_MARKER)
  })
  it('handles a first release and a manual release', () => {
    const notes = renderReleaseNotes({ ...input, prevUpstreamCommit: null, verdictComment: null })
    expect(notes).toContain(`https://github.com/shaikhspeare/wanderlog-mcp/commit/${sha('b')}`)
    expect(notes).toContain('No automated review for this release')
  })
})

describe('forkReleaseTags', () => {
  const sha = 'a'.repeat(40)
  it('keeps only annotated fork release tags, in input order', () => {
    const lines = [
      `v1.2.0\ttag\tupstream-commit: ${sha}`,
      `v0.3.1\tcommit\tfix: something`,
      `v0.3.0\ttag\tRelease 0.3.0`,
      `v1.1.0\ttag\tupstream-commit: ${sha}`,
      `v1.0.0\tcommit\tupstream-commit: ${sha}`,
      `v1.0.0-rc.1\ttag\tupstream-commit: ${sha}`,
      `v1.0.1\ttag\tupstream-commit: ${sha.slice(1)}`,
    ].join('\n')
    expect(forkReleaseTags(lines)).toEqual(['v1.2.0', 'v1.1.0'])
  })

  it('returns [] for empty input', () => {
    expect(forkReleaseTags('')).toEqual([])
    expect(forkReleaseTags('\n')).toEqual([])
  })
})
