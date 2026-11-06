import { describe, expect, it } from 'vitest'
import type { FileChange } from '@mjolnir/core/browser'
import { buildTree, filesInOrder, type TreeNode } from './tree'

const change = (path: string, additions: number | null = 1, deletions: number | null = 0): FileChange =>
  ({ path, status: 'modified', additions, deletions }) as FileChange

const shape = (nodes: TreeNode[]): unknown[] =>
  nodes.map((node) => (node.kind === 'file' ? node.name : { [node.name]: shape(node.children) }))

describe('buildTree', () => {
  it('lists folders before files, alphabetically', () => {
    expect(shape(buildTree([change('z.ts'), change('b/x.ts'), change('a.ts'), change('a/y.ts')]))).toEqual([
      { a: ['y.ts'] },
      { b: ['x.ts'] },
      'a.ts',
      'z.ts',
    ])
  })

  it('walks files in the order the tree shows them', () => {
    expect(filesInOrder(buildTree([change('z.ts'), change('a/y.ts')])).map((file) => file.path)).toEqual(['a/y.ts', 'z.ts'])
  })

  it('compacts folder chains with a single subfolder into one row', () => {
    const tree = buildTree([change('apps/desktop/src/main/a.ts'), change('apps/desktop/src/renderer/b.ts')])
    expect(shape(tree)).toEqual([{ 'apps/desktop/src': [{ main: ['a.ts'] }, { renderer: ['b.ts'] }] }])
    expect(tree[0]).toMatchObject({ kind: 'dir', path: 'apps/desktop/src' })
  })

  it('does not compact a folder that also holds files', () => {
    expect(shape(buildTree([change('src/index.ts'), change('src/lib/a.ts')]))).toEqual([{ src: [{ lib: ['a.ts'] }, 'index.ts'] }])
  })

  it('sums the changes of everything inside each folder, counting binaries as zero', () => {
    const [src] = buildTree([change('src/a.ts', 3, 1), change('src/lib/b.ts', 2, 5), change('src/logo.png', null, null)])
    expect(src).toMatchObject({ additions: 5, deletions: 6 })
  })
})
