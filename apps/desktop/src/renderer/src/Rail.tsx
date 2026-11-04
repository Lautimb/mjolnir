import { GitCompare, GitPullRequest, Layers, Puzzle, Settings } from 'lucide-react'

export type View = 'sessions' | 'diff' | 'settings'

const SOON = 'Próximamente'

export function Rail({ view, onChange }: { view: View; onChange(view: View): void }) {
  return (
    <nav className="rail" aria-label="Vistas">
      <button
        className={`rail-button${view === 'sessions' ? ' active' : ''}`}
        title="Sesiones"
        onClick={() => onChange('sessions')}
      >
        <Layers size={18} />
      </button>
      <button
        className={`rail-button${view === 'diff' ? ' active' : ''}`}
        title="Diff"
        onClick={() => onChange(view === 'diff' ? 'sessions' : 'diff')}
      >
        <GitCompare size={18} />
      </button>
      <button className="rail-button" title={`Pull requests · ${SOON}`} disabled>
        <GitPullRequest size={18} />
      </button>
      <button className="rail-button" title={`Plugins · ${SOON}`} disabled>
        <Puzzle size={18} />
      </button>
      <div className="rail-spacer" />
      <button
        className={`rail-button${view === 'settings' ? ' active' : ''}`}
        title="Ajustes"
        onClick={() => onChange(view === 'settings' ? 'sessions' : 'settings')}
      >
        <Settings size={18} />
      </button>
    </nav>
  )
}
