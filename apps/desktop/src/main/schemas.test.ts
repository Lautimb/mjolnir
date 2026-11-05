import { describe, expect, it } from 'vitest'
import { savedTabs } from './schemas'

const tab = { id: 't1', sessionKey: 'repo::/wt', kind: 'agent', profileId: 'bash', label: 'Claude Code', agent: 'claude' }

describe('savedTabs', () => {
  it('only accepts UUIDs as conversation ids because they are typed into the shell', () => {
    expect(savedTabs.safeParse({ tabs: [{ ...tab, conversation: 'c0ffee00-0000-4000-8000-000000000000' }], active: {} }).success).toBe(true)
    expect(savedTabs.safeParse({ tabs: [{ ...tab, conversation: 'x; rm -rf ~' }], active: {} }).success).toBe(false)
  })
})
