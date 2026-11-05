import type { TerminalProfile } from '@mjolnir/core/browser'

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
