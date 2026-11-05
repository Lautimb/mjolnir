import type { ReactNode } from 'react'
import { GitCompare, GitPullRequest, Layers, Puzzle, Settings } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { cx } from '../ui/cx'

export type View = 'sessions' | 'diff' | 'pulls' | 'settings'

const MAX_BADGE = 99

interface ItemProps {
  title: string
  active?: boolean
  disabled?: boolean
  onClick?(): void
  children: ReactNode
}

function RailItem({ title, active, disabled, onClick, children }: ItemProps) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'relative grid size-9 place-items-center rounded-md enabled:hover:bg-hover enabled:hover:text-fg disabled:opacity-45',
        active
          ? 'text-fg before:absolute before:inset-y-2 before:-left-1.5 before:w-0.5 before:rounded-full before:bg-accent panel-right:before:right-[-6px] panel-right:before:left-auto'
          : 'text-subtle',
      )}
    >
      {children}
    </button>
  )
}

interface Props {
  view: View
  changes: number | null
  onChange(view: View): void
}

export function Rail({ view, changes, onChange }: Props) {
  const { t } = useI18n()
  const toggle = (target: View) => onChange(view === target ? 'sessions' : target)

  return (
    <nav
      aria-label={t('rail.label')}
      className="flex flex-col items-center gap-1 border-r border-line bg-surface py-2 [grid-area:rail] panel-right:border-r-0 panel-right:border-l"
    >
      <RailItem title={t('rail.sessions')} active={view === 'sessions'} onClick={() => onChange('sessions')}>
        <Layers size={18} />
      </RailItem>
      <RailItem
        title={changes ? `${t('rail.diff')} · ${t('statusBar.changedFiles', { count: changes })}` : t('rail.diff')}
        active={view === 'diff'}
        onClick={() => toggle('diff')}
      >
        <GitCompare size={18} />
        {!!changes && (
          <span
            aria-label={t('statusBar.changedFiles', { count: changes })}
            className="pointer-events-none absolute top-[3px] right-px h-4 min-w-4 rounded-full bg-accent px-1 text-center text-2xs font-bold text-on-accent tabular-nums shadow-[0_0_0_2px_var(--color-surface)]"
          >
            {changes > MAX_BADGE ? `${MAX_BADGE}+` : changes}
          </span>
        )}
      </RailItem>
      <RailItem title={t('rail.pullRequests')} active={view === 'pulls'} onClick={() => toggle('pulls')}>
        <GitPullRequest size={18} />
      </RailItem>
      <RailItem title={t('common.soon', { feature: t('rail.plugins') })} disabled>
        <Puzzle size={18} />
      </RailItem>
      <div className="flex-1" />
      <RailItem title={t('rail.settings')} active={view === 'settings'} onClick={() => toggle('settings')}>
        <Settings size={18} />
      </RailItem>
    </nav>
  )
}
