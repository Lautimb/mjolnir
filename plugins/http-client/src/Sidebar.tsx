import { useMemo, useState } from 'react'
import { Folder, Plus, RefreshCw, SlidersHorizontal, Trash2 } from 'lucide-react'
import type { WorkspaceSession } from '@mjolnir/plugin-sdk'
import { cx, IconButton, Segmented, Select } from '@mjolnir/plugin-sdk/react'
import { describeError } from './errors'
import { useT } from './i18n'
import { COLLECTION_DIR, collectionTree, type CollectionFolder, type Environment, type HistoryEntry } from './model'
import type { CollectionState } from './useCollection'

type Tab = 'collection' | 'history'

function MethodTag({ method }: { method: string }) {
  return <span className={cx('method', `method-${method.toLowerCase()}`)}>{method}</span>
}

function FolderItems({ folder, openPath, onOpen }: { folder: CollectionFolder; openPath: string | null; onOpen(path: string): void }) {
  return (
    <ul className="tree">
      {folder.folders.map((child) => (
        <li key={child.path}>
          <div className="tree-folder">
            <Folder size={13} />
            {child.name}
          </div>
          <FolderItems folder={child} openPath={openPath} onOpen={onOpen} />
        </li>
      ))}
      {folder.requests.map((request) => (
        <li key={request.path}>
          <button type="button" className="list-item" aria-current={request.path === openPath} onClick={() => onOpen(request.path)}>
            {request.name}
          </button>
        </li>
      ))}
    </ul>
  )
}

interface Props {
  session: WorkspaceSession | null
  collection: CollectionState
  openPath: string | null
  history: HistoryEntry[]
  environments: Environment[]
  environmentId: string | null
  onOpen(path: string): void
  onReload(): void
  onNew(): void
  onRestore(entry: HistoryEntry): void
  onClearHistory(): void
  onEnvironmentChange(id: string | null): void
  onEditEnvironments(): void
}

export function Sidebar(props: Props) {
  const t = useT()
  const [tab, setTab] = useState<Tab>('collection')
  const { collection } = props
  const tree = useMemo(() => (collection.status === 'ready' ? collectionTree(collection.entries) : null), [collection])

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'collection', label: t('collection') },
            { value: 'history', label: t('history') },
          ]}
        />
        <div className="spacer" />
        {tab === 'collection' ? (
          <>
            <IconButton aria-label={t('newRequest')} title={t('newRequest')} onClick={props.onNew}>
              <Plus size={14} />
            </IconButton>
            {props.session && (
              <IconButton aria-label={t('reload')} title={t('reload')} onClick={props.onReload}>
                <RefreshCw size={13} />
              </IconButton>
            )}
          </>
        ) : (
          props.history.length > 0 && (
            <IconButton danger aria-label={t('clearHistory')} title={t('clearHistory')} onClick={props.onClearHistory}>
              <Trash2 size={13} />
            </IconButton>
          )
        )}
      </div>
      <div className="sidebar-body">
        {tab === 'collection' ? (
          <>
            {collection.status === 'none' && <p className="hint">{t('noSession')}</p>}
            {collection.status === 'loading' && <p className="hint">{t('loadingCollection')}</p>}
            {collection.status === 'error' && <p className="hint error">{describeError(t, collection.error)}</p>}
            {tree &&
              (tree.folders.length || tree.requests.length ? (
                <FolderItems folder={tree} openPath={props.openPath} onOpen={props.onOpen} />
              ) : (
                <p className="hint">{t('emptyCollection', { dir: COLLECTION_DIR })}</p>
              ))}
          </>
        ) : props.history.length ? (
          <ul className="tree">
            {props.history.map((entry) => (
              <li key={entry.id}>
                <button type="button" className="list-item history-item" title={entry.request.url} onClick={() => props.onRestore(entry)}>
                  <MethodTag method={entry.request.method} />
                  <span className="history-url">{entry.request.url}</span>
                  <span className={cx('history-status', entry.status === null || entry.status >= 400 ? 'error' : null)}>{entry.status ?? '—'}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">{t('emptyHistory')}</p>
        )}
      </div>
      <div className="sidebar-footer">
        <Select
          aria-label={t('environment')}
          value={props.environmentId ?? ''}
          onChange={(event) => props.onEnvironmentChange(event.target.value || null)}
        >
          <option value="">{t('noEnvironment')}</option>
          {props.environments.map((environment) => (
            <option key={environment.id} value={environment.id}>
              {environment.name}
            </option>
          ))}
        </Select>
        <IconButton aria-label={t('editEnvironments')} title={t('editEnvironments')} onClick={props.onEditEnvironments}>
          <SlidersHorizontal size={14} />
        </IconButton>
      </div>
    </aside>
  )
}
