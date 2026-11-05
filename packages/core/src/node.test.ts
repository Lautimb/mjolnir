import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isInside } from './node'

describe('isInside', () => {
  it('accepts files inside the directory, including names that merely start with dots', () => {
    expect(isInside(path.posix, '/repo', 'src/a.ts')).toBe(true)
    expect(isInside(path.posix, '/repo', '..config/a.ts')).toBe(true)
    expect(isInside(path.win32, 'C:\\repo', 'src\\a.ts')).toBe(true)
  })

  it('rejects traversal, absolute paths and other drives', () => {
    expect(isInside(path.posix, '/repo', '../etc/passwd')).toBe(false)
    expect(isInside(path.posix, '/repo', 'src/../../etc/passwd')).toBe(false)
    expect(isInside(path.posix, '/repo', '/etc/passwd')).toBe(false)
    expect(isInside(path.win32, 'C:\\repo', 'D:\\secrets.txt')).toBe(false)
    expect(isInside(path.win32, 'C:\\repo', '..\\outside')).toBe(false)
  })
})
