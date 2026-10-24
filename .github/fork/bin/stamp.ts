import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { stampPackage } from '../lib/release.ts'

const { values } = parseArgs({
  options: {
    file: { type: 'string', default: 'package.json' },
    version: { type: 'string' },
    'upstream-repository': { type: 'string' },
    'upstream-commit': { type: 'string' },
  },
})
if (!values.version || !values['upstream-repository'] || !values['upstream-commit']) {
  throw new Error('stamp.ts needs --version, --upstream-repository and --upstream-commit')
}
const pkg = JSON.parse(readFileSync(values.file, 'utf8')) as Record<string, unknown>
const stamped = stampPackage(pkg, {
  version: values.version,
  upstreamRepository: values['upstream-repository'],
  upstreamCommit: values['upstream-commit'],
})
writeFileSync(values.file, JSON.stringify(stamped, null, 2) + '\n')
