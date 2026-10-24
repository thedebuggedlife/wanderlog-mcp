export interface ToolInfo {
  name: string
  inputSchema?: { required?: string[]; properties?: Record<string, unknown> }
}

export interface ToolsDiff {
  added: string[]
  removed: string[]
  newlyRequired: { tool: string; params: string[] }[]
  removedParams: { tool: string; params: string[] }[]
}

export function diffTools(base: ToolInfo[], head: ToolInfo[]): ToolsDiff {
  const before = new Map(base.map((t) => [t.name, t]))
  const after = new Map(head.map((t) => [t.name, t]))
  const newlyRequired: { tool: string; params: string[] }[] = []
  const removedParams: { tool: string; params: string[] }[] = []
  for (const [name, h] of after) {
    const b = before.get(name)
    if (!b) continue
    const required = new Set(b.inputSchema?.required ?? [])
    const added = (h.inputSchema?.required ?? []).filter((p) => !required.has(p)).sort()
    if (added.length > 0) newlyRequired.push({ tool: name, params: added })
    const props = new Set(Object.keys(h.inputSchema?.properties ?? {}))
    const gone = Object.keys(b.inputSchema?.properties ?? {})
      .filter((p) => !props.has(p))
      .sort()
    if (gone.length > 0) removedParams.push({ tool: name, params: gone })
  }
  const byTool = (x: { tool: string }, y: { tool: string }): number => x.tool.localeCompare(y.tool)
  return {
    added: [...after.keys()].filter((n) => !before.has(n)).sort(),
    removed: [...before.keys()].filter((n) => !after.has(n)).sort(),
    newlyRequired: newlyRequired.sort(byTool),
    removedParams: removedParams.sort(byTool),
  }
}
