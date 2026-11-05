import type { RemoteRepo } from './providers'

export interface ParsedRemote {
  host: string
  path: string
}

export interface RemoteRule {
  host: string
  path: string
  repo: { host?: string; owner: string; name: string }
}

const VARIABLE = /\{([a-z]+)\}/g
const NAME = /^[a-z]+$/

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compile(template: string, part: 'host' | 'path'): RegExp {
  const piece = part === 'host' ? '([a-z0-9-]+)' : '([^/]+)'
  let source = ''
  let last = 0
  for (const match of template.matchAll(VARIABLE)) {
    source += escape(template.slice(last, match.index)) + piece.replace('(', `(?<${match[1]}>`)
    last = match.index + match[0].length
  }
  return new RegExp(`^${source + escape(template.slice(last))}$`, part === 'host' ? 'i' : '')
}

function variables(template: string): string[] {
  return [...template.matchAll(VARIABLE)].map((match) => match[1]!)
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(VARIABLE, (_, name: string) => values[name] ?? '')
}

export function isRemoteRule(rule: RemoteRule): boolean {
  const captured = [...variables(rule.host), ...variables(rule.path)]
  const used = [...variables(rule.repo.host ?? ''), ...variables(rule.repo.owner), ...variables(rule.repo.name)]
  return (
    new Set(captured).size === captured.length &&
    captured.every((name) => NAME.test(name)) &&
    used.every((name) => captured.includes(name)) &&
    /^[a-z0-9.{}-]+$/i.test(rule.host) &&
    !rule.path.startsWith('/')
  )
}

export function matchRemote(rules: readonly RemoteRule[], provider: string, remote: ParsedRemote): RemoteRepo | null {
  for (const rule of rules) {
    const host = compile(rule.host, 'host').exec(remote.host)
    const path = host && compile(rule.path, 'path').exec(remote.path)
    if (!host || !path) continue
    const values = { ...host.groups, ...path.groups }
    return {
      provider,
      host: (rule.repo.host ? fill(rule.repo.host, values) : remote.host).toLowerCase(),
      owner: fill(rule.repo.owner, values),
      name: fill(rule.repo.name, values),
    }
  }
  return null
}
