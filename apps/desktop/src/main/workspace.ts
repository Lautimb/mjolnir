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
  isInside,
  resolveLocation,
  sameHost,
  TAKE_PROMPT_FILE,
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
import type { CommitDiff, DiffFile, HistoryScope, SessionDiff, SessionHistory, TakePrompts } from '../shared/api'
import { AppError } from '../shared/errors'
import { diffBetweenRefs, diffContent, MAX_DIFF_BYTES } from './diff-content'
import type { Store } from './store'

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
    const { repo, git } = this.open(repoId)
    const worktree = await this.worktree(repoId, path)
    if (worktree.main) throw new AppError('unknownWorktree', { path })
    if (!force && (await git.changedFiles(worktree.path)) > 0) {
      throw new AppError('worktreeDirty', { name: worktree.branch ?? worktree.path })
    }
    await git.removeWorktree(repo.path, worktree.path, force)
    this.store.setSessionBase(sessionKey(repoId, worktree.path), null)
  }

  async worktree(repoId: string, path: string): Promise<Worktree> {
    const worktree = (await this.worktrees(repoId)).find((candidate) => candidate.path === path)
    if (!worktree) throw new AppError('unknownWorktree', { path })
    return worktree
  }

  async nativeWorktreePath(repoId: string, path: string): Promise<string> {
    const worktree = await this.worktree(repoId, path)
    return toNativePath(process.platform, this.repo(repoId).host, worktree.path)
  }

  async compare(repoId: string, path: string, mode: CompareMode): Promise<SessionDiff> {
    const { repo, diff } = this.open(repoId)
    await this.worktree(repoId, path)
    const base = await this.sessionBase(repo, path)
    const from = await diff.resolveFrom(path, mode, base)
    return { mode, base, from, files: await diff.files(path, from) }
  }

  async history(repoId: string, path: string, scope: HistoryScope, limit: number): Promise<SessionHistory> {
    const { repo, diff } = this.open(repoId)
    await this.worktree(repoId, path)
    const base = await this.sessionBase(repo, path)
    const since = scope === 'branch' && base ? await diff.resolveFrom(path, 'branch', base) : null
    const commits = await diff.log(path, since, limit + 1)
    return { base, commits: commits.slice(0, limit), more: commits.length > limit }
  }

  async commitDiff(repoId: string, path: string, sha: string): Promise<CommitDiff> {
    const { diff } = this.open(repoId)
    await this.worktree(repoId, path)
    const from = await diff.parent(path, sha)
    return { from, to: sha, files: await diff.files(path, from, sha) }
  }

  async commitFile(repoId: string, path: string, from: string, to: string, change: FileChange): Promise<DiffFile> {
    const { diff } = this.open(repoId)
    await this.worktree(repoId, path)
    return diffBetweenRefs(diff, path, from, to, change)
  }

  private async sessionBase(repo: Repo, path: string): Promise<string | null> {
    return this.store.sessionBase(sessionKey(repo.id, path)) ?? (await this.git(repo).defaultBase(repo.path))
  }

  async diffFile(repoId: string, path: string, from: string, change: FileChange): Promise<DiffFile> {
    const { repo, diff } = this.open(repoId)
    await this.worktree(repoId, path)
    if (change.binary) return { kind: 'binary' }
    const modified = change.status === 'deleted' ? '' : await this.readWorkingFile(repo, path, change.path)
    if (modified === null) return { kind: 'too-large' }
    return diffContent(await diff.original(path, from, change), modified)
  }

  private async readWorkingFile(repo: Repo, dir: string, file: string): Promise<string | null> {
    const paths = hostPath(repo.host)
    if (!isInside(paths, dir, file)) throw new AppError('unknownWorktree', { path: file })
    const target = paths.resolve(dir, file)
    const nativePath = toNativePath(process.platform, repo.host, target)
    if ((await stat(nativePath)).size > MAX_DIFF_BYTES) return null
    return readFile(nativePath, 'utf8')
  }

  async takePrompts(repoId: string): Promise<TakePrompts> {
    const repo = this.repo(repoId)
    const shared = await this.readWorkingFile(repo, repo.path, TAKE_PROMPT_FILE).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null
      throw error
    })
    return { app: this.store.takePrompt(repoId), repo: shared?.trim() || null }
  }

  setTakePrompt(repoId: string, template: string | null): void {
    this.repo(repoId)
    this.store.setTakePrompt(repoId, template)
  }

  async changedFiles(repoId: string, path: string): Promise<number> {
    const worktree = await this.worktree(repoId, path)
    return this.git(this.repo(repoId)).changedFiles(worktree.path)
  }

  open(repoId: string): { repo: Repo; git: Git; diff: ReturnType<typeof createDiff> } {
    const repo = this.repo(repoId)
    return { repo, git: this.git(repo), diff: createDiff(createHostExec(repo.host)) }
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
