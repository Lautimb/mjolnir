import type { Host } from './hosts'

export const AGENT_SETTINGS_ENV = 'MJOLNIR_AGENT_SETTINGS'
export const AGENT_STATUS_ENV = 'MJOLNIR_AGENT_STATUS'

export type AgentStatus = 'working' | 'waiting' | 'done'

export interface AgentEvent {
  status?: AgentStatus | null
  conversation?: string
  pristine?: boolean
}

const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd'] as const
const writeStatus = { hooks: [{ type: 'command', command: `cat > "$${AGENT_STATUS_ENV}"` }] }

export const CLAUDE_HOOK_SETTINGS = JSON.stringify({ hooks: Object.fromEntries(HOOK_EVENTS.map((event) => [event, [writeStatus]])) })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID.test(value)
}

export function hookStatusPath(platform: NodeJS.Platform, host: Host, nativePath: string): string {
  return platform === 'win32' && host.kind === 'windows' ? nativePath.replaceAll('\\', '/') : nativePath
}

export function parseHookEvent(text: string): AgentEvent | null {
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    return null
  }
  if (!payload || typeof payload !== 'object') return null
  const { hook_event_name: name, session_id: session, source, notification_type: notification } = payload as Record<string, unknown>
  const conversation = typeof session === 'string' && isUuid(session) ? { conversation: session } : {}
  switch (name) {
    case 'SessionStart':
      return { ...conversation, status: null, pristine: source === 'startup' || source === 'clear' }
    case 'UserPromptSubmit':
      return { ...conversation, status: 'working', pristine: false }
    case 'PostToolUse':
      return { ...conversation, status: 'working' }
    case 'Notification':
      return notification === 'idle_prompt' ? conversation : { ...conversation, status: 'waiting' }
    case 'Stop':
      return { ...conversation, status: 'done' }
    case 'SessionEnd':
      return { ...conversation, status: null }
    default:
      return null
  }
}
