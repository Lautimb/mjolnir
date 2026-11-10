import { useCallback, useEffect, useRef, useState } from 'react'
import { AGENT_SETTINGS_ENV, envReference, type AgentEvent, type TerminalProfile } from '@mjolnir/core/browser'
import type { SavedTabs } from '../../../shared/api'
import { AGENTS, agentLaunch, wakeLaunch, withAgentEvent, type Tab } from './model'
import { fromSaved, toSaved } from './persistence'

export type NewTab = Omit<Tab, 'id' | 'sessionKey'>

export function useTerminalTabs() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeBySession, setActiveBySession] = useState<Record<string, string>>({})
  const [restored, setRestored] = useState(false)

  const lastSaved = useRef('')
  useEffect(() => {
    if (!restored) return
    const state = toSaved(tabs, activeBySession)
    const serialized = JSON.stringify(state)
    if (serialized === lastSaved.current) return
    lastSaved.current = serialized
    window.mjolnir.tabs.save(state)
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
        const launch = agent && agentLaunch(agent, wakeLaunch(tab, current), () => crypto.randomUUID(), envReference(tab.profile, AGENT_SETTINGS_ENV))
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
    setTabs((current) => current.map((tab) => (tab.id === id ? { ...tab, exitCode, status: undefined } : tab)))
  }, [])

  useEffect(
    () =>
      window.mjolnir.pty.onAgentEvent((id: string, event: AgentEvent) => {
        setTabs((current) => {
          const next = current.map((tab) => (tab.id === id ? withAgentEvent(tab, event) : tab))
          return next.some((tab, index) => tab !== current[index]) ? next : current
        })
      }),
    [],
  )

  const forSession = (sessionKey: string) => {
    const sessionTabs = tabs.filter((tab) => tab.sessionKey === sessionKey)
    const stored = activeBySession[sessionKey]
    const activeId = sessionTabs.some((tab) => tab.id === stored) ? stored : sessionTabs.at(-1)?.id
    return { tabs: sessionTabs, activeId }
  }

  return { tabs, restore, open, wake, activate, close, markExited, forSession }
}
