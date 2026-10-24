import type { ToolsDiff } from './tools.ts'

export type EvidenceKind =
  | 'dependency'
  | 'audit'
  | 'lifecycle'
  | 'bin'
  | 'package'
  | 'host'
  | 'risky-api'
  | 'sensitive-file'
  | 'tool'
  | 'tools-list'
  | 'lockfile-source'

export interface EvidenceItem {
  id: string
  kind: EvidenceKind
  detail: string
}

export interface NpmLsNode {
  version?: string
  dependencies?: Record<string, NpmLsNode>
}

export interface PackageJson {
  scripts?: Record<string, string>
  bin?: string | Record<string, string>
  packageManager?: unknown
  devEngines?: unknown
}

export interface AuditReport {
  vulnerabilities?: Record<string, { severity?: string }>
}

export const LIFECYCLE_SCRIPTS = [
  'preinstall',
  'install',
  'postinstall',
  'prepare',
  'prepublish',
  'prepublishOnly',
  'prepack',
  'postpack',
  'publish',
  'postpublish',
]

export const byId = (a: EvidenceItem, b: EvidenceItem): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export function flattenNpmLs(root: NpmLsNode): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const walk = (deps: Record<string, NpmLsNode> | undefined): void => {
    for (const [name, node] of Object.entries(deps ?? {})) {
      if (node.version) {
        const versions = out.get(name) ?? new Set<string>()
        versions.add(node.version)
        out.set(name, versions)
      }
      walk(node.dependencies)
    }
  }
  walk(root.dependencies)
  return out
}

const fmt = (versions: Set<string>): string => [...versions].sort().join(', ')

export function dependencyItems(base: NpmLsNode, head: NpmLsNode): EvidenceItem[] {
  const before = flattenNpmLs(base)
  const after = flattenNpmLs(head)
  const items: EvidenceItem[] = []
  for (const [name, versions] of after) {
    const prev = before.get(name)
    if (!prev) {
      items.push({
        id: `dependency:${name}`,
        kind: 'dependency',
        detail: `New runtime package ${name}@${fmt(versions)}`,
      })
    } else if (fmt(prev) !== fmt(versions)) {
      items.push({ id: `dependency:${name}`, kind: 'dependency', detail: `${name} ${fmt(prev)} → ${fmt(versions)}` })
    }
  }
  for (const [name, versions] of before) {
    if (!after.has(name)) {
      items.push({
        id: `dependency:${name}`,
        kind: 'dependency',
        detail: `Removed runtime package ${name}@${fmt(versions)}`,
      })
    }
  }
  return items.sort(byId)
}

export function packageItems(base: PackageJson, head: PackageJson): EvidenceItem[] {
  const items: EvidenceItem[] = []
  for (const script of LIFECYCLE_SCRIPTS) {
    const before = base.scripts?.[script] ?? null
    const after = head.scripts?.[script] ?? null
    if (before !== after) {
      items.push({
        id: `lifecycle:${script}`,
        kind: 'lifecycle',
        detail: `${script}: ${JSON.stringify(before)} → ${JSON.stringify(after)}`,
      })
    }
  }
  const binBefore = JSON.stringify(base.bin ?? null)
  const binAfter = JSON.stringify(head.bin ?? null)
  if (binBefore !== binAfter) {
    items.push({ id: 'bin', kind: 'bin', detail: `bin: ${binBefore} → ${binAfter}` })
  }
  for (const field of ['packageManager', 'devEngines'] as const) {
    const before = JSON.stringify(base[field] ?? null)
    const after = JSON.stringify(head[field] ?? null)
    if (before !== after) {
      items.push({ id: `package:${field}`, kind: 'package', detail: `${field}: ${before} → ${after}` })
    }
  }
  return items
}

export function auditItems(audit: AuditReport | null, signatures: { ok: boolean; log: string }): EvidenceItem[] {
  const items: EvidenceItem[] = []
  if (!signatures.ok) {
    items.push({
      id: 'audit:signatures',
      kind: 'audit',
      detail: `npm audit signatures failed: ${signatures.log.trim().slice(0, 500)}`,
    })
  }
  if (audit === null) {
    items.push({ id: 'audit:unavailable', kind: 'audit', detail: 'npm audit --omit=dev produced no parseable report' })
  }
  for (const [name, vuln] of Object.entries(audit?.vulnerabilities ?? {})) {
    if (vuln.severity === 'high' || vuln.severity === 'critical') {
      items.push({ id: `audit:${name}`, kind: 'audit', detail: `${vuln.severity} vulnerability in ${name}` })
    }
  }
  return items.sort(byId)
}

export interface SourceFile {
  path: string
  content: string
}

const URL_RE = /\b(?:https?|wss?):(?:\/\/|\\\/\\\/)([^\s\/?#"'`<>)\\]+)/gi

export function isAllowedHost(host: string): boolean {
  if (!/^[a-z0-9.-]+$/.test(host)) return false
  return host === 'wanderlog.com' || host.endsWith('.wanderlog.com') || host === 'localhost' || host === '127.0.0.1'
}

function normalizeHost(authority: string): string {
  let host = authority.toLowerCase()
  host = host.slice(host.lastIndexOf('@') + 1)
  const close = host.indexOf(']')
  host = host.startsWith('[') && close >= 0 ? host.slice(0, close + 1) : host.replace(/:\d*$/, '')
  return host.replace(/\.$/, '')
}

export function collectHosts(files: SourceFile[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const file of files) {
    for (const m of file.content.matchAll(URL_RE)) {
      const host = normalizeHost(m[1]!)
      const paths = out.get(host) ?? []
      if (!paths.includes(file.path)) paths.push(file.path)
      out.set(host, paths)
    }
  }
  return out
}

export function hostItems(base: SourceFile[], head: SourceFile[]): EvidenceItem[] {
  const before = collectHosts(base)
  const items: EvidenceItem[] = []
  for (const [host, paths] of collectHosts(head)) {
    const isNew = !before.has(host)
    const allowed = isAllowedHost(host)
    if (isNew || !allowed) {
      items.push({
        id: `host:${host}`,
        kind: 'host',
        detail: `${isNew ? 'New' : 'Existing'} ${allowed ? 'allowlisted' : 'non-Wanderlog'} host ${host} in ${paths.join(', ')}`,
      })
    }
  }
  return items.sort(byId)
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
const GIT_ESCAPES: Record<string, string> = { '\\': '\\', '"': '"', t: '\t', n: '\n' }

function unquoteGitPath(s: string): string {
  if (s.length < 2 || !s.startsWith('"') || !s.endsWith('"')) return s
  const bytes: number[] = []
  const encoder = new TextEncoder()
  for (const token of s.slice(1, -1).match(/\\[0-7]{3}|\\[\s\S]|[^\\]+/g) ?? []) {
    if (/^\\[0-7]{3}$/.test(token)) bytes.push(parseInt(token.slice(1), 8))
    else if (token.startsWith('\\')) bytes.push(...encoder.encode(GIT_ESCAPES[token[1]!] ?? token[1]!))
    else bytes.push(...encoder.encode(token))
  }
  return new TextDecoder().decode(new Uint8Array(bytes))
}

function parseNewPath(raw: string): string | null {
  const path = unquoteGitPath(raw.split('\t')[0]!)
  return path === '/dev/null' ? null : path.replace(/^b\//, '')
}

export function addedLines(diff: string): { file: string; line: number; text: string }[] {
  const out: { file: string; line: number; text: string }[] = []
  let file: string | null = null
  let line = 0
  let oldLeft = 0
  let newLeft = 0
  for (const raw of diff.split('\n')) {
    const atBoundary = oldLeft === 0 && newLeft === 0
    const hunk = HUNK_RE.exec(raw)
    if (hunk) {
      line = Number(hunk[3])
      oldLeft = hunk[2] === undefined ? 1 : Number(hunk[2])
      newLeft = hunk[4] === undefined ? 1 : Number(hunk[4])
    } else if (atBoundary && raw.startsWith('diff --git ')) {
      file = null
    } else if (atBoundary && raw.startsWith('+++ ')) {
      file = parseNewPath(raw.slice(4))
    } else if (atBoundary && raw.startsWith('--- ')) {
      continue
    } else if (raw.startsWith('+')) {
      if (file !== null) out.push({ file, line, text: raw.slice(1) })
      newLeft = Math.max(0, newLeft - 1)
      line += 1
    } else if (raw.startsWith('-')) {
      oldLeft = Math.max(0, oldLeft - 1)
    } else if (!raw.startsWith('\\')) {
      oldLeft = Math.max(0, oldLeft - 1)
      newLeft = Math.max(0, newLeft - 1)
      line += 1
    }
  }
  return out
}

const RISKY: { name: string; re: RegExp }[] = [
  { name: 'child_process', re: /\bchild_process\b/ },
  { name: 'eval', re: /\beval\s*\(|\(\s*0\s*,\s*eval\s*\)|\[\s*['"]eval['"]\s*\]/ },
  { name: 'Function constructor', re: /\bFunction\s*\(/ },
  {
    name: 'filesystem write',
    re: /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|mkdir|mkdirSync|rmSync|rm|rmdir|rmdirSync|cp|cpSync|unlink|unlinkSync|rename|renameSync|copyFile|copyFileSync|truncate|truncateSync|symlink|symlinkSync|chmod|chmodSync)\s*\(|\bfs\.write(?:Sync)?\s*\(/,
  },
  { name: 'network server/socket', re: /["'](?:node:)?(?:net|dgram|tls)["']|\bcreateServer\s*\(|\.listen\s*\(/ },
  { name: 'sensitive module', re: /["'`](?:node:)?(?:net|dgram|tls|vm|worker_threads|http|https|http2)["'`]/ },
  { name: 'native binding', re: /\bprocess\s*\.\s*(?:binding|dlopen)\b/ },
]

export const KNOWN_WANDERLOG_ENV = [
  'WANDERLOG_COOKIE',
  'WANDERLOG_BASE_URL',
  'WANDERLOG_WS_BASE_URL',
  'WANDERLOG_USER_AGENT',
  'WANDERLOG_DEFAULT_CURRENCY',
]

const ENV_ROOT_RE = /\bprocess\s*(?:\?\.\s*env\b|\.\s*env\b|\[\s*(['"])env\1\s*\])|(?<![\w$])env\b(?=\?\.|\.|\[)/g
const ENV_NAME_AFTER_RE = /^(?:\?\.|\.)([A-Za-z_]\w*)|^(?:\?\.)?\[\s*(['"])([A-Za-z_]\w*)\2\s*\]/
const ENV_DYNAMIC_AFTER_RE = /^(?:\?\.)?\[/
const IMPORT_CALL_RE = /\bimport\s*\(/g
const STATIC_IMPORT_ARG_RE = /^\s*(?:'[^'\\]*'|"[^"\\]*"|`[^`$\\]*`)\s*[,)]/

function envHits(text: string): string[] {
  const hits: string[] = []
  for (const m of text.matchAll(ENV_ROOT_RE)) {
    const after = text.slice(m.index! + m[0].length)
    const named = ENV_NAME_AFTER_RE.exec(after)
    if (named) {
      const name = named[1] ?? named[3]!
      if (!KNOWN_WANDERLOG_ENV.includes(name)) hits.push(`env read ${name}`)
    } else if (ENV_DYNAMIC_AFTER_RE.test(after)) {
      hits.push('dynamic env read')
    } else if (m[0].startsWith('process')) {
      hits.push('process.env access')
    }
  }
  return hits
}

function dynamicImportHits(text: string): string[] {
  const hits: string[] = []
  for (const m of text.matchAll(IMPORT_CALL_RE)) {
    if (!STATIC_IMPORT_ARG_RE.test(text.slice(m.index! + m[0].length))) hits.push('dynamic import')
  }
  return hits
}

export function riskyApiItems(diff: string): EvidenceItem[] {
  const items: EvidenceItem[] = []
  for (const { file, line, text } of addedLines(diff)) {
    if (!file.startsWith('src/')) continue
    const hits = new Set([
      ...RISKY.filter((p) => p.re.test(text)).map((p) => p.name),
      ...dynamicImportHits(text),
      ...envHits(text),
    ])
    if (hits.size > 0) {
      items.push({
        id: `risky-api:${file}:${line}`,
        kind: 'risky-api',
        detail: `${[...hits].join(', ')}: ${text.trim().slice(0, 200)}`,
      })
    }
  }
  return items
}

export const SENSITIVE_FILES = ['src/config.ts', 'src/transport/rest.ts', 'src/transport/sharedb.ts', '.npmrc']

export function sensitiveFileItems(changed: string[]): EvidenceItem[] {
  return changed
    .filter((f) => SENSITIVE_FILES.includes(f))
    .map((f): EvidenceItem => ({
      id: `sensitive-file:${f}`,
      kind: 'sensitive-file',
      detail: `${f} changed (cookie/transport handling or npm config)`,
    }))
    .sort(byId)
}

export function toolItems(d: ToolsDiff): EvidenceItem[] {
  const items: EvidenceItem[] = [
    ...d.added.map((n): EvidenceItem => ({ id: `tool:added:${n}`, kind: 'tool', detail: `Tool added: ${n}` })),
    ...d.removed.map((n): EvidenceItem => ({ id: `tool:removed:${n}`, kind: 'tool', detail: `Tool removed: ${n}` })),
    ...d.newlyRequired.map((r): EvidenceItem => ({
      id: `tool:required:${r.tool}`,
      kind: 'tool',
      detail: `${r.tool} now requires: ${r.params.join(', ')}`,
    })),
    ...d.removedParams.map((r): EvidenceItem => ({
      id: `tool:params-removed:${r.tool}`,
      kind: 'tool',
      detail: `${r.tool} no longer accepts: ${r.params.join(', ')}`,
    })),
  ]
  return items.sort(byId)
}

interface LockDependency {
  version?: string
  resolved?: string
  dependencies?: Record<string, LockDependency>
}

export interface PackageLock {
  lockfileVersion?: number
  packages?: Record<string, { name?: string; version?: string; resolved?: string; link?: boolean }>
  dependencies?: Record<string, LockDependency>
}

const NPM_REGISTRY = 'https://registry.npmjs.org/'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

function expectedTarball(key: string, name: string | undefined, version: string | undefined): string {
  const marker = key.lastIndexOf('node_modules/')
  const pkg = name ?? (marker >= 0 ? key.slice(marker + 'node_modules/'.length) : key)
  if (version === undefined) return `a tarball of ${pkg} with a pinned version`
  return `${NPM_REGISTRY}${pkg}/-/${pkg.slice(pkg.lastIndexOf('/') + 1)}-${version}.tgz`
}

export function lockfileSourceItems(lock: PackageLock | null): EvidenceItem[] {
  if (!isObject(lock)) return []
  const items = new Map<string, EvidenceItem>()
  const add = (id: string, detail: string): void => {
    items.set(id, { id: `lockfile-source:${id}`, kind: 'lockfile-source', detail })
  }

  if (typeof lock.lockfileVersion !== 'number' || lock.lockfileVersion < 2) {
    add('lockfile-version', `lockfileVersion ${String(lock.lockfileVersion ?? 'missing')} (expected 2 or 3)`)
  }

  if (isObject(lock.packages)) {
    for (const [key, p] of Object.entries(lock.packages)) {
      if (key === '' || !isObject(p)) continue
      const resolved = str(p.resolved)
      const version = str(p.version)
      if (p.link === true) {
        add(key, `${key} resolves from a local link`)
      } else if (resolved !== undefined && !resolved.startsWith(NPM_REGISTRY)) {
        add(key, `${key} resolves from ${resolved}`)
      } else if (resolved !== undefined) {
        const expected = expectedTarball(key, str(p.name), version)
        if (version === undefined || resolved !== expected) {
          add(key, `${key} resolves to ${resolved}, expected ${expected}`)
        }
      }
    }
  }

  const stack: { path: string; deps: unknown }[] = [{ path: 'dependencies', deps: lock.dependencies }]
  while (stack.length > 0) {
    const { path, deps } = stack.pop()!
    if (!isObject(deps)) continue
    for (const [name, dep] of Object.entries(deps)) {
      if (!isObject(dep)) continue
      const here = `${path}/${name}`
      const source = [str(dep.resolved), str(dep.version)].find(
        (v) => v !== undefined && v.includes(':') && !v.startsWith(NPM_REGISTRY),
      )
      if (source !== undefined) add(here, `${here} resolves from ${source}`)
      stack.push({ path: here, deps: dep.dependencies })
    }
  }

  return [...items.values()].sort(byId)
}
