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
  onOpenAgent(agent: Agent, resume: boolean): void
}

const card = 'flex w-42 flex-col items-start gap-2 rounded-lg border border-line-strong bg-surface px-4 py-3 text-left'

function CardBody({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <>
      <span className="text-accent">{icon}</span>
      <strong className="font-medium">{title}</strong>
      <span className="text-xs text-muted">{detail}</span>
    </>
  )
}

function AgentCard({ agent, onOpen }: { agent: Agent; onOpen(resume: boolean): void }) {
  const { t } = useI18n()
  const action = 'rounded border border-line-strong px-2 py-0.5 hover:border-accent hover:bg-raised'
  return (
    <div className={card}>
      <CardBody icon={<Sparkles size={18} />} title={agent.label} detail={t(`agents.${agent.id}`)} />
      <div className="flex flex-wrap gap-1.5 text-xs">
        <button className={action} onClick={() => onOpen(true)}>
          {t('launchpad.continue')}
        </button>
        <button className={action} onClick={() => onOpen(false)}>
          {t('launchpad.newConversation')}
        </button>
      </div>
    </div>
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
          <button className={`${card} hover:border-accent hover:bg-raised`} onClick={() => onOpenShell(defaultProfile)}>
            <CardBody icon={<SquareTerminal size={18} />} title={t('launchpad.terminal')} detail={defaultProfile.label} />
          </button>
          {AGENTS.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onOpen={(resume) => onOpenAgent(agent, resume)} />
          ))}
        </div>
      ) : (
        <p className={note}>{t('errors.noTerminal')}</p>
      )}
    </div>
  )
}
