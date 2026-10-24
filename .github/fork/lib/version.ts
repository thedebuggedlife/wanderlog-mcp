export type Bump = 'major' | 'minor' | 'patch'
export type ReleaseLabel = Bump | 'none'

const LABEL_RE = /^release:(major|minor|patch|none)$/
const BUMPS: readonly string[] = ['major', 'minor', 'patch']

export function releaseFromLabels(labels: string[]): ReleaseLabel | null {
  const found = labels.map((l) => LABEL_RE.exec(l)?.[1]).filter((v): v is string => v !== undefined)
  if (found.length === 0) return null
  const distinct = [...new Set(found)]
  if (distinct.length > 1) throw new Error(`Conflicting release labels: ${distinct.join(', ')}`)
  return distinct[0] as ReleaseLabel
}

export function nextVersion(latestTag: string | null, bump: Bump): string {
  if (latestTag === null) return '1.0.0'
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(latestTag)
  if (!m) throw new Error(`Unrecognized tag: ${latestTag}`)
  const major = Number(m[1])
  const minor = Number(m[2])
  const patch = Number(m[3])
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

export function planRelease(i: { labels: string[]; latestTag: string | null; bump?: string }): {
  publish: boolean
  version?: string
  reason?: string
} {
  let release: ReleaseLabel | null
  if (i.bump) {
    if (!BUMPS.includes(i.bump)) throw new Error(`Invalid bump: ${i.bump}`)
    release = i.bump as Bump
  } else {
    release = releaseFromLabels(i.labels)
  }
  if (release === null) return { publish: false, reason: 'No release:* label on the merged PR' }
  if (release === 'none') return { publish: false, reason: 'release:none' }
  return { publish: true, version: nextVersion(i.latestTag, release) }
}
