export interface BranchRef {
  name: string
  remote: string | null
  mine: boolean
  updatedAt: number
}

export interface BranchList {
  refs: BranchRef[]
  defaultBase: string | null
}

export type BranchGroupId = 'principal' | 'local' | 'mine' | 'others'

export interface BranchGroup {
  id: BranchGroupId
  refs: BranchRef[]
}

export const BRANCH_FORMAT = '%(refname)%09%(authoremail)%09%(committerdate:unix)'

const PRINCIPAL_NAMES = ['main', 'master', 'develop', 'development', 'dev', 'staging', 'sandbox', 'qa', 'release']

export function parseBranchRefs(output: string, userEmail: string | null): BranchRef[] {
  const me = userEmail?.trim() ? `<${userEmail.trim().toLowerCase()}>` : null
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line): BranchRef[] => {
      const [ref = '', email = '', date = ''] = line.split('\t')
      const meta = { mine: me !== null && email.toLowerCase() === me, updatedAt: Number(date) || 0 }
      if (ref.startsWith('refs/heads/')) return [{ name: ref.slice('refs/heads/'.length), remote: null, ...meta }]
      if (ref.startsWith('refs/remotes/') && !ref.endsWith('/HEAD')) {
        const name = ref.slice('refs/remotes/'.length)
        return [{ name, remote: name.split('/')[0]!, ...meta }]
      }
      return []
    })
}

export function shortName(ref: BranchRef): string {
  return ref.remote ? ref.name.slice(ref.remote.length + 1) : ref.name
}

export function findBranch(refs: BranchRef[], name: string): BranchRef | undefined {
  return refs.find((ref) => !ref.remote && ref.name === name) ?? refs.find((ref) => ref.remote && shortName(ref) === name)
}

export function worktreeAddArgs(refs: BranchRef[], path: string, branch: string, base: string): string[] {
  const existing = findBranch(refs, branch)
  if (existing && !existing.remote) return ['worktree', 'add', path, branch]
  if (existing) return ['worktree', 'add', '--track', '-b', branch, path, existing.name]
  return ['worktree', 'add', '--no-track', '-b', branch, path, base]
}

export function groupBranches(list: BranchList, query: string): { groups: BranchGroup[]; hiddenOthers: number } {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (ref: BranchRef) => terms.every((term) => ref.name.toLowerCase().includes(term))
  const byRecent = (a: BranchRef, b: BranchRef) => b.updatedAt - a.updatedAt
  const principalRank = (ref: BranchRef) => (ref.name === list.defaultBase ? -1 : PRINCIPAL_NAMES.indexOf(shortName(ref)))
  const isPrincipal = (ref: BranchRef) =>
    ref.name === list.defaultBase || (ref.remote !== null && PRINCIPAL_NAMES.includes(shortName(ref)))

  const localNames = new Set(list.refs.filter((ref) => !ref.remote).map((ref) => ref.name))
  const rest = list.refs
    .filter((ref) => ref.remote && !isPrincipal(ref) && !localNames.has(shortName(ref)))
    .sort(byRecent)
  const others = rest.filter((ref) => !ref.mine)

  const groups: BranchGroup[] = [
    { id: 'principal', refs: list.refs.filter(isPrincipal).sort((a, b) => principalRank(a) - principalRank(b)) },
    { id: 'local', refs: list.refs.filter((ref) => !ref.remote).sort(byRecent) },
    { id: 'mine', refs: rest.filter((ref) => ref.mine) },
    { id: 'others', refs: terms.length > 0 ? others : [] },
  ]

  return {
    groups: groups.map((group) => ({ ...group, refs: group.refs.filter(matches) })).filter((group) => group.refs.length > 0),
    hiddenOthers: terms.length > 0 ? 0 : others.length,
  }
}
