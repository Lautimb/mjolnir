#!/usr/bin/env node
import { packPlugin } from './zip.mjs'

const [command, dir = 'dist', ...rest] = process.argv.slice(2)
if (command !== 'pack') {
  console.error('usage: mjolnir-plugin pack [dir] [--out file.mjp]')
  process.exit(1)
}
const outIndex = rest.indexOf('--out')
const out = outIndex >= 0 ? rest[outIndex + 1] : undefined
try {
  const result = await packPlugin(dir, out)
  console.log(`${result.id} ${result.version}: ${result.files} files → ${result.file}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
