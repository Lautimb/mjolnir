import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('electron-updater', () => ({ autoUpdater: {} }))

const { blockedInstall, smartAppControlEnabled } = await import('./updater')

describe('blockedInstall', () => {
  it('reports the target version when the app restarted on the version it tried to leave', () => {
    expect(blockedInstall({ from: '0.3.1', to: '0.3.2' }, '0.3.1')).toBe('0.3.2')
  })

  it('ignores attempts that already installed or are malformed', () => {
    expect(blockedInstall({ from: '0.3.1', to: '0.3.2' }, '0.3.2')).toBeNull()
    expect(blockedInstall({ from: '0.3.1' }, '0.3.1')).toBeNull()
    expect(blockedInstall(null, '0.3.1')).toBeNull()
  })
})

describe('smartAppControlEnabled', () => {
  const output = (value: string) =>
    `\r\nHKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\CI\\Policy\r\n    VerifiedAndReputablePolicyState    REG_DWORD    ${value}\r\n\r\n`

  it('is on only when the policy state is enforced', () => {
    expect(smartAppControlEnabled(output('0x1'))).toBe(true)
    expect(smartAppControlEnabled(output('0x0'))).toBe(false)
    expect(smartAppControlEnabled(output('0x2'))).toBe(false)
    expect(smartAppControlEnabled('')).toBe(false)
  })
})
