import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import {
  createGit,
  createDiff,
  createHostExec,
  discoverRepos,
  findBranch,
  hostHome,
  hostPath,
  resolveLocation,
  sameHost,
  toNativePath,
  worktreePath,
  type CompareMode,
  type FileChange,
  type BranchList,
  type DiscoveredRepos,
  type Git,
  type Host,
  type Repo,
  type Worktree,
} from '@mjolnir/core'
import type { DiffFile, SessionDiff } from '../shared/api'
import { AppError } from '../shared/errors'
import type { Store } from './store'

const MAX_DIFF_BYTES = 1.5 * 1024 * 1024
const BINARY_SNIFF_BYTES = 8000

const sessionKey = (repoId: string, path: string) => `${repoId}::${path}`

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
    const isNew = !findBranch((await git.branches(repo.path)).refs, branch)
    await git.addWorktree(repo.path, target, branch, base)
    const created = (await git.worktrees(repo.path)).find((wt) => wt.path === target)
    if (!created) throw new AppError('worktreeMissing', { path: target })
    if (isNew) this.store.setSessionBase(sessionKey(repoId, target), base)
    return created
  }

  async removeWorktree(repoId: string, path: string, force: boolean): Promise<void> {
    const repo = this.repo(repoId)
    await this.git(repo).removeWorktree(repo.path, path, force)
    this.store.setSessionBase(sessionKey(repoId, path), null)
  }

  async compare(repoId: string, path: string, mode: CompareMode): Promise<SessionDiff> {
    const repo = this.repo(repoId)
    const diff = createDiff(createHostExec(repo.host))
    const base = this.store.sessionBase(sessionKey(repoId, path)) ?? (await this.git(repo).defaultBase(repo.path))
    const from = await diff.resolveFrom(path, mode, base)
    return { mode, base, from, files: await diff.files(path, from) }
  }

  async diffFile(repoId: string, path: string, from: string, change: FileChange): Promise<DiffFile> {
    const repo = this.repo(repoId)
    if (change.binary) return { kind: 'binary' }

    const modified = change.status === 'deleted' ? Buffer.alloc(0) : await this.readWorkingFile(repo, path, change.path)
    if (modified === 'too-large') return { kind: 'too-large' }
    if (modified.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return { kind: 'binary' }

    const original = await createDiff(createHostExec(repo.host)).original(path, from, change)
    if (original.length > MAX_DIFF_BYTES) return { kind: 'too-large' }
    return { kind: 'text', original, modified: modified.toString('utf8') }
  }

  private async readWorkingFile(repo: Repo, dir: string, file: string): Promise<Buffer | 'too-large'> {
    const nativePath = toNativePath(process.platform, repo.host, hostPath(repo.host).join(dir, file))
    if ((await stat(nativePath)).size > MAX_DIFF_BYTES) return 'too-large'
    return readFile(nativePath)
  }

  async changedFiles(repoId: string, path: string): Promise<number> {
    return this.git(this.repo(repoId)).changedFiles(path)
  }

  private repo(id: string): Repo {
    const repo = this.store.repos().find((r) => r.id === id)
    if (!repo) throw new AppError('unknownRepo', { id })
    return repo
  }

  private git({ host }: Pick<Repo, 'host'>): Git {
    return createGit(createHostExec(host), hostPath(host))
  }
}
