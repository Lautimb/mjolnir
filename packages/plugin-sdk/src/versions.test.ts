import { describe, expect, it } from 'vitest'
import { compareVersions } from './versions'

describe('compareVersions', () => {
  it('orders by number, not as text', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.2.3', '1.3.0')).toBe(-1)
  })

  it('puts a prerelease before its release, so a beta never hides the final version', () => {
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1)
    expect(compareVersions('1.0.0', '1.0.0-beta.1')).toBe(1)
    expect(compareVersions('1.0.0-beta.1', '1.0.0-beta.2')).toBe(-1)
  })
})
