import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { decide, parseReview, renderComment } from '../lib/decide.ts'
import type { EvidenceItem } from '../lib/evidence.ts'
import type { GateResult } from '../lib/gates.ts'

const { values } = parseArgs({
  options: {
    gates: { type: 'string' },
    evidence: { type: 'string' },
    'review-env': { type: 'string', default: 'REVIEW' },
    model: { type: 'string', default: '' },
    'head-ref': { type: 'string', default: '' },
    out: { type: 'string', default: 'decision.json' },
    comment: { type: 'string', default: 'comment.md' },
  },
})

const readJson = <T>(path: string | undefined): T | null => {
  try {
    return path && existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : null
  } catch {
    return null
  }
}

const gates = readJson<GateResult>(values.gates)
const evidence = readJson<{ items: EvidenceItem[] }>(values.evidence)?.items ?? null
const review = parseReview(process.env[values['review-env']])
const decision = decide({ gates, evidence, review, headRef: values['head-ref'] })

writeFileSync(values.out, JSON.stringify(decision, null, 2) + '\n')
writeFileSync(values.comment, renderComment(decision, review, evidence, values.model) + '\n')
process.stdout.write(JSON.stringify(decision) + '\n')
