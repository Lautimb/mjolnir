import { PROMPT_VARS, type Host, type PromptVar, type Repo, type Ticket, type Worktree } from '@mjolnir/core/browser'
import type { T } from '../i18n/I18nProvider'

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

export function sessionCwd(key: string): string | undefined {
  const separator = key.indexOf('::')
  return separator === -1 ? undefined : key.slice(separator + 2)
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
  ticket?: Ticket
  nonce: number
}

const KEEP_PROMPT_VARS = Object.fromEntries(PROMPT_VARS.map((name) => [name, `{${name}}`])) as Record<PromptVar, string>

export function defaultTakePrompt(t: T): string {
  return t('take.defaultPrompt', KEEP_PROMPT_VARS)
}
