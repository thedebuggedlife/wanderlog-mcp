import { parseArgs } from 'node:util'
import { planRelease } from '../lib/version.ts'

const { values } = parseArgs({
  options: {
    labels: { type: 'string', default: '' },
    'latest-tag': { type: 'string', default: '' },
    bump: { type: 'string', default: '' },
  },
})

const plan = planRelease({
  labels: values.labels.split(',').filter(Boolean),
  latestTag: values['latest-tag'] || null,
  bump: values.bump || undefined,
})
process.stdout.write(JSON.stringify(plan) + '\n')
