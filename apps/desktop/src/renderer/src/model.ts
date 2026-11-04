import type { Host, Repo, TerminalProfile, Worktree } from '@mjolnir/core/browser'

export const SCRATCH_KEY = 'scratch'

export interface Session {
  key: string
  host: Host
  title: string
  cwd?: string
  repo?: Repo
  worktree?: Worktree
}

export interface Tab {
  id: string
  sessionKey: string
  profile: TerminalProfile
  label: string
  kind: 'shell' | 'agent'
  cwd?: string
  initialInput?: string
  exitCode?: number
}

export interface Agent {
  id: string
  label: string
  description: string
  command: string
}

export const AGENTS: Agent[] = [
  { id: 'claude', label: 'Claude Code', description: 'Agente de Anthropic', command: 'claude' },
  { id: 'opencode', label: 'opencode', description: 'Agente open source', command: 'opencode' },
]

export function sessionKey(repo: Repo, worktree: Worktree): string {
  return `${repo.id}::${worktree.path}`
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

export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
