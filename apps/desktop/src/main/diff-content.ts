import type { createDiff, FileChange } from '@mjolnir/core'
import type { DiffFile } from '../shared/api'

export const MAX_DIFF_BYTES = 1.5 * 1024 * 1024
const BINARY_SNIFF_CHARS = 8000

const looksBinary = (text: string) => text.slice(0, BINARY_SNIFF_CHARS).includes('\0')

export function diffContent(original: string, modified: string): DiffFile {
  if (original.length > MAX_DIFF_BYTES || modified.length > MAX_DIFF_BYTES) return { kind: 'too-large' }
  if (looksBinary(original) || looksBinary(modified)) return { kind: 'binary' }
  return { kind: 'text', original, modified }
}

export async function diffBetweenRefs(
  diff: ReturnType<typeof createDiff>,
  dir: string,
  from: string,
  to: string,
  change: FileChange,
): Promise<DiffFile> {
  if (change.binary) return { kind: 'binary' }
  const [original, modified] = await Promise.all([diff.original(dir, from, change), diff.modified(dir, to, change)])
  return diffContent(original, modified)
}
