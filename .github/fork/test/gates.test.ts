import { describe, expect, it } from 'vitest'
import { MAX_SRC_DELTA_LINES, evaluateGates, srcDeltaLines } from '../lib/gates.ts'

const ok = { buildOk: true, testsOk: true, conflictFiles: [] as string[] }

describe('srcDeltaLines', () => {
  it('sums added + deleted lines under src/ only', () => {
    const numstat = ['10\t2\tsrc/a.ts', '5\t5\tREADME.md', '-\t-\tsrc/logo.png', '3\t0\tsrc/b/c.ts'].join('\n')
    expect(srcDeltaLines(numstat)).toBe(15)
  })
  it('handles an empty numstat', () => {
    expect(srcDeltaLines('')).toBe(0)
  })
})

describe('evaluateGates', () => {
  it('passes a small, building, conflict-free change', () => {
    const r = evaluateGates({ ...ok, numstat: '1\t1\tsrc/a.ts' })
    expect(r).toEqual({ passed: true, conflict: false, emptyDiff: false, srcDeltaLines: 2, reasons: [] })
  })
  it('fails on build failure', () => {
    const r = evaluateGates({ ...ok, buildOk: false, numstat: '1\t1\tsrc/a.ts' })
    expect(r.passed).toBe(false)
    expect(r.reasons).toContain('Install, typecheck or build failed')
  })
  it('fails on test failure', () => {
    expect(evaluateGates({ ...ok, testsOk: false, numstat: '' }).reasons).toContain('Upstream unit tests failed')
  })
  it('fails over the size cap', () => {
    const r = evaluateGates({ ...ok, numstat: `${MAX_SRC_DELTA_LINES}\t1\tsrc/a.ts` })
    expect(r.passed).toBe(false)
    expect(r.reasons[0]).toMatch(/1501 lines \(cap 1500\)/)
  })
  it('flags conflicts', () => {
    const r = evaluateGates({ ...ok, conflictFiles: ['src/a.ts'], numstat: '1\t0\tsrc/a.ts' })
    expect(r.conflict).toBe(true)
    expect(r.reasons[0]).toBe('Merge conflict markers in: src/a.ts')
  })
  it('marks an empty diff', () => {
    expect(evaluateGates({ ...ok, numstat: '' }).emptyDiff).toBe(true)
  })
})
