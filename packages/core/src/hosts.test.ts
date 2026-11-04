import { describe, expect, it } from 'vitest'
import { buildHostCommand, resolveLocation, sameHost, toNativePath } from './hosts'

describe('resolveLocation', () => {
  it.each([
    ['\\\\wsl.localhost\\Ubuntu\\home\\me\\repo', 'Ubuntu', '/home/me/repo'],
    ['\\\\wsl$\\Debian\\srv\\app', 'Debian', '/srv/app'],
    ['\\\\wsl.localhost\\Ubuntu', 'Ubuntu', '/'],
  ])('on Windows maps %s to the %s distro', (input, distro, path) => {
    expect(resolveLocation('win32', {}, input)).toEqual({ host: { kind: 'wsl', distro }, path })
  })

  it('on Windows keeps drive paths on the Windows host', () => {
    expect(resolveLocation('win32', {}, 'C:\\code\\repo')).toEqual({ host: { kind: 'windows' }, path: 'C:\\code\\repo' })
  })

  it('inside WSL tags paths with the current distro', () => {
    expect(resolveLocation('linux', { WSL_DISTRO_NAME: 'Ubuntu' }, '/home/me/repo').host).toEqual({
      kind: 'wsl',
      distro: 'Ubuntu',
    })
  })

  it('on plain Linux or macOS uses the posix host', () => {
    expect(resolveLocation('darwin', {}, '/Users/me/repo').host).toEqual({ kind: 'posix' })
  })
})

describe('buildHostCommand', () => {
  it('from Windows runs WSL commands through wsl.exe so git operates on the Linux filesystem', () => {
    expect(buildHostCommand('win32', { kind: 'wsl', distro: 'Ubuntu' }, '/home/me/repo', 'git', ['status'])).toEqual({
      file: 'wsl.exe',
      args: ['-d', 'Ubuntu', '--cd', '/home/me/repo', '--exec', 'git', 'status'],
    })
  })

  it('runs directly when already inside the target host', () => {
    expect(buildHostCommand('linux', { kind: 'wsl', distro: 'Ubuntu' }, '/repo', 'git', ['status'])).toEqual({
      file: 'git',
      args: ['status'],
      cwd: '/repo',
    })
  })
})

describe('sameHost', () => {
  it('distinguishes WSL distros', () => {
    expect(sameHost({ kind: 'wsl', distro: 'Ubuntu' }, { kind: 'wsl', distro: 'Debian' })).toBe(false)
    expect(sameHost({ kind: 'wsl', distro: 'Ubuntu' }, { kind: 'wsl', distro: 'Ubuntu' })).toBe(true)
    expect(sameHost({ kind: 'windows' }, { kind: 'posix' })).toBe(false)
  })
})

describe('toNativePath', () => {
  it('on Windows turns a WSL path into the UNC path that native dialogs understand', () => {
    const native = toNativePath('win32', { kind: 'wsl', distro: 'Ubuntu' }, '/home/me')
    expect(native).toBe('\\\\wsl.localhost\\Ubuntu\\home\\me')
    expect(resolveLocation('win32', {}, native)).toEqual({ host: { kind: 'wsl', distro: 'Ubuntu' }, path: '/home/me' })
  })

  it('leaves paths untouched when the host is native to the app', () => {
    expect(toNativePath('linux', { kind: 'wsl', distro: 'Ubuntu' }, '/home/me')).toBe('/home/me')
  })
})
