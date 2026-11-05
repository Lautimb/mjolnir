import { useCallback, useRef, useState } from 'react'
import { Plus, Sparkles, SquareTerminal, X } from 'lucide-react'
import type { TerminalProfile } from '@mjolnir/core/browser'
import { useI18n } from '../i18n/I18nProvider'
import { IconButton } from '../ui/Button'
import { cx } from '../ui/cx'
import { HOST_TEXT } from '../ui/hosts'
import { MenuDivider, MenuItem, MenuSection, popover } from '../ui/Menu'
import { useDismiss } from '../ui/useDismiss'
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
  const { t } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useDismiss(menuOpen, [menuRef], useCallback(() => setMenuOpen(false), []))

  const pick = (action: () => void) => () => {
    setMenuOpen(false)
    action()
  }

  return (
    <header className="flex h-tabbar flex-none items-stretch border-b border-line bg-surface select-none">
      <div className="flex min-w-0 [scrollbar-width:none] overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.kind === 'agent' ? Sparkles : SquareTerminal
          const active = tab.id === activeId
          return (
            <div
              key={tab.id}
              className={cx(
                'flex max-w-[220px] flex-none cursor-pointer items-center gap-2 border-r border-line pr-1 pl-3',
                active ? 'bg-canvas text-fg shadow-[inset_0_2px_0_var(--color-accent)]' : 'text-muted hover:bg-hover hover:text-fg',
              )}
              title={`${tab.label} · ${tab.profile.label}`}
              onClick={() => onActivate(tab.id)}
              onAuxClick={(event) => event.button === 1 && onClose(tab.id)}
            >
              <Icon size={14} className={cx('flex-none', tab.kind === 'agent' ? 'text-accent' : HOST_TEXT[tab.profile.host.kind])} />
              <span className={cx('truncate', tab.exitCode !== undefined && 'line-through opacity-50')}>{tab.label}</span>
              <IconButton
                small
                className="opacity-60 hover:opacity-100"
                aria-label={t('common.close')}
                onClick={(event) => {
                  event.stopPropagation()
                  onClose(tab.id)
                }}
              >
                <X size={13} />
              </IconButton>
            </div>
          )
        })}
      </div>
      <div className="relative flex items-center px-2" ref={menuRef}>
        <IconButton aria-label={t('tabs.newTab')} onClick={() => setMenuOpen((open) => !open)}>
          <Plus size={16} />
        </IconButton>
        {menuOpen && (
          <div role="menu" className={cx(popover, 'absolute top-[calc(100%+2px)] left-1 z-20 min-w-[220px] p-1')}>
            <MenuSection>{t('tabs.agents')}</MenuSection>
            {AGENTS.map((agent) => (
              <MenuItem key={agent.id} onClick={pick(() => onOpenAgent(agent))}>
                <Sparkles size={14} className="text-accent" />
                {agent.label}
              </MenuItem>
            ))}
            <MenuDivider />
            <MenuSection>{t('tabs.terminals')}</MenuSection>
            {profiles.map((profile) => (
              <MenuItem key={profile.id} onClick={pick(() => onOpenShell(profile))}>
                <SquareTerminal size={14} className={HOST_TEXT[profile.host.kind]} />
                {profile.label}
              </MenuItem>
            ))}
          </div>
        )}
      </div>
    </header>
  )
}
