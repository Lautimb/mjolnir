import { BRANCH_FORMAT, parseBranchRefs, worktreeAddArgs, type BranchList } from './branches'
import type { PathApi } from './node'

export type Exec = (cwd: string, file: string, args: string[]) => Promise<string>

export interface Worktree {
  path: string
  head: string
  branch: string | null
  main: boolean
  locked: boolean
  prunable: boolean
}

export function parseWorktreeList(output: string): Worktree[] {
  return output
    .split(/\r?\n\r?\n/)
    .map((block) => block.split(/\r?\n/).filter(Boolean))
    .filter((lines) => lines[0]?.startsWith('worktree '))
    .map((lines, index) => {
      const value = (key: string) => lines.find((line) => line === key || line.startsWith(`${key} `))
      const branch = value('branch')?.slice('branch '.length).replace(/^refs\/heads\//, '') ?? null
      return {
        path: lines[0]!.slice('worktree '.length),
        head: value('HEAD')?.slice('HEAD '.length) ?? '',
        branch,
        main: index === 0,
        locked: value('locked') !== undefined,
        prunable: value('prunable') !== undefined,
      }
    })
}

export function sanitizeBranch(branch: string): string {
  return branch.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '')
}

export function worktreePath(paths: PathApi, home: string, repoName: string, branch: string): string {
  return paths.join(home, '.mjolnir', 'worktrees', repoName, sanitizeBranch(branch))
}

export function createGit(exec: Exec, paths: PathApi) {
  const git = (cwd: string, ...args: string[]) => exec(cwd, 'git', args)
  const lines = (output: string) => output.split(/\r?\n/).filter(Boolean)
  const normalize = (p: string) => paths.normalize(p)
  const orNull = (out: Promise<string>) => out.then((value) => value.trim() || null, () => null)

  return {
    async toplevel(dir: string): Promise<string> {
      return normalize((await git(dir, 'rev-parse', '--show-toplevel')).trim())
    },

    async worktrees(repo: string): Promise<Worktree[]> {
      return parseWorktreeList(await git(repo, 'worktree', 'list', '--porcelain')).map((wt) => ({
        ...wt,
        path: normalize(wt.path),
      }))
    },

    async defaultBase(repo: string): Promise<string | null> {
      return orNull(git(repo, 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'))
    },

    async branches(repo: string): Promise<BranchList> {
      const [output, email, defaultBase] = await Promise.all([
        git(repo, 'for-each-ref', '--sort=-committerdate', `--format=${BRANCH_FORMAT}`, 'refs/heads', 'refs/remotes'),
        orNull(git(repo, 'config', 'user.email')),
        this.defaultBase(repo),
      ])
      return { refs: parseBranchRefs(output, email), defaultBase }
    },

    async fetch(repo: string): Promise<void> {
      await git(repo, 'fetch', '--all', '--prune')
    },

    async addWorktree(repo: string, path: string, branch: string, base: string): Promise<void> {
      await git(repo, ...worktreeAddArgs((await this.branches(repo)).refs, path, branch, base))
    },

    async removeWorktree(repo: string, path: string, force: boolean): Promise<void> {
      await git(repo, 'worktree', 'remove', ...(force ? ['--force'] : []), path)
    },

    async changedFiles(dir: string): Promise<number> {
      return lines(await git(dir, 'status', '--porcelain=v1')).length
    },
  }
}

export type Git = ReturnType<typeof createGit>
