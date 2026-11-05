import { useEffect, useState } from 'react'
import type { ChangeStatus, FileChange } from '@mjolnir/core/browser'
import type { DiffFile } from '../../../shared/api'
import { describeError, useI18n } from '../i18n/I18nProvider'
import { cx } from '../ui/cx'
import { Note } from '../ui/EmptyState'
import { MonacoDiff } from './MonacoDiff'
import { Stats } from './Stats'

const STATUS: Record<ChangeStatus, { letter: string; color: string }> = {
  modified: { letter: 'M', color: 'text-accent' },
  added: { letter: 'A', color: 'text-success' },
  deleted: { letter: 'D', color: 'text-danger' },
  renamed: { letter: 'R', color: 'text-windows' },
  untracked: { letter: 'N', color: 'text-success' },
}

type Content = { state: 'loading' } | { state: 'error'; error: unknown } | ({ state: 'ready'; path: string } & DiffFile)

interface Props {
  files: FileChange[]
  sideBySide: boolean
  reloadKey: string
  loadFile(change: FileChange): Promise<DiffFile>
}

function signature(file: FileChange | undefined): string {
  return file ? `${file.path}|${file.status}|${file.oldPath ?? ''}|${file.additions}|${file.deletions}` : ''
}

export function DiffBrowser({ files, sideBySide, reloadKey, loadFile }: Props) {
  const { t } = useI18n()
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState<Content>({ state: 'loading' })

  const current = files.find((file) => file.path === selected) ?? files[0]
  const currentSignature = signature(current)

  useEffect(() => {
    if (!current) return
    let cancelled = false
    const filePath = current.path
    setContent((previous) => (previous.state === 'ready' && previous.path === filePath ? previous : { state: 'loading' }))
    loadFile(current).then(
      (file) => !cancelled && setContent({ state: 'ready', path: filePath, ...file }),
      (error: unknown) => !cancelled && setContent({ state: 'error', error }),
    )
    return () => {
      cancelled = true
    }
  }, [currentSignature, reloadKey])

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
      <ul className="overflow-y-auto border-r border-line bg-surface py-2">
        {files.map((file) => {
          const slash = file.path.lastIndexOf('/')
          const status = STATUS[file.status]
          return (
            <li key={file.path}>
              <button
                className={cx(
                  'mx-2 flex h-control w-[calc(100%-var(--spacing)*4)] items-center gap-2 rounded-md px-2 text-left',
                  file === current ? 'bg-selected text-fg' : 'text-muted hover:bg-hover',
                )}
                title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
                onClick={() => setSelected(file.path)}
              >
                <span className={cx('w-3.5 flex-none text-center font-mono text-xs font-bold', status.color)} title={t(`diff.status.${file.status}`)}>
                  {status.letter}
                </span>
                <span className="max-w-[60%] flex-none truncate text-fg">{file.path.slice(slash + 1)}</span>
                <span className="min-w-0 flex-1 truncate text-left text-xs text-subtle [direction:rtl]">{slash > 0 ? file.path.slice(0, slash) : ''}</span>
                {file.additions !== null && <Stats additions={file.additions} deletions={file.deletions ?? 0} className="flex-none font-mono text-xs" />}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="relative min-h-0 min-w-0">
        {content.state === 'ready' && content.kind === 'text' && (
          <MonacoDiff path={content.path} original={content.original} modified={content.modified} sideBySide={sideBySide} />
        )}
        {content.state === 'ready' && content.kind === 'binary' && <Note>{t('diff.binary')}</Note>}
        {content.state === 'ready' && content.kind === 'too-large' && <Note>{t('diff.tooLarge')}</Note>}
        {content.state === 'error' && <Note error>{describeError(t, content.error)}</Note>}
      </div>
    </div>
  )
}
