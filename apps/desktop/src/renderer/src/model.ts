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

export type AgentId = 'claude' | 'opencode'

export interface Agent {
  id: AgentId
  label: string
  command: string
}

export const AGENTS: Agent[] = [
  { id: 'claude', label: 'Claude Code', command: 'claude' },
  { id: 'opencode', label: 'opencode', command: 'opencode' },
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
