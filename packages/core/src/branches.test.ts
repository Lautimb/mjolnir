import { describe, expect, it } from 'vitest'
import { findBranch, groupBranches, parseBranchRefs, worktreeAddArgs, type BranchList, type BranchRef } from './branches'

const ref = (name: string, overrides: Partial<BranchRef> = {}): BranchRef => ({
  name,
  remote: name.startsWith('origin/') ? 'origin' : null,
  mine: false,
  updatedAt: 0,
  ...overrides,
})

describe('parseBranchRefs', () => {
  it('splits local and remote refs, marks the ones whose tip commit is mine and drops the remote HEAD alias', () => {
    const output = [
      'refs/heads/feat/x\t<Me@Example.com>\t300',
      'refs/remotes/origin/HEAD\t<other@example.com>\t200',
      'refs/remotes/origin/develop\t<other@example.com>\t200',
      'refs/remotes/upstream/master\t<me@example.com>\t100',
    ].join('\n')

    expect(parseBranchRefs(output, 'me@example.com')).toEqual([
      { name: 'feat/x', remote: null, mine: true, updatedAt: 300 },
      { name: 'origin/develop', remote: 'origin', mine: false, updatedAt: 200 },
      { name: 'upstream/master', remote: 'upstream', mine: true, updatedAt: 100 },
    ])
  })

  it('marks nothing as mine when git has no user.email configured', () => {
    expect(parseBranchRefs('refs/heads/x\t<>\t1', null)[0]?.mine).toBe(false)
  })
})

describe('worktreeAddArgs', () => {
  const refs = [ref('feat/x'), ref('origin/develop'), ref('origin/feat/x')]

  it('checks out an existing local branch as is', () => {
    expect(worktreeAddArgs(refs, '/wt', 'feat/x', 'origin/develop')).toEqual(['worktree', 'add', '/wt', 'feat/x'])
  })

  it('creates a tracking branch when the name only exists on a remote', () => {
    expect(worktreeAddArgs(refs, '/wt', 'develop', 'main')).toEqual(['worktree', 'add', '--track', '-b', 'develop', '/wt', 'origin/develop'])
  })

  it('creates new branches without tracking the base, so the first push goes to their own remote branch', () => {
    expect(worktreeAddArgs(refs, '/wt', 'feat/new', 'origin/develop')).toEqual([
      'worktree', 'add', '--no-track', '-b', 'feat/new', '/wt', 'origin/develop',
    ])
  })

  it('prefers the local branch when the name exists both locally and on a remote', () => {
    expect(findBranch(refs, 'feat/x')?.remote).toBeNull()
  })
})

describe('groupBranches', () => {
  const list: BranchList = {
    defaultBase: 'origin/develop',
    refs: [
      ref('feat/local', { updatedAt: 50 }),
      ref('origin/master', { updatedAt: 10 }),
      ref('origin/develop', { updatedAt: 5 }),
      ref('origin/sandbox', { updatedAt: 1 }),
      ref('origin/feat/local', { mine: true, updatedAt: 50 }),
      ref('origin/feat/old-mine', { mine: true, updatedAt: 20 }),
      ref('origin/feat/new-mine', { mine: true, updatedAt: 40 }),
      ref('origin/feat/juan', { updatedAt: 30 }),
      ref('origin/fix/ana', { updatedAt: 60 }),
    ],
  }
  const names = (query: string) =>
    Object.fromEntries(groupBranches(list, query).groups.map((group) => [group.id, group.refs.map((r) => r.name)]))

  it('without a query shows principal, local and mine, and only counts the branches of others', () => {
    expect(names('')).toEqual({
      principal: ['origin/develop', 'origin/master', 'origin/sandbox'],
      local: ['feat/local'],
      mine: ['origin/feat/new-mine', 'origin/feat/old-mine'],
    })
    expect(groupBranches(list, '').hiddenOthers).toBe(2)
  })

  it('with a query also searches the branches of others, newest first', () => {
    expect(names('feat')).toEqual({
      local: ['feat/local'],
      mine: ['origin/feat/new-mine', 'origin/feat/old-mine'],
      others: ['origin/feat/juan'],
    })
    expect(names('ana juan')).toEqual({})
    expect(names('fix ana')).toEqual({ others: ['origin/fix/ana'] })
  })
})
