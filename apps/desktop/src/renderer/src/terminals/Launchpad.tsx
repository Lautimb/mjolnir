import type { ReactNode } from 'react'
import { Sparkles, SquareTerminal } from 'lucide-react'
import type { TerminalProfile } from '@mjolnir/core/browser'
import { useI18n } from '../i18n/I18nProvider'
import type { Session } from '../sessions/model'
import { AGENTS, type Agent } from './model'

interface Props {
  session: Session
  defaultProfile: TerminalProfile | undefined
  onOpenShell(profile: TerminalProfile): void
  onOpenAgent(agent: Agent): void
}

function LaunchCard({ icon, title, detail, onClick }: { icon: ReactNode; title: string; detail: string; onClick(): void }) {
  return (
    <button
      className="flex w-42 flex-col items-start gap-2 rounded-lg border border-line-strong bg-surface px-4 py-3 text-left hover:border-accent hover:bg-raised"
      onClick={onClick}
    >
      <span className="text-accent">{icon}</span>
      <strong className="font-medium">{title}</strong>
      <span className="text-xs text-muted">{detail}</span>
    </button>
  )
}

export function Launchpad({ session, defaultProfile, onOpenShell, onOpenAgent }: Props) {
  const { t } = useI18n()
  const note = 'max-w-[460px] font-mono text-sm break-all text-muted'
  return (
    <div className="absolute inset-0 grid place-content-center justify-items-center gap-4 p-6 text-center">
      <h2 className="text-xl font-semibold">{session.title}</h2>
      {session.cwd && <p className={note}>{session.cwd}</p>}
      {defaultProfile ? (
        <div className="flex flex-wrap justify-center gap-2">
          <LaunchCard
            icon={<SquareTerminal size={18} />}
            title={t('launchpad.terminal')}
            detail={defaultProfile.label}
            onClick={() => onOpenShell(defaultProfile)}
          />
          {AGENTS.map((agent) => (
            <LaunchCard
              key={agent.id}
              icon={<Sparkles size={18} />}
              title={agent.label}
              detail={t(`agents.${agent.id}`)}
              onClick={() => onOpenAgent(agent)}
            />
          ))}
        </div>
      ) : (
        <p className={note}>{t('errors.noTerminal')}</p>
      )}
    </div>
  )
}
