import { readFileSync } from 'node:fs'
import { forkReleaseTags } from '../lib/release.ts'

const tags = forkReleaseTags(readFileSync(0, 'utf8'))
if (tags.length > 0) process.stdout.write(tags.join('\n') + '\n')
