import { FileDiff, GitBranch, Server } from 'lucide-react'
import { hostLabel, useI18n } from './i18n/I18nProvider'
import type { Session } from './model'

interface Props {
  session: Session
  changes: number | null
  onOpenDiff(): void
}

export function StatusBar({ session, changes, onOpenDiff }: Props) {
  const { t } = useI18n()
  const { repo, worktree } = session

  return (
    <footer className="statusbar">
      <span className={`status-item host host-${session.host.kind}`}>
        <Server size={12} />
        {hostLabel(t, session.host)}
      </span>
      {worktree && (
        <span className="status-item">
          <GitBranch size={12} />
          {session.title}
        </span>
      )}
      {changes !== null && (
        <button className="status-item status-link" title={t('statusBar.openDiff')} onClick={onOpenDiff}>
          <FileDiff size={12} />
          {changes === 0 ? t('statusBar.noChanges') : t('statusBar.changedFiles', { count: changes })}
        </button>
      )}
      <span className="status-spacer" />
      {repo && <span className="status-item">{repo.name}</span>}
    </footer>
  )
}
