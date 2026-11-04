import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDiff, EMPTY_TREE, parseNameStatus, parseNumstat } from './diff'
import { createHostExec } from './node'

describe('parseNameStatus', () => {
  it('reads -z output including renames and copies', () => {
    const output = ['M', 'src/a.ts', 'A', 'new.ts', 'D', 'gone.ts', 'R087', 'old name.ts', 'new name.ts', 'C100', 'a.ts', 'copy.ts', ''].join('\0')
    expect(parseNameStatus(output)).toEqual([
      { path: 'src/a.ts', status: 'modified' },
      { path: 'new.ts', status: 'added' },
      { path: 'gone.ts', status: 'deleted' },
      { path: 'new name.ts', oldPath: 'old name.ts', status: 'renamed' },
      { path: 'copy.ts', status: 'added' },
    ])
  })
})

describe('parseNumstat', () => {
  it('reads -z output, keys renames by their new path and flags binary files', () => {
    const output = ['3\t1\tsrc/a.ts', '0\t0\t', 'old.ts', 'new.ts', '-\t-\tlogo.png', ''].join('\0')
    expect(Object.fromEntries(parseNumstat(output))).toEqual({
      'src/a.ts': { additions: 3, deletions: 1, binary: false },
      'new.ts': { additions: 0, deletions: 0, binary: false },
      'logo.png': { additions: null, deletions: null, binary: true },
    })
  })
})

describe('createDiff against a real repository', () => {
  let root: string
  let repo: string
  const diff = createDiff(createHostExec({ kind: 'posix' }))
  const run = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  const write = (file: string, content: string | Buffer) => writeFileSync(path.join(repo, file), content)
  const commit = (message: string) => {
    run(repo, 'add', '-A')
    run(repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', message)
  }

  beforeAll(() => {
    root = realpathSync(mkdtempSync(path.join(tmpdir(), 'mjolnir-diff-')))
    repo = path.join(root, 'repo')
    execFileSync('git', ['init', '-q', '-b', 'main', repo])
    write('keep.ts', 'export const a = 1\n')
    write('rename-me.ts', 'line 1\nline 2\nline 3\nline 4\nline 5\n')
    write('delete-me.ts', 'bye\n')
    commit('base')
    run(repo, 'switch', '-q', '-c', 'feat/x')
    write('committed.ts', 'from the branch\n')
    commit('branch work')
    write('keep.ts', 'export const a = 2\nexport const b = 3\n')
    unlinkSync(path.join(repo, 'delete-me.ts'))
    run(repo, 'mv', 'rename-me.ts', 'renamed.ts')
    write('untracked.md', '# draft\n')
    write('logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 1]))
    run(repo, 'add', 'logo.png')
  })

  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('in working mode lists uncommitted changes, staged or not, plus untracked files', async () => {
    const from = await diff.resolveFrom(repo, 'working', 'main')
    expect(from).toBe('HEAD')
    expect(await diff.files(repo, from)).toEqual([
      { path: 'delete-me.ts', status: 'deleted', additions: 0, deletions: 1, binary: false },
      { path: 'keep.ts', status: 'modified', additions: 2, deletions: 1, binary: false },
      { path: 'logo.png', status: 'added', additions: null, deletions: null, binary: true },
      { path: 'renamed.ts', oldPath: 'rename-me.ts', status: 'renamed', additions: 0, deletions: 0, binary: false },
      { path: 'untracked.md', status: 'untracked', additions: null, deletions: null, binary: false },
    ])
  })

  it('in branch mode compares against the merge base, so commits made on the branch show up too', async () => {
    const from = await diff.resolveFrom(repo, 'branch', 'main')
    expect(from).toBe(run(repo, 'rev-parse', 'main'))
    expect((await diff.files(repo, from)).map((file) => `${file.status}:${file.path}`)).toContain('added:committed.ts')
  })

  it('reads the original side from the comparison point, following renames', async () => {
    const files = await diff.files(repo, 'HEAD')
    const renamed = files.find((file) => file.status === 'renamed')!
    expect(await diff.original(repo, 'HEAD', renamed)).toBe('line 1\nline 2\nline 3\nline 4\nline 5\n')
    expect(await diff.original(repo, 'HEAD', files.find((file) => file.status === 'untracked')!)).toBe('')
  })

  it('compares against the empty tree when the repository has no commits yet', async () => {
    const fresh = path.join(root, 'fresh')
    execFileSync('git', ['init', '-q', '-b', 'main', fresh])
    writeFileSync(path.join(fresh, 'a.txt'), 'a\n')
    expect(await diff.resolveFrom(fresh, 'branch', 'main')).toBe(EMPTY_TREE)
    expect((await diff.files(fresh, EMPTY_TREE)).map((file) => file.status)).toEqual(['untracked'])
  })
})
