export type EvidenceKind =
  'dependency' | 'audit' | 'lifecycle' | 'bin' | 'host' | 'risky-api' | 'sensitive-file' | 'tool' | 'tools-list'

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

const URL_RE = /\b(?:https?|wss?):\/\/([a-z0-9.-]+)/gi

export function isAllowedHost(host: string): boolean {
  return host === 'wanderlog.com' || host.endsWith('.wanderlog.com') || host === 'localhost' || host === '127.0.0.1'
}

export function collectHosts(files: SourceFile[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const file of files) {
    for (const m of file.content.matchAll(URL_RE)) {
      const host = m[1]!.toLowerCase().replace(/\.$/, '')
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

export function addedLines(diff: string): { file: string; line: number; text: string }[] {
  const out: { file: string; line: number; text: string }[] = []
  let file: string | null = null
  let line = 0
  let prev = ''
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ') && prev.startsWith('--- ')) {
      file = raw === '+++ /dev/null' ? null : raw.slice(4).replace(/^b\//, '')
    } else if (raw.startsWith('diff --git ')) {
      file = null
    } else {
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw)
      if (hunk) {
        line = Number(hunk[1])
      } else if (file !== null && raw.startsWith('+')) {
        out.push({ file, line, text: raw.slice(1) })
        line += 1
      } else if (file !== null && raw.startsWith(' ')) {
        line += 1
      }
    }
    prev = raw
  }
  return out
}

const RISKY: { name: string; re: RegExp }[] = [
  { name: 'child_process', re: /\bchild_process\b/ },
  { name: 'eval', re: /\beval\s*\(/ },
  { name: 'new Function', re: /\bnew\s+Function\s*\(/ },
  {
    name: 'filesystem write',
    re: /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|mkdir|mkdirSync|rmSync|unlink|unlinkSync|rename|renameSync|copyFile|copyFileSync)\s*\(/,
  },
  { name: 'network server/socket', re: /["'](?:node:)?(?:net|dgram|tls)["']|\bcreateServer\s*\(|\.listen\s*\(/ },
  { name: 'dynamic import', re: /\bimport\s*\(\s*[^'"`\s)]/ },
]

const ENV_RE =
  /\b(?:process\.)?env(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*(?:["']([A-Za-z_][A-Za-z0-9_]*)["']|([^\]]+))\s*\])/g

export function riskyApiItems(diff: string): EvidenceItem[] {
  const items: EvidenceItem[] = []
  for (const { file, line, text } of addedLines(diff)) {
    if (!file.startsWith('src/')) continue
    const hits = RISKY.filter((p) => p.re.test(text)).map((p) => p.name)
    for (const m of text.matchAll(ENV_RE)) {
      const name = m[1] ?? m[2]
      if (m[3] !== undefined) hits.push('dynamic env read')
      else if (name !== undefined && !name.startsWith('WANDERLOG_')) hits.push(`env read ${name}`)
    }
    if (hits.length > 0) {
      items.push({
        id: `risky-api:${file}:${line}`,
        kind: 'risky-api',
        detail: `${hits.join(', ')}: ${text.trim().slice(0, 200)}`,
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
