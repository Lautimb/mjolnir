import { describe, expect, it } from 'vitest'
import { AGENT_STATUS_ENV, CLAUDE_HOOK_SETTINGS, hookStatusPath, parseHookEvent } from './agent-hooks'

const session = '0b5e7a4c-1d2e-4f30-8a9b-0c1d2e3f4a5b'
const event = (fields: Record<string, unknown>) => JSON.stringify({ session_id: session, ...fields })

describe('CLAUDE_HOOK_SETTINGS', () => {
  it('writes every hook payload to the file in the env, so nothing has to be escaped into the command', () => {
    const { hooks } = JSON.parse(CLAUDE_HOOK_SETTINGS) as { hooks: Record<string, { hooks: { command: string }[] }[]> }
    expect(Object.keys(hooks)).toEqual(['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd'])
    for (const [entry] of Object.values(hooks)) expect(entry!.hooks[0]!.command).toBe(`cat > "$${AGENT_STATUS_ENV}"`)
  })
})

describe('hookStatusPath', () => {
  it('uses forward slashes for native Windows, where Claude runs hooks in Git Bash', () => {
    expect(hookStatusPath('win32', { kind: 'windows' }, 'C:\\Users\\me\\x.json')).toBe('C:/Users/me/x.json')
  })

  it('keeps the native path when WSLENV translates it or no host is crossed', () => {
    expect(hookStatusPath('win32', { kind: 'wsl', distro: 'Ubuntu' }, 'C:\\Users\\me\\x.json')).toBe('C:\\Users\\me\\x.json')
    expect(hookStatusPath('linux', { kind: 'posix' }, '/home/me/x.json')).toBe('/home/me/x.json')
  })
})

describe('parseHookEvent', () => {
  it('maps the turn of the agent to working, waiting and done', () => {
    expect(parseHookEvent(event({ hook_event_name: 'UserPromptSubmit' }))).toEqual({ conversation: session, status: 'working', pristine: false })
    expect(parseHookEvent(event({ hook_event_name: 'PostToolUse' }))).toEqual({ conversation: session, status: 'working' })
    expect(parseHookEvent(event({ hook_event_name: 'Notification', notification_type: 'permission_prompt' }))).toEqual({ conversation: session, status: 'waiting' })
    expect(parseHookEvent(event({ hook_event_name: 'Stop' }))).toEqual({ conversation: session, status: 'done' })
  })

  it('does not turn a finished turn into waiting when Claude only reminds that it is idle', () => {
    expect(parseHookEvent(event({ hook_event_name: 'Notification', notification_type: 'idle_prompt' }))).toEqual({ conversation: session })
  })

  it('follows the conversation id and knows a fresh or cleared one has nothing to resume yet', () => {
    expect(parseHookEvent(event({ hook_event_name: 'SessionStart', source: 'clear' }))).toEqual({ conversation: session, status: null, pristine: true })
    expect(parseHookEvent(event({ hook_event_name: 'SessionStart', source: 'resume' }))).toEqual({ conversation: session, status: null, pristine: false })
    expect(parseHookEvent(event({ hook_event_name: 'SessionEnd' }))).toEqual({ conversation: session, status: null })
  })

  it('ignores half-written files, unknown events and ids that are not uuids', () => {
    expect(parseHookEvent('{"hook_event_name":"St')).toBeNull()
    expect(parseHookEvent('')).toBeNull()
    expect(parseHookEvent(event({ hook_event_name: 'PreCompact' }))).toBeNull()
    expect(parseHookEvent(JSON.stringify({ hook_event_name: 'Stop', session_id: '../x' }))).toEqual({ status: 'done' })
  })
})
