import type { Command, Host } from './hosts'

export interface TerminalProfile {
  id: string
  label: string
  host: Host
  file: string
  args: string[]
  cwd?: string
  launcher?: 'wsl'
}

export interface DetectContext {
  platform: NodeJS.Platform
  env: Record<string, string | undefined>
  exists(path: string): boolean
  listWslDistros(): string[]
}

export function parseWslDistroList(output: Buffer): string[] {
  const text = output.includes(0) ? output.toString('utf16le') : output.toString('utf8')
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((name) => name.length > 0 && !name.startsWith('docker-desktop'))
}

export function detectProfiles(ctx: DetectContext): TerminalProfile[] {
  if (ctx.platform === 'win32') return detectWindowsProfiles(ctx)
  return detectPosixProfiles(ctx)
}

export function spawnCommand(profile: TerminalProfile, cwd?: string): Command {
  if (profile.launcher === 'wsl') return { file: profile.file, args: [...profile.args, '--cd', cwd ?? '~'] }
  return { file: profile.file, args: profile.args, cwd: cwd ?? profile.cwd }
}

const WINDOWS: Host = { kind: 'windows' }

function detectWindowsProfiles(ctx: DetectContext): TerminalProfile[] {
  const { env } = ctx
  const programFiles = env.ProgramFiles ?? 'C:\\Program Files'
  const systemRoot = env.SystemRoot ?? 'C:\\Windows'
  const pwsh = `${programFiles}\\PowerShell\\7\\pwsh.exe`
  const wsl = `${systemRoot}\\System32\\wsl.exe`

  const wslProfiles: TerminalProfile[] = ctx.exists(wsl)
    ? ctx.listWslDistros().map((distro) => ({
        id: `wsl:${distro}`,
        label: `WSL: ${distro}`,
        host: { kind: 'wsl', distro },
        file: wsl,
        args: ['-d', distro],
        launcher: 'wsl',
      }))
    : []

  const windowsProfiles: TerminalProfile[] = [
    ...(ctx.exists(pwsh) ? [{ id: 'pwsh', label: 'PowerShell 7', host: WINDOWS, file: pwsh, args: ['-NoLogo'] }] : []),
    {
      id: 'powershell',
      label: 'Windows PowerShell',
      host: WINDOWS,
      file: `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
      args: ['-NoLogo'],
    },
    { id: 'cmd', label: 'Command Prompt', host: WINDOWS, file: env.ComSpec ?? 'cmd.exe', args: [] },
  ]

  return [...wslProfiles, ...windowsProfiles]
}

function detectPosixProfiles(ctx: DetectContext): TerminalProfile[] {
  const { env } = ctx
  const distro = env.WSL_DISTRO_NAME
  const shell = env.SHELL ?? '/bin/bash'

  const local: TerminalProfile = distro
    ? { id: `wsl:${distro}`, label: `WSL: ${distro}`, host: { kind: 'wsl', distro }, file: shell, args: ['-l'] }
    : { id: 'shell', label: shell.split('/').pop() ?? 'Shell', host: { kind: 'posix' }, file: shell, args: ['-l'] }

  if (!distro) return [local]

  const candidates: TerminalProfile[] = [
    { id: 'pwsh', label: 'PowerShell 7', host: WINDOWS, file: '/mnt/c/Program Files/PowerShell/7/pwsh.exe', args: ['-NoLogo'], cwd: '/mnt/c' },
    {
      id: 'powershell',
      label: 'Windows PowerShell',
      host: WINDOWS,
      file: '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
      args: ['-NoLogo'],
      cwd: '/mnt/c',
    },
    { id: 'cmd', label: 'Command Prompt', host: WINDOWS, file: '/mnt/c/Windows/System32/cmd.exe', args: [], cwd: '/mnt/c' },
  ]

  return [local, ...candidates.filter((profile) => ctx.exists(profile.file))]
}
