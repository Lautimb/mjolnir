import { useCallback, useEffect, useState } from 'react'
import type { Repo, Worktree } from '@mjolnir/core/browser'

const api = () => window.mjolnir

export function useWorkspace() {
  const [repos, setRepos] = useState<Repo[]>([])
  const [worktrees, setWorktrees] = useState<Record<string, Worktree[]>>({})
  const [errors, setErrors] = useState<Record<string, unknown>>({})

  const loadWorktrees = useCallback(async (repoId: string) => {
    try {
      const list = await api().worktrees.list(repoId)
      setWorktrees((current) => ({ ...current, [repoId]: list }))
      setErrors(({ [repoId]: _, ...rest }) => rest)
    } catch (error) {
      setErrors((current) => ({ ...current, [repoId]: error }))
    }
  }, [])

  const refresh = useCallback(async () => {
    const list = await api().repos.list()
    setRepos(list)
    await Promise.all(list.map((repo) => loadWorktrees(repo.id)))
  }, [loadWorktrees])

  useEffect(() => {
    void refresh()
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const addRepo = useCallback(async (request: () => Promise<Repo | null>) => {
    const repo = await request()
    if (!repo) return null
    setRepos((current) => (current.some((r) => r.id === repo.id) ? current : [...current, repo]))
    await loadWorktrees(repo.id)
    return repo
  }, [loadWorktrees])

  const removeRepo = useCallback(async (repoId: string) => {
    await api().repos.remove(repoId)
    setRepos((current) => current.filter((repo) => repo.id !== repoId))
    setWorktrees(({ [repoId]: _, ...rest }) => rest)
  }, [])

  const createWorktree = useCallback(
    async (repoId: string, branch: string, base: string) => {
      const worktree = await api().worktrees.create(repoId, branch, base)
      await loadWorktrees(repoId)
      return worktree
    },
    [loadWorktrees],
  )

  const removeWorktree = useCallback(
    async (repoId: string, path: string, force: boolean) => {
      await api().worktrees.remove(repoId, path, force)
      await loadWorktrees(repoId)
    },
    [loadWorktrees],
  )

  return { repos, worktrees, errors, addRepo, removeRepo, createWorktree, removeWorktree }
}
