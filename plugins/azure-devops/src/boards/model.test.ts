import { describe, expect, it } from 'vitest'
import {
  branchName,
  columnOf,
  groupByColumn,
  itemsQuery,
  linksBranch,
  matchesSearch,
  movePatch,
  parseArtifact,
  startColumn,
  takePatch,
  toBoard,
  toWorkItem,
  type Board,
  type WorkItem,
} from './model'

const board: Board = toBoard({
  id: 'b1',
  name: 'Stories',
  columns: [
    { id: 'c1', name: 'To Do', columnType: 'incoming', stateMappings: { 'User Story': 'New', Bug: 'New' } },
    { id: 'c2', name: 'WIP', columnType: 'inProgress', stateMappings: { 'User Story': 'Active', Bug: 'Active' }, isSplit: true },
    { id: 'c3', name: 'Review', columnType: 'inProgress', stateMappings: { 'User Story': 'Active' } },
    { id: 'c4', name: 'Done', columnType: 'outgoing', stateMappings: { 'User Story': 'Closed', Bug: 'Closed' } },
  ],
  fields: { columnField: { referenceName: 'WEF_1_Kanban.Column' }, doneField: { referenceName: 'WEF_1_Kanban.Column.Done' } },
})

const column = (name: string) => board.columns.find((candidate) => candidate.name === name)!

const item = (overrides: Partial<WorkItem> = {}): WorkItem => ({
  id: 42,
  rev: 3,
  type: 'User Story',
  title: 'Login con SSO',
  description: '',
  state: 'New',
  assignedTo: null,
  column: 'To Do',
  done: false,
  tags: [],
  links: [],
  ...overrides,
})

describe('itemsQuery', () => {
  it('scopes to the board types, the team areas and the iteration, escaping quotes', () => {
    const query = itemsQuery(
      board,
      { field: 'System.AreaPath', values: [{ value: "Web\\O'Brien", includeChildren: true }, { value: 'Web\\Api', includeChildren: false }] },
      "Web\\Sprint 'A'",
    )
    expect(query).toBe(
      "SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] IN ('User Story', 'Bug') AND [System.State] <> 'Removed'" +
        " AND ([System.AreaPath] UNDER 'Web\\O''Brien' OR [System.AreaPath] = 'Web\\Api')" +
        " AND [System.IterationPath] = 'Web\\Sprint ''A''' ORDER BY [System.ChangedDate] DESC",
    )
  })

  it('leaves the iteration out when the board is not filtered by one', () => {
    expect(itemsQuery(board, { field: 'System.AreaPath', values: [] }, null)).not.toContain('IterationPath')
  })
})

describe('parseArtifact', () => {
  it('reads branches whose name has slashes and pull requests', () => {
    expect(parseArtifact('vstfs:///Git/Ref/p1%2Fr1%2FGBfeat%2Flogin')).toEqual({ kind: 'branch', projectId: 'p1', repoId: 'r1', name: 'feat/login' })
    expect(parseArtifact('vstfs:///Git/PullRequestId/p1%2Fr1%2F17')).toEqual({ kind: 'pullRequest', projectId: 'p1', repoId: 'r1', name: '17' })
  })

  it('ignores tags, commits and malformed links', () => {
    expect(parseArtifact('vstfs:///Git/Ref/p1%2Fr1%2FGTv1.0')).toBeNull()
    expect(parseArtifact('vstfs:///Git/Commit/p1%2Fr1%2Fabc')).toBeNull()
    expect(parseArtifact('vstfs:///Git/Ref/p1%2FGBmain')).toBeNull()
    expect(parseArtifact('vstfs:///Git/Ref/%E0%A4%A')).toBeNull()
  })
})

describe('toWorkItem', () => {
  it('reads the board column from the board own field and keeps only git links', () => {
    const parsed = toWorkItem(
      {
        id: 7,
        rev: 2,
        fields: {
          'System.WorkItemType': 'Bug',
          'System.Title': 'Falla el login',
          'System.State': 'Active',
          'System.AssignedTo': { id: 'u1', displayName: 'Ada', uniqueName: 'ada@acme.io' },
          'System.Tags': 'web; urgente',
          'WEF_1_Kanban.Column': 'WIP',
          'WEF_1_Kanban.Column.Done': true,
        },
        relations: [
          { rel: 'ArtifactLink', url: 'vstfs:///Git/Ref/p1%2Fr1%2FGBfix%2Flogin' },
          { rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'https://dev.azure.com/acme/_apis/wit/workItems/1' },
        ],
      },
      board,
    )
    expect(parsed).toEqual({
      id: 7,
      rev: 2,
      type: 'Bug',
      title: 'Falla el login',
      description: '',
      state: 'Active',
      assignedTo: { id: 'u1', name: 'Ada', uniqueName: 'ada@acme.io' },
      column: 'WIP',
      done: true,
      tags: ['web', 'urgente'],
      links: [{ kind: 'branch', projectId: 'p1', repoId: 'r1', name: 'fix/login' }],
    })
  })
})

describe('columns', () => {
  it('falls back to the state mapping when the item has no column for this board', () => {
    expect(columnOf(item({ column: null, state: 'Active' }), board)?.name).toBe('WIP')
    expect(columnOf(item({ column: 'Gone', state: 'Closed' }), board)?.name).toBe('Done')
  })

  it('groups every item under one column, in the order received', () => {
    const groups = groupByColumn([item({ id: 1 }), item({ id: 2, column: 'Review', state: 'Active' }), item({ id: 3 })], board)
    expect([...groups].map(([id, items]) => [id, items.map((entry) => entry.id)])).toEqual([
      ['c1', [1, 3]],
      ['c2', []],
      ['c3', [2]],
      ['c4', []],
    ])
  })
})

describe('movePatch', () => {
  it('guards the revision and sets both state and column, since several columns share a state', () => {
    expect(movePatch(item({ column: 'WIP', state: 'Active' }), column('Review'), board)).toEqual([
      { op: 'test', path: '/rev', value: 3 },
      { op: 'add', path: '/fields/WEF_1_Kanban.Column', value: 'Review' },
    ])
    expect(movePatch(item(), column('Done'), board)).toEqual([
      { op: 'test', path: '/rev', value: 3 },
      { op: 'add', path: '/fields/System.State', value: 'Closed' },
      { op: 'add', path: '/fields/WEF_1_Kanban.Column', value: 'Done' },
    ])
  })

  it('lands in the doing half of a split column', () => {
    expect(movePatch(item(), column('WIP'), board)).toContainEqual({ op: 'add', path: '/fields/WEF_1_Kanban.Column.Done', value: false })
  })

  it('refuses columns that have no state for the item type', () => {
    expect(movePatch(item({ type: 'Bug' }), column('Review'), board)).toBeNull()
  })
})

describe('filters', () => {
  it('matches the id, the title and the tags', () => {
    const story = item({ tags: ['backend'] })
    expect(matchesSearch(story, '#42')).toBe(true)
    expect(matchesSearch(story, 'sso')).toBe(true)
    expect(matchesSearch(story, 'back')).toBe(true)
    expect(matchesSearch(story, '4')).toBe(false)
  })

  it('links a branch only in the same repo', () => {
    const story = item({ links: [{ kind: 'branch', projectId: 'p1', repoId: 'r1', name: 'feat/sso' }] })
    expect(linksBranch(story, 'r1', 'feat/sso')).toBe(true)
    expect(linksBranch(story, 'r2', 'feat/sso')).toBe(false)
    expect(linksBranch(story, null, 'feat/sso')).toBe(false)
  })
})

describe('taking a card', () => {
  it('assigns it to me, guarding the revision', () => {
    expect(takePatch(item(), { id: 'u1', uniqueName: 'ada@acme.io' })).toEqual([
      { op: 'test', path: '/rev', value: 3 },
      { op: 'add', path: '/fields/System.AssignedTo', value: 'ada@acme.io' },
    ])
  })

  it('starts it in the first in-progress column only when it has not started', () => {
    expect(startColumn(item(), board)?.name).toBe('WIP')
    expect(startColumn(item({ column: 'Review', state: 'Active' }), board)).toBeNull()
  })

  it('suggests a branch from the type, the id and the title', () => {
    expect(branchName(item({ title: 'Migración de la API: ¡v2!' }))).toBe('feat/42-migracion-de-la-api-v2')
    expect(branchName(item({ type: 'Bug', title: '!!!' }))).toBe('fix/42')
    expect(branchName(item({ title: 'a'.repeat(60) }))).toBe(`feat/42-${'a'.repeat(40)}`)
  })
})
