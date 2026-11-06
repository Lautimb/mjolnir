import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { ChevronDown, ChevronRight, List, ListTree } from 'lucide-react'
import type { ChangeStatus, FileChange } from '@mjolnir/core/browser'
import type { DiffFile } from '../../../shared/api'
import { describeError, useI18n } from '../i18n/I18nProvider'
import { cx, eyebrow } from '../ui/cx'
import { Note } from '../ui/EmptyState'
import { Segmented } from '../ui/Segmented'
import { MonacoDiff } from './MonacoDiff'
import { PathMenu, type PathMenuTarget, type PathRoot } from './PathMenu'
import { Stats } from './Stats'
import { buildTree, filesInOrder, type DirNode, type TreeNode } from './tree'

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
  tree: boolean
  onTreeChange(tree: boolean): void
  root?: PathRoot
  reloadKey: string
  loadFile(change: FileChange): Promise<DiffFile>
}

function signature(file: FileChange | undefined): string {
  return file ? `${file.path}|${file.status}|${file.oldPath ?? ''}|${file.additions}|${file.deletions}` : ''
}

const ROW = 'mx-2 flex h-control w-[calc(100%-var(--spacing)*4)] items-center gap-2 rounded-md pr-2 text-left'
const INDENT_PX = 12

export function DiffBrowser({ files, sideBySide, tree, onTreeChange, root, reloadKey, loadFile }: Props) {
  const { t } = useI18n()
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState<Content>({ state: 'loading' })
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [menu, setMenu] = useState<PathMenuTarget | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const nodes = useMemo(() => (tree ? buildTree(files) : []), [tree, files])

  const current = files.find((file) => file.path === selected) ?? (tree ? filesInOrder(nodes) : files)[0]
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

  const openMenu = (path: string) => (event: MouseEvent) => {
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY, path })
  }

  const toggle = (path: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (!next.delete(path)) next.add(path)
      return next
    })

  const indent = (depth: number) => ({ paddingLeft: 8 + depth * INDENT_PX })

  const fileRow = (file: FileChange, depth: number, showDir: boolean) => {
    const slash = file.path.lastIndexOf('/')
    const status = STATUS[file.status]
    return (
      <button
        className={cx(ROW, file === current ? 'bg-selected text-fg' : 'text-muted hover:bg-hover')}
        style={indent(depth)}
        title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
        onClick={() => setSelected(file.path)}
        onContextMenu={openMenu(file.path)}
      >
        <span className={cx('w-3.5 flex-none text-center font-mono text-xs font-bold', status.color)} title={t(`diff.status.${file.status}`)}>
          {status.letter}
        </span>
        <span className={cx('truncate text-fg', showDir ? 'max-w-[60%] flex-none' : 'min-w-0 flex-1')}>{file.path.slice(slash + 1)}</span>
        {showDir && (
          <span className="min-w-0 flex-1 truncate text-left text-xs text-subtle [direction:rtl]">{slash > 0 ? file.path.slice(0, slash) : ''}</span>
        )}
        {file.additions !== null && <Stats additions={file.additions} deletions={file.deletions ?? 0} className="flex-none font-mono text-xs" />}
      </button>
    )
  }

  const dirRow = (dir: DirNode, depth: number) => {
    const open = !collapsed.has(dir.path)
    return (
      <button
        className={cx(ROW, 'text-muted hover:bg-hover')}
        style={indent(depth)}
        title={dir.path}
        aria-expanded={open}
        onClick={() => toggle(dir.path)}
        onContextMenu={openMenu(dir.path)}
      >
        <span className="flex w-3.5 flex-none justify-center text-subtle">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
        <span className="min-w-0 flex-1 truncate">{dir.name}</span>
        <Stats additions={dir.additions} deletions={dir.deletions} className="flex-none font-mono text-xs" />
      </button>
    )
  }

  const renderNodes = (list: TreeNode[], depth: number) =>
    list.map((node) =>
      node.kind === 'file' ? (
        <li key={node.file.path}>{fileRow(node.file, depth, false)}</li>
      ) : (
        <li key={node.path}>
          {dirRow(node, depth)}
          {!collapsed.has(node.path) && <ul>{renderNodes(node.children, depth + 1)}</ul>}
        </li>
      ),
    )

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col border-r border-line bg-surface">
        <div className="flex h-9 flex-none items-center justify-between border-b border-line pr-2 pl-4">
          <span className={cx(eyebrow, 'text-subtle')}>{t('diff.filesHeader')}</span>
          <Segmented
            size="xs"
            label={t('diff.layout')}
            value={tree ? 'tree' : 'list'}
            options={[
              { value: 'list', label: <List size={13} />, title: t('diff.asList') },
              { value: 'tree', label: <ListTree size={13} />, title: t('diff.asTree') },
            ]}
            onChange={(layout) => onTreeChange(layout === 'tree')}
            className="[&_button]:px-1.5"
          />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto py-2">
          {tree ? renderNodes(nodes, 0) : files.map((file) => <li key={file.path}>{fileRow(file, 0, true)}</li>)}
        </ul>
      </div>
      <div className="relative min-h-0 min-w-0">
        {content.state === 'ready' && content.kind === 'text' && (
          <MonacoDiff path={content.path} original={content.original} modified={content.modified} sideBySide={sideBySide} />
        )}
        {content.state === 'ready' && content.kind === 'binary' && <Note>{t('diff.binary')}</Note>}
        {content.state === 'ready' && content.kind === 'too-large' && <Note>{t('diff.tooLarge')}</Note>}
        {content.state === 'error' && <Note error>{describeError(t, content.error)}</Note>}
      </div>
      {menu && <PathMenu target={menu} root={root} onClose={closeMenu} />}
    </div>
  )
}
