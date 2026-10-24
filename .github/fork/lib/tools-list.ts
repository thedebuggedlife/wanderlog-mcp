import { spawn } from 'node:child_process'
import type { ToolInfo } from './tools.ts'

export const PLACEHOLDER_ENV: Record<string, string> = {
  WANDERLOG_COOKIE: 's%3Aplaceholder',
  WANDERLOG_BASE_URL: 'http://127.0.0.1:9',
  WANDERLOG_WS_BASE_URL: 'ws://127.0.0.1:9',
}

interface RpcMessage {
  id?: unknown
  error?: unknown
  result?: { tools?: ToolInfo[]; nextCursor?: string }
}

export function listTools(entry: string, env: Record<string, string>, timeoutMs = 20_000): Promise<ToolInfo[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry], {
      env: { PATH: process.env.PATH ?? '', ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const tools: ToolInfo[] = []
    let buffer = ''
    let stderr = ''
    let settled = false

    const finish = (err: Error | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill()
      if (err) reject(err)
      else resolve(tools)
    }
    const timer = setTimeout(() => finish(new Error(`tools/list timed out after ${timeoutMs}ms\n${stderr}`)), timeoutMs)
    const send = (msg: object): void => {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n')
    }

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (err) => finish(err))
    child.on('close', (code) => finish(new Error(`MCP exited with code ${code} before listing tools\n${stderr}`)))
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      let nl = buffer.indexOf('\n')
      while (nl >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        nl = buffer.indexOf('\n')
        if (!line) continue
        let msg: RpcMessage
        try {
          msg = JSON.parse(line) as RpcMessage
        } catch {
          continue
        }
        if (msg.id === 1) {
          if (msg.error) return finish(new Error(`initialize failed: ${JSON.stringify(msg.error)}`))
          send({ method: 'notifications/initialized' })
          send({ id: 2, method: 'tools/list', params: {} })
        } else if (typeof msg.id === 'number' && msg.id >= 2) {
          if (msg.error) return finish(new Error(`tools/list failed: ${JSON.stringify(msg.error)}`))
          tools.push(...(msg.result?.tools ?? []))
          const cursor = msg.result?.nextCursor
          if (cursor) send({ id: msg.id + 1, method: 'tools/list', params: { cursor } })
          else finish(null)
        }
      }
    })

    send({
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'fork-evidence', version: '0.0.0' },
      },
    })
  })
}
