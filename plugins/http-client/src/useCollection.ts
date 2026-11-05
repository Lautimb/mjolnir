import { useCallback, useEffect, useState } from 'react'
import type { RepoFileEntry, WorkspaceSession } from '@mjolnir/plugin-sdk'
import { useMjolnir } from '@mjolnir/plugin-sdk/react'
import { COLLECTION_DIR } from './model'

export type CollectionState = { status: 'none' } | { status: 'loading' } | { status: 'ready'; entries: RepoFileEntry[] } | { status: 'error'; error: unknown }

export function useCollection(session: WorkspaceSession | null): { state: CollectionState; reload(): void } {
  const { repoFiles } = useMjolnir()
  const [state, setState] = useState<CollectionState>({ status: 'none' })
  const [version, setVersion] = useState(0)
  const repoId = session?.repoId
  const worktree = session?.worktree

  useEffect(() => {
    if (!repoId || !worktree) return setState({ status: 'none' })
    let cancelled = false
    setState({ status: 'loading' })
    repoFiles.list({ repoId, worktree }, COLLECTION_DIR).then(
      (entries) => !cancelled && setState({ status: 'ready', entries }),
      (error: unknown) => !cancelled && setState({ status: 'error', error }),
    )
    return () => {
      cancelled = true
    }
  }, [repoFiles, repoId, worktree, version])

  return { state, reload: useCallback(() => setVersion((current) => current + 1), []) }
}
