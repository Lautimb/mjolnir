import { Sparkles, SquareTerminal } from 'lucide-react'
import type { TerminalProfile } from '@mjolnir/core/browser'
import { AGENTS, type Agent, type Session } from './model'

interface Props {
  session: Session
  defaultProfile: TerminalProfile | undefined
  onOpenShell(profile: TerminalProfile): void
  onOpenAgent(agent: Agent): void
}

export function Launchpad({ session, defaultProfile, onOpenShell, onOpenAgent }: Props) {
  return (
    <div className="launchpad">
      <h2>{session.title}</h2>
      {session.cwd && <p>{session.cwd}</p>}
      {defaultProfile ? (
        <div className="launchpad-actions">
          <button className="launch-card" onClick={() => onOpenShell(defaultProfile)}>
            <SquareTerminal size={18} />
            <strong>Terminal</strong>
            <span>{defaultProfile.label}</span>
          </button>
          {AGENTS.map((agent) => (
            <button key={agent.id} className="launch-card" onClick={() => onOpenAgent(agent)}>
              <Sparkles size={18} />
              <strong>{agent.label}</strong>
              <span>{agent.description}</span>
            </button>
          ))}
        </div>
      ) : (
        <p>No hay una terminal disponible para este host.</p>
      )}
    </div>
  )
}
