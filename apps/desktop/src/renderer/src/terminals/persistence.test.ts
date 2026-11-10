import { describe, expect, it } from 'vitest'
import type { TerminalProfile } from '@mjolnir/core/browser'
import type { Tab } from './model'
import { fromSaved, toSaved } from './persistence'

const bash: TerminalProfile = { id: 'bash', label: 'bash', host: { kind: 'posix' }, file: '/bin/bash', args: [] }
const key = 'repo-1::/home/me/code/app'

const tab = (overrides: Partial<Tab> = {}): Tab => ({
  id: 't1',
  sessionKey: key,
  profile: bash,
  label: 'bash',
  kind: 'shell',
  ...overrides,
})

describe('terminal tab persistence', () => {
  it('saves what the tab is, not its runtime state', () => {
    const saved = toSaved([tab({ initialInput: 'claude\r', exitCode: 0, cwd: '/tmp' })], {})
    expect(saved.tabs).toEqual([{ id: 't1', sessionKey: key, kind: 'shell', profileId: 'bash', label: 'bash' }])
  })

  it('drops active entries that point to tabs that no longer exist', () => {
    expect(toSaved([tab()], { [key]: 't1', other: 'gone' }).active).toEqual({ [key]: 't1' })
  })

  it('restores tabs dormant, in the session worktree, without relaunching anything', () => {
    const conversation = 'c0ffee00-0000-4000-8000-000000000000'
    const [restored] = fromSaved(toSaved([tab({ kind: 'agent', agent: 'claude', label: 'Claude Code', conversation })], {}), [bash])
    expect(restored).toEqual({
      id: 't1',
      sessionKey: key,
      profile: bash,
      label: 'Claude Code',
      kind: 'agent',
      agent: 'claude',
      conversation,
      cwd: '/home/me/code/app',
      dormant: true,
    })
  })

  it('keeps whether the conversation never got a prompt, but not the live status', () => {
    const agent = tab({ kind: 'agent', agent: 'claude', label: 'Claude Code', conversation: 'c0ffee00-0000-4000-8000-000000000000', pristine: true, status: 'working', hooks: true })
    const [restored] = fromSaved(toSaved([agent], {}), [bash])
    expect(restored).toMatchObject({ pristine: true })
    expect(restored).not.toHaveProperty('status')
    expect(restored).not.toHaveProperty('hooks')
  })

  it('skips tabs whose profile or agent is no longer available', () => {
    const saved = toSaved([tab({ id: 'a' }), tab({ id: 'b', profile: { ...bash, id: 'zsh' } }), tab({ id: 'c', kind: 'agent' })], {})
    expect(fromSaved(saved, [bash]).map((restored) => restored.id)).toEqual(['a'])
  })
})
