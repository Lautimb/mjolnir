import { useCallback, useEffect, useMemo, useState } from 'react'
import { Columns2, FileDiff, RefreshCw, Rows2 } from 'lucide-react'
import type { CompareMode, FileChange } from '@mjolnir/core/browser'
import type { SessionDiff } from '../../../shared/api'
import { MAIN_COLUMN, TOOLBAR } from '../app/layout'
import { describeError, useI18n } from '../i18n/I18nProvider'
import type { Session } from '../sessions/model'
import { IconButton } from '../ui/Button'
import { EmptyState, Note } from '../ui/EmptyState'
import { Segmented } from '../ui/Segmented'
import { CommitHistory } from './CommitHistory'
import { DiffBrowser } from './DiffBrowser'
import { Stats } from './Stats'

const POLL_MS = 4000

type ViewMode = CompareMode | 'history'

interface Props {
  session: Session
  sideBySide: boolean
  tree: boolean
  onSideBySideChange(sideBySide: boolean): void
  onTreeChange(tree: boolean): void
}

export function DiffView({ session, sideBySide, tree, onSideBySideChange, onTreeChange }: Props) {
  const { t } = useI18n()
  const { repo, worktree } = session
  const [mode, setMode] = useState<ViewMode>('working')
  const [diff, setDiff] = useState<SessionDiff | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const repoId = repo?.id
  const path = worktree?.path

  const load = useCallback(async () => {
    if (!repoId || !path || mode === 'history') return
    try {
      setDiff(await window.mjolnir.diff.compare(repoId, path, mode))
      setError(null)
    } catch (err) {
      setError(err)
    }
  }, [repoId, path, mode])

  useEffect(() => {
    setDiff(null)
    void load()
    const timer = setInterval(load, POLL_MS)
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  const files = useMemo(() => diff?.files ?? [], [diff])

  const loadFile = useCallback(
    (change: FileChange) => window.mjolnir.diff.file(repoId!, path!, diff!.from, change),
    [repoId, path, diff],
  )

  const refresh = async () => {
    setRefreshing(true)
    await load()
    setReloadToken((token) => token + 1)
    setRefreshing(false)
  }

  if (!repo || !worktree) {
    return (
      <section className={MAIN_COLUMN}>
        <EmptyState icon={<FileDiff size={22} />}>
          <p>{t('diff.pickSession')}</p>
        </EmptyState>
      </section>
    )
  }

  const totals = files.reduce(
    (sum, file) => ({ additions: sum.additions + (file.additions ?? 0), deletions: sum.deletions + (file.deletions ?? 0) }),
    { additions: 0, deletions: 0 },
  )

  return (
    <section className={MAIN_COLUMN}>
      <header className={TOOLBAR}>
        <Segmented
          size="sm"
          value={mode}
          options={[
            { value: 'working', label: t('diff.modes.working') },
            { value: 'branch', label: t('diff.modes.branch') },
            { value: 'history', label: t('diff.modes.history') },
          ]}
          onChange={setMode}
        />
        {mode === 'branch' && (
          <span className="font-mono text-muted" title={t('diff.baseHint')}>
            {diff?.base ? t('diff.versus', { base: diff.base }) : t('diff.noBase')}
          </span>
        )}
        {mode !== 'history' && (
          <span className="flex gap-2 text-muted">
            {t('diff.files', { count: files.length })}
            {files.length > 0 && <Stats additions={totals.additions} deletions={totals.deletions} />}
          </span>
        )}
        <span className="flex-1" />
        <IconButton title={sideBySide ? t('diff.inline') : t('diff.sideBySide')} onClick={() => onSideBySideChange(!sideBySide)}>
          {sideBySide ? <Rows2 size={15} /> : <Columns2 size={15} />}
        </IconButton>
        <IconButton title={t('common.refresh')} disabled={refreshing} onClick={refresh}>
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : undefined} />
        </IconButton>
      </header>

      {error !== null && <Note error>{describeError(t, error)}</Note>}

      {mode === 'history' ? (
        <CommitHistory
          key={`${repo.id}:${worktree.path}`}
          repoId={repo.id}
          path={worktree.path}
          root={{ path: worktree.path, host: repo.host }}
          sideBySide={sideBySide}
          tree={tree}
          onTreeChange={onTreeChange}
          reloadToken={reloadToken}
        />
      ) : error === null && diff && files.length === 0 ? (
        <EmptyState icon={<FileDiff size={22} />}>
          <p>{mode === 'working' ? t('diff.emptyWorking') : t('diff.emptyBranch', { base: diff.base ?? 'HEAD' })}</p>
        </EmptyState>
      ) : (
        <DiffBrowser
          files={files}
          sideBySide={sideBySide}
          tree={tree}
          onTreeChange={onTreeChange}
          root={{ path: worktree.path, host: repo.host }}
          reloadKey={`${diff?.from}:${reloadToken}`}
          loadFile={loadFile}
        />
      )}
    </section>
  )
}
