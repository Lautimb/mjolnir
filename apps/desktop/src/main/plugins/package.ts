import { createHash } from 'node:crypto'
import { crc32, inflateRawSync } from 'node:zlib'
import { isSafeRelativePath } from '@mjolnir/plugin-sdk/manifest'

export const PACKAGE_LIMITS = { packageBytes: 50_000_000, fileBytes: 20_000_000, totalBytes: 100_000_000, entries: 2_000 }

export class PackageError extends Error {}

const END_OF_DIRECTORY = 0x06054b50
const CENTRAL_ENTRY = 0x02014b50
const LOCAL_ENTRY = 0x04034b50
const MAX_COMMENT = 0xffff
const UNIX = 3
const FILE_TYPE = 0o170000
const SYMLINK = 0o120000

function endOfDirectory(zip: Buffer): number {
  for (let offset = zip.length - 22; offset >= Math.max(0, zip.length - 22 - MAX_COMMENT); offset--) {
    if (zip.readUInt32LE(offset) === END_OF_DIRECTORY) return offset
  }
  throw new PackageError('not a zip file')
}

export interface PluginPackage {
  sha256: string
  files: Map<string, Buffer>
}

export function readPackage(zip: Buffer, limits = PACKAGE_LIMITS): PluginPackage {
  if (zip.length > limits.packageBytes) throw new PackageError(`larger than ${limits.packageBytes} bytes`)
  const end = endOfDirectory(zip)
  const count = zip.readUInt16LE(end + 10)
  const directorySize = zip.readUInt32LE(end + 12)
  let offset = zip.readUInt32LE(end + 16)
  if (zip.readUInt16LE(end + 4) !== 0 || count !== zip.readUInt16LE(end + 8)) throw new PackageError('multi-disk zips are not supported')
  if (count > limits.entries) throw new PackageError(`more than ${limits.entries} entries`)
  if (offset + directorySize > end) throw new PackageError('corrupt zip directory')

  const files = new Map<string, Buffer>()
  let total = 0
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || zip.readUInt32LE(offset) !== CENTRAL_ENTRY) throw new PackageError('corrupt zip directory')
    const madeBy = zip.readUInt16LE(offset + 4) >> 8
    const flags = zip.readUInt16LE(offset + 8)
    const method = zip.readUInt16LE(offset + 10)
    const checksum = zip.readUInt32LE(offset + 16)
    const compressedSize = zip.readUInt32LE(offset + 20)
    const size = zip.readUInt32LE(offset + 24)
    const nameLength = zip.readUInt16LE(offset + 28)
    const extraLength = zip.readUInt16LE(offset + 30)
    const commentLength = zip.readUInt16LE(offset + 32)
    const mode = zip.readUInt32LE(offset + 38) >>> 16
    const localOffset = zip.readUInt32LE(offset + 42)
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength)
    offset += 46 + nameLength + extraLength + commentLength

    if (name.endsWith('/')) continue
    if (flags & 1) throw new PackageError(`${name}: encrypted entries are not supported`)
    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) throw new PackageError('zip64 is not supported')
    if (madeBy === UNIX && (mode & FILE_TYPE) === SYMLINK) throw new PackageError(`${name}: symbolic links are not allowed`)
    if (!isSafeRelativePath(name)) throw new PackageError(`${name}: unsafe path`)
    if (files.has(name)) throw new PackageError(`${name}: duplicated`)
    if (method !== 0 && method !== 8) throw new PackageError(`${name}: unsupported compression`)
    if (size > limits.fileBytes) throw new PackageError(`${name}: larger than ${limits.fileBytes} bytes`)
    total += size
    if (total > limits.totalBytes) throw new PackageError(`more than ${limits.totalBytes} bytes uncompressed`)

    if (localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== LOCAL_ENTRY) throw new PackageError(`${name}: corrupt entry`)
    const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28)
    if (dataStart + compressedSize > zip.length) throw new PackageError(`${name}: corrupt entry`)
    const data = zip.subarray(dataStart, dataStart + compressedSize)
    let content: Buffer
    try {
      content = method === 0 ? Buffer.from(data) : inflateRawSync(data, { maxOutputLength: Math.max(size, 1) })
    } catch {
      throw new PackageError(`${name}: corrupt data`)
    }
    if (content.length !== size || crc32(content) !== checksum) throw new PackageError(`${name}: corrupt data`)
    files.set(name, content)
  }
  return { sha256: createHash('sha256').update(zip).digest('hex'), files }
}
