import { useMemo } from 'react'
import type { Repo, Worktree } from '@mjolnir/core/browser'
import { useI18n } from '../i18n/I18nProvider'
import { SCRATCH_KEY, worktreeSession, type Session } from './model'

export function useSessions(repos: Repo[], worktrees: Record<string, Worktree[]>): Map<string, Session> {
  const { t } = useI18n()
  return useMemo(() => {
    const sessions = new Map<string, Session>()
    sessions.set(SCRATCH_KEY, { key: SCRATCH_KEY, host: window.mjolnir.appHost, title: t('sidebar.scratch') })
    for (const repo of repos) {
      for (const worktree of worktrees[repo.id] ?? []) {
        const session = worktreeSession(repo, worktree)
        sessions.set(session.key, session)
      }
    }
    return sessions
  }, [repos, worktrees, t])
}
