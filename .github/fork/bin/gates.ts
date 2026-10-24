import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { evaluateGates } from '../lib/gates.ts'
import { setOutput } from '../lib/gh-output.ts'

const { values } = parseArgs({
  options: {
    numstat: { type: 'string' },
    conflicts: { type: 'string' },
    'build-ok': { type: 'string' },
    'tests-ok': { type: 'string' },
    out: { type: 'string' },
  },
})

const read = (path: string | undefined): string => (path ? readFileSync(path, 'utf8') : '')

const result = evaluateGates({
  numstat: read(values.numstat),
  conflictFiles: read(values.conflicts).split('\n').filter(Boolean),
  buildOk: values['build-ok'] === 'true',
  testsOk: values['tests-ok'] === 'true',
})

writeFileSync(values.out ?? 'gates.json', JSON.stringify(result, null, 2) + '\n')
setOutput('passed', String(result.passed))
setOutput('conflict', String(result.conflict))
process.stdout.write(JSON.stringify(result) + '\n')
