import { useEffect, useRef, useState } from 'react'
import { Plus, Sparkles, SquareTerminal, X } from 'lucide-react'
import type { TerminalProfile } from '@mjolnir/core/browser'
import { AGENTS, type Agent, type Tab } from './model'

interface Props {
  tabs: Tab[]
  activeId: string | undefined
  profiles: TerminalProfile[]
  onActivate(id: string): void
  onClose(id: string): void
  onOpenShell(profile: TerminalProfile): void
  onOpenAgent(agent: Agent): void
}

export function TabBar({ tabs, activeId, profiles, onActivate, onClose, onOpenShell, onOpenAgent }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onMouseDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const pick = (action: () => void) => () => {
    setMenuOpen(false)
    action()
  }

  return (
    <header className="tabbar">
      <div className="tabs">
        {tabs.map((tab) => {
          const Icon = tab.kind === 'agent' ? Sparkles : SquareTerminal
          return (
            <div
              key={tab.id}
              className={[
                'tab',
                `host-${tab.profile.host.kind}`,
                tab.kind,
                tab.id === activeId && 'active',
                tab.exitCode !== undefined && 'exited',
              ]
                .filter(Boolean)
                .join(' ')}
              title={`${tab.label} · ${tab.profile.label}`}
              onClick={() => onActivate(tab.id)}
              onAuxClick={(event) => event.button === 1 && onClose(tab.id)}
            >
              <Icon size={14} className="tab-icon" />
              <span className="tab-label">{tab.label}</span>
              <button
                className="icon-button"
                aria-label="Cerrar"
                onClick={(event) => {
                  event.stopPropagation()
                  onClose(tab.id)
                }}
              >
                <X size={13} />
              </button>
            </div>
          )
        })}
      </div>
      <div className="new-tab" ref={menuRef}>
        <button className="icon-button" aria-label="Nueva pestaña" onClick={() => setMenuOpen((open) => !open)}>
          <Plus size={16} />
        </button>
        {menuOpen && (
          <div className="menu" role="menu">
            <div className="menu-section">Agentes</div>
            {AGENTS.map((agent) => (
              <button key={agent.id} className="menu-item" role="menuitem" onClick={pick(() => onOpenAgent(agent))}>
                <Sparkles size={14} />
                {agent.label}
              </button>
            ))}
            <div className="menu-divider" />
            <div className="menu-section">Terminales</div>
            {profiles.map((profile) => (
              <button
                key={profile.id}
                className={`menu-item host-${profile.host.kind}`}
                role="menuitem"
                onClick={pick(() => onOpenShell(profile))}
              >
                <SquareTerminal size={14} />
                {profile.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  )
}
