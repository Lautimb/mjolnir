import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import {
  createGit,
  createHostExec,
  discoverRepos,
  hostHome,
  hostPath,
  resolveLocation,
  sameHost,
  worktreePath,
  type BranchList,
  type DiscoveredRepos,
  type Git,
  type Host,
  type Repo,
  type Worktree,
} from '@mjolnir/core'
import type { Store } from './store'

export class Workspace {
  constructor(private readonly store: Store) {}

  repos(): Repo[] {
    return this.store.repos()
  }

  async addNativePath(nativePath: string): Promise<Repo> {
    const { host, path } = resolveLocation(process.platform, process.env, nativePath)
    return this.addRepo(host, path)
  }

  async addRepo(host: Host, path: string): Promise<Repo> {
    const root = await this.git({ host }).toplevel(path)
    const existing = this.store.repos().find((repo) => sameHost(repo.host, host) && repo.path === root)
    if (existing) return existing

    const repo: Repo = { id: randomUUID(), name: hostPath(host).basename(root), path: root, host }
    this.store.addRepo(repo)
    return repo
  }

  async discover(host: Host): Promise<DiscoveredRepos> {
    if (host.kind === 'windows') return { home: homedir(), repos: [] }
    return discoverRepos(createHostExec(host))
  }

  removeRepo(id: string): void {
    this.store.removeRepo(id)
  }

  async worktrees(repoId: string): Promise<Worktree[]> {
    const repo = this.repo(repoId)
    return (await this.git(repo).worktrees(repo.path)).filter((wt) => !wt.prunable)
  }

  async branches(repoId: string): Promise<BranchList> {
    const repo = this.repo(repoId)
    return this.git(repo).branches(repo.path)
  }

  async fetch(repoId: string): Promise<BranchList> {
    const repo = this.repo(repoId)
    await this.git(repo).fetch(repo.path)
    return this.git(repo).branches(repo.path)
  }

  async createWorktree(repoId: string, branch: string, base: string): Promise<Worktree> {
    const repo = this.repo(repoId)
    const git = this.git(repo)
    const home = await hostHome(repo.host)
    const target = worktreePath(hostPath(repo.host), home, repo.name, branch)
    await git.addWorktree(repo.path, target, branch, base)
    const created = (await git.worktrees(repo.path)).find((wt) => wt.path === target)
    if (!created) throw new Error(`El worktree no aparece en ${target}`)
    return created
  }

  async removeWorktree(repoId: string, path: string, force: boolean): Promise<void> {
    const repo = this.repo(repoId)
    await this.git(repo).removeWorktree(repo.path, path, force)
  }

  async changedFiles(repoId: string, path: string): Promise<number> {
    return this.git(this.repo(repoId)).changedFiles(path)
  }

  private repo(id: string): Repo {
    const repo = this.store.repos().find((r) => r.id === id)
    if (!repo) throw new Error(`Repo desconocido: ${id}`)
    return repo
  }

  private git({ host }: Pick<Repo, 'host'>): Git {
    return createGit(createHostExec(host), hostPath(host))
  }
}
