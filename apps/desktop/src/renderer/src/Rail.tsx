import { GitCompare, GitPullRequest, Layers, Puzzle, Settings } from 'lucide-react'
import { useI18n } from './i18n/I18nProvider'

export type View = 'sessions' | 'diff' | 'settings'

export function Rail({ view, onChange }: { view: View; onChange(view: View): void }) {
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
        title={t('rail.diff')}
        onClick={() => onChange(view === 'diff' ? 'sessions' : 'diff')}
      >
        <GitCompare size={18} />
      </button>
      <button className="rail-button" title={t('common.soon', { feature: t('rail.pullRequests') })} disabled>
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
