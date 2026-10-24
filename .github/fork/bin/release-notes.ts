import { existsSync, readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { findVerdictComment, renderReleaseNotes } from '../lib/release.ts'

const { values } = parseArgs({
  options: {
    version: { type: 'string', default: '' },
    'upstream-repository': { type: 'string', default: '' },
    'prev-upstream': { type: 'string', default: '' },
    'upstream-commit': { type: 'string', default: '' },
    comments: { type: 'string' },
    commits: { type: 'string' },
  },
})
const lines = (path: string | undefined): string[] =>
  path && existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean) : []

const bodies = lines(values.comments).map((l) => (JSON.parse(l) as { body?: string }).body ?? '')
process.stdout.write(
  renderReleaseNotes({
    version: values.version,
    upstreamRepository: values['upstream-repository'],
    prevUpstreamCommit: values['prev-upstream'] || null,
    upstreamCommit: values['upstream-commit'],
    verdictComment: findVerdictComment(bodies),
    commits: lines(values.commits),
  }),
)
