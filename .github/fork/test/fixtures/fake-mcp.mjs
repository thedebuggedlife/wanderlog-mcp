import { createInterface } from 'node:readline'

const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n')
const tool = (name) => ({ name, inputSchema: { type: 'object', properties: {} } })
const pages = [
  [tool('alpha')],
  [tool(process.env.FAKE_TOOL ?? 'beta'), ...(process.env.SECRET_X ? [tool('leaked')] : [])],
]

createInterface({ input: process.stdin }).on('line', (line) => {
  const msg = JSON.parse(line)
  if (msg.method === 'initialize') {
    send({
      id: msg.id,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'fake', version: '0' },
      },
    })
  } else if (msg.method === 'tools/list') {
    const page = msg.params?.cursor === 'p2' ? 1 : 0
    send({ id: msg.id, result: { tools: pages[page], ...(page === 0 ? { nextCursor: 'p2' } : {}) } })
  }
})
