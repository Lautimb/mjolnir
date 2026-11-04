import type { BranchList, DiscoveredRepos, Host, Repo, TerminalProfile, Worktree } from '@mjolnir/core/browser'
import type { Settings } from './settings'

export interface SpawnRequest {
  id: string
  profileId: string
  cols: number
  rows: number
  cwd?: string
  initialInput?: string
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
  pty: {
    spawn(request: SpawnRequest): Promise<void>
    write(id: string, data: string): void
    resize(id: string, cols: number, rows: number): void
    kill(id: string): void
    onData(listener: (id: string, data: string) => void): () => void
    onExit(listener: (id: string, exitCode: number) => void): () => void
  }
}
