import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseArgs } from 'node:util'
import {
  auditItems,
  dependencyItems,
  hostItems,
  packageItems,
  riskyApiItems,
  sensitiveFileItems,
  toolItems,
} from '../lib/evidence.ts'
import type { AuditReport, EvidenceItem, NpmLsNode, PackageJson, SourceFile } from '../lib/evidence.ts'
import { diffTools } from '../lib/tools.ts'
import type { ToolInfo, ToolsDiff } from '../lib/tools.ts'
import { PLACEHOLDER_ENV, listTools } from '../lib/tools-list.ts'

const { values } = parseArgs({
  options: {
    base: { type: 'string' },
    head: { type: 'string' },
    diff: { type: 'string' },
    changed: { type: 'string' },
    'base-ls': { type: 'string' },
    'head-ls': { type: 'string' },
    audit: { type: 'string' },
    'sig-status': { type: 'string' },
    'sig-log': { type: 'string' },
    out: { type: 'string' },
  },
})

const readText = (path: string | undefined): string => (path && existsSync(path) ? readFileSync(path, 'utf8') : '')
const readJson = <T>(path: string | undefined): T | null => {
  try {
    return JSON.parse(readText(path)) as T
  } catch {
    return null
  }
}

const SOURCE_EXT = /\.(?:ts|js|mjs|cjs|json)$/
function sourceFiles(root: string): SourceFile[] {
  const srcDir = join(root, 'src')
  if (!existsSync(srcDir)) return []
  return readdirSync(srcDir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && SOURCE_EXT.test(e.name))
    .map((e) => {
      const full = join(e.parentPath, e.name)
      return { path: relative(root, full), content: readFileSync(full, 'utf8') }
    })
}

async function tools(root: string): Promise<ToolInfo[] | Error> {
  try {
    return await listTools(join(root, 'dist', 'index.js'), PLACEHOLDER_ENV)
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err))
  }
}

const base = values.base ?? 'base'
const head = values.head ?? 'head'
const [baseTools, headTools] = await Promise.all([tools(base), tools(head)])

const items: EvidenceItem[] = [
  ...dependencyItems(readJson<NpmLsNode>(values['base-ls']) ?? {}, readJson<NpmLsNode>(values['head-ls']) ?? {}),
  ...packageItems(
    readJson<PackageJson>(join(base, 'package.json')) ?? {},
    readJson<PackageJson>(join(head, 'package.json')) ?? {},
  ),
  ...auditItems(readJson<AuditReport>(values.audit), {
    ok: readText(values['sig-status']).trim() === 'ok',
    log: readText(values['sig-log']),
  }),
  ...hostItems(sourceFiles(base), sourceFiles(head)),
  ...riskyApiItems(readText(values.diff)),
  ...sensitiveFileItems(readText(values.changed).split('\n').filter(Boolean)),
]

let toolsDiff: ToolsDiff | null = null
for (const [side, result] of [
  ['base', baseTools],
  ['head', headTools],
] as const) {
  if (result instanceof Error) {
    items.push({
      id: `tools-list:${side}`,
      kind: 'tools-list',
      detail: `Could not list ${side} tools: ${result.message.slice(0, 500)}`,
    })
  }
}
if (!(baseTools instanceof Error) && !(headTools instanceof Error)) {
  toolsDiff = diffTools(baseTools, headTools)
  items.push(...toolItems(toolsDiff))
}

const names = (t: ToolInfo[] | Error): string[] => (t instanceof Error ? [] : t.map((x) => x.name))
const report = { items, toolsDiff, tools: { base: names(baseTools), head: names(headTools) } }
writeFileSync(values.out ?? 'evidence.json', JSON.stringify(report, null, 2) + '\n')
process.stdout.write(`${items.length} evidence item(s)\n`)
