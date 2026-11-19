import {
  HostError,
  type CreatePullRequestInput,
  type DiffSide,
  type LineCommentInput,
  type Person,
  type ProviderCredential,
  type ProviderIdentity,
  type ProviderImplementation,
  type PullRequestComment,
  type PullRequestDetail,
  type PullRequestQuery,
  type MergeMethod,
  type PullRequestMergeInput,
  type PullRequestReview,
  type PullRequestReviewInput,
  type PullRequestState,
  type PullRequestSummary,
  type PullRequestThread,
  type RemoteRepo,
  type ReviewDecision,
} from '@mjolnir/plugin-sdk'
import { API_VERSION, createCall, segment, type Request } from './api'

const PROFILE_URL = 'https://app.vssps.visualstudio.com/_apis/profile/profiles/me'
const PAGE_SIZE = 100

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
  mergeStatus?: 'notSet' | 'queued' | 'conflicts' | 'succeeded' | 'rejectedByPolicy' | 'failure'
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

interface FilePosition {
  line: number
  offset: number
}

export interface Thread {
  id: number
  comments: Comment[]
  isDeleted?: boolean
  threadContext?: { filePath: string; rightFileStart?: FilePosition; leftFileStart?: FilePosition } | null
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

export function repoUrl({ org, project, name }: AzureRepo): string {
  return `https://dev.azure.com/${segment(org)}/${segment(project)}/_git/${segment(name)}`
}

function apiUrl({ org, project, name }: AzureRepo, path: string, query: Record<string, string> = {}): string {
  const params = new URLSearchParams({ ...query, 'api-version': API_VERSION })
  return `https://dev.azure.com/${segment(org)}/${segment(project)}/_apis/git/repositories/${segment(name)}/${path}?${params}`
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
    mergeable: mergeable(pull.mergeStatus),
  }
}

function threadComments(repo: AzureRepo, number: number, thread: Thread): PullRequestComment[] {
  return thread.comments
    .filter((comment) => comment.commentType === 'text' && !comment.isDeleted && comment.content)
    .map((comment) => ({
      id: `${thread.id}/${comment.id}`,
      author: person(comment.author),
      body: comment.content!,
      createdAt: comment.publishedDate,
      url: `${repoUrl(repo)}/pullrequest/${number}?discussionId=${thread.id}`,
    }))
}

export function toComments(repo: AzureRepo, number: number, threads: Thread[]): PullRequestComment[] {
  return threads
    .filter((thread) => !thread.isDeleted && !thread.threadContext?.filePath)
    .flatMap((thread) => threadComments(repo, number, thread))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function toThreads(repo: AzureRepo, number: number, threads: Thread[]): PullRequestThread[] {
  return threads.flatMap((thread) => {
    const context = thread.threadContext
    const start = context?.rightFileStart ?? context?.leftFileStart
    if (thread.isDeleted || !context?.filePath || !start) return []
    const comments = threadComments(repo, number, thread)
    if (!comments.length) return []
    const side: DiffSide = context.rightFileStart ? 'right' : 'left'
    return [{ id: String(thread.id), path: context.filePath.replace(/^\//, ''), line: start.line, side, comments }]
  })
}

const MERGE_STRATEGIES: Record<MergeMethod, string> = { merge: 'noFastForward', squash: 'squash', rebase: 'rebase' }

function mergeable(status: GitPullRequest['mergeStatus']): boolean | null {
  if (status === 'succeeded') return true
  if (status === 'conflicts' || status === 'failure' || status === 'rejectedByPolicy') return false
  return null
}

const VOTES: Record<PullRequestReviewInput['verdict'], number> = { approve: 10, request_changes: -5 }

const STATUS_FILTER: Record<PullRequestQuery['state'], string> = { open: 'active', closed: 'all', all: 'all' }

export function createAzureProvider(request: Request): ProviderImplementation {
  const users = new Map<string, Promise<string>>()

  const call = createCall(request)

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

  const postThread = (credential: ProviderCredential, repo: AzureRepo, number: number, body: string) =>
    call<Thread>(credential, 'POST', apiUrl(repo, `pullRequests/${number}/threads`), {
      comments: [{ parentCommentId: 0, content: body, commentType: 1 }],
      status: 1,
    })

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
        const thread = await postThread(credential, repo, number, body)
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
      async review(credential, remote, number, { verdict, body }: PullRequestReviewInput) {
        const repo = azureRepo(remote)
        const reviewer = await me(credential, repo)
        await call(credential, 'PUT', apiUrl(repo, `pullRequests/${number}/reviewers/${segment(reviewer)}`), { vote: VOTES[verdict] })
        if (body.trim()) await postThread(credential, repo, number, body)
      },
      async threads(credential, remote, number) {
        const repo = azureRepo(remote)
        const data = await call<{ value: Thread[] }>(credential, 'GET', apiUrl(repo, `pullRequests/${number}/threads`))
        return toThreads(repo, number, data.value)
      },
      async commentOnLine(credential, remote, number, { path, line, side, body }: LineCommentInput) {
        const repo = azureRepo(remote)
        const start = { line, offset: 1 }
        const range = side === 'right' ? { rightFileStart: start, rightFileEnd: start } : { leftFileStart: start, leftFileEnd: start }
        const thread = await call<Thread>(credential, 'POST', apiUrl(repo, `pullRequests/${number}/threads`), {
          comments: [{ parentCommentId: 0, content: body, commentType: 1 }],
          status: 1,
          threadContext: { filePath: `/${path}`, ...range },
        })
        const comments = threadComments(repo, number, { ...thread, comments: thread.comments.map((entry) => ({ ...entry, commentType: 'text' })) })
        return { id: String(thread.id), path, line, side, comments }
      },
      async reply(credential, remote, number, threadId, body) {
        const repo = azureRepo(remote)
        const id = Number(threadId)
        if (!Number.isSafeInteger(id) || id <= 0) throw new HostError('invalidRequest', `invalid thread id: ${threadId}`)
        const created = await call<Comment>(credential, 'POST', apiUrl(repo, `pullRequests/${number}/threads/${id}/comments`), {
          parentCommentId: 1,
          content: body,
          commentType: 1,
        })
        const [reply] = threadComments(repo, number, { id, comments: [{ ...created, commentType: 'text' }] })
        if (!reply) throw new HostError('requestFailed', 'Azure DevOps did not return the reply')
        return reply
      },
      async merge(credential, remote, number, { method, sha, deleteBranch }: PullRequestMergeInput) {
        const repo = azureRepo(remote)
        await call(credential, 'PATCH', apiUrl(repo, `pullrequests/${number}`), {
          status: 'completed',
          lastMergeSourceCommit: { commitId: sha },
          completionOptions: { mergeStrategy: MERGE_STRATEGIES[method], deleteSourceBranch: deleteBranch },
        })
      },
    },
  }
}
