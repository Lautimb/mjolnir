export interface ParsedRemote {
  host: string
  path: string
}

export type { RemoteRepo } from '@mjolnir/plugin-sdk/providers'

export function parseRemoteUrl(url: string): ParsedRemote | null {
  const trimmed = url.trim()
  const scp = /^(?:[\w.-]+@)?([\w.-]{2,}):(?!\/\/)(.+)$/.exec(trimmed)
  const parsed = scp ? { host: scp[1]!, path: decode(scp[2]!) } : fromUrl(trimmed)
  if (!parsed) return null
  const path = parsed.path.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '')
  return path ? { host: parsed.host.toLowerCase(), path } : null
}

function fromUrl(value: string): ParsedRemote | null {
  try {
    const url = new URL(value)
    return url.hostname ? { host: url.hostname, path: decode(url.pathname) } : null
  } catch {
    return null
  }
}

function decode(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}
