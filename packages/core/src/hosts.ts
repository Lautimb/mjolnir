export type Host = { kind: 'windows' } | { kind: 'wsl'; distro: string } | { kind: 'posix' }

export interface HostLocation {
  host: Host
  path: string
}

export interface Command {
  file: string
  args: string[]
  cwd?: string
}

const WSL_UNC = /^\\\\wsl(?:\$|\.localhost)\\([^\\]+)(\\.*)?$/i

export function resolveLocation(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  nativePath: string,
): HostLocation {
  if (platform === 'win32') {
    const match = WSL_UNC.exec(nativePath)
    if (match) {
      const rest = (match[2] ?? '').replaceAll('\\', '/')
      return { host: { kind: 'wsl', distro: match[1]! }, path: rest || '/' }
    }
    return { host: { kind: 'windows' }, path: nativePath }
  }
  if (env.WSL_DISTRO_NAME) return { host: { kind: 'wsl', distro: env.WSL_DISTRO_NAME }, path: nativePath }
  return { host: { kind: 'posix' }, path: nativePath }
}

export function sameHost(a: Host, b: Host): boolean {
  if (a.kind === 'wsl' && b.kind === 'wsl') return a.distro === b.distro
  return a.kind === b.kind
}

export function hostKey(host: Host): string {
  return host.kind === 'wsl' ? `wsl:${host.distro}` : host.kind
}

export function toNativePath(platform: NodeJS.Platform, host: Host, path: string): string {
  if (platform === 'win32' && host.kind === 'wsl') return `\\\\wsl.localhost\\${host.distro}${path.replaceAll('/', '\\')}`
  return path
}

export function hostLabel(host: Host): string {
  if (host.kind === 'wsl') return `WSL: ${host.distro}`
  return host.kind === 'windows' ? 'Windows' : 'Local'
}

export function buildHostCommand(
  platform: NodeJS.Platform,
  host: Host,
  cwd: string,
  file: string,
  args: string[],
): Command {
  if (platform === 'win32' && host.kind === 'wsl') {
    return { file: 'wsl.exe', args: ['-d', host.distro, '--cd', cwd, '--exec', file, ...args] }
  }
  return { file, args, cwd }
}
