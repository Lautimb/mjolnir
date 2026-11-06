import type { FileChange } from '@mjolnir/core/browser'

export interface DirNode {
  kind: 'dir'
  name: string
  path: string
  children: TreeNode[]
  additions: number
  deletions: number
}

export interface FileNode {
  kind: 'file'
  name: string
  file: FileChange
}

export type TreeNode = DirNode | FileNode

export function buildTree(files: FileChange[]): TreeNode[] {
  const root: DirNode = { kind: 'dir', name: '', path: '', children: [], additions: 0, deletions: 0 }
  for (const file of files) {
    const parts = file.path.split('/')
    let dir = root
    for (const name of parts.slice(0, -1)) {
      const path = dir.path ? `${dir.path}/${name}` : name
      let next = dir.children.find((child): child is DirNode => child.kind === 'dir' && child.path === path)
      if (!next) {
        next = { kind: 'dir', name, path, children: [], additions: 0, deletions: 0 }
        dir.children.push(next)
      }
      dir = next
    }
    dir.children.push({ kind: 'file', name: parts.at(-1)!, file })
  }
  return root.children.map(finish).sort(compare)
}

function finish(node: TreeNode): TreeNode {
  if (node.kind === 'file') return node
  let dir = node
  let only = dir.children[0]
  while (dir.children.length === 1 && only?.kind === 'dir') {
    dir = { ...only, name: `${dir.name}/${only.name}` }
    only = dir.children[0]
  }
  const children = dir.children.map(finish).sort(compare)
  const totals = children.reduce(
    (sum, child) => {
      const [additions, deletions] = child.kind === 'dir' ? [child.additions, child.deletions] : [child.file.additions ?? 0, child.file.deletions ?? 0]
      return { additions: sum.additions + additions, deletions: sum.deletions + deletions }
    },
    { additions: 0, deletions: 0 },
  )
  return { ...dir, children, ...totals }
}

function compare(a: TreeNode, b: TreeNode): number {
  if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
  return a.name.localeCompare(b.name)
}

export function filesInOrder(nodes: TreeNode[]): FileChange[] {
  return nodes.flatMap((node) => (node.kind === 'file' ? [node.file] : filesInOrder(node.children)))
}
