import type { ParsedRemote, RemoteRepo } from './remote'

export type AccountSource = 'cli' | 'oauth' | 'token'

export interface Account {
  provider: string
  host: string
  login: string
  name: string | null
  avatarUrl: string | null
  source: AccountSource
}

export interface Person {
  login: string
  avatarUrl: string | null
}

export type PullRequestState = 'open' | 'closed' | 'merged'

export type ReviewDecision = 'approved' | 'changes_requested' | 'review_required'

export type ChecksState = 'success' | 'failure' | 'pending'

export type PullRequestFilter = 'mine' | 'review' | 'all'

export interface PullRequestSummary {
  number: number
  title: string
  author: Person
  state: PullRequestState
  draft: boolean
  headRef: string
  baseRef: string
  url: string
  createdAt: string
  updatedAt: string
}

export interface PullRequestReview {
  author: Person
  state: 'approved' | 'changes_requested' | 'commented' | 'dismissed' | 'pending'
  submittedAt: string | null
}

export interface PullRequestDetail extends PullRequestSummary {
  body: string
  headSha: string
  additions: number
  deletions: number
  changedFiles: number
  reviews: PullRequestReview[]
  reviewDecision: ReviewDecision | null
  checks: ChecksState | null
}

export interface PullRequestComment {
  id: string
  author: Person
  body: string
  createdAt: string
  url: string
}

export interface CreatePullRequestInput {
  head: string
  base: string
  title: string
  body: string
  draft: boolean
}

export interface PullRequestProvider {
  list(repo: RemoteRepo, filter: PullRequestFilter): Promise<PullRequestSummary[]>
  get(repo: RemoteRepo, number: number): Promise<PullRequestDetail>
  forBranch(repo: RemoteRepo, branch: string): Promise<PullRequestSummary | null>
  comments(repo: RemoteRepo, number: number): Promise<PullRequestComment[]>
  comment(repo: RemoteRepo, number: number, body: string): Promise<PullRequestComment>
  create(repo: RemoteRepo, input: CreatePullRequestInput): Promise<PullRequestSummary>
  headRefspec(number: number): string
}

export interface ProviderDefinition {
  id: string
  displayName: string
  matchRemote(remote: ParsedRemote): RemoteRepo | null
}
