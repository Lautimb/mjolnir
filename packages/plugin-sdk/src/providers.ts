export interface RemoteRepo {
  provider: string
  host: string
  owner: string
  name: string
}

export interface Person {
  login: string
  avatarUrl: string | null
}

export type PullRequestState = 'open' | 'closed' | 'merged'

export type ReviewDecision = 'approved' | 'changes_requested' | 'review_required'

export type ChecksState = 'success' | 'failure' | 'pending'

export type PullRequestFilter = 'mine' | 'review' | 'all'

export type PullRequestStateFilter = 'open' | 'closed' | 'all'

export interface PullRequestQuery {
  filter: PullRequestFilter
  state: PullRequestStateFilter
}

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
  additions: number | null
  deletions: number | null
  changedFiles: number | null
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

export type CredentialSource = 'cli' | 'oauth' | 'token'

export interface ProviderCredential {
  host: string
  token: string
  source: CredentialSource
}

export interface ProviderIdentity {
  login: string
  name: string | null
  avatarUrl: string | null
}

export interface PullRequestService {
  list(credential: ProviderCredential, repo: RemoteRepo, query: PullRequestQuery): Promise<PullRequestSummary[]>
  get(credential: ProviderCredential, repo: RemoteRepo, number: number): Promise<PullRequestDetail>
  forBranch(credential: ProviderCredential, repo: RemoteRepo, branch: string): Promise<PullRequestSummary | null>
  comments(credential: ProviderCredential, repo: RemoteRepo, number: number): Promise<PullRequestComment[]>
  comment(credential: ProviderCredential, repo: RemoteRepo, number: number, body: string): Promise<PullRequestComment>
  create(credential: ProviderCredential, repo: RemoteRepo, input: CreatePullRequestInput): Promise<PullRequestSummary>
}

export interface ProviderImplementation {
  identify(credential: ProviderCredential): Promise<ProviderIdentity>
  pulls?: PullRequestService
}

export type ProviderMethod = 'identify' | `pulls.${keyof PullRequestService}`
