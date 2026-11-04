import type { BranchList, CompareMode, DiscoveredRepos, FileChange, Host, Repo, TerminalProfile, Worktree } from '@mjolnir/core/browser'
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
    browse(host: Host): Promise<Repo | null>
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
