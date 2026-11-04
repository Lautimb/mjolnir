import { describe, expect, it } from 'vitest'
import { detectProfiles, parseWslDistroList, spawnCommand, type DetectContext } from './profiles'

function context(overrides: Partial<DetectContext>): DetectContext {
  return {
    platform: 'linux',
    env: {},
    exists: () => true,
    listWslDistros: () => [],
    ...overrides,
  }
}

describe('parseWslDistroList', () => {
  it('decodes the UTF-16LE output that wsl.exe prints on Windows', () => {
    const output = Buffer.from('\uFEFFUbuntu\r\nDebian\r\n', 'utf16le')
    expect(parseWslDistroList(output)).toEqual(['Ubuntu', 'Debian'])
  })

  it('accepts UTF-8 output when WSL_UTF8 is set', () => {
    expect(parseWslDistroList(Buffer.from('Ubuntu\nDebian\n'))).toEqual(['Ubuntu', 'Debian'])
  })

  it('hides Docker Desktop internal distros', () => {
    const output = Buffer.from('Ubuntu\r\ndocker-desktop\r\ndocker-desktop-data\r\n', 'utf16le')
    expect(parseWslDistroList(output)).toEqual(['Ubuntu'])
  })
})

describe('detectProfiles', () => {
  it('on Windows lists WSL distros first, then Windows shells', () => {
    const profiles = detectProfiles(
      context({
        platform: 'win32',
        env: { SystemRoot: 'C:\\Windows', ProgramFiles: 'C:\\Program Files', ComSpec: 'C:\\Windows\\system32\\cmd.exe' },
        listWslDistros: () => ['Ubuntu'],
      }),
    )
    expect(profiles.map((p) => p.id)).toEqual(['wsl:Ubuntu', 'pwsh', 'powershell', 'cmd'])
    expect(profiles[0]).toMatchObject({
      host: { kind: 'wsl', distro: 'Ubuntu' },
      file: 'C:\\Windows\\System32\\wsl.exe',
      launcher: 'wsl',
    })
  })

  it('on Windows without WSL or PowerShell 7 still offers the built-in shells', () => {
    const profiles = detectProfiles(context({ platform: 'win32', exists: () => false }))
    expect(profiles.map((p) => p.id)).toEqual(['powershell', 'cmd'])
  })

  it('inside WSL offers the distro shell plus Windows shells through interop', () => {
    const profiles = detectProfiles(
      context({
        env: { WSL_DISTRO_NAME: 'Ubuntu', SHELL: '/usr/bin/zsh' },
        exists: (path) => !path.includes('PowerShell/7'),
      }),
    )
    expect(profiles.map((p) => p.id)).toEqual(['wsl:Ubuntu', 'powershell', 'cmd'])
    expect(profiles[0]).toMatchObject({ host: { kind: 'wsl', distro: 'Ubuntu' }, file: '/usr/bin/zsh' })
  })

  it('on plain Linux or macOS offers only the login shell', () => {
    const profiles = detectProfiles(context({ platform: 'darwin', env: { SHELL: '/bin/zsh' } }))
    expect(profiles).toEqual([{ id: 'shell', label: 'zsh', host: { kind: 'posix' }, file: '/bin/zsh', args: ['-l'] }])
  })
})

describe('spawnCommand', () => {
  const [wslFromWindows] = detectProfiles(context({ platform: 'win32', listWslDistros: () => ['Ubuntu'] }))
  const [localShell] = detectProfiles(context({ env: { SHELL: '/bin/zsh' } }))

  it('passes the working directory to wsl.exe as a Linux path, not as the process cwd', () => {
    expect(spawnCommand(wslFromWindows!, '/home/me/repo')).toEqual({
      file: 'C:\\Windows\\System32\\wsl.exe',
      args: ['-d', 'Ubuntu', '--cd', '/home/me/repo'],
    })
  })

  it('opens wsl.exe in the Linux home when no directory is given', () => {
    expect(spawnCommand(wslFromWindows!).args).toEqual(['-d', 'Ubuntu', '--cd', '~'])
  })

  it('uses the process cwd for shells that run natively', () => {
    expect(spawnCommand(localShell!, '/home/me/repo')).toEqual({ file: '/bin/zsh', args: ['-l'], cwd: '/home/me/repo' })
  })
})
