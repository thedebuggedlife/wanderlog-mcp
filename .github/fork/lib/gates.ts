export const MAX_SRC_DELTA_LINES = 1500

export interface GateResult {
  passed: boolean
  conflict: boolean
  emptyDiff: boolean
  srcDeltaLines: number
  reasons: string[]
}

export function srcDeltaLines(numstat: string): number {
  let total = 0
  for (const record of numstat.split(numstat.includes('\0') ? '\0' : '\n')) {
    const [added, deleted] = record.split('\t', 2)
    const path = record.split('\t').slice(2).join('\t')
    if (!path.startsWith('src/')) continue
    if (added === '-' || deleted === '-') continue
    total += Number(added) + Number(deleted)
  }
  return total
}

export function evaluateGates(i: {
  buildOk: boolean
  testsOk: boolean
  numstat: string
  conflictFiles: string[]
}): GateResult {
  const reasons: string[] = []
  const conflict = i.conflictFiles.length > 0
  if (conflict) reasons.push(`Merge conflict markers in: ${i.conflictFiles.join(', ')}`)
  if (!i.buildOk) reasons.push('Install, typecheck or build failed')
  if (!i.testsOk) reasons.push('Upstream unit tests failed')
  const lines = srcDeltaLines(i.numstat)
  if (lines > MAX_SRC_DELTA_LINES) {
    reasons.push(`src/ delta is ${lines} lines (cap ${MAX_SRC_DELTA_LINES})`)
  }
  return {
    passed: reasons.length === 0,
    conflict,
    emptyDiff: i.numstat.trim() === '',
    srcDeltaLines: lines,
    reasons,
  }
}
