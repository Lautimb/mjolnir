import {
  parseRemoteUrl,
  type CreatePullRequestInput,
  type FileChange,
  type PullRequestQuery,
  type PullRequestProvider,
  type RemoteRepo,
} from '@mjolnir/core'
import type { DiffFile, PullRequestContext, PullRequestDiff } from '../shared/api'
import { AppError } from '../shared/errors'
import type { Accounts } from './accounts'
import { diffContent } from './diff-content'
import type { ProviderRegistry } from './providers'
import type { Workspace } from './workspace'

const pullRef = (number: number) => `refs/mjolnir/pulls/${number}`
const baseRef = (number: number) => `refs/mjolnir/pulls/${number}-base`

export class Pulls {
  constructor(
    private readonly workspace: Workspace,
    private readonly accounts: Accounts,
    private readonly providers: ProviderRegistry,
  ) {}

  async context(repoId: string): Promise<PullRequestContext> {
    const { repo, git } = this.workspace.open(repoId)
    const [remote, defaultBase] = await Promise.all([this.detectRemote(repoId), git.defaultBase(repo.path)])
    const provider = remote && this.accounts.providers().find((info) => info.id === remote.provider)
    return {
      remote,
      provider: provider ?? null,
      account: remote && this.accounts.find(remote.provider, remote.host),
      defaultBranch: defaultBase?.replace(/^[^/]+\//, '') ?? null,
    }
  }

  list(repoId: string, query: PullRequestQuery) {
    return this.call(repoId, (pulls, remote) => pulls.list(remote, query))
  }

  get(repoId: string, number: number) {
    return this.call(repoId, (pulls, remote) => pulls.get(remote, number))
  }

  forBranch(repoId: string, branch: string) {
    return this.call(repoId, (pulls, remote) => pulls.forBranch(remote, branch))
  }

  comments(repoId: string, number: number) {
    return this.call(repoId, (pulls, remote) => pulls.comments(remote, number))
  }

  comment(repoId: string, number: number, body: string) {
    return this.call(repoId, (pulls, remote) => pulls.comment(remote, number, body))
  }

  async create(repoId: string, worktreePath: string, input: CreatePullRequestInput) {
    const { git } = this.workspace.open(repoId)
    const worktree = await this.workspace.worktree(repoId, worktreePath)
    const state = await git.publishState(worktree.path)
    if (!state.upstream || state.ahead > 0) await git.push(worktree.path, input.head)
    return this.call(repoId, (pulls, remote) => pulls.create(remote, input))
  }

  async diff(repoId: string, number: number, base: string): Promise<PullRequestDiff> {
    const { repo, git, diff } = this.workspace.open(repoId)
    const refspec = await this.call(repoId, async (pulls) => pulls.headRefspec(number))
    await git.fetchRef(repo.path, refspec, pullRef(number))
    await git.fetchRef(repo.path, `refs/heads/${base}`, baseRef(number))
    const from = (await git.mergeBase(repo.path, baseRef(number), pullRef(number))) ?? baseRef(number)
    return { from, to: pullRef(number), files: await diff.files(repo.path, from, pullRef(number)) }
  }

  async diffFile(repoId: string, from: string, to: string, change: FileChange): Promise<DiffFile> {
    if (change.binary) return { kind: 'binary' }
    const { repo, diff } = this.workspace.open(repoId)
    const [original, modified] = await Promise.all([diff.original(repo.path, from, change), diff.modified(repo.path, to, change)])
    return diffContent(original, modified)
  }

  private async call<T>(repoId: string, action: (pulls: PullRequestProvider, remote: RemoteRepo) => Promise<T>) {
    const remote = await this.detectRemote(repoId)
    if (!remote) throw new AppError('unsupportedRemote', {})
    return this.accounts.use(remote.provider, remote.host, (pulls) => action(pulls, remote))
  }

  private async detectRemote(repoId: string): Promise<RemoteRepo | null> {
    const { repo, git } = this.workspace.open(repoId)
    const parsed = parseRemoteUrl((await git.remoteUrl(repo.path)) ?? '')
    return parsed && this.providers.match(parsed)
  }
}
