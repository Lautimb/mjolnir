import type {
  CreatePullRequestInput,
  CredentialSource,
  PullRequestComment,
  PullRequestDetail,
  PullRequestQuery,
  PullRequestSummary,
} from '@mjolnir/plugin-sdk/providers'
import type { ParsedRemote, RemoteRepo } from './remote'

export type {
  ChecksState,
  CreatePullRequestInput,
  Person,
  PullRequestComment,
  PullRequestDetail,
  PullRequestFilter,
  PullRequestQuery,
  PullRequestReview,
  PullRequestState,
  PullRequestStateFilter,
  PullRequestSummary,
  ReviewDecision,
} from '@mjolnir/plugin-sdk/providers'

export type AccountSource = CredentialSource

export interface Account {
  provider: string
  host: string
  login: string
  name: string | null
  avatarUrl: string | null
  source: AccountSource
}

export interface PullRequestProvider {
  list(repo: RemoteRepo, query: PullRequestQuery): Promise<PullRequestSummary[]>
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
