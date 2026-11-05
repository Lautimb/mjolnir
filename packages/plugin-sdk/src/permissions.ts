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
}

export function missingPermissions(requested: GrantablePermissions, granted: GrantablePermissions): GrantablePermissions {
  const network = (requested.network ?? []).filter((pattern) => !(granted.network ?? []).includes(pattern))
  return network.length ? { network } : {}
}

export function hasPermissions(permissions: GrantablePermissions): boolean {
  return (permissions.network?.length ?? 0) > 0
}
