import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { toolItems } from '../lib/evidence.ts'
import { diffTools } from '../lib/tools.ts'
import { listTools } from '../lib/tools-list.ts'

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

describe('diffTools', () => {
  const base = [{ name: 'keep', inputSchema: { required: ['a'], properties: { a: {}, b: {} } } }, { name: 'gone' }]
  const head = [
    { name: 'keep', inputSchema: { required: ['a', 'c'], properties: { a: {}, c: {} } } },
    { name: 'fresh' },
  ]
  it('reports added/removed tools, newly required inputs and removed params', () => {
    expect(diffTools(base, head)).toEqual({
      added: ['fresh'],
      removed: ['gone'],
      newlyRequired: [{ tool: 'keep', params: ['c'] }],
      removedParams: [{ tool: 'keep', params: ['b'] }],
    })
  })
  it('maps the diff to evidence items', () => {
    expect(toolItems(diffTools(base, head)).map((i) => i.id)).toEqual([
      'tool:added:fresh',
      'tool:params-removed:keep',
      'tool:removed:gone',
      'tool:required:keep',
    ])
  })
})

describe('listTools', () => {
  afterEach(() => {
    delete process.env.SECRET_X
  })
  it('lists tools across pages with the given env', async () => {
    const tools = await listTools(fixture('fake-mcp.mjs'), { FAKE_TOOL: 'gamma' })
    expect(tools.map((t) => t.name)).toEqual(['alpha', 'gamma'])
  })
  it('does not leak the parent environment to the MCP', async () => {
    process.env.SECRET_X = 'should-not-pass'
    const tools = await listTools(fixture('fake-mcp.mjs'), {})
    expect(tools.map((t) => t.name)).not.toContain('leaked')
  })
  it('rejects with stderr when the MCP exits early', async () => {
    await expect(listTools(fixture('exit-mcp.mjs'), {})).rejects.toThrow(/exited with code 3[\s\S]*boom/)
  })
  it('rejects on timeout', async () => {
    await expect(listTools(fixture('silent-mcp.mjs'), {}, 300)).rejects.toThrow(/timed out after 300ms/)
  })
})
