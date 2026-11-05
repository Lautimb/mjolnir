import { useCallback, useState } from 'react'
import type { Tab } from './model'

export type NewTab = Omit<Tab, 'id' | 'sessionKey'>

export function useTerminalTabs() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeBySession, setActiveBySession] = useState<Record<string, string>>({})

  const open = useCallback((sessionKey: string, tab: NewTab) => {
    const id = crypto.randomUUID()
    setTabs((current) => [...current, { ...tab, id, sessionKey }])
    setActiveBySession((current) => ({ ...current, [sessionKey]: id }))
  }, [])

  const activate = useCallback((sessionKey: string, id: string) => {
    setActiveBySession((current) => ({ ...current, [sessionKey]: id }))
  }, [])

  const close = useCallback((predicate: (tab: Tab) => boolean) => {
    setTabs((current) => current.filter((tab) => !predicate(tab)))
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

  return { tabs, open, activate, close, markExited, forSession }
}
