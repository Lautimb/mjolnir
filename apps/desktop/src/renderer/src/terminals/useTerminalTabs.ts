import { useCallback, useEffect, useState } from 'react'
import type { TerminalProfile } from '@mjolnir/core/browser'
import type { SavedTabs } from '../../../shared/api'
import { AGENTS, agentLaunch, wakeLaunch, type Tab } from './model'
import { fromSaved, toSaved } from './persistence'

export type NewTab = Omit<Tab, 'id' | 'sessionKey'>

export function useTerminalTabs() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeBySession, setActiveBySession] = useState<Record<string, string>>({})
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    if (restored) window.mjolnir.tabs.save(toSaved(tabs, activeBySession))
  }, [restored, tabs, activeBySession])

  const restore = useCallback((saved: SavedTabs, profiles: TerminalProfile[]) => {
    setTabs((current) => [...fromSaved(saved, profiles), ...current])
    setActiveBySession((current) => ({ ...saved.active, ...current }))
    setRestored(true)
  }, [])

  const open = useCallback((sessionKey: string, tab: NewTab) => {
    const id = crypto.randomUUID()
    setTabs((current) => [...current, { ...tab, id, sessionKey }])
    setActiveBySession((current) => ({ ...current, [sessionKey]: id }))
  }, [])

  const wake = useCallback((id: string) => {
    setTabs((current) =>
      current.map((tab) => {
        if (tab.id !== id || !tab.dormant) return tab
        const agent = AGENTS.find((candidate) => candidate.id === tab.agent)
        const launch = agent && agentLaunch(agent, wakeLaunch(tab, current), () => crypto.randomUUID())
        return { ...tab, ...launch, dormant: false }
      }),
    )
  }, [])

  const activate = useCallback((sessionKey: string, id: string) => {
    setActiveBySession((current) => ({ ...current, [sessionKey]: id }))
  }, [])

  const close = useCallback((predicate: (tab: Tab) => boolean) => {
    setTabs((current) => (current.some(predicate) ? current.filter((tab) => !predicate(tab)) : current))
  }, [])

  const markExited = useCallback((id: string, exitCode: number) => {
    setTabs((current) => current.map((tab) => (tab.id === id ? { ...tab, exitCode } : tab)))
  }, [])

  const forSession = (sessionKey: string) => {
    const sessionTabs = tabs.filter((tab) => tab.sessionKey === sessionKey)
    const stored = activeBySession[sessionKey]
    const activeId = sessionTabs.some((tab) => tab.id === stored) ? stored : sessionTabs.at(-1)?.id
    return { tabs: sessionTabs, activeId }
  }

  return { tabs, restore, open, wake, activate, close, markExited, forSession }
}
