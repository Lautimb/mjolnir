import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createGit, parseWorktreeList, sanitizeBranch, worktreePath, type Exec } from './git'
import { createHostExec } from './node'

describe('parseWorktreeList', () => {
  it('parses porcelain output and marks the first entry as the main worktree', () => {
    const output = [
      'worktree /home/me/repo',
      'HEAD 1111111111111111111111111111111111111111',
      'branch refs/heads/main',
      '',
      'worktree /home/me/.mjolnir/worktrees/repo/feat-login',
      'HEAD 2222222222222222222222222222222222222222',
      'branch refs/heads/feat/login',
      'locked',
      '',
      'worktree /tmp/detached',
      'HEAD 3333333333333333333333333333333333333333',
      'detached',
      'prunable gitdir file points to non-existent location',
      '',
    ].join('\n')

    expect(parseWorktreeList(output)).toEqual([
      { path: '/home/me/repo', head: '1'.repeat(40), branch: 'main', main: true, locked: false, prunable: false },
      {
        path: '/home/me/.mjolnir/worktrees/repo/feat-login',
        head: '2'.repeat(40),
        branch: 'feat/login',
        main: false,
        locked: true,
        prunable: false,
      },
      { path: '/tmp/detached', head: '3'.repeat(40), branch: null, main: false, locked: false, prunable: true },
    ])
  })
})

describe('worktreePath', () => {
  it('nests worktrees under ~/.mjolnir/worktrees/<repo>/<branch> with a filesystem-safe branch', () => {
    expect(sanitizeBranch('feat/login form')).toBe('feat-login-form')
    expect(worktreePath(path.posix, '/home/me', 'repo', 'feat/login')).toBe('/home/me/.mjolnir/worktrees/repo/feat-login')
    expect(worktreePath(path.win32, 'C:\\Users\\me', 'repo', 'fix/tabs')).toBe('C:\\Users\\me\\.mjolnir\\worktrees\\repo\\fix-tabs')
  })
})

describe('createGit', () => {
  it('normalizes the forward-slash paths git prints on Windows', async () => {
    const exec: Exec = async () => 'C:/code/repo\n'
    expect(await createGit(exec, path.win32).toplevel('C:\\code\\repo')).toBe('C:\\code\\repo')
  })
})

describe('createGit against a real repository', () => {
  let root: string
  let repo: string
  const git = createGit(createHostExec({ kind: 'posix' }), path.posix)
  const run = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' })

  beforeAll(() => {
    root = realpathSync(mkdtempSync(path.join(tmpdir(), 'mjolnir-git-')))
    repo = path.join(root, 'repo')
    execFileSync('git', ['init', '-q', '-b', 'main', repo])
    run(repo, 'config', 'user.email', 'test@example.com')
    run(repo, 'config', 'user.name', 'Test')
    writeFileSync(path.join(repo, 'README.md'), 'hi\n')
    run(repo, 'add', '.')
    run(repo, 'commit', '-q', '-m', 'init')
    run(repo, 'branch', 'existing')
  })

  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('creates a worktree on a new branch from a base, and on an existing branch without -b', async () => {
    const fresh = worktreePath(path.posix, root, 'repo', 'feat/new')
    const reused = worktreePath(path.posix, root, 'repo', 'existing')

    await git.addWorktree(repo, fresh, 'feat/new', 'main')
    await git.addWorktree(repo, reused, 'existing', 'main')

    const worktrees = await git.worktrees(repo)
    expect(worktrees[0]).toMatchObject({ branch: 'main', path: repo, main: true })
    expect(worktrees.slice(1).map((wt) => [wt.branch, wt.path, wt.main])).toEqual(
      expect.arrayContaining([
        ['feat/new', fresh, false],
        ['existing', reused, false],
      ]),
    )
    expect(await git.toplevel(fresh)).toBe(fresh)
  })

  it('counts changed files and refuses to remove a dirty worktree unless forced', async () => {
    const dirty = worktreePath(path.posix, root, 'repo', 'feat/new')
    writeFileSync(path.join(dirty, 'scratch.txt'), 'wip\n')
    expect(await git.changedFiles(dirty)).toBe(1)

    await expect(git.removeWorktree(repo, dirty, false)).rejects.toThrow(/modified or untracked/)
    await git.removeWorktree(repo, dirty, true)
    expect((await git.worktrees(repo)).map((wt) => wt.branch)).toEqual(['main', 'existing'])
  })
})

describe('createGit with a remote', () => {
  let root: string
  let clone: string
  const git = createGit(createHostExec({ kind: 'posix' }), path.posix)
  const run = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

  beforeAll(() => {
    root = realpathSync(mkdtempSync(path.join(tmpdir(), 'mjolnir-remote-')))
    const seed = path.join(root, 'seed')
    execFileSync('git', ['init', '-q', '-b', 'develop', seed])
    run(seed, 'config', 'user.email', 'test@example.com')
    run(seed, 'config', 'user.name', 'Test')
    writeFileSync(path.join(seed, 'README.md'), 'hi\n')
    run(seed, 'add', '.')
    run(seed, 'commit', '-q', '-m', 'init')
    run(seed, 'branch', 'master')
    execFileSync('git', ['clone', '-q', '--bare', seed, path.join(root, 'origin.git')])
    execFileSync('git', ['clone', '-q', path.join(root, 'origin.git'), path.join(root, 'clone')])
    clone = path.join(root, 'clone')
    run(clone, 'checkout', '-q', '-b', 'feat/local')
    run(clone, 'branch', '-q', '-D', 'develop')
  })

  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('lists remote branches, authorship and the remote default branch even when they were never checked out', async () => {
    run(clone, 'config', 'user.email', 'test@example.com')
    const { refs, defaultBase } = await git.branches(clone)
    expect(defaultBase).toBe('origin/develop')
    expect(refs.map((ref) => [ref.name, ref.remote, ref.mine]).sort()).toEqual([
      ['feat/local', null, true],
      ['origin/develop', 'origin', true],
      ['origin/master', 'origin', true],
    ])
    expect(refs.every((ref) => ref.updatedAt > 0)).toBe(true)
  })

  it('creates a new branch from a remote base without making it track that base', async () => {
    const target = path.join(root, 'wt-new')
    await git.addWorktree(clone, target, 'feat/new', 'origin/develop')
    expect(run(target, 'branch', '--show-current')).toBe('feat/new')
    expect(() => run(target, 'rev-parse', '--abbrev-ref', '@{upstream}')).toThrow()
  })

  it('opens a remote-only branch as a local branch that tracks it', async () => {
    const target = path.join(root, 'wt-master')
    await git.addWorktree(clone, target, 'master', 'origin/develop')
    expect(run(target, 'rev-parse', '--abbrev-ref', '@{upstream}')).toBe('origin/master')
  })
})
