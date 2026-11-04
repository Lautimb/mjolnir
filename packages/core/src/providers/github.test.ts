import { describe, expect, it } from 'vitest'
import { checksState, createGitHubClient, github, ProviderRequestError, reviewDecision } from './github'
import { parseRemoteUrl } from './remote'
import type { PullRequestReview } from './types'

const repo = { provider: 'github', host: 'github.com', owner: 'Lautimb', name: 'mjolnir' }

const pull = (overrides: Record<string, unknown> = {}) => ({
  number: 7,
  title: 'feat: diff',
  body: 'Body',
  user: { login: 'lauti', avatar_url: 'https://avatars/lauti' },
  state: 'open',
  draft: false,
  merged_at: null,
  html_url: 'https://github.com/Lautimb/mjolnir/pull/7',
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-02T00:00:00Z',
  head: { ref: 'feat/diff', sha: 'abc123' },
  base: { ref: 'main' },
  requested_reviewers: [],
  ...overrides,
})

function fakeFetch(routes: Record<string, unknown>) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const path = url.replace('https://api.github.com', '')
    const key = Object.keys(routes).find((route) => path.startsWith(route))
    if (!key) return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 })
    return new Response(JSON.stringify(routes[key]), { status: 200 })
  }) as typeof globalThis.fetch
  return { fetch, calls }
}

describe('github.matchRemote', () => {
  it('recognizes github.com owner/name remotes and ignores everything else', () => {
    expect(github.matchRemote(parseRemoteUrl('git@github.com:Lautimb/mjolnir.git')!)).toEqual(repo)
    expect(github.matchRemote(parseRemoteUrl('https://gitlab.com/group/sub/project')!)).toBeNull()
  })
})

describe('createGitHubClient', () => {
  it('authenticates every request with the token and the versioned API headers', async () => {
    const { fetch, calls } = fakeFetch({ '/repos/Lautimb/mjolnir/pulls?': [pull()] })
    await createGitHubClient({ token: 'secret', fetch }).list(repo, 'all')
    expect(calls[0]!.init.headers).toMatchObject({
      Authorization: 'Bearer secret',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    })
  })

  it('filters open pull requests by author or by requested reviewer using the viewer login', async () => {
    const { fetch } = fakeFetch({
      '/user': { login: 'lauti' },
      '/repos/Lautimb/mjolnir/pulls?': [
        pull({ number: 1 }),
        pull({ number: 2, user: { login: 'ana' }, requested_reviewers: [{ login: 'lauti' }] }),
        pull({ number: 3, user: { login: 'juan' } }),
      ],
    })
    const client = createGitHubClient({ token: 't', fetch })
    expect((await client.list(repo, 'mine')).map((pr) => pr.number)).toEqual([1])
    expect((await client.list(repo, 'review')).map((pr) => pr.number)).toEqual([2])
    expect((await client.list(repo, 'all')).map((pr) => pr.number)).toEqual([1, 2, 3])
  })

  it('reports merged pull requests as merged even though GitHub keeps their state as closed', async () => {
    const { fetch } = fakeFetch({ '/repos/Lautimb/mjolnir/pulls?': [pull({ state: 'closed', merged_at: '2026-11-03T00:00:00Z' })] })
    expect((await createGitHubClient({ token: 't', fetch }).list(repo, 'all'))[0]!.state).toBe('merged')
  })

  it('builds the detail from the pull, its reviews and the checks of its head commit', async () => {
    const { fetch } = fakeFetch({
      '/repos/Lautimb/mjolnir/pulls/7/reviews': [{ user: { login: 'ana' }, state: 'APPROVED', submitted_at: '2026-11-02T10:00:00Z' }],
      '/repos/Lautimb/mjolnir/pulls/7': pull({ additions: 10, deletions: 2, changed_files: 3 }),
      '/repos/Lautimb/mjolnir/commits/abc123/check-runs': { check_runs: [{ status: 'completed', conclusion: 'success' }] },
      '/repos/Lautimb/mjolnir/commits/abc123/status': { state: 'pending', total_count: 0 },
    })
    expect(await createGitHubClient({ token: 't', fetch }).get(repo, 7)).toMatchObject({
      number: 7,
      body: 'Body',
      headSha: 'abc123',
      additions: 10,
      changedFiles: 3,
      reviewDecision: 'approved',
      checks: 'success',
    })
  })

  it('posts comments and new pull requests as JSON', async () => {
    const { fetch, calls } = fakeFetch({
      '/repos/Lautimb/mjolnir/issues/7/comments': { id: 1, user: { login: 'lauti' }, body: 'LGTM', created_at: 'x', html_url: 'u' },
      '/repos/Lautimb/mjolnir/pulls': pull({ number: 8 }),
    })
    const client = createGitHubClient({ token: 't', fetch })
    expect((await client.comment(repo, 7, 'LGTM')).body).toBe('LGTM')
    await client.create(repo, { head: 'feat/x', base: 'main', title: 'T', body: 'B', draft: true })
    expect(calls.map((call) => [call.init.method, JSON.parse(String(call.init.body))])).toEqual([
      ['POST', { body: 'LGTM' }],
      ['POST', { head: 'feat/x', base: 'main', title: 'T', body: 'B', draft: true }],
    ])
  })

  it('turns error responses into ProviderRequestError with the API message', async () => {
    const { fetch } = fakeFetch({})
    await expect(createGitHubClient({ token: 't', fetch }).get(repo, 99)).rejects.toEqual(new ProviderRequestError(404, 'Not Found'))
  })
})

describe('reviewDecision', () => {
  const review = (login: string, state: PullRequestReview['state']): PullRequestReview => ({
    author: { login, avatarUrl: null },
    state,
    submittedAt: null,
  })

  it('keeps only the latest decisive review per reviewer', () => {
    expect(reviewDecision([review('ana', 'changes_requested'), review('ana', 'approved')], 0)).toBe('approved')
    expect(reviewDecision([review('ana', 'approved'), review('juan', 'changes_requested')], 0)).toBe('changes_requested')
    expect(reviewDecision([review('ana', 'commented')], 1)).toBe('review_required')
    expect(reviewDecision([], 0)).toBeNull()
  })
})

describe('checksState', () => {
  it('fails if anything failed, is pending if anything is still running, and is null without checks', () => {
    const run = (status: string, conclusion: string | null) => ({ status, conclusion })
    const none = { state: 'pending' as const, total_count: 0 }
    expect(checksState({ check_runs: [run('completed', 'success'), run('completed', 'failure')] }, none)).toBe('failure')
    expect(checksState({ check_runs: [run('in_progress', null)] }, none)).toBe('pending')
    expect(checksState({ check_runs: [run('completed', 'skipped')] }, { state: 'success', total_count: 1 })).toBe('success')
    expect(checksState({ check_runs: [] }, none)).toBeNull()
  })
})
