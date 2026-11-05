import { useEffect, useState, type DragEvent, type KeyboardEvent } from 'react'
import { GitBranch, GitPullRequest } from 'lucide-react'
import type { WorkspaceSession } from '@mjolnir/plugin-sdk'
import { Badge, EmptyState, cx, useMjolnir } from '@mjolnir/plugin-sdk/react'
import { workItemUrl, type BoardsClient } from './client'
import { Detail } from './Detail'
import { describeError } from './errors'
import { useT } from './i18n'
import {
  MAX_ITEMS,
  canMove,
  columnOf,
  groupByColumn,
  isMine,
  linksBranch,
  matchesSearch,
  moved,
  type Board,
  type BoardColumn,
  type Me,
  type Scope,
  type WorkItem,
} from './model'
import { useAsync } from './useAsync'

interface Props {
  client: BoardsClient
  scope: Scope
  boardId: string
  iterationPath: string | null
  mine: boolean
  search: string
  session: WorkspaceSession | null
}

export function BoardView({ client, scope, boardId, iterationPath, mine, search, session }: Props) {
  const t = useT()
  const setup = useAsync(async () => {
    const [board, area, repos, me] = await Promise.all([
      client.board(scope, boardId),
      client.area(scope),
      client.repositories(scope.org, scope.project).catch(() => []),
      client.me(scope.org).catch(() => null),
    ])
    return { board, area, repos, me }
  }, [client, scope, boardId])
  const loaded = useAsync(
    setup.data ? () => client.items(scope, setup.data!.board, setup.data!.area, iterationPath) : null,
    [client, scope, setup.data, iterationPath],
  )

  if (setup.error) return <EmptyState>{describeError(t, setup.error)}</EmptyState>
  if (!setup.data) return <EmptyState>{t('loading')}</EmptyState>
  if (loaded.error) return <EmptyState>{describeError(t, loaded.error)}</EmptyState>
  if (!loaded.data) return <EmptyState>{t('loading')}</EmptyState>

  const { board, repos, me } = setup.data
  const repoId = session ? (repos.find((repo) => repo.name === session.repoName)?.id ?? null) : null
  return (
    <Columns
      client={client}
      scope={scope}
      board={board}
      initial={loaded.data}
      me={me}
      session={session}
      onStale={loaded.reload}
      visible={(item) => (!mine || isMine(item, me)) && matchesSearch(item, search)}
      linked={(item) => linksBranch(item, repoId, session?.branch ?? null)}
    />
  )
}

function Columns({
  client,
  scope,
  board,
  initial,
  me,
  session,
  onStale,
  visible,
  linked,
}: {
  client: BoardsClient
  scope: Scope
  board: Board
  initial: WorkItem[]
  me: Me | null
  session: WorkspaceSession | null
  onStale(): void
  visible(item: WorkItem): boolean
  linked(item: WorkItem): boolean
}) {
  const t = useT()
  const { ui } = useMjolnir()
  const [items, setItems] = useState(initial)
  const [dragging, setDragging] = useState<WorkItem | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  useEffect(() => setItems(initial), [initial])
  const selected = items.find((item) => item.id === selectedId) ?? null

  const groups = groupByColumn(items.filter(visible), board)
  const open = (item: WorkItem) => void ui.openExternal(workItemUrl(scope.org, scope.project, item.id))

  const replace = (next: WorkItem) => setItems((current) => current.map((entry) => (entry.id === next.id ? next : entry)))

  const move = async (item: WorkItem, column: BoardColumn) => {
    if (columnOf(item, board)?.id === column.id) return
    if (!canMove(item, column)) {
      ui.notify(t('moveNotAllowed', { type: item.type, column: column.name }), 'error')
      return
    }
    replace(moved(item, column))
    try {
      replace(await client.move(scope, board, item, column))
    } catch (error) {
      replace(item)
      ui.notify(describeError(t, error), 'error')
      onStale()
    }
  }

  const onKeyDown = (event: KeyboardEvent, item: WorkItem) => {
    if (event.key === 'Enter') return setSelectedId(item.id)
    if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
    event.preventDefault()
    const index = board.columns.findIndex((column) => column.id === columnOf(item, board)?.id)
    const step = event.key === 'ArrowLeft' ? -1 : 1
    for (let next = index + step; next >= 0 && next < board.columns.length; next += step) {
      const column = board.columns[next]!
      if (canMove(item, column)) return void move(item, column)
    }
  }

  const accepts = (column: BoardColumn) => !!dragging && canMove(dragging, column)

  return (
    <div className="board-area">
      <div className="board" title={t('moveHint')}>
        {board.columns.map((column) => {
          const entries = groups.get(column.id) ?? []
          return (
            <section
              key={column.id}
              className={cx('column', dragging && (accepts(column) ? 'column-accepts' : 'column-rejects'))}
              onDragOver={(event: DragEvent) => accepts(column) && event.preventDefault()}
              onDrop={(event: DragEvent) => {
                event.preventDefault()
                if (dragging) void move(dragging, column)
                setDragging(null)
              }}
            >
              <h2 className="column-title">
                <span>{column.name}</span>
                <span className="count">{entries.length}</span>
              </h2>
              <ul className="cards">
                {entries.map((item) => (
                  <Card
                    key={item.id}
                    item={item}
                    split={column.split}
                    linked={linked(item)}
                    selected={item.id === selectedId}
                    onSelect={() => setSelectedId(item.id)}
                    onOpen={() => open(item)}
                    onKeyDown={(event) => onKeyDown(event, item)}
                    onDragStart={() => setDragging(item)}
                    onDragEnd={() => setDragging(null)}
                  />
                ))}
                {!entries.length && <li className="column-empty">{t('emptyColumn')}</li>}
              </ul>
            </section>
          )
        })}
      </div>
      {selected && (
        <Detail
          key={selected.id}
          client={client}
          scope={scope}
          board={board}
          item={selected}
          me={me}
          session={session}
          onChange={replace}
          onStale={onStale}
          onClose={() => setSelectedId(null)}
        />
      )}
      {items.length >= MAX_ITEMS && <p className="note">{t('truncated', { count: MAX_ITEMS })}</p>}
    </div>
  )
}

function Card({
  item,
  split,
  linked,
  selected,
  onSelect,
  onOpen,
  onKeyDown,
  onDragStart,
  onDragEnd,
}: {
  item: WorkItem
  split: boolean
  linked: boolean
  selected: boolean
  onSelect(): void
  onOpen(): void
  onKeyDown(event: KeyboardEvent): void
  onDragStart(): void
  onDragEnd(): void
}) {
  const t = useT()
  const branches = item.links.filter((link) => link.kind === 'branch')
  const pulls = item.links.length - branches.length
  return (
    <li
      className={cx('card', linked && 'card-linked')}
      aria-current={selected || undefined}
      tabIndex={0}
      draggable
      onClick={onSelect}
      onKeyDown={onKeyDown}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', String(item.id))
        onDragStart()
      }}
      onDragEnd={onDragEnd}
    >
      <div className="card-header">
        <Badge tone="muted">{item.type}</Badge>
        <button
          type="button"
          className="card-id"
          title={t('openItem', { id: item.id })}
          onClick={(event) => {
            event.stopPropagation()
            onOpen()
          }}
        >
          #{item.id}
        </button>
        {split && item.done && <Badge tone="success">{t('doneHalf')}</Badge>}
      </div>
      <p className="card-title">{item.title}</p>
      <div className="card-footer">
        <span className="assignee">{item.assignedTo?.name ?? t('unassigned')}</span>
        {item.tags.map((tag) => (
          <Badge key={tag} tone="accent">
            {tag}
          </Badge>
        ))}
        {branches.map((link) => (
          <span key={`${link.repoId}/${link.name}`} className="link" title={linked ? t('sessionBranch') : undefined}>
            <GitBranch size={12} />
            {link.name}
          </span>
        ))}
        {pulls > 0 && (
          <span className="link">
            <GitPullRequest size={12} />
            {t('pullRequests', { count: pulls })}
          </span>
        )}
      </div>
    </li>
  )
}
