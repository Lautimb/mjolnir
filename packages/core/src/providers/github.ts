import type { ParsedRemote, RemoteRepo } from './remote'
import type {
  ChecksState,
  CreatePullRequestInput,
  Person,
  ProviderDefinition,
  PullRequestComment,
  PullRequestDetail,
  PullRequestQuery,
  PullRequestProvider,
  PullRequestReview,
  PullRequestSummary,
  ReviewDecision,
} from './types'

export const GITHUB_HOST = 'github.com'

export const github: ProviderDefinition = {
  id: 'github',
  displayName: 'GitHub',
  matchRemote(remote: ParsedRemote): RemoteRepo | null {
    const segments = remote.path.split('/')
    if (remote.host !== GITHUB_HOST || segments.length !== 2) return null
    return { provider: 'github', host: remote.host, owner: segments[0]!, name: segments[1]! }
  },
}

export class ProviderRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

interface GitHubUser {
  login: string
  name?: string | null
  avatar_url?: string | null
}

interface GitHubPull {
  number: number
  title: string
  body: string | null
  user: GitHubUser
  state: 'open' | 'closed'
  draft?: boolean
  merged_at: string | null
  html_url: string
  created_at: string
  updated_at: string
  head: { ref: string; sha: string }
  base: { ref: string }
  requested_reviewers?: GitHubUser[]
  additions?: number
  deletions?: number
  changed_files?: number
}

interface GitHubReview {
  user: GitHubUser
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING'
  submitted_at: string | null
}

interface GitHubComment {
  id: number
  user: GitHubUser
  body: string
  created_at: string
  html_url: string
}

interface GitHubCheckRuns {
  check_runs: { status: string; conclusion: string | null }[]
}

interface GitHubCombinedStatus {
  state: 'success' | 'failure' | 'error' | 'pending'
  total_count: number
}

const person = (user: GitHubUser): Person => ({ login: user.login, avatarUrl: user.avatar_url ?? null })

function summary(pull: GitHubPull): PullRequestSummary {
  return {
    number: pull.number,
    title: pull.title,
    author: person(pull.user),
    state: pull.merged_at ? 'merged' : pull.state,
    draft: pull.draft ?? false,
    headRef: pull.head.ref,
    baseRef: pull.base.ref,
    url: pull.html_url,
    createdAt: pull.created_at,
    updatedAt: pull.updated_at,
  }
}

const REVIEW_STATES: Record<GitHubReview['state'], PullRequestReview['state']> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes_requested',
  COMMENTED: 'commented',
  DISMISSED: 'dismissed',
  PENDING: 'pending',
}

export function reviewDecision(reviews: PullRequestReview[], pendingReviewers: number): ReviewDecision | null {
  const latest = new Map<string, PullRequestReview['state']>()
  for (const review of reviews) {
    if (review.state === 'approved' || review.state === 'changes_requested' || review.state === 'dismissed') {
      latest.set(review.author.login, review.state)
    }
  }
  const states = [...latest.values()]
  if (states.includes('changes_requested')) return 'changes_requested'
  if (pendingReviewers > 0) return 'review_required'
  if (states.includes('approved')) return 'approved'
  return null
}

export function checksState(runs: GitHubCheckRuns, status: GitHubCombinedStatus): ChecksState | null {
  const results = [
    ...runs.check_runs.map((run): ChecksState => {
      if (run.status !== 'completed') return 'pending'
      return ['success', 'neutral', 'skipped'].includes(run.conclusion ?? '') ? 'success' : 'failure'
    }),
    ...(status.total_count > 0 ? [status.state === 'error' ? 'failure' : status.state] : []),
  ]
  if (results.length === 0) return null
  if (results.includes('failure')) return 'failure'
  if (results.includes('pending')) return 'pending'
  return 'success'
}

export interface GitHubClientOptions {
  token: string
  fetch?: typeof globalThis.fetch
  apiUrl?: string
}

export function createGitHubClient({ token, fetch = globalThis.fetch, apiUrl = 'https://api.github.com' }: GitHubClientOptions) {
  async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const response = await fetch(`${apiUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { message?: string }
      throw new ProviderRequestError(response.status, payload.message ?? response.statusText)
    }
    return (await response.json()) as T
  }

  const repoPath = (repo: RemoteRepo) => `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`

  let viewerLogin: Promise<string> | null = null
  const viewer = () => request<GitHubUser>('/user')
  const login = () => (viewerLogin ??= viewer().then((user) => user.login))

  const provider: PullRequestProvider = {
    async list(repo: RemoteRepo, { filter, state }: PullRequestQuery) {
      const pulls = await request<GitHubPull[]>(`${repoPath(repo)}/pulls?state=${state}&sort=updated&direction=desc&per_page=100`)
      if (filter === 'all') return pulls.map(summary)
      const me = await login()
      return pulls
        .filter((pull) =>
          filter === 'mine'
            ? pull.user.login === me
            : (pull.requested_reviewers ?? []).some((reviewer) => reviewer.login === me),
        )
        .map(summary)
    },

    async get(repo: RemoteRepo, number: number): Promise<PullRequestDetail> {
      const pull = await request<GitHubPull>(`${repoPath(repo)}/pulls/${number}`)
      const [reviews, runs, status] = await Promise.all([
        request<GitHubReview[]>(`${repoPath(repo)}/pulls/${number}/reviews?per_page=100`),
        request<GitHubCheckRuns>(`${repoPath(repo)}/commits/${pull.head.sha}/check-runs?per_page=100`),
        request<GitHubCombinedStatus>(`${repoPath(repo)}/commits/${pull.head.sha}/status`),
      ])
      const mapped = reviews.map(
        (review): PullRequestReview => ({
          author: person(review.user),
          state: REVIEW_STATES[review.state],
          submittedAt: review.submitted_at,
        }),
      )
      return {
        ...summary(pull),
        body: pull.body ?? '',
        headSha: pull.head.sha,
        additions: pull.additions ?? 0,
        deletions: pull.deletions ?? 0,
        changedFiles: pull.changed_files ?? 0,
        reviews: mapped,
        reviewDecision: reviewDecision(mapped, pull.requested_reviewers?.length ?? 0),
        checks: checksState(runs, status),
      }
    },

    async forBranch(repo: RemoteRepo, branch: string) {
      const head = encodeURIComponent(`${repo.owner}:${branch}`)
      const [pull] = await request<GitHubPull[]>(`${repoPath(repo)}/pulls?state=all&head=${head}&per_page=1`)
      return pull ? summary(pull) : null
    },

    async comments(repo: RemoteRepo, number: number) {
      const comments = await request<GitHubComment[]>(`${repoPath(repo)}/issues/${number}/comments?per_page=100`)
      return comments.map(comment)
    },

    async comment(repo: RemoteRepo, number: number, body: string) {
      return comment(await request<GitHubComment>(`${repoPath(repo)}/issues/${number}/comments`, { method: 'POST', body: { body } }))
    },

    async create(repo: RemoteRepo, input: CreatePullRequestInput) {
      return summary(await request<GitHubPull>(`${repoPath(repo)}/pulls`, { method: 'POST', body: input }))
    },

    headRefspec: (number: number) => `pull/${number}/head`,
  }

  return { ...provider, viewer }
}

function comment(raw: GitHubComment): PullRequestComment {
  return { id: String(raw.id), author: person(raw.user), body: raw.body, createdAt: raw.created_at, url: raw.html_url }
}
