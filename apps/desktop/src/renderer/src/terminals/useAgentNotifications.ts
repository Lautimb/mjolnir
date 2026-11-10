import { useEffect, useRef } from 'react'
import type { AgentStatus } from '@mjolnir/core/browser'
import { useI18n } from '../i18n/I18nProvider'
import type { Tab } from './model'

const NOTIFIED: AgentStatus[] = ['waiting', 'done']

export function useAgentNotifications(tabs: Tab[], sessionName: (sessionKey: string) => string, onOpen: (tab: Tab) => void) {
  const { t } = useI18n()
  const latest = useRef({ tabs, sessionName, onOpen, t })
  latest.current = { tabs, sessionName, onOpen, t }
  const seen = useRef(new Map<string, AgentStatus | undefined>())

  useEffect(() => {
    const previous = seen.current
    seen.current = new Map(tabs.map((tab) => [tab.id, tab.status]))
    if (document.hasFocus()) return
    const { sessionName: name, t: translate } = latest.current
    for (const tab of tabs) {
      if (!tab.status || !NOTIFIED.includes(tab.status) || !previous.has(tab.id) || previous.get(tab.id) === tab.status) continue
      const session = name(tab.sessionKey)
      const body = tab.status === 'waiting' ? translate('agents.notify.waiting', { session }) : translate('agents.notify.done', { session })
      window.mjolnir.window.notify(tab.id, tab.label, body)
    }
  }, [tabs])

  useEffect(
    () =>
      window.mjolnir.window.onNotificationClick((id) => {
        const tab = latest.current.tabs.find((candidate) => candidate.id === id)
        if (tab) latest.current.onOpen(tab)
      }),
    [],
  )
}
