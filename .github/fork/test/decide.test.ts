import { describe, expect, it } from 'vitest'
import { VERDICT_MARKER, decide, parseReview, redact, renderComment } from '../lib/decide.ts'
import type { Review } from '../lib/decide.ts'
import type { GateResult } from '../lib/gates.ts'

const gatesOk: GateResult = { passed: true, conflict: false, emptyDiff: false, srcDeltaLines: 10, reasons: [] }
const evidence = [{ id: 'dependency:zod', kind: 'dependency' as const, detail: 'zod 3 → 4' }]
const review: Review = {
  verdict: 'safe',
  bump: 'minor',
  evidenceDispositions: [{ item: 'dependency:zod', disposition: 'Expected: upstream migrated schemas.' }],
  concerns: [],
  summary: 'Adds a transit tool.',
}

describe('parseReview', () => {
  it('accepts a well-formed review', () => {
    expect(parseReview(JSON.stringify(review))).toEqual(review)
  })
  it.each([
    undefined,
    '',
    'not json',
    '{}',
    JSON.stringify({ ...review, verdict: 'yes' }),
    JSON.stringify({ ...review, bump: 'huge' }),
    JSON.stringify({ ...review, evidenceDispositions: [{ item: 1 }] }),
  ])('rejects %s', (raw) => {
    expect(parseReview(raw)).toBeNull()
  })
})

describe('decide', () => {
  const base = { gates: gatesOk, evidence, review, headRef: 'sync/upstream' }
  it('auto-merges when gates pass, review is safe and all evidence is addressed', () => {
    expect(decide(base)).toEqual({
      automerge: true,
      gatesPassed: true,
      dryRun: false,
      releaseLabel: 'release:minor',
      reasons: [],
    })
  })
  it('fails closed without a review', () => {
    const d = decide({ ...base, review: null })
    expect(d.automerge).toBe(false)
    expect(d.releaseLabel).toBeNull()
    expect(d.reasons).toContain('Claude review missing or invalid')
  })
  it('fails closed without gate results or evidence', () => {
    const d = decide({ ...base, gates: null, evidence: null })
    expect(d.automerge).toBe(false)
    expect(d.reasons).toEqual(['Gate results missing (analyze job failed)', 'Evidence report missing'])
  })
  it('fails closed when every input is missing', () => {
    const d = decide({ gates: null, evidence: null, review: null, headRef: 'sync/upstream' })
    expect(d.automerge).toBe(false)
    expect(d.reasons).toContain('Claude review missing or invalid')
  })
  it('needs a human when the reviewer says so', () => {
    expect(decide({ ...base, review: { ...review, verdict: 'needs-human' } }).automerge).toBe(false)
  })
  it('needs a human when an evidence item has no (or a blank) disposition', () => {
    const d = decide({
      ...base,
      review: { ...review, evidenceDispositions: [{ item: 'dependency:zod', disposition: '  ' }] },
    })
    expect(d.reasons).toContain('Evidence items without a disposition: dependency:zod')
  })
  it('passes gate failures through as reasons', () => {
    const d = decide({ ...base, gates: { ...gatesOk, passed: false, reasons: ['Upstream unit tests failed'] } })
    expect(d).toMatchObject({ automerge: false, gatesPassed: false, reasons: ['Upstream unit tests failed'] })
  })
  it('flags dry runs', () => {
    expect(decide({ ...base, headRef: 'sync/dry-run' }).dryRun).toBe(true)
  })
  it('does not release an empty diff', () => {
    expect(decide({ ...base, gates: { ...gatesOk, emptyDiff: true } }).releaseLabel).toBe('release:none')
  })
})

describe('redact', () => {
  it('redacts token-shaped strings', () => {
    const text =
      'a sk-ant-oat01-ABCDEFGHijkl_mn b ghp_abcdefghijklmnopqrstuvwxyz0123 c github_pat_11ABCDEFGHIJKLMNOPQRSTU d'
    expect(redact(text)).toBe('a [REDACTED] b [REDACTED] c [REDACTED] d')
  })
})

describe('renderComment', () => {
  it('starts with the marker, shows the model, and never contains tokens or live mentions', () => {
    const evil = { ...review, summary: 'ok sk-ant-oat01-SECRETSECRET123 cc @someone' }
    const body = renderComment(
      decide({ gates: gatesOk, evidence, review: evil, headRef: 'sync/upstream' }),
      evil,
      evidence,
      'claude-opus-5-5',
    )
    expect(body.startsWith(VERDICT_MARKER)).toBe(true)
    expect(body).toContain('claude-opus-5-5')
    expect(body).not.toContain('SECRETSECRET')
    expect(body).not.toMatch(/@someone/)
    expect(body).toContain('| dependency:zod | zod 3 → 4 | Expected: upstream migrated schemas. |')
  })
})
