import { useEffect, useState } from 'react'
import type { ChangeStatus, FileChange } from '@mjolnir/core/browser'
import type { DiffFile } from '../../shared/api'
import { describeError, useI18n } from './i18n/I18nProvider'
import { MonacoDiff } from './MonacoDiff'

const STATUS_LETTER: Record<ChangeStatus, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'N',
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
                <span className={`diff-status status-${file.status}`} title={t(`diff.status.${file.status}`)}>
                  {STATUS_LETTER[file.status]}
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
        {content.state === 'ready' && content.kind === 'binary' && <p className="diff-note">{t('diff.binary')}</p>}
        {content.state === 'ready' && content.kind === 'too-large' && <p className="diff-note">{t('diff.tooLarge')}</p>}
        {content.state === 'error' && <p className="diff-note error">{describeError(t, content.error)}</p>}
      </div>
    </div>
  )
}
