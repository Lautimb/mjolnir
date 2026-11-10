import type { AgentEvent, AgentStatus, TerminalProfile } from '@mjolnir/core/browser'

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
  hooks?: boolean
  status?: AgentStatus
  pristine?: true
}

export type AgentId = 'claude' | 'opencode'

export interface Agent {
  id: AgentId
  label: string
  command: string
  conversationFlags?: { start: string; resume: string }
  promptFlag?: string
  settingsFlag?: string
}

export const AGENTS: Agent[] = [
  { id: 'claude', label: 'Claude Code', command: 'claude', conversationFlags: { start: '--session-id', resume: '--resume' }, settingsFlag: '--settings' },
  { id: 'opencode', label: 'opencode', command: 'opencode', promptFlag: '--prompt' },
]

export type Launch = { mode: 'new'; promptArgument?: string } | { mode: 'latest' } | { mode: 'resume'; conversation: string }

export function agentLaunch(
  agent: Agent,
  launch: Launch,
  newId: () => string,
  settingsArgument?: string | null,
): Pick<Tab, 'conversation' | 'initialInput' | 'hooks' | 'pristine'> {
  const hooks = agent.settingsFlag && settingsArgument ? [agent.settingsFlag, settingsArgument] : []
  const watched = hooks.length > 0 ? { hooks: true } : {}
  if (launch.mode === 'latest') return { ...watched, initialInput: `${[agent.command, ...hooks, '--continue'].join(' ')}\r` }
  const prompt = launch.mode === 'new' && launch.promptArgument ? [agent.promptFlag, launch.promptArgument] : []
  const flags = agent.conversationFlags
  const conversation = flags && (launch.mode === 'resume' ? launch.conversation : newId())
  const pinned = flags && conversation ? [launch.mode === 'resume' ? flags.resume : flags.start, conversation] : []
  const command = [agent.command, ...pinned, ...hooks, ...prompt].filter(Boolean).join(' ')
  const pristine = launch.mode === 'new' && conversation && hooks.length > 0 ? { pristine: true as const } : {}
  return { ...(conversation && { conversation }), ...watched, ...pristine, initialInput: `${command}\r` }
}

export function wakeLaunch(tab: Tab, tabs: Tab[]): Launch {
  if (tab.conversation && !tab.pristine) return { mode: 'resume', conversation: tab.conversation }
  if (tab.pristine) return { mode: 'new' }
  const siblings = tabs.filter((candidate) => candidate.sessionKey === tab.sessionKey && candidate.agent === tab.agent)
  return siblings.length === 1 ? { mode: 'latest' } : { mode: 'new' }
}

export function withAgentEvent(tab: Tab, event: AgentEvent): Tab {
  const conversation = event.conversation ?? tab.conversation
  const status = event.status === undefined ? tab.status : (event.status ?? undefined)
  const pristine = event.pristine === undefined ? tab.pristine : event.pristine || undefined
  if (conversation === tab.conversation && status === tab.status && pristine === tab.pristine) return tab
  return { ...tab, conversation, status, pristine }
}

export function sessionAgentStatus(tabs: Tab[]): AgentStatus | undefined {
  return (['waiting', 'working', 'done'] as const).find((status) => tabs.some((tab) => tab.status === status))
}
