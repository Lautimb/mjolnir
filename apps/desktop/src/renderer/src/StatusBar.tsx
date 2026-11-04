import { useEffect, useState } from 'react'
import { FileDiff, GitBranch, Server } from 'lucide-react'
import { hostLabel } from '@mjolnir/core/browser'
import type { Session } from './model'

const POLL_MS = 5000

export function StatusBar({ session }: { session: Session }) {
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
        {hostLabel(session.host)}
      </span>
      {worktree && (
        <span className="status-item">
          <GitBranch size={12} />
          {session.title}
        </span>
      )}
      {changes !== null && (
        <span className="status-item">
          <FileDiff size={12} />
          {changes === 0 ? 'Sin cambios' : `${changes} ${changes === 1 ? 'archivo cambiado' : 'archivos cambiados'}`}
        </span>
      )}
      <span className="status-spacer" />
      {repo && <span className="status-item">{repo.name}</span>}
    </footer>
  )
}
