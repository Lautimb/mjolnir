import type { Host } from '@mjolnir/core/browser'

export function absolutePath(root: string, relative: string, host: Host): string {
  const joined = `${root.replace(/[\\/]+$/, '')}/${relative}`
  return host.kind === 'windows' ? joined.replaceAll('/', '\\') : joined
}

export function wslWindowsPath(linuxPath: string, distro: string): string {
  return `\\\\wsl.localhost\\${distro}${linuxPath.replaceAll('/', '\\')}`
}
