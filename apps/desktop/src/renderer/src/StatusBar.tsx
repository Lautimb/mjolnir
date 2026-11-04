import { useEffect, useState } from 'react'
import { FileDiff, GitBranch, Server } from 'lucide-react'
import { hostLabel, useI18n } from './i18n/I18nProvider'
import type { Session } from './model'

const POLL_MS = 5000

export function StatusBar({ session, onOpenDiff }: { session: Session; onOpenDiff(): void }) {
  const { t } = useI18n()
  const [changes, setChanges] = useState<number | null>(null)
  const { repo, worktree } = session
  const repoId = repo?.id
  const path = worktree?.path

  useEffect(() => {
    setChanges(null)
    if (!repoId || !path) return
    let cancelled = false
    const poll = () =>
      window.mjolnir.worktrees.changedFiles(repoId, path).then(
        (count) => !cancelled && setChanges(count),
        () => !cancelled && setChanges(null),
      )
    void poll()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [repoId, path])

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
