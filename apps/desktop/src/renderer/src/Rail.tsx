import { GitCompare, GitPullRequest, Layers, Puzzle, Settings } from 'lucide-react'
import { useI18n } from './i18n/I18nProvider'

export type View = 'sessions' | 'diff' | 'pulls' | 'settings'

const MAX_BADGE = 99

interface Props {
  view: View
  changes: number | null
  onChange(view: View): void
}

export function Rail({ view, changes, onChange }: Props) {
  const { t } = useI18n()
  return (
    <nav className="rail" aria-label={t('rail.label')}>
      <button
        className={`rail-button${view === 'sessions' ? ' active' : ''}`}
        title={t('rail.sessions')}
        onClick={() => onChange('sessions')}
      >
        <Layers size={18} />
      </button>
      <button
        className={`rail-button${view === 'diff' ? ' active' : ''}`}
        title={changes ? `${t('rail.diff')} · ${t('statusBar.changedFiles', { count: changes })}` : t('rail.diff')}
        onClick={() => onChange(view === 'diff' ? 'sessions' : 'diff')}
      >
        <GitCompare size={18} />
        {!!changes && (
          <span className="rail-badge" aria-label={t('statusBar.changedFiles', { count: changes })}>
            {changes > MAX_BADGE ? `${MAX_BADGE}+` : changes}
          </span>
        )}
      </button>
      <button
        className={`rail-button${view === 'pulls' ? ' active' : ''}`}
        title={t('rail.pullRequests')}
        onClick={() => onChange(view === 'pulls' ? 'sessions' : 'pulls')}
      >
        <GitPullRequest size={18} />
      </button>
      <button className="rail-button" title={t('common.soon', { feature: t('rail.plugins') })} disabled>
        <Puzzle size={18} />
      </button>
      <div className="rail-spacer" />
      <button
        className={`rail-button${view === 'settings' ? ' active' : ''}`}
        title={t('rail.settings')}
        onClick={() => onChange(view === 'settings' ? 'sessions' : 'settings')}
      >
        <Settings size={18} />
      </button>
    </nav>
  )
}
