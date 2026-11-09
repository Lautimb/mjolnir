import type { TerminalProfile } from '@mjolnir/core/browser'

export interface Tab {
  id: string
  sessionKey: string
  profile: TerminalProfile
  label: string
  kind: 'shell' | 'agent'
  agent?: AgentId
  conversation?: string
  dormant?: boolean
  cwd?: string
  initialInput?: string
  prompt?: string
  exitCode?: number
}

export type AgentId = 'claude' | 'opencode'

export interface Agent {
  id: AgentId
  label: string
  command: string
  conversationFlags?: { start: string; resume: string }
  promptFlag?: string
}

export const AGENTS: Agent[] = [
  { id: 'claude', label: 'Claude Code', command: 'claude', conversationFlags: { start: '--session-id', resume: '--resume' } },
  { id: 'opencode', label: 'opencode', command: 'opencode', promptFlag: '--prompt' },
]

export type Launch = { mode: 'new'; promptArgument?: string } | { mode: 'latest' } | { mode: 'resume'; conversation: string }

export function agentLaunch(agent: Agent, launch: Launch, newId: () => string): Pick<Tab, 'conversation' | 'initialInput'> {
  if (launch.mode === 'latest') return { initialInput: `${agent.command} --continue\r` }
  const prompt = launch.mode === 'new' && launch.promptArgument ? [agent.promptFlag, launch.promptArgument] : []
  const flags = agent.conversationFlags
  const conversation = flags && (launch.mode === 'resume' ? launch.conversation : newId())
  const pinned = flags && conversation ? [launch.mode === 'resume' ? flags.resume : flags.start, conversation] : []
  const command = [agent.command, ...pinned, ...prompt].filter(Boolean).join(' ')
  return { ...(conversation && { conversation }), initialInput: `${command}\r` }
}

export function wakeLaunch(tab: Tab, tabs: Tab[]): Launch {
  if (tab.conversation) return { mode: 'resume', conversation: tab.conversation }
  const siblings = tabs.filter((candidate) => candidate.sessionKey === tab.sessionKey && candidate.agent === tab.agent)
  return siblings.length === 1 ? { mode: 'latest' } : { mode: 'new' }
}
