import type {
  Account,
  BranchList,
  CompareMode,
  CreatePullRequestInput,
  DeviceCode,
  DiscoveredRepos,
  FileChange,
  Host,
  PullRequestComment,
  PullRequestDetail,
  PullRequestQuery,
  PullRequestSummary,
  RemoteRepo,
  Repo,
  TerminalProfile,
  Worktree,
} from '@mjolnir/core/browser'
import type { Settings } from './settings'

export interface SpawnRequest {
  id: string
  profileId: string
  cols: number
  rows: number
  cwd?: string
  initialInput?: string
}

export interface SessionDiff {
  mode: CompareMode
  base: string | null
  from: string
  files: FileChange[]
}

export type DiffFile = { kind: 'text'; original: string; modified: string } | { kind: 'binary' } | { kind: 'too-large' }

export type AuthMethod = 'cli' | 'device' | 'token'

export interface ProviderInfo {
  id: string
  displayName: string
  cli: string | null
  methods: AuthMethod[]
}

export interface PullRequestContext {
  remote: RemoteRepo | null
  provider: ProviderInfo | null
  account: Account | null
  defaultBranch: string | null
}

export interface PullRequestDiff {
  from: string
  to: string
  files: FileChange[]
}

export interface MjolnirApi {
  platform: NodeJS.Platform
  appHost: Host
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    isMaximized(): Promise<boolean>
    onMaximizedChange(listener: (maximized: boolean) => void): () => void
  }
  settings: {
    get(): Promise<Settings>
    update(patch: Partial<Settings>): Promise<Settings>
  }
  profiles: {
    list(): Promise<TerminalProfile[]>
  }
  repos: {
    list(): Promise<Repo[]>
    hosts(): Promise<Host[]>
    discover(host: Host): Promise<DiscoveredRepos>
    add(host: Host, path: string): Promise<Repo>
    browse(host: Host, title: string): Promise<Repo | null>
    remove(id: string): Promise<void>
    branches(id: string): Promise<BranchList>
    fetch(id: string): Promise<BranchList>
  }
  worktrees: {
    list(repoId: string): Promise<Worktree[]>
    create(repoId: string, branch: string, base: string): Promise<Worktree>
    remove(repoId: string, path: string, force: boolean): Promise<void>
    changedFiles(repoId: string, path: string): Promise<number>
  }
  accounts: {
    providers(): Promise<ProviderInfo[]>
    list(): Promise<Account[]>
    connectCli(provider: string): Promise<Account>
    connectToken(provider: string, token: string): Promise<Account>
    startDeviceFlow(provider: string): Promise<DeviceCode>
    finishDeviceFlow(provider: string): Promise<Account>
    cancelDeviceFlow(provider: string): void
    disconnect(provider: string, host: string): Promise<void>
  }
  pulls: {
    context(repoId: string): Promise<PullRequestContext>
    list(repoId: string, query: PullRequestQuery): Promise<PullRequestSummary[]>
    get(repoId: string, number: number): Promise<PullRequestDetail>
    forBranch(repoId: string, branch: string): Promise<PullRequestSummary | null>
    comments(repoId: string, number: number): Promise<PullRequestComment[]>
    comment(repoId: string, number: number, body: string): Promise<PullRequestComment>
    create(repoId: string, worktreePath: string, input: CreatePullRequestInput): Promise<PullRequestSummary>
    diff(repoId: string, number: number, base: string): Promise<PullRequestDiff>
    diffFile(repoId: string, from: string, to: string, change: FileChange): Promise<DiffFile>
  }
  diff: {
    compare(repoId: string, path: string, mode: CompareMode): Promise<SessionDiff>
    file(repoId: string, path: string, from: string, change: FileChange): Promise<DiffFile>
  }
  pty: {
    spawn(request: SpawnRequest): Promise<void>
    write(id: string, data: string): void
    resize(id: string, cols: number, rows: number): void
    kill(id: string): void
    onData(listener: (id: string, data: string) => void): () => void
    onExit(listener: (id: string, exitCode: number) => void): () => void
  }
}
