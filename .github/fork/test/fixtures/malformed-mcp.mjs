import { createInterface } from 'node:readline'

const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n')

createInterface({ input: process.stdin }).on('line', (line) => {
  const msg = JSON.parse(line)
  if (msg.method === 'initialize') {
    send({
      id: msg.id,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'malformed', version: '0' },
      },
    })
  } else if (msg.method === 'tools/list') {
    send({ id: msg.id, result: {} })
  }
})
