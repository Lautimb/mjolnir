import { Sparkles, SquareTerminal } from 'lucide-react'
import type { TerminalProfile } from '@mjolnir/core/browser'
import { useI18n } from './i18n/I18nProvider'
import { AGENTS, type Agent, type Session } from './model'

interface Props {
  session: Session
  defaultProfile: TerminalProfile | undefined
  onOpenShell(profile: TerminalProfile): void
  onOpenAgent(agent: Agent): void
}

export function Launchpad({ session, defaultProfile, onOpenShell, onOpenAgent }: Props) {
  const { t } = useI18n()
  return (
    <div className="launchpad">
      <h2>{session.title}</h2>
      {session.cwd && <p>{session.cwd}</p>}
      {defaultProfile ? (
        <div className="launchpad-actions">
          <button className="launch-card" onClick={() => onOpenShell(defaultProfile)}>
            <SquareTerminal size={18} />
            <strong>{t('launchpad.terminal')}</strong>
            <span>{defaultProfile.label}</span>
          </button>
          {AGENTS.map((agent) => (
            <button key={agent.id} className="launch-card" onClick={() => onOpenAgent(agent)}>
              <Sparkles size={18} />
              <strong>{agent.label}</strong>
              <span>{t(`agents.${agent.id}`)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p>{t('errors.noTerminal')}</p>
      )}
    </div>
  )
}
