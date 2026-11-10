import type { Exec } from './git'
import { safeRef } from './refs'

export type ChangeStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'

export interface FileChange {
  path: string
  oldPath?: string
  status: ChangeStatus
  additions: number | null
  deletions: number | null
  binary: boolean
}

export type CompareMode = 'working' | 'branch'

export interface Comparison {
  from: string
  files: FileChange[]
}

export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

export interface CommitSummary {
  sha: string
  parents: string[]
  author: string
  date: number
  subject: string
}

const FIELD = '\x1f'
const LOG_FORMAT = ['%H', '%P', '%an', '%at', '%s'].join('%x1f')

export function parseLog(output: string): CommitSummary[] {
  return output
    .split('\0')
    .filter(Boolean)
    .map((record) => {
      const [sha = '', parents = '', author = '', date = '', ...subject] = record.split(FIELD)
      return { sha, parents: parents.split(' ').filter(Boolean), author, date: Number(date) * 1000, subject: subject.join(FIELD) }
    })
}

type NameStatus = Pick<FileChange, 'path' | 'oldPath' | 'status'>

export function parseNameStatus(output: string): NameStatus[] {
  const tokens = output.split('\0').filter(Boolean)
  const changes: NameStatus[] = []
  for (let i = 0; i < tokens.length; ) {
    const code = tokens[i++]![0]
    if (code === 'R' || code === 'C') {
      const oldPath = tokens[i++]!
      const path = tokens[i++]!
      changes.push(code === 'R' ? { path, oldPath, status: 'renamed' } : { path, status: 'added' })
    } else {
      const path = tokens[i++]!
      changes.push({ path, status: code === 'A' ? 'added' : code === 'D' ? 'deleted' : 'modified' })
    }
  }
  return changes
}

export function parseNumstat(output: string): Map<string, Pick<FileChange, 'additions' | 'deletions' | 'binary'>> {
  const tokens = output.split('\0')
  const stats = new Map<string, Pick<FileChange, 'additions' | 'deletions' | 'binary'>>()
  for (let i = 0; i < tokens.length; i++) {
    const match = /^(\d+|-)\t(\d+|-)\t(.*)$/.exec(tokens[i]!)
    if (!match) continue
    const [, added, deleted, inline] = match
    const path = inline || ((i += 2), tokens[i]!)
    const binary = added === '-'
    stats.set(path, {
      additions: binary ? null : Number(added),
      deletions: binary ? null : Number(deleted),
      binary,
    })
  }
  return stats
}

export function createDiff(exec: Exec) {
  const git = (cwd: string, ...args: string[]) => exec(cwd, 'git', args)
  const tryGit = (cwd: string, ...args: string[]) =>
    git(cwd, ...args).then(
      (out) => out.trim() || null,
      () => null,
    )

  return {
    async resolveFrom(dir: string, mode: CompareMode, base: string | null): Promise<string> {
      const head = await tryGit(dir, 'rev-parse', '--verify', '--quiet', 'HEAD')
      if (!head) return EMPTY_TREE
      if (mode === 'working' || !base) return 'HEAD'
      return (await tryGit(dir, 'merge-base', 'HEAD', safeRef(base))) ?? base
    },

    async files(dir: string, from: string, to?: string): Promise<FileChange[]> {
      const range = to ? [safeRef(from), safeRef(to)] : [safeRef(from)]
      const [nameStatus, numstat, untracked] = await Promise.all([
        git(dir, 'diff', '--name-status', '-z', '-M', ...range),
        git(dir, 'diff', '--numstat', '-z', '-M', ...range),
        to ? Promise.resolve('') : git(dir, 'ls-files', '--others', '--exclude-standard', '-z'),
      ])
      const stats = parseNumstat(numstat)
      const tracked = parseNameStatus(nameStatus).map((change) => ({
        ...change,
        ...(stats.get(change.path) ?? { additions: null, deletions: null, binary: false }),
      }))
      const added = untracked
        .split('\0')
        .filter(Boolean)
        .map((path): FileChange => ({ path, status: 'untracked', additions: null, deletions: null, binary: false }))
      return [...tracked, ...added].sort((a, b) => a.path.localeCompare(b.path))
    },

    async log(dir: string, since: string | null, limit: number): Promise<CommitSummary[]> {
      const exclude = since && since !== EMPTY_TREE ? ['--not', safeRef(since)] : []
      if (!(await tryGit(dir, 'rev-parse', '--verify', '--quiet', 'HEAD'))) return []
      return parseLog(await git(dir, 'log', '-z', `--format=${LOG_FORMAT}`, `--max-count=${limit}`, 'HEAD', ...exclude))
    },

    async parent(dir: string, sha: string): Promise<string> {
      const [, first] = (await git(dir, 'rev-list', '--parents', '--max-count=1', safeRef(sha))).trim().split(' ')
      return first ?? EMPTY_TREE
    },

    async original(dir: string, from: string, change: FileChange): Promise<string> {
      if (change.status === 'added' || change.status === 'untracked' || from === EMPTY_TREE) return ''
      return git(dir, 'show', `${safeRef(from)}:${change.oldPath ?? change.path}`)
    },

    async modified(dir: string, to: string, change: FileChange): Promise<string> {
      if (change.status === 'deleted') return ''
      return git(dir, 'show', `${safeRef(to)}:${change.path}`)
    },
  }
}
