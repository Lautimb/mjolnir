import { useEffect, useState } from 'react'
import type { Session } from './model'

const POLL_MS = 5000

export function useChangedFiles(session: Session): number | null {
  const [changes, setChanges] = useState<number | null>(null)
  const repoId = session.repo?.id
  const path = session.worktree?.path

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

  return changes
}
