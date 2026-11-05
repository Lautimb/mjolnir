export const ANY_ORIGIN = '*'

const ORIGIN_PATTERN = /^https?:\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*(:\d{1,5})?$/

export function isOriginPattern(pattern: string): boolean {
  return pattern === ANY_ORIGIN || ORIGIN_PATTERN.test(pattern)
}

function parse(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

export function matchesOrigin(pattern: string, url: string): boolean {
  const target = parse(url)
  if (!target || (target.protocol !== 'https:' && target.protocol !== 'http:')) return false
  if (pattern === ANY_ORIGIN) return true
  const wildcard = pattern.includes('://*.')
  const allowed = parse(pattern.replace('://*.', '://'))
  if (!allowed || allowed.protocol !== target.protocol || allowed.port !== target.port) return false
  return wildcard ? target.hostname.endsWith(`.${allowed.hostname}`) : target.hostname === allowed.hostname
}

export function allowsUrl(patterns: readonly string[] | undefined, url: string): boolean {
  return (patterns ?? []).some((pattern) => matchesOrigin(pattern, url))
}

export interface GrantablePermissions {
  network?: string[]
  workspace?: 'read'
  repoFiles?: string[]
  accounts?: string[]
  cli?: string[]
}

const LISTS = ['network', 'repoFiles', 'accounts', 'cli'] as const

export function missingPermissions(requested: GrantablePermissions, granted: GrantablePermissions): GrantablePermissions {
  const missing: GrantablePermissions = {}
  for (const key of LISTS) {
    const entries = (requested[key] ?? []).filter((entry) => !(granted[key] ?? []).includes(entry))
    if (entries.length) missing[key] = entries
  }
  if (requested.workspace && !granted.workspace) missing.workspace = requested.workspace
  return missing
}

export function mergePermissions(current: GrantablePermissions, approved: GrantablePermissions): GrantablePermissions {
  const merged: GrantablePermissions = {}
  for (const key of LISTS) {
    const entries = [...new Set([...(current[key] ?? []), ...(approved[key] ?? [])])]
    if (entries.length) merged[key] = entries
  }
  const workspace = current.workspace ?? approved.workspace
  if (workspace) merged.workspace = workspace
  return merged
}

export function hasPermissions(permissions: GrantablePermissions): boolean {
  return !!permissions.workspace || LISTS.some((key) => (permissions[key]?.length ?? 0) > 0)
}

export function seesWorkspace(permissions: GrantablePermissions): boolean {
  return !!permissions.workspace || (permissions.repoFiles?.length ?? 0) > 0
}
