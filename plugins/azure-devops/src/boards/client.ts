import { HostError, type ProviderCredential } from '@mjolnir/plugin-sdk'
import { apiUrl, createCall, segment, type Request } from '../api'
import {
  MAX_ITEMS,
  itemsQuery,
  movePatch,
  takePatch,
  toBoard,
  toWorkItem,
  type Board,
  type BoardColumn,
  type Iteration,
  type Me,
  type Named,
  type PatchOperation,
  type RawBoard,
  type RawWorkItem,
  type Scope,
  type TeamArea,
  type TimeFrame,
  type WorkItem,
} from './model'

const VSSPS = 'https://app.vssps.visualstudio.com/_apis'
const BATCH_SIZE = 200

interface List<T> {
  value: T[]
}

const orgUrl = (org: string) => `https://dev.azure.com/${segment(org)}`
const projectUrl = (org: string, project: string) => `${orgUrl(org)}/${segment(project)}`
const teamUrl = ({ org, project, team }: Scope) => `${projectUrl(org, project)}/${segment(team)}`

export function workItemUrl(org: string, project: string, id: number): string {
  return `${projectUrl(org, project)}/_workitems/edit/${id}`
}

export function createBoardsClient(request: Request, credential: ProviderCredential) {
  const call = createCall(request)
  const get = <T>(url: string) => call<T>(credential, 'GET', url)

  const update = async (scope: Scope, board: Board, item: WorkItem, patch: PatchOperation[]) => {
    const raw = await call<RawWorkItem>(
      credential,
      'PATCH',
      apiUrl(`${projectUrl(scope.org, scope.project)}/_apis/wit/workitems/${item.id}`, { $expand: 'relations' }),
      patch,
      'application/json-patch+json',
    )
    return toWorkItem(raw, board)
  }

  return {
    async organizations(): Promise<string[]> {
      const profile = await get<{ id: string }>(apiUrl(`${VSSPS}/profile/profiles/me`))
      const accounts = await get<List<{ accountName: string }>>(apiUrl(`${VSSPS}/accounts`, { memberId: profile.id }))
      return accounts.value.map((account) => account.accountName).sort((a, b) => a.localeCompare(b))
    },

    async me(org: string): Promise<Me> {
      const data = await get<{ authenticatedUser: { id: string; providerDisplayName?: string; properties?: { Account?: { $value?: string } } } }>(
        `${orgUrl(org)}/_apis/connectionData`,
      )
      const user = data.authenticatedUser
      return { id: user.id, uniqueName: user.properties?.Account?.$value || user.providerDisplayName || user.id }
    },

    async projects(org: string): Promise<Named[]> {
      const data = await get<List<Named>>(apiUrl(`${orgUrl(org)}/_apis/projects`, { $top: '500' }))
      return data.value.sort((a, b) => a.name.localeCompare(b.name))
    },

    async teams(org: string, project: string): Promise<Named[]> {
      const data = await get<List<Named>>(apiUrl(`${orgUrl(org)}/_apis/projects/${segment(project)}/teams`, { $top: '500' }))
      return data.value.sort((a, b) => a.name.localeCompare(b.name))
    },

    async repositories(org: string, project: string): Promise<Named[]> {
      const data = await get<List<Named>>(apiUrl(`${projectUrl(org, project)}/_apis/git/repositories`))
      return data.value
    },

    async iterations(scope: Scope): Promise<Iteration[]> {
      const data = await get<List<{ id: string; name: string; path: string; attributes?: { timeFrame?: TimeFrame } }>>(
        apiUrl(`${teamUrl(scope)}/_apis/work/teamsettings/iterations`),
      )
      return data.value.map(({ id, name, path, attributes }) => ({ id, name, path, timeFrame: attributes?.timeFrame ?? null }))
    },

    async boards(scope: Scope): Promise<Named[]> {
      const data = await get<List<Named>>(apiUrl(`${teamUrl(scope)}/_apis/work/boards`))
      return data.value
    },

    async board(scope: Scope, id: string): Promise<Board> {
      return toBoard(await get<RawBoard>(apiUrl(`${teamUrl(scope)}/_apis/work/boards/${segment(id)}`)))
    },

    async area(scope: Scope): Promise<TeamArea> {
      const data = await get<{ field: { referenceName: string }; values: TeamArea['values'] }>(apiUrl(`${teamUrl(scope)}/_apis/work/teamsettings/teamfieldvalues`))
      return { field: data.field.referenceName, values: data.values }
    },

    async items(scope: Scope, board: Board, area: TeamArea, iterationPath: string | null): Promise<WorkItem[]> {
      const query = itemsQuery(board, area, iterationPath)
      const found = await call<{ workItems: { id: number }[] }>(
        credential,
        'POST',
        apiUrl(`${projectUrl(scope.org, scope.project)}/_apis/wit/wiql`, { $top: String(MAX_ITEMS) }),
        { query },
      )
      const ids = found.workItems.map((item) => item.id)
      const items: WorkItem[] = []
      for (let start = 0; start < ids.length; start += BATCH_SIZE) {
        const batch = ids.slice(start, start + BATCH_SIZE)
        const data = await get<List<RawWorkItem | null>>(
          apiUrl(`${projectUrl(scope.org, scope.project)}/_apis/wit/workitems`, { ids: batch.join(','), $expand: 'relations', errorPolicy: 'omit' }),
        )
        for (const raw of data.value) if (raw) items.push(toWorkItem(raw, board))
      }
      return items
    },

    async move(scope: Scope, board: Board, item: WorkItem, column: BoardColumn): Promise<WorkItem> {
      const patch = movePatch(item, column, board)
      if (!patch) throw new HostError('invalidRequest', `${item.type} cannot be moved to ${column.name}`)
      return update(scope, board, item, patch)
    },

    take(scope: Scope, board: Board, item: WorkItem, me: Me): Promise<WorkItem> {
      return update(scope, board, item, takePatch(item, me))
    },
  }
}

export type BoardsClient = ReturnType<typeof createBoardsClient>
