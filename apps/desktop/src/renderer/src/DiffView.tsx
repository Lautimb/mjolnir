import { useCallback, useEffect, useMemo, useState } from 'react'
import { Columns2, FileDiff, RefreshCw, Rows2 } from 'lucide-react'
import type { ChangeStatus, CompareMode, FileChange } from '@mjolnir/core/browser'
import type { DiffFile, SessionDiff } from '../../shared/api'
import { MonacoDiff } from './MonacoDiff'
import { errorMessage, type Session } from './model'

const POLL_MS = 4000

const STATUS: Record<ChangeStatus, { letter: string; label: string }> = {
  modified: { letter: 'M', label: 'Modificado' },
  added: { letter: 'A', label: 'Agregado' },
  deleted: { letter: 'D', label: 'Eliminado' },
  renamed: { letter: 'R', label: 'Renombrado' },
  untracked: { letter: 'N', label: 'Nuevo, sin trackear' },
}

type Content = { state: 'loading' } | { state: 'error'; message: string } | ({ state: 'ready'; path: string } & DiffFile)

function signature(file: FileChange | undefined, from: string | undefined): string {
  return file && from ? `${from}|${file.status}|${file.oldPath ?? ''}|${file.additions}|${file.deletions}` : ''
}

interface Props {
  session: Session
  sideBySide: boolean
  onSideBySideChange(sideBySide: boolean): void
}

export function DiffView({ session, sideBySide, onSideBySideChange }: Props) {
  const { repo, worktree } = session
  const [mode, setMode] = useState<CompareMode>('working')
  const [diff, setDiff] = useState<SessionDiff | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState<Content>({ state: 'loading' })
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
      setError(errorMessage(err))
    }
  }, [repoId, path, mode])

  useEffect(() => {
    setDiff(null)
    setSelected(null)
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
  const current = files.find((file) => file.path === selected) ?? files[0]
  const currentSignature = signature(current, diff?.from)

  useEffect(() => {
    if (!repoId || !path || !current || !diff) return
    let cancelled = false
    const filePath = current.path
    setContent((previous) => (previous.state === 'ready' && previous.path === filePath ? previous : { state: 'loading' }))
    window.mjolnir.diff.file(repoId, path, diff.from, current).then(
      (file) => !cancelled && setContent({ state: 'ready', path: filePath, ...file }),
      (err: unknown) => !cancelled && setContent({ state: 'error', message: errorMessage(err) }),
    )
    return () => {
      cancelled = true
    }
  }, [repoId, path, currentSignature, reloadToken])

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
          <p>Elegí una sesión en el panel para ver sus cambios.</p>
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
            Sin commitear
          </button>
          <button className={mode === 'branch' ? 'selected' : undefined} onClick={() => setMode('branch')}>
            Toda la branch
          </button>
        </div>
        {mode === 'branch' && (
          <span className="diff-base" title="Se compara contra el punto donde la sesión se separó de su base">
            {diff?.base ? `vs ${diff.base}` : 'sin base: se compara contra HEAD'}
          </span>
        )}
        <span className="diff-summary">
          {files.length} {files.length === 1 ? 'archivo' : 'archivos'}
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
          title={sideBySide ? 'Ver unificado' : 'Ver lado a lado'}
          onClick={() => onSideBySideChange(!sideBySide)}
        >
          {sideBySide ? <Rows2 size={15} /> : <Columns2 size={15} />}
        </button>
        <button className="icon-button" title="Actualizar" disabled={refreshing} onClick={refresh}>
          <RefreshCw size={14} className={refreshing ? 'spin' : undefined} />
        </button>
      </header>

      {error && <div className="diff-error">{error}</div>}

      {!error && diff && files.length === 0 ? (
        <div className="diff-empty">
          <FileDiff size={22} />
          <p>{mode === 'working' ? 'Sin cambios desde el último commit.' : `Sin cambios respecto de ${diff.base ?? 'HEAD'}.`}</p>
        </div>
      ) : (
        <div className="diff-body">
          <ul className="diff-files">
            {files.map((file) => {
              const slash = file.path.lastIndexOf('/')
              return (
                <li key={file.path}>
                  <button
                    className={`diff-file${file === current ? ' selected' : ''}`}
                    title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
                    onClick={() => setSelected(file.path)}
                  >
                    <span className={`diff-status status-${file.status}`} title={STATUS[file.status].label}>
                      {STATUS[file.status].letter}
                    </span>
                    <span className="diff-file-name">{file.path.slice(slash + 1)}</span>
                    <span className="diff-file-dir">{slash > 0 ? file.path.slice(0, slash) : ''}</span>
                    {file.additions !== null && (
                      <span className="diff-file-stats">
                        <span className="added">+{file.additions}</span>
                        <span className="removed">−{file.deletions}</span>
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="diff-content">
            {content.state === 'ready' && content.kind === 'text' && (
              <MonacoDiff path={content.path} original={content.original} modified={content.modified} sideBySide={sideBySide} />
            )}
            {content.state === 'ready' && content.kind === 'binary' && <p className="diff-note">Archivo binario: no se puede mostrar el diff.</p>}
            {content.state === 'ready' && content.kind === 'too-large' && <p className="diff-note">Archivo demasiado grande para mostrar el diff.</p>}
            {content.state === 'error' && <p className="diff-note error">{content.message}</p>}
          </div>
        </div>
      )}
    </section>
  )
}
