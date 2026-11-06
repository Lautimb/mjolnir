import { describe, expect, it } from 'vitest'
import { absolutePath, wslWindowsPath } from './paths'

describe('absolutePath', () => {
  it('joins with the separator of the host where the worktree lives', () => {
    expect(absolutePath('/home/me/app', 'src/a.ts', { kind: 'posix' })).toBe('/home/me/app/src/a.ts')
    expect(absolutePath('/home/me/app/', 'src', { kind: 'wsl', distro: 'Ubuntu' })).toBe('/home/me/app/src')
    expect(absolutePath('C:/code/app', 'src/a.ts', { kind: 'windows' })).toBe('C:\\code\\app\\src\\a.ts')
  })
})

describe('wslWindowsPath', () => {
  it('points Windows tools at the file inside the distro', () => {
    expect(wslWindowsPath('/home/me/app/src/a.ts', 'Ubuntu')).toBe('\\\\wsl.localhost\\Ubuntu\\home\\me\\app\\src\\a.ts')
  })
})
