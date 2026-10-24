import { VERDICT_MARKER } from './decide.ts'

export function stampPackage(
  pkg: Record<string, unknown>,
  s: { version: string; upstreamRepository: string; upstreamCommit: string },
): Record<string, unknown> {
  return { ...pkg, version: s.version, upstream: { repository: s.upstreamRepository, commit: s.upstreamCommit } }
}

export function parseUpstreamCommit(tagMessage: string): string | null {
  return /^upstream-commit: ([0-9a-f]{40})$/m.exec(tagMessage)?.[1] ?? null
}

export function findVerdictComment(bodies: string[]): string | null {
  return bodies.filter((b) => b.includes(VERDICT_MARKER)).at(-1) ?? null
}

export function renderReleaseNotes(n: {
  version: string
  upstreamRepository: string
  prevUpstreamCommit: string | null
  upstreamCommit: string
  verdictComment: string | null
  commits: string[]
}): string {
  const gh = `https://github.com/${n.upstreamRepository}`
  const upstream = n.prevUpstreamCommit
    ? `Upstream changes: [${n.prevUpstreamCommit.slice(0, 12)}...${n.upstreamCommit.slice(0, 12)}](${gh}/compare/${n.prevUpstreamCommit}...${n.upstreamCommit})`
    : `Built from upstream [${n.upstreamRepository}@${n.upstreamCommit.slice(0, 12)}](${gh}/commit/${n.upstreamCommit})`
  const review = n.verdictComment
    ? n.verdictComment.replace(VERDICT_MARKER, '').replace(/^## /m, '### ').trim()
    : '_No automated review for this release (manual or patch release)._'
  return [
    `## @thedebuggedlife/wanderlog-mcp ${n.version}`,
    '',
    upstream,
    '',
    '### Commits',
    '',
    ...(n.commits.length > 0 ? n.commits.map((c) => `- ${c}`) : ['- (none)']),
    '',
    '### Review',
    '',
    review,
    '',
  ].join('\n')
}
