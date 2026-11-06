import { describe, expect, it } from 'vitest'
import type { TerminalProfile } from '@mjolnir/core/browser'
import { AGENTS, agentLaunch, wakeLaunch, type Agent, type Tab } from './model'

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
})

describe('wakeLaunch', () => {
  it('resumes the tab conversation when it has one', () => {
    expect(wakeLaunch(agentTab({ conversation: newId() }), [])).toEqual({ mode: 'resume', conversation: newId() })
  })

  it('falls back to the latest conversation only when no other tab of that agent shares the session', () => {
    const tab = agentTab()
    expect(wakeLaunch(tab, [tab, agentTab({ id: 't2', sessionKey: 'other' })])).toEqual({ mode: 'latest' })
    expect(wakeLaunch(tab, [tab, agentTab({ id: 't2' })])).toEqual({ mode: 'new' })
  })
})
