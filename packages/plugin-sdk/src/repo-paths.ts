const UNSAFE_CHARS = /[\\/:*?"<>|\x00-\x1f]/
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i
const SHORT_NAME = /~\d+$/
const MAX_SEGMENT = 255
const MAX_PATH = 1024

function isSafeName(segment: string, unsafe: RegExp): boolean {
  return (
    segment.length > 0 &&
    segment.length <= MAX_SEGMENT &&
    !unsafe.test(segment) &&
    !/[. ]$/.test(segment) &&
    segment.toLowerCase() !== '.git' &&
    !WINDOWS_DEVICE.test(segment) &&
    !SHORT_NAME.test(segment)
  )
}

/**
 * A repo-relative path, `/`-separated, that resolves to the same file on every host.
 * Rejects `.git` and the names Windows aliases to it (trailing dots or spaces, 8.3 short names),
 * because writing there would let a plugin run code through git hooks.
 */
export function isSafeRepoPath(path: string): boolean {
  return path.length <= MAX_PATH && path.split('/').every((segment) => isSafeName(segment, UNSAFE_CHARS))
}

export function repoPathSegments(path: string): string[] {
  return path === '' ? [] : path.split('/')
}

const GLOB_UNSAFE = /[\\/:"<>|\x00-\x1f]/

export function isRepoGlob(glob: string): boolean {
  return glob.length <= MAX_PATH && glob.split('/').every((segment) => segment === '**' || (!segment.includes('**') && isSafeName(segment, GLOB_UNSAFE)))
}

const segmentPatterns = new Map<string, RegExp>()

function segmentPattern(segment: string): RegExp {
  let pattern = segmentPatterns.get(segment)
  if (!pattern) {
    const source = [...segment].map((char) => (char === '*' ? '[^/]*' : char === '?' ? '[^/]' : char.replace(/[.+^${}()|[\]\\]/g, '\\$&'))).join('')
    pattern = new RegExp(`^${source}$`)
    segmentPatterns.set(segment, pattern)
  }
  return pattern
}

export function matchesRepoGlob(glob: string, path: string): boolean {
  const pattern = glob.split('/')
  const segments = repoPathSegments(path)
  let states = new Set([0])
  const expand = (set: Set<number>) => {
    for (const index of set) if (pattern[index] === '**') set.add(index + 1)
    return set
  }
  states = expand(states)
  for (const segment of segments) {
    const next = new Set<number>()
    for (const index of states) {
      const part = pattern[index]
      if (part === '**') next.add(index)
      else if (part !== undefined && segmentPattern(part).test(segment)) next.add(index + 1)
    }
    states = expand(next)
    if (!states.size) return false
  }
  return states.has(pattern.length)
}

export function repoGlobReaches(glob: string, dir: string): boolean {
  const pattern = glob.split('/')
  const segments = repoPathSegments(dir)
  for (let index = 0; index < segments.length; index++) {
    const part = pattern[index]
    if (part === '**') return true
    if (part === undefined || !segmentPattern(part).test(segments[index]!)) return false
  }
  return pattern.length > segments.length
}

export function allowsRepoPath(globs: readonly string[] | undefined, path: string): boolean {
  return isSafeRepoPath(path) && (globs ?? []).some((glob) => matchesRepoGlob(glob, path))
}

export function allowsRepoDir(globs: readonly string[] | undefined, dir: string): boolean {
  return (dir === '' || isSafeRepoPath(dir)) && (globs ?? []).some((glob) => repoGlobReaches(glob, dir))
}
