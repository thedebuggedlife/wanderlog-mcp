import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseReview } from '../lib/decide.ts'

const schemaRaw = readFileSync(new URL('../review-schema.json', import.meta.url), 'utf8')
const schema = JSON.parse(schemaRaw)
const prompt = readFileSync(new URL('../review-prompt.md', import.meta.url), 'utf8')

describe('review contract', () => {
  it('requires exactly the fields parseReview validates', () => {
    expect([...schema.required].sort()).toEqual(['bump', 'concerns', 'evidenceDispositions', 'summary', 'verdict'])
  })
  it('accepts a schema-shaped example', () => {
    const example = {
      verdict: 'needs-human',
      bump: 'patch',
      evidenceDispositions: [{ item: 'host:x', disposition: 'unexplained' }],
      concerns: ['x'],
      summary: 's',
    }
    expect(parseReview(JSON.stringify(example))).toEqual(example)
  })
  it('contains no single quotes, so it can be passed inside claude_args', () => {
    expect(schemaRaw).not.toContain("'")
  })
  it('requires a non-empty disposition', () => {
    expect(schema.properties.evidenceDispositions.items.properties.disposition.minLength).toBe(1)
  })
  it('keeps the security-critical prompt wording', () => {
    for (const phrase of [
      'untrusted data',
      'When in doubt, `needs-human`',
      'one entry for every `id`',
      'A non-empty `concerns` list',
    ]) {
      expect(prompt).toContain(phrase)
    }
  })
  it('the prompt points at the paths review.yml provides', () => {
    for (const path of ['pr-head/', 'analysis/diff.patch', 'analysis/evidence.json', 'exec/tools.json']) {
      expect(prompt).toContain(path)
    }
  })
})
