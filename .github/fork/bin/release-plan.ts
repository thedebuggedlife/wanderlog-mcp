import { parseArgs } from 'node:util'
import { planRelease } from '../lib/version.ts'

const { values } = parseArgs({
  options: {
    labels: { type: 'string', default: '' },
    'labels-json': { type: 'string' },
    'latest-tag': { type: 'string', default: '' },
    bump: { type: 'string', default: '' },
  },
})

function parseLabelSets(raw: string | undefined): string[][] | undefined {
  if (raw === undefined) return undefined
  const value: unknown = JSON.parse(raw)
  const ok = Array.isArray(value) && value.every((s) => Array.isArray(s) && s.every((l) => typeof l === 'string'))
  if (!ok) throw new Error('--labels-json must be a JSON array of string arrays')
  return value as string[][]
}

const plan = planRelease({
  labels: values.labels.split(',').filter(Boolean),
  labelSets: parseLabelSets(values['labels-json']),
  latestTag: values['latest-tag'] || null,
  bump: values.bump || undefined,
})
process.stdout.write(JSON.stringify(plan) + '\n')
