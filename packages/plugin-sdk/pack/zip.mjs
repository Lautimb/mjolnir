import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'

const UTF8 = 0x0800
const DOS_DATE_1980 = 0x21
const REGULAR_FILE = 0o100644

export function createZip(files) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, content] of files) {
    const nameBytes = Buffer.from(name, 'utf8')
    const compressed = deflateRawSync(content)
    const checksum = crc32(content)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(UTF8, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(DOS_DATE_1980, 12)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(content.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(0x0314, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(UTF8, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(DOS_DATE_1980, 14)
    central.writeUInt32LE(checksum, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(content.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE((REGULAR_FILE << 16) >>> 0, 38)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, compressed)
    centrals.push(central, nameBytes)
    offset += local.length + nameBytes.length + compressed.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

async function collect(root, dir = root) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await collect(root, path)))
    else if (entry.isFile()) files.push([relative(root, path).split(sep).join('/'), await readFile(path)])
    else throw new Error(`${relative(root, path)}: only regular files can be packed`)
  }
  return files
}

export async function packPlugin(dir, out) {
  const root = resolve(dir)
  const manifest = JSON.parse(await readFile(join(root, 'mjolnir-plugin.json'), 'utf8'))
  if (typeof manifest.id !== 'string' || typeof manifest.version !== 'string') throw new Error('mjolnir-plugin.json needs an id and a version')
  const files = (await collect(root)).sort(([a], [b]) => a.localeCompare(b))
  const file = resolve(out ?? join(root, '..', `${manifest.id}-${manifest.version}.mjp`))
  await writeFile(file, createZip(files))
  return { file, id: manifest.id, version: manifest.version, files: files.length }
}
