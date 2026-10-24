import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const cli = fileURLToPath(new URL('../bin/release-plan.ts', import.meta.url))
const plan = (...args: string[]) =>
  JSON.parse(execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', stdio: 'pipe' }))

it('plans from --labels for a single PR', () => {
  expect(plan('--labels', 'release:minor', '--latest-tag', 'v1.0.0')).toEqual({ publish: true, version: '1.1.0' })
})

it('plans the maximum bump from --labels-json', () => {
  const sets = JSON.stringify([['release:patch'], ['bug', 'release:major'], []])
  expect(plan('--labels', 'release:patch', '--labels-json', sets, '--latest-tag', 'v1.2.3')).toEqual({
    publish: true,
    version: '2.0.0',
  })
})

it.each(['{not json', '{"a":1}', '[["x", 1]]', '["release:major"]'])('rejects malformed --labels-json %s', (raw) => {
  expect(() => plan('--labels-json', raw, '--latest-tag', 'v1.0.0')).toThrow(/labels-json|JSON/)
})
