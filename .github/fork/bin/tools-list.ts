import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { diffTools } from '../lib/tools.ts'
import type { ToolInfo, ToolsDiff } from '../lib/tools.ts'
import { PLACEHOLDER_ENV, listTools } from '../lib/tools-list.ts'

const { values } = parseArgs({
  options: {
    base: { type: 'string' },
    head: { type: 'string' },
    out: { type: 'string' },
  },
})

const errors: string[] = []
async function list(side: string, root: string): Promise<ToolInfo[] | null> {
  try {
    return await listTools(join(root, 'dist', 'index.js'), PLACEHOLDER_ENV)
  } catch (err) {
    errors.push(`Could not list ${side} tools: ${(err instanceof Error ? err.message : String(err)).slice(0, 500)}`)
    return null
  }
}

const [base, head] = await Promise.all([list('base', values.base ?? 'base'), list('head', values.head ?? 'head')])
const toolsDiff: ToolsDiff | null = base && head ? diffTools(base, head) : null
const names = (t: ToolInfo[] | null): string[] | null => (t ? t.map((x) => x.name) : null)

writeFileSync(
  values.out ?? 'tools.json',
  JSON.stringify({ base: names(base), head: names(head), toolsDiff, errors }, null, 2) + '\n',
)
process.stdout.write(`tools/list: base ${base ? 'ok' : 'failed'}, head ${head ? 'ok' : 'failed'}\n`)
