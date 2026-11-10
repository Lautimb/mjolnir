import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileChange } from '@mjolnir/core/browser'
import type { CommitDiff, HistoryScope, SessionHistory } from '../../../shared/api'
import { describeError, useI18n } from '../i18n/I18nProvider'
import { useRelativeTime } from '../i18n/useRelativeTime'
import { Button } from '../ui/Button'
import { cx, eyebrow } from '../ui/cx'
import { Note } from '../ui/EmptyState'
import { Segmented } from '../ui/Segmented'
import { DiffBrowser } from './DiffBrowser'
import type { PathRoot } from './PathMenu'
import { Stats } from './Stats'

const PAGE = 50
const POLL_MS = 10_000
const SHORT_SHA = 7

type Selected = { state: 'loading' } | { state: 'error'; error: unknown } | { state: 'ready'; diff: CommitDiff }

interface Props {
  repoId: string
  path: string
  root: PathRoot
  sideBySide: boolean
  tree: boolean
  onTreeChange(tree: boolean): void
  reloadToken: number
}

export function CommitHistory({ repoId, path, root, sideBySide, tree, onTreeChange, reloadToken }: Props) {
  const { t } = useI18n()
  const ago = useRelativeTime()
  const [scope, setScope] = useState<HistoryScope>('branch')
  const [limit, setLimit] = useState(PAGE)
  const [history, setHistory] = useState<SessionHistory | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [selectedSha, setSelectedSha] = useState<string | null>(null)
  const [selected, setSelected] = useState<Selected>({ state: 'loading' })
  const diffs = useRef(new Map<string, CommitDiff>())

  useEffect(() => {
    let cancelled = false
    const load = () =>
      window.mjolnir.diff.history(repoId, path, scope, limit).then(
        (next) => {
          if (cancelled) return
          setHistory(next)
          setError(null)
        },
        (err: unknown) => !cancelled && setError(err),
      )
    void load()
    const timer = setInterval(load, POLL_MS)
    window.addEventListener('focus', load)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('focus', load)
    }
  }, [repoId, path, scope, limit, reloadToken])

  const commits = history?.commits ?? []
  const current = commits.find((commit) => commit.sha === selectedSha) ?? commits[0]
  const sha = current?.sha

  useEffect(() => {
    if (!sha) return
    const cached = diffs.current.get(sha)
    if (cached) {
      setSelected({ state: 'ready', diff: cached })
      return
    }
    let cancelled = false
    setSelected({ state: 'loading' })
    window.mjolnir.diff.commit(repoId, path, sha).then(
      (diff) => {
        diffs.current.set(sha, diff)
        if (!cancelled) setSelected({ state: 'ready', diff })
      },
      (err: unknown) => !cancelled && setSelected({ state: 'error', error: err }),
    )
    return () => {
      cancelled = true
    }
  }, [repoId, path, sha])

  const loadFile = useCallback(
    (change: FileChange) => {
      if (selected.state !== 'ready') throw new Error('commit not loaded')
      return window.mjolnir.diff.commitFile(repoId, path, selected.diff.from, selected.diff.to, change)
    },
    [repoId, path, selected],
  )

  const changeScope = (next: HistoryScope) => {
    setScope(next)
    setLimit(PAGE)
    setHistory(null)
  }

  const files = selected.state === 'ready' ? selected.diff.files : []
  const totals = files.reduce(
    (sum, file) => ({ additions: sum.additions + (file.additions ?? 0), deletions: sum.deletions + (file.deletions ?? 0) }),
    { additions: 0, deletions: 0 },
  )
  const base = scope === 'branch' ? history?.base : null

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col border-r border-line bg-surface">
        <div className="flex h-9 flex-none items-center gap-2 border-b border-line pr-2 pl-4">
          <span className={cx(eyebrow, 'flex-none text-subtle')}>{t('diff.commitsHeader')}</span>
          {base && (
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-subtle" title={t('diff.baseHint')}>
              {t('diff.versus', { base })}
            </span>
          )}
          <Segmented
            size="xs"
            label={t('diff.historyScope')}
            value={scope}
            options={[
              { value: 'branch', label: t('diff.scope.branch'), title: t('diff.scope.branchHint') },
              { value: 'all', label: t('diff.scope.all'), title: t('diff.scope.allHint') },
            ]}
            onChange={changeScope}
            className="ml-auto [&_button]:px-2"
          />
        </div>
        {error !== null && <Note error>{describeError(t, error)}</Note>}
        {history && commits.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted">{base ? t('diff.emptyHistoryBranch', { base }) : t('diff.emptyHistory')}</p>
        )}
        <ul className="min-h-0 flex-1 overflow-y-auto py-2">
          {commits.map((commit) => (
            <li key={commit.sha}>
              <button
                className={cx(
                  'mx-2 flex w-[calc(100%-var(--spacing)*4)] flex-col gap-0.5 rounded-md px-3 py-1.5 text-left',
                  commit === current ? 'bg-selected' : 'hover:bg-hover',
                )}
                title={commit.subject}
                onClick={() => setSelectedSha(commit.sha)}
              >
                <span className="truncate text-fg">{commit.subject}</span>
                <span className="flex gap-2 text-xs text-muted">
                  <span className="flex-none font-mono text-subtle">{commit.sha.slice(0, SHORT_SHA)}</span>
                  <span className="min-w-0 truncate">{commit.author}</span>
                  <span className="ml-auto flex-none">{ago(commit.date)}</span>
                </span>
              </button>
            </li>
          ))}
          {history?.more && (
            <li className="mx-2 pt-1">
              <Button className="w-full" onClick={() => setLimit((current) => current + PAGE)}>
                {t('diff.loadMore')}
              </Button>
            </li>
          )}
        </ul>
      </div>
      <div className="flex min-h-0 min-w-0 flex-col">
        {current && selected.state === 'ready' && (
          <>
            <header className="flex h-9 flex-none items-center gap-3 border-b border-line px-4 text-sm">
              <span className="flex-none font-mono text-subtle">{current.sha.slice(0, SHORT_SHA)}</span>
              <span className="min-w-0 truncate text-fg" title={current.subject}>
                {current.subject}
              </span>
              <span className="flex-1" />
              <span className="flex flex-none gap-2 text-muted">
                {t('diff.files', { count: files.length })}
                {files.length > 0 && <Stats additions={totals.additions} deletions={totals.deletions} />}
              </span>
            </header>
            {files.length === 0 ? (
              <Note>{t('diff.emptyCommit')}</Note>
            ) : (
              <DiffBrowser
                files={files}
                sideBySide={sideBySide}
                tree={tree}
                onTreeChange={onTreeChange}
                root={root}
                reloadKey={selected.diff.to}
                loadFile={loadFile}
              />
            )}
          </>
        )}
        {selected.state === 'error' && <Note error>{describeError(t, selected.error)}</Note>}
      </div>
    </div>
  )
}
