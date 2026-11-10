import { describe, expect, it } from 'vitest'
import type { TerminalProfile } from '@mjolnir/core/browser'
import { AGENTS, agentLaunch, sessionAgentStatus, wakeLaunch, withAgentEvent, type Agent, type Tab } from './model'

const [claude, opencode] = AGENTS as [Agent, Agent]
const newId = () => 'c0ffee00-0000-4000-8000-000000000000'
const bash: TerminalProfile = { id: 'bash', label: 'bash', host: { kind: 'posix' }, file: '/bin/bash', args: [] }
const agentTab = (overrides: Partial<Tab> = {}): Tab => ({
  id: 't1',
  sessionKey: 'repo::/wt',
  profile: bash,
  label: 'Claude Code',
  kind: 'agent',
  agent: 'claude',
  ...overrides,
})

describe('agentLaunch', () => {
  it('pins new Claude conversations to an id so the tab can resume exactly that one', () => {
    expect(agentLaunch(claude, { mode: 'new' }, newId)).toEqual({
      conversation: newId(),
      initialInput: `claude --session-id ${newId()}\r`,
    })
    expect(agentLaunch(claude, { mode: 'resume', conversation: newId() }, newId).initialInput).toBe(`claude --resume ${newId()}\r`)
  })

  it('does not know which conversation "latest" picks, so it records none', () => {
    expect(agentLaunch(claude, { mode: 'latest' }, newId)).toEqual({ initialInput: 'claude --continue\r' })
  })

  it('opens opencode without an id because it cannot be chosen up front', () => {
    expect(agentLaunch(opencode, { mode: 'new' }, newId)).toEqual({ initialInput: 'opencode\r' })
  })

  it('appends the prompt reference as a positional argument for Claude and with its flag for opencode', () => {
    const promptArgument = '"$MJOLNIR_PROMPT"'
    expect(agentLaunch(claude, { mode: 'new', promptArgument }, newId).initialInput).toBe(`claude --session-id ${newId()} "$MJOLNIR_PROMPT"\r`)
    expect(agentLaunch(opencode, { mode: 'new', promptArgument }, newId).initialInput).toBe('opencode --prompt "$MJOLNIR_PROMPT"\r')
  })
})

describe('agentLaunch with hooks', () => {
  const settings = '"$MJOLNIR_AGENT_SETTINGS"'

  it('loads the status hooks into Claude and marks a new conversation as not resumable until it gets a prompt', () => {
    expect(agentLaunch(claude, { mode: 'new' }, newId, settings)).toEqual({
      conversation: newId(),
      hooks: true,
      pristine: true,
      initialInput: `claude --session-id ${newId()} --settings ${settings}\r`,
    })
    expect(agentLaunch(claude, { mode: 'resume', conversation: newId() }, newId, settings)).toEqual({
      conversation: newId(),
      hooks: true,
      initialInput: `claude --resume ${newId()} --settings ${settings}\r`,
    })
    expect(agentLaunch(claude, { mode: 'latest' }, newId, settings).initialInput).toBe(`claude --settings ${settings} --continue\r`)
  })

  it('launches without hooks when the shell cannot reference the settings or the agent has none', () => {
    expect(agentLaunch(claude, { mode: 'new' }, newId, null)).toEqual({ conversation: newId(), initialInput: `claude --session-id ${newId()}\r` })
    expect(agentLaunch(opencode, { mode: 'new' }, newId, settings)).toEqual({ initialInput: 'opencode\r' })
  })
})

describe('wakeLaunch', () => {
  it('starts over instead of resuming a conversation that never got a prompt, which Claude cannot find', () => {
    expect(wakeLaunch(agentTab({ conversation: newId(), pristine: true }), [])).toEqual({ mode: 'new' })
  })

  it('resumes the tab conversation when it has one', () => {
    expect(wakeLaunch(agentTab({ conversation: newId() }), [])).toEqual({ mode: 'resume', conversation: newId() })
  })

  it('falls back to the latest conversation only when no other tab of that agent shares the session', () => {
    const tab = agentTab()
    expect(wakeLaunch(tab, [tab, agentTab({ id: 't2', sessionKey: 'other' })])).toEqual({ mode: 'latest' })
    expect(wakeLaunch(tab, [tab, agentTab({ id: 't2' })])).toEqual({ mode: 'new' })
  })
})

describe('withAgentEvent', () => {
  const other = '0b5e7a4c-1d2e-4f30-8a9b-0c1d2e3f4a5b'

  it('follows the conversation when it changes inside the tab and keeps the same tab when nothing changed', () => {
    const tab = agentTab({ conversation: newId(), status: 'working' })
    expect(withAgentEvent(tab, { conversation: other, status: null, pristine: true })).toMatchObject({ conversation: other, status: undefined, pristine: true })
    expect(withAgentEvent(tab, { conversation: newId(), status: 'working' })).toBe(tab)
  })

  it('clears pristine once a prompt is sent', () => {
    expect(withAgentEvent(agentTab({ pristine: true }), { status: 'working', pristine: false }).pristine).toBeUndefined()
  })
})

describe('sessionAgentStatus', () => {
  it('shows what needs attention first', () => {
    const tabs = [agentTab({ status: 'done' }), agentTab({ status: 'waiting' }), agentTab({ status: 'working' })]
    expect(sessionAgentStatus(tabs)).toBe('waiting')
    expect(sessionAgentStatus(tabs.slice(0, 1).concat(tabs.slice(2)))).toBe('working')
    expect(sessionAgentStatus([agentTab()])).toBeUndefined()
  })
})
