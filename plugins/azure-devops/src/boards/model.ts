export interface Scope {
  org: string
  project: string
  team: string
}

export interface Named {
  id: string
  name: string
}

export type TimeFrame = 'past' | 'current' | 'future'

export interface Iteration {
  id: string
  name: string
  path: string
  timeFrame: TimeFrame | null
}

export type ColumnKind = 'incoming' | 'inProgress' | 'outgoing'

export interface BoardColumn {
  id: string
  name: string
  kind: ColumnKind
  states: Record<string, string>
  split: boolean
}

export interface Board {
  id: string
  name: string
  columns: BoardColumn[]
  columnField: string
  doneField: string | null
}

export interface TeamArea {
  field: string
  values: { value: string; includeChildren: boolean }[]
}

export interface Identity {
  id: string | null
  name: string
  uniqueName: string | null
}

export type LinkKind = 'branch' | 'pullRequest'

export interface ArtifactRef {
  kind: LinkKind
  projectId: string
  repoId: string
  name: string
}

export interface WorkItem {
  id: number
  rev: number
  type: string
  title: string
  description: string
  state: string
  assignedTo: Identity | null
  column: string | null
  done: boolean
  tags: string[]
  links: ArtifactRef[]
}

export interface RawIdentity {
  id?: string
  displayName?: string
  uniqueName?: string
}

export interface RawWorkItem {
  id: number
  rev: number
  fields: Record<string, unknown>
  relations?: { rel: string; url: string }[]
}

export interface RawBoardColumn {
  id: string
  name: string
  columnType: ColumnKind
  stateMappings?: Record<string, string>
  isSplit?: boolean
}

export interface RawBoard {
  id: string
  name: string
  columns: RawBoardColumn[]
  fields: { columnField: { referenceName: string }; doneField?: { referenceName: string } }
}

export interface PatchOperation {
  op: 'add' | 'test'
  path: string
  value: unknown
}

export const MAX_ITEMS = 200

export function toBoard(raw: RawBoard): Board {
  return {
    id: raw.id,
    name: raw.name,
    columns: raw.columns.map((column) => ({
      id: column.id,
      name: column.name,
      kind: column.columnType,
      states: column.stateMappings ?? {},
      split: !!column.isSplit,
    })),
    columnField: raw.fields.columnField.referenceName,
    doneField: raw.fields.doneField?.referenceName ?? null,
  }
}

export function boardTypes(board: Board): string[] {
  return [...new Set(board.columns.flatMap((column) => Object.keys(column.states)))]
}

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`

const field = (name: string) => `[${name.replace(/[\[\]]/g, '')}]`

export function itemsQuery(board: Board, area: TeamArea, iterationPath: string | null): string {
  const conditions = [`[System.WorkItemType] IN (${boardTypes(board).map(literal).join(', ')})`, `[System.State] <> 'Removed'`]
  const areas = area.values.map(({ value, includeChildren }) => `${field(area.field)} ${includeChildren ? 'UNDER' : '='} ${literal(value)}`)
  if (areas.length) conditions.push(`(${areas.join(' OR ')})`)
  if (iterationPath) conditions.push(`[System.IterationPath] = ${literal(iterationPath)}`)
  return `SELECT [System.Id] FROM WorkItems WHERE ${conditions.join(' AND ')} ORDER BY [System.ChangedDate] DESC`
}

const ARTIFACT = /^vstfs:\/\/\/Git\/(Ref|PullRequestId)\/(.+)$/i

export function parseArtifact(url: string): ArtifactRef | null {
  const match = ARTIFACT.exec(url)
  if (!match) return null
  let tail: string
  try {
    tail = decodeURIComponent(match[2]!)
  } catch {
    return null
  }
  const [projectId, repoId, ...rest] = tail.split('/')
  const name = rest.join('/')
  if (!projectId || !repoId || !name) return null
  if (match[1]!.toLowerCase() === 'pullrequestid') return /^\d+$/.test(name) ? { kind: 'pullRequest', projectId, repoId, name } : null
  return name.startsWith('GB') && name.length > 2 ? { kind: 'branch', projectId, repoId, name: name.slice(2) } : null
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')

function identity(value: unknown): Identity | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as RawIdentity
  const name = raw.displayName || raw.uniqueName
  return name ? { id: raw.id ?? null, name, uniqueName: raw.uniqueName ?? null } : null
}

export function toWorkItem(raw: RawWorkItem, board: Board): WorkItem {
  const fields = raw.fields
  return {
    id: raw.id,
    rev: raw.rev,
    type: text(fields['System.WorkItemType']),
    title: text(fields['System.Title']),
    description: text(fields['System.Description']),
    state: text(fields['System.State']),
    assignedTo: identity(fields['System.AssignedTo']),
    column: text(fields[board.columnField]) || null,
    done: board.doneField ? fields[board.doneField] === true : false,
    tags: text(fields['System.Tags'])
      .split(';')
      .map((tag) => tag.trim())
      .filter(Boolean),
    links: (raw.relations ?? []).flatMap((relation) => (relation.rel === 'ArtifactLink' && parseArtifact(relation.url)) || []),
  }
}

export function columnOf(item: WorkItem, board: Board): BoardColumn | null {
  return (
    board.columns.find((column) => column.name === item.column) ??
    board.columns.find((column) => column.states[item.type] === item.state) ??
    null
  )
}

export function groupByColumn(items: WorkItem[], board: Board): Map<string, WorkItem[]> {
  const groups = new Map(board.columns.map((column) => [column.id, [] as WorkItem[]]))
  for (const item of items) {
    const column = columnOf(item, board)
    if (column) groups.get(column.id)!.push(item)
  }
  return groups
}

export function canMove(item: WorkItem, column: BoardColumn): boolean {
  return item.type in column.states
}

export function movePatch(item: WorkItem, column: BoardColumn, board: Board): PatchOperation[] | null {
  const state = column.states[item.type]
  if (!state) return null
  const operations: PatchOperation[] = [{ op: 'test', path: '/rev', value: item.rev }]
  if (state !== item.state) operations.push({ op: 'add', path: '/fields/System.State', value: state })
  operations.push({ op: 'add', path: `/fields/${board.columnField}`, value: column.name })
  if (board.doneField && column.split) operations.push({ op: 'add', path: `/fields/${board.doneField}`, value: false })
  return operations
}

export function moved(item: WorkItem, column: BoardColumn): WorkItem {
  return { ...item, column: column.name, state: column.states[item.type] ?? item.state, done: false }
}

export interface Me {
  id: string
  uniqueName: string
}

export function takePatch(item: WorkItem, me: Me): PatchOperation[] {
  return [
    { op: 'test', path: '/rev', value: item.rev },
    { op: 'add', path: '/fields/System.AssignedTo', value: me.uniqueName },
  ]
}

export function startColumn(item: WorkItem, board: Board): BoardColumn | null {
  if (columnOf(item, board)?.kind !== 'incoming') return null
  return board.columns.find((column) => column.kind === 'inProgress' && canMove(item, column)) ?? null
}

const MAX_SLUG = 40
const FIX_TYPES = new Set(['Bug', 'Issue', 'Impediment'])

export function branchName(item: WorkItem): string {
  const slug = item.title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_SLUG)
    .replace(/^-+|-+$/g, '')
  return `${FIX_TYPES.has(item.type) ? 'fix' : 'feat'}/${item.id}${slug ? `-${slug}` : ''}`
}

export function defaultIteration(iterations: Iteration[]): Iteration | null {
  return iterations.find((iteration) => iteration.timeFrame === 'current') ?? null
}

export function isMine(item: WorkItem, me: Me | null): boolean {
  return !!me && item.assignedTo?.id === me.id
}

export function matchesSearch(item: WorkItem, search: string): boolean {
  const needle = search.trim().toLowerCase()
  if (!needle) return true
  return String(item.id) === needle.replace(/^#/, '') || item.title.toLowerCase().includes(needle) || item.tags.some((tag) => tag.toLowerCase().includes(needle))
}

export function linksBranch(item: WorkItem, repoId: string | null, branch: string | null): boolean {
  return !!repoId && !!branch && item.links.some((link) => link.kind === 'branch' && link.repoId === repoId && link.name === branch)
}
