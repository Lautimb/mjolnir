#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { catalogEntry } from './catalog.mjs'
import { packPlugin } from './zip.mjs'

const USAGE = `usage:
  mjolnir-plugin pack [dir] [--out file.mjp]
  mjolnir-plugin entry <dir> <file.mjp> --url <url> [--key file.pem]   (or MJOLNIR_SIGNING_KEY)`

const [command, ...args] = process.argv.slice(2)
const option = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const positional = args.filter((arg, index) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--'))

try {
  if (command === 'pack') {
    const result = await packPlugin(positional[0] ?? 'dist', option('--out'))
    console.log(`${result.id} ${result.version}: ${result.files} files → ${result.file}`)
  } else if (command === 'entry' && positional.length === 2 && option('--url')) {
    const keyFile = option('--key')
    const privateKeyPem = keyFile ? await readFile(keyFile, 'utf8') : process.env.MJOLNIR_SIGNING_KEY || undefined
    const entry = await catalogEntry({ dir: positional[0], file: positional[1], url: option('--url'), privateKeyPem })
    console.log(JSON.stringify(entry, null, 2))
  } else {
    console.error(USAGE)
    process.exit(1)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
