import { describe, expect, it } from 'vitest'
import type { HttpRequest, HttpResponse } from '@mjolnir/plugin-sdk'
import { authorization } from './api'
import { createAzureProvider, reviewDecision, toComments, toDetail, type GitPullRequest } from './azure'

const credential = { host: 'dev.azure.com', token: 'pat', source: 'token' as const }
const remote = { provider: 'azure-devops.azure-devops', host: 'dev.azure.com', owner: 'acme/Web Site', name: 'api' }
const repo = { org: 'acme', project: 'Web Site', name: 'api' }

const pull: GitPullRequest = {
  pullRequestId: 7,
  title: 'Add login',
  description: 'Body',
  status: 'active',
  createdBy: { displayName: 'Ada', uniqueName: 'ada@acme.io' },
  creationDate: '2026-01-02T00:00:00Z',
  sourceRefName: 'refs/heads/feat/login',
  targetRefName: 'refs/heads/main',
  lastMergeSourceCommit: { commitId: 'abc' },
  reviewers: [{ uniqueName: 'bob@acme.io', vote: 10 }],
}

function fake(routes: Record<string, unknown>, status = 200) {
  const requests: HttpRequest[] = []
  const request = async (req: HttpRequest): Promise<HttpResponse> => {
    requests.push(req)
    const key = Object.keys(routes).find((prefix) => req.url.startsWith(prefix))
    return {
      url: req.url,
      status: key ? status : 404,
      statusText: '',
      headers: [],
      body: { encoding: 'utf8', data: key ? JSON.stringify(routes[key]) : '{"message":"not found"}' },
      redirects: [],
      durationMs: 1,
    }
  }
  return { provider: createAzureProvider(request), requests }
}

const API = 'https://dev.azure.com/acme/Web%20Site/_apis/git/repositories/api/'

describe('Azure DevOps provider', () => {
  it('uses Basic auth for PATs and Bearer for tokens from the Azure CLI', () => {
    expect(authorization(credential)).toBe(`Basic ${btoa(':pat')}`)
    expect(authorization({ ...credential, source: 'cli' })).toBe('Bearer pat')
  })

  it('lists pull requests of the repo with the user as creator for "mine"', async () => {
    const { provider, requests } = fake({
      'https://dev.azure.com/acme/_apis/connectionData': { authenticatedUser: { id: 'me-1' } },
      [`${API}pullrequests`]: { value: [pull] },
    })
    const list = await provider.pulls!.list(credential, remote, { filter: 'mine', state: 'open' })
    expect(list).toEqual([
      {
        number: 7,
        title: 'Add login',
        author: { login: 'ada@acme.io', avatarUrl: null },
        state: 'open',
        draft: false,
        headRef: 'feat/login',
        baseRef: 'main',
        url: 'https://dev.azure.com/acme/Web%20Site/_git/api/pullrequest/7',
        createdAt: '2026-01-02T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      },
    ])
    const url = new URL(requests.at(-1)!.url)
    expect(url.searchParams.get('searchCriteria.creatorId')).toBe('me-1')
    expect(url.searchParams.get('searchCriteria.status')).toBe('active')
    await provider.pulls!.list(credential, remote, { filter: 'review', state: 'open' })
    expect(requests.filter((req) => req.url.includes('connectionData'))).toHaveLength(1)
  })

  it('treats a login page or 401 as expired credentials', async () => {
    for (const status of [401, 203]) {
      const { provider } = fake({ [`${API}pullrequests`]: '<html>' }, status)
      await expect(provider.pulls!.get(credential, remote, 7)).rejects.toMatchObject({ code: 'unauthorized' })
    }
  })

  it('reports API errors with the message Azure sends', async () => {
    const { provider } = fake({})
    await expect(provider.pulls!.get(credential, remote, 7)).rejects.toMatchObject({ code: 'requestFailed', message: '404: not found' })
  })

  it('creates pull requests from branch names', async () => {
    const { provider, requests } = fake({ [`${API}pullrequests`]: pull })
    await provider.pulls!.create(credential, remote, { head: 'feat/login', base: 'main', title: 'Add login', body: 'Body', draft: true })
    expect(requests[0]!.method).toBe('POST')
    expect(JSON.parse(requests[0]!.body!.data)).toEqual({ sourceRefName: 'refs/heads/feat/login', targetRefName: 'refs/heads/main', title: 'Add login', description: 'Body', isDraft: true })
  })
})

describe('mapping', () => {
  it('maps votes to reviews and a decision', () => {
    const detail = toDetail(repo, { ...pull, status: 'completed' })
    expect(detail).toMatchObject({ state: 'merged', headSha: 'abc', additions: null, reviews: [{ author: { login: 'bob@acme.io' }, state: 'approved' }], reviewDecision: 'approved' })
    expect(reviewDecision([{ vote: 10 }, { vote: -10 }])).toBe('changes_requested')
    expect(reviewDecision([{ vote: 10 }, { vote: 0, isRequired: true }])).toBe('review_required')
    expect(reviewDecision([])).toBeNull()
  })

  it('keeps only human comments, oldest first', () => {
    const comments = toComments(repo, 7, [
      {
        id: 1,
        comments: [
          { id: 2, author: { uniqueName: 'b' }, content: 'later', publishedDate: '2026-01-03', commentType: 'text' },
          { id: 1, author: { uniqueName: 'sys' }, content: 'Policy updated', publishedDate: '2026-01-01', commentType: 'system' },
        ],
      },
      { id: 2, comments: [{ id: 1, author: { uniqueName: 'a' }, content: 'first', publishedDate: '2026-01-02', commentType: 'text' }] },
      { id: 3, isDeleted: true, comments: [{ id: 1, author: { uniqueName: 'a' }, content: 'gone', publishedDate: '2026-01-02', commentType: 'text' }] },
    ])
    expect(comments.map((comment) => [comment.id, comment.body])).toEqual([
      ['2/1', 'first'],
      ['1/2', 'later'],
    ])
    expect(comments[0]!.url).toBe('https://dev.azure.com/acme/Web%20Site/_git/api/pullrequest/7?discussionId=2')
  })
})
