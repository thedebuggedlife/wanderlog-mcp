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

export const byId = (a: EvidenceItem, b: EvidenceItem): number => a.id.localeCompare(b.id)

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
