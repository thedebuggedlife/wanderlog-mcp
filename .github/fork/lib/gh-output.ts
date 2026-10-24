import { appendFileSync } from 'node:fs'

export function setOutput(name: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT
  if (!file) return
  appendFileSync(file, `${name}=${value}\n`)
}
