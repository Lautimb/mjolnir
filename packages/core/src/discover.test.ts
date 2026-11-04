import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { discoverRepos, parseDiscovered } from './discover'
import { createHostExec } from './node'

describe('parseDiscovered', () => {
  it('reads the root from the first line and strips the .git suffix from the rest', () => {
    expect(parseDiscovered('/home/me\n/home/me/b/.git\n/home/me/a/.git\n')).toEqual({
      home: '/home/me',
      repos: ['/home/me/a', '/home/me/b'],
    })
  })
})

describe('discoverRepos', () => {
  let root: string
  const dirs = (...parts: string[]) => mkdirSync(path.join(root, ...parts), { recursive: true })

  beforeAll(() => {
    root = realpathSync(mkdtempSync(path.join(tmpdir(), 'mjolnir-discover-')))
    dirs('projects', 'app', '.git')
    dirs('projects', 'app', 'node_modules', 'dep', '.git')
    dirs('projects', 'deep', 'a', 'b', 'c', 'd', 'e', '.git')
    dirs('.nvm', '.git')
    dirs('.mjolnir', 'worktrees', 'app', 'feat-x')
    writeFileSync(path.join(root, '.mjolnir', 'worktrees', 'app', 'feat-x', '.git'), 'gitdir: elsewhere\n')
    dirs('notes')
  })

  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('finds repos under the root, skipping node_modules, hidden folders and anything past the depth limit', async () => {
    expect(await discoverRepos(createHostExec({ kind: 'posix' }), root)).toEqual({
      home: root,
      repos: [path.join(root, 'projects', 'app')],
    })
  })
})
