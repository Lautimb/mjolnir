import {
  HostError,
  type CreatePullRequestInput,
  type HttpRequest,
  type HttpResponse,
  type Person,
  type ProviderCredential,
  type ProviderIdentity,
  type ProviderImplementation,
  type PullRequestComment,
  type PullRequestDetail,
  type PullRequestQuery,
  type PullRequestReview,
  type PullRequestState,
  type PullRequestSummary,
  type RemoteRepo,
  type ReviewDecision,
} from '@mjolnir/plugin-sdk'

export const API_VERSION = '7.1'
const PROFILE_URL = 'https://app.vssps.visualstudio.com/_apis/profile/profiles/me'
const PAGE_SIZE = 100

export type Request = (request: HttpRequest) => Promise<HttpResponse>

interface IdentityRef {
  id?: string
  displayName?: string
  uniqueName?: string
}

interface Reviewer extends IdentityRef {
  vote: number
  isRequired?: boolean
}

export interface GitPullRequest {
  pullRequestId: number
  title: string
  description?: string
  status: 'active' | 'abandoned' | 'completed' | 'notSet'
  isDraft?: boolean
  createdBy: IdentityRef
  creationDate: string
  closedDate?: string
  sourceRefName: string
  targetRefName: string
  lastMergeSourceCommit?: { commitId: string }
  reviewers?: Reviewer[]
}

interface Comment {
  id: number
  author: IdentityRef
  content?: string
  publishedDate: string
  commentType: string
  isDeleted?: boolean
}

export interface Thread {
  id: number
  comments: Comment[]
  isDeleted?: boolean
}

export interface AzureRepo {
  org: string
  project: string
  name: string
}

export function azureRepo(repo: RemoteRepo): AzureRepo {
  const [org, project] = repo.owner.split('/')
  if (!org || !project) throw new HostError('invalidRequest', `not an Azure DevOps repo: ${repo.owner}/${repo.name}`)
  return { org, project, name: repo.name }
}

const segment = encodeURIComponent

export function repoUrl({ org, project, name }: AzureRepo): string {
  return `https://dev.azure.com/${segment(org)}/${segment(project)}/_git/${segment(name)}`
}

function apiUrl({ org, project, name }: AzureRepo, path: string, query: Record<string, string> = {}): string {
  const params = new URLSearchParams({ ...query, 'api-version': API_VERSION })
  return `https://dev.azure.com/${segment(org)}/${segment(project)}/_apis/git/repositories/${segment(name)}/${path}?${params}`
}

export function authorization({ token, source }: ProviderCredential): string {
  return source === 'cli' ? `Bearer ${token}` : `Basic ${btoa(`:${token}`)}`
}

const branch = (ref: string) => ref.replace(/^refs\/heads\//, '')

const person = (identity: IdentityRef): Person => ({ login: identity.uniqueName || identity.displayName || 'unknown', avatarUrl: null })

const STATES: Record<GitPullRequest['status'], PullRequestState> = { active: 'open', completed: 'merged', abandoned: 'closed', notSet: 'open' }

export function toSummary(repo: AzureRepo, pull: GitPullRequest): PullRequestSummary {
  return {
    number: pull.pullRequestId,
    title: pull.title,
    author: person(pull.createdBy),
    state: STATES[pull.status] ?? 'open',
    draft: !!pull.isDraft,
    headRef: branch(pull.sourceRefName),
    baseRef: branch(pull.targetRefName),
    url: `${repoUrl(repo)}/pullrequest/${pull.pullRequestId}`,
    createdAt: pull.creationDate,
    updatedAt: pull.closedDate ?? pull.creationDate,
  }
}

function reviewState(vote: number): PullRequestReview['state'] {
  if (vote > 0) return 'approved'
  if (vote < 0) return 'changes_requested'
  return 'pending'
}

export function reviewDecision(reviewers: Reviewer[]): ReviewDecision | null {
  if (!reviewers.length) return null
  if (reviewers.some((reviewer) => reviewer.vote < 0)) return 'changes_requested'
  const required = reviewers.filter((reviewer) => reviewer.isRequired)
  if (required.some((reviewer) => reviewer.vote <= 0)) return 'review_required'
  return reviewers.some((reviewer) => reviewer.vote > 0) ? 'approved' : 'review_required'
}

export function toDetail(repo: AzureRepo, pull: GitPullRequest): PullRequestDetail {
  const reviewers = pull.reviewers ?? []
  return {
    ...toSummary(repo, pull),
    body: pull.description ?? '',
    headSha: pull.lastMergeSourceCommit?.commitId ?? '',
    additions: null,
    deletions: null,
    changedFiles: null,
    reviews: reviewers.map((reviewer) => ({ author: person(reviewer), state: reviewState(reviewer.vote), submittedAt: null })),
    reviewDecision: reviewDecision(reviewers),
    checks: null,
  }
}

export function toComments(repo: AzureRepo, number: number, threads: Thread[]): PullRequestComment[] {
  return threads
    .filter((thread) => !thread.isDeleted)
    .flatMap((thread) =>
      thread.comments
        .filter((comment) => comment.commentType === 'text' && !comment.isDeleted && comment.content)
        .map((comment) => ({
          id: `${thread.id}/${comment.id}`,
          author: person(comment.author),
          body: comment.content!,
          createdAt: comment.publishedDate,
          url: `${repoUrl(repo)}/pullrequest/${number}?discussionId=${thread.id}`,
        })),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

const STATUS_FILTER: Record<PullRequestQuery['state'], string> = { open: 'active', closed: 'all', all: 'all' }

export function createAzureProvider(request: Request): ProviderImplementation {
  const users = new Map<string, Promise<string>>()

  const call = async <T>(credential: ProviderCredential, method: string, url: string, body?: unknown): Promise<T> => {
    const response = await request({
      method,
      url,
      headers: { Authorization: authorization(credential), Accept: 'application/json', ...(body !== undefined && { 'Content-Type': 'application/json' }) },
      ...(body !== undefined && { body: { encoding: 'utf8', data: JSON.stringify(body) } }),
      followRedirects: false,
    })
    if (response.status === 401 || response.status === 203 || (response.status >= 300 && response.status < 400)) {
      throw new HostError('unauthorized', `Azure DevOps rejected the credentials (${response.status})`)
    }
    let parsed: unknown = null
    try {
      parsed = response.body.encoding === 'utf8' && response.body.data ? JSON.parse(response.body.data) : null
    } catch {}
    if (response.status >= 400) {
      const message = (parsed as { message?: string } | null)?.message ?? response.statusText
      throw new HostError('requestFailed', `${response.status}: ${message}`)
    }
    return parsed as T
  }

  const me = (credential: ProviderCredential, repo: AzureRepo) => {
    const key = `${repo.org}|${credential.token}`
    let id = users.get(key)
    if (!id) {
      id = call<{ authenticatedUser: { id: string } }>(credential, 'GET', `https://dev.azure.com/${segment(repo.org)}/_apis/connectionData`).then(
        (data) => data.authenticatedUser.id,
      )
      id.catch(() => users.delete(key))
      users.set(key, id)
    }
    return id
  }

  const pulls = async (credential: ProviderCredential, repo: AzureRepo, criteria: Record<string, string>) => {
    const query = Object.fromEntries(Object.entries(criteria).map(([key, value]) => [`searchCriteria.${key}`, value]))
    const data = await call<{ value: GitPullRequest[] }>(credential, 'GET', apiUrl(repo, 'pullrequests', { ...query, $top: String(PAGE_SIZE) }))
    return data.value
  }

  return {
    async identify(credential): Promise<ProviderIdentity> {
      const profile = await call<{ displayName?: string; emailAddress?: string; publicAlias?: string }>(credential, 'GET', `${PROFILE_URL}?api-version=${API_VERSION}`)
      const login = profile.emailAddress || profile.displayName || profile.publicAlias
      if (!login) throw new HostError('requestFailed', 'Azure DevOps did not return a profile')
      return { login, name: profile.displayName ?? null, avatarUrl: null }
    },
    pulls: {
      async list(credential, remote, query) {
        const repo = azureRepo(remote)
        const criteria: Record<string, string> = { status: STATUS_FILTER[query.state] }
        if (query.filter === 'mine') criteria.creatorId = await me(credential, repo)
        if (query.filter === 'review') criteria.reviewerId = await me(credential, repo)
        const found = await pulls(credential, repo, criteria)
        return found.filter((pull) => query.state !== 'closed' || pull.status !== 'active').map((pull) => toSummary(repo, pull))
      },
      async get(credential, remote, number) {
        const repo = azureRepo(remote)
        return toDetail(repo, await call<GitPullRequest>(credential, 'GET', apiUrl(repo, `pullrequests/${number}`)))
      },
      async forBranch(credential, remote, name) {
        const repo = azureRepo(remote)
        const [pull] = await pulls(credential, repo, { status: 'active', sourceRefName: `refs/heads/${name}` })
        return pull ? toSummary(repo, pull) : null
      },
      async comments(credential, remote, number) {
        const repo = azureRepo(remote)
        const data = await call<{ value: Thread[] }>(credential, 'GET', apiUrl(repo, `pullRequests/${number}/threads`))
        return toComments(repo, number, data.value)
      },
      async comment(credential, remote, number, body) {
        const repo = azureRepo(remote)
        const thread = await call<Thread>(credential, 'POST', apiUrl(repo, `pullRequests/${number}/threads`), {
          comments: [{ parentCommentId: 0, content: body, commentType: 1 }],
          status: 1,
        })
        const [comment] = toComments(repo, number, [{ ...thread, comments: thread.comments.map((entry) => ({ ...entry, commentType: 'text' })) }])
        if (!comment) throw new HostError('requestFailed', 'Azure DevOps did not return the comment')
        return comment
      },
      async create(credential, remote, input: CreatePullRequestInput) {
        const repo = azureRepo(remote)
        const pull = await call<GitPullRequest>(credential, 'POST', apiUrl(repo, 'pullrequests'), {
          sourceRefName: `refs/heads/${input.head}`,
          targetRefName: `refs/heads/${input.base}`,
          title: input.title,
          description: input.body,
          isDraft: input.draft,
        })
        return toSummary(repo, pull)
      },
    },
  }
}
