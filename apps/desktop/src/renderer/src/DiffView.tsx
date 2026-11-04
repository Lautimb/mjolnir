import { useCallback, useEffect, useMemo, useState } from 'react'
import { Columns2, FileDiff, RefreshCw, Rows2 } from 'lucide-react'
import type { CompareMode, FileChange } from '@mjolnir/core/browser'
import type { SessionDiff } from '../../shared/api'
import { DiffBrowser } from './DiffBrowser'
import { describeError, useI18n } from './i18n/I18nProvider'
import type { Session } from './model'

const POLL_MS = 4000

interface Props {
  session: Session
  sideBySide: boolean
  onSideBySideChange(sideBySide: boolean): void
}

export function DiffView({ session, sideBySide, onSideBySideChange }: Props) {
  const { t } = useI18n()
  const { repo, worktree } = session
  const [mode, setMode] = useState<CompareMode>('working')
  const [diff, setDiff] = useState<SessionDiff | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const repoId = repo?.id
  const path = worktree?.path

  const load = useCallback(async () => {
    if (!repoId || !path) return
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
      <section className="diff-view">
        <div className="diff-empty">
          <FileDiff size={22} />
          <p>{t('diff.pickSession')}</p>
        </div>
      </section>
    )
  }

  const totals = files.reduce(
    (sum, file) => ({ additions: sum.additions + (file.additions ?? 0), deletions: sum.deletions + (file.deletions ?? 0) }),
    { additions: 0, deletions: 0 },
  )

  return (
    <section className="diff-view">
      <header className="diff-toolbar">
        <div className="segmented" role="radiogroup">
          <button className={mode === 'working' ? 'selected' : undefined} onClick={() => setMode('working')}>
            {t('diff.modes.working')}
          </button>
          <button className={mode === 'branch' ? 'selected' : undefined} onClick={() => setMode('branch')}>
            {t('diff.modes.branch')}
          </button>
        </div>
        {mode === 'branch' && (
          <span className="diff-base" title={t('diff.baseHint')}>
            {diff?.base ? t('diff.versus', { base: diff.base }) : t('diff.noBase')}
          </span>
        )}
        <span className="diff-summary">
          {t('diff.files', { count: files.length })}
          {files.length > 0 && (
            <>
              <span className="added">+{totals.additions}</span>
              <span className="removed">−{totals.deletions}</span>
            </>
          )}
        </span>
        <span className="status-spacer" />
        <button
          className="icon-button"
          title={sideBySide ? t('diff.inline') : t('diff.sideBySide')}
          onClick={() => onSideBySideChange(!sideBySide)}
        >
          {sideBySide ? <Rows2 size={15} /> : <Columns2 size={15} />}
        </button>
        <button className="icon-button" title={t('common.refresh')} disabled={refreshing} onClick={refresh}>
          <RefreshCw size={14} className={refreshing ? 'spin' : undefined} />
        </button>
      </header>

      {error !== null && <div className="diff-error">{describeError(t, error)}</div>}

      {error === null && diff && files.length === 0 ? (
        <div className="diff-empty">
          <FileDiff size={22} />
          <p>{mode === 'working' ? t('diff.emptyWorking') : t('diff.emptyBranch', { base: diff.base ?? 'HEAD' })}</p>
        </div>
      ) : (
        <DiffBrowser files={files} sideBySide={sideBySide} reloadKey={`${diff?.from}:${reloadToken}`} loadFile={loadFile} />
      )}
    </section>
  )
}
