import type { TerminalProfile } from '@mjolnir/core/browser'
import type { SavedTab, SavedTabs } from '../../../shared/api'
import { sessionCwd } from '../sessions/model'
import { AGENTS, type Tab } from './model'

export function toSaved(tabs: Tab[], active: Record<string, string>): SavedTabs {
  const saved = tabs.map(({ id, sessionKey, kind, profile, label, agent, conversation, pristine }): SavedTab => ({
    id,
    sessionKey,
    kind,
    profileId: profile.id,
    label,
    ...(agent && { agent }),
    ...(conversation && { conversation }),
    ...(pristine && { pristine }),
  }))
  const ids = new Set(saved.map((tab) => tab.id))
  return { tabs: saved, active: Object.fromEntries(Object.entries(active).filter(([, id]) => ids.has(id))) }
}

export function fromSaved(saved: SavedTabs, profiles: TerminalProfile[]): Tab[] {
  return saved.tabs.flatMap((entry): Tab[] => {
    const profile = profiles.find((candidate) => candidate.id === entry.profileId)
    if (!profile) return []
    const base = { id: entry.id, sessionKey: entry.sessionKey, profile, label: entry.label, cwd: sessionCwd(entry.sessionKey), dormant: true }
    if (entry.kind === 'shell') return [{ ...base, kind: 'shell' }]
    const agent = AGENTS.find((candidate) => candidate.id === entry.agent)
    if (!agent) return []
    return [{ ...base, kind: 'agent', agent: agent.id, ...(entry.conversation && { conversation: entry.conversation }), ...(entry.pristine && { pristine: true }) }]
  })
}
