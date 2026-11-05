import { describe, expect, it } from 'vitest'
import type { HttpRequest, HttpResponse } from '@mjolnir/plugin-sdk'
import { createBoardsClient } from './client'
import { toBoard, type WorkItem } from './model'

const credential = { host: 'dev.azure.com', token: 'pat', source: 'token' as const }
const scope = { org: 'acme', project: 'Web Site', team: 'Web Team' }

const board = toBoard({
  id: 'b1',
  name: 'Stories',
  columns: [
    { id: 'c1', name: 'To Do', columnType: 'incoming', stateMappings: { 'User Story': 'New' } },
    { id: 'c2', name: 'Done', columnType: 'outgoing', stateMappings: { 'User Story': 'Closed' } },
  ],
  fields: { columnField: { referenceName: 'WEF_1_Kanban.Column' } },
})

function fake(reply: (request: HttpRequest) => unknown) {
  const requests: HttpRequest[] = []
  const request = async (req: HttpRequest): Promise<HttpResponse> => {
    requests.push(req)
    return { url: req.url, status: 200, statusText: '', headers: [], body: { encoding: 'utf8', data: JSON.stringify(reply(req)) }, redirects: [], durationMs: 1 }
  }
  return { client: createBoardsClient(request, credential), requests }
}

const raw = (id: number) => ({ id, rev: 1, fields: { 'System.WorkItemType': 'User Story', 'System.Title': `#${id}`, 'System.State': 'New' } })

describe('boards client', () => {
  it('queries the ids with WIQL and fetches them with their links in the same order', async () => {
    const { client, requests } = fake((req) =>
      req.method === 'POST' ? { workItems: [{ id: 3 }, { id: 1 }] } : { value: [raw(3), null, raw(1)] },
    )
    const items = await client.items(scope, board, { field: 'System.AreaPath', values: [] }, null)
    expect(items.map((item) => item.id)).toEqual([3, 1])
    expect(requests[0]!.url).toBe('https://dev.azure.com/acme/Web%20Site/_apis/wit/wiql?%24top=200&api-version=7.1')
    expect(new URL(requests[1]!.url).searchParams.get('ids')).toBe('3,1')
    expect(new URL(requests[1]!.url).searchParams.get('$expand')).toBe('relations')
  })

  it('moves a card with a JSON Patch on the work item', async () => {
    const { client, requests } = fake(() => ({ ...raw(42), rev: 4, fields: { ...raw(42).fields, 'System.State': 'Closed', 'WEF_1_Kanban.Column': 'Done' } }))
    const item: WorkItem = { id: 42, rev: 3, type: 'User Story', title: '', description: '', state: 'New', assignedTo: null, column: 'To Do', done: false, tags: [], links: [] }
    const updated = await client.move(scope, board, item, board.columns[1]!)
    expect(requests[0]).toMatchObject({ method: 'PATCH', headers: { 'Content-Type': 'application/json-patch+json' } })
    expect(JSON.parse(requests[0]!.body!.data)).toContainEqual({ op: 'test', path: '/rev', value: 3 })
    expect(updated).toMatchObject({ rev: 4, state: 'Closed', column: 'Done' })
  })

  it('reads the team settings under the team path', async () => {
    const { client, requests } = fake(() => ({ value: [{ id: 'i1', name: 'Sprint 1', path: 'Web\\Sprint 1', attributes: { timeFrame: 'current' } }] }))
    expect(await client.iterations(scope)).toEqual([{ id: 'i1', name: 'Sprint 1', path: 'Web\\Sprint 1', timeFrame: 'current' }])
    expect(requests[0]!.url).toBe('https://dev.azure.com/acme/Web%20Site/Web%20Team/_apis/work/teamsettings/iterations?api-version=7.1')
  })
})
