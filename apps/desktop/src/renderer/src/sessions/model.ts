import type { Host, Repo, Worktree } from '@mjolnir/core/browser'

export const SCRATCH_KEY = 'scratch'

export interface Session {
  key: string
  host: Host
  title: string
  cwd?: string
  repo?: Repo
  worktree?: Worktree
}

export function sessionKey(repo: Repo, worktree: Worktree): string {
  return `${repo.id}::${worktree.path}`
}

export function repoKeyPrefix(repo: Repo): string {
  return `${repo.id}::`
}

export function worktreeSession(repo: Repo, worktree: Worktree): Session {
  return {
    key: sessionKey(repo, worktree),
    host: repo.host,
    title: worktree.branch ?? worktree.head.slice(0, 7),
    cwd: worktree.path,
    repo,
    worktree,
  }
}

export interface SessionDraft {
  repoId: string
  branch: string
  nonce: number
}
