import type { EvidenceItem } from './evidence.ts'
import type { GateResult } from './gates.ts'
import type { Bump } from './version.ts'

export interface Disposition {
  item: string
  disposition: string
}

export interface Review {
  verdict: 'safe' | 'needs-human'
  bump: Bump
  evidenceDispositions: Disposition[]
  concerns: string[]
  summary: string
}

export interface Decision {
  automerge: boolean
  gatesPassed: boolean
  dryRun: boolean
  releaseLabel: string | null
  reasons: string[]
}

const BUMPS: readonly string[] = ['major', 'minor', 'patch']

export function parseReview(raw: string | undefined): Review | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const r = value as Record<string, unknown>
  if (r.verdict !== 'safe' && r.verdict !== 'needs-human') return null
  if (typeof r.bump !== 'string' || !BUMPS.includes(r.bump)) return null
  if (typeof r.summary !== 'string') return null
  if (!Array.isArray(r.concerns) || !r.concerns.every((c) => typeof c === 'string')) return null
  const dispositionsOk =
    Array.isArray(r.evidenceDispositions) &&
    r.evidenceDispositions.every(
      (d) =>
        typeof d === 'object' &&
        d !== null &&
        typeof (d as Disposition).item === 'string' &&
        typeof (d as Disposition).disposition === 'string',
    )
  if (!dispositionsOk) return null
  return r as unknown as Review
}

export function decide(i: {
  gates: GateResult | null
  evidence: EvidenceItem[] | null
  review: Review | null
  headRef: string
}): Decision {
  const reasons: string[] = []
  if (i.gates === null) {
    reasons.push('Gate results missing (analyze job failed)')
  } else {
    reasons.push(...i.gates.reasons)
    if ((!i.gates.passed || i.gates.conflict) && i.gates.reasons.length === 0) reasons.push('Gate checks failed')
  }
  if (i.evidence === null) reasons.push('Evidence report missing')
  if (i.review === null) {
    reasons.push('Claude review missing or invalid')
  } else {
    if (i.review.verdict !== 'safe') reasons.push('Claude review verdict: needs-human')
    if (i.review.concerns.length > 0) reasons.push('Reviewer listed concerns')
    const addressed = new Set(
      i.review.evidenceDispositions.filter((d) => d.disposition.trim() !== '').map((d) => d.item),
    )
    const missing = (i.evidence ?? []).map((e) => e.id).filter((id) => !addressed.has(id))
    if (missing.length > 0) reasons.push(`Evidence items without a disposition: ${missing.join(', ')}`)
  }
  let releaseLabel: string | null = i.review ? `release:${i.review.bump}` : null
  if (i.gates?.emptyDiff) releaseLabel = 'release:none'
  return {
    automerge: reasons.length === 0 && i.gates?.passed === true && i.gates?.conflict !== true,
    gatesPassed: i.gates?.passed === true,
    dryRun: i.headRef === 'sync/dry-run',
    releaseLabel,
    reasons,
  }
}

const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\u2060\uFEFF]/g
const TOKEN_RE = /(?:sk-ant-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g

export function redact(text: string): string {
  return text.replace(ZERO_WIDTH_RE, '').replace(TOKEN_RE, '[REDACTED]')
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

export function parseGates(value: unknown): GateResult | null {
  if (!isObject(value)) return null
  const { passed, conflict, emptyDiff, srcDeltaLines, reasons } = value
  if (typeof passed !== 'boolean' || typeof conflict !== 'boolean' || typeof emptyDiff !== 'boolean') return null
  if (typeof srcDeltaLines !== 'number') return null
  if (!Array.isArray(reasons) || !reasons.every((r) => typeof r === 'string')) return null
  return { passed, conflict, emptyDiff, srcDeltaLines, reasons }
}

export function parseEvidence(value: unknown): EvidenceItem[] | null {
  if (!isObject(value) || !Array.isArray(value.items)) return null
  const ok = value.items.every(
    (e) => isObject(e) && typeof e.id === 'string' && typeof e.kind === 'string' && typeof e.detail === 'string',
  )
  return ok ? (value.items as EvidenceItem[]) : null
}

export const VERDICT_MARKER = '<!-- fork-verdict -->'
const MAX_COMMENT = 60_000

const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

export function renderComment(
  d: Decision,
  review: Review | null,
  evidence: EvidenceItem[] | null,
  model: string,
): string {
  const dispositions = new Map((review?.evidenceDispositions ?? []).map((x) => [x.item, x.disposition]))
  const lines = [
    VERDICT_MARKER,
    d.automerge
      ? d.dryRun
        ? '## Fork review: safe — dry run, not merged'
        : '## Fork review: safe — auto-merge enabled'
      : '## Fork review: needs a human',
    '',
    `Reviewer model: \`${model || 'unknown'}\`${d.dryRun ? ' · **dry run** (never auto-merged)' : ''}`,
    `Release label: \`${d.releaseLabel ?? 'none — add a release:* label before merging'}\``,
  ]
  if (review) lines.push('', '### Summary', '', review.summary)
  if (d.reasons.length > 0) lines.push('', '### Why a human is needed', '', ...d.reasons.map((r) => `- ${r}`))
  if (review && review.concerns.length > 0) lines.push('', '### Concerns', '', ...review.concerns.map((c) => `- ${c}`))
  if (evidence && evidence.length > 0) {
    lines.push('', '### Evidence', '', '| Item | Detail | Disposition |', '|---|---|---|')
    for (const e of evidence)
      lines.push(`| ${cell(e.id)} | ${cell(e.detail)} | ${cell(dispositions.get(e.id) ?? '—')} |`)
  }
  const body = redact(lines.join('\n')).replace(/@(?=[A-Za-z0-9-])/g, '@\u200B')
  return body.length > MAX_COMMENT ? body.slice(0, MAX_COMMENT) + '\n\n…(truncated)' : body
}
