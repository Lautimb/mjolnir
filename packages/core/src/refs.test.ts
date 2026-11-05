import { describe, expect, it } from 'vitest'
import { isSafeRef, safeRef, UnsafeRefError } from './refs'

describe('isSafeRef', () => {
  it.each(['main', 'feat/pull-requests', 'origin/develop', 'HEAD', 'refs/mjolnir/pulls/3', '4b825dc642cb6eb9a060e54bf8d69288fbee4904', 'v1.2.0'])(
    'accepts %s',
    (ref) => expect(isSafeRef(ref)).toBe(true),
  )

  it.each([
    ['an option git would parse', '--output=/tmp/pwned'],
    ['a refspec that redirects the target', 'main:refs/heads/other'],
    ['a forced refspec', '+main'],
    ['path traversal', '../outside'],
    ['an embedded traversal', 'feat/../../x'],
    ['whitespace', 'feat branch'],
    ['control characters', 'feat\nmain'],
    ['reflog syntax', 'main@{1}'],
    ['revision operators', 'main~1'],
    ['an absolute path', '/etc/passwd'],
    ['a lock file', 'main.lock'],
    ['an empty value', ''],
  ])('rejects %s', (_case, ref) => expect(isSafeRef(ref)).toBe(false))
})

describe('safeRef', () => {
  it('returns the ref untouched or throws a typed error', () => {
    expect(safeRef('main')).toBe('main')
    expect(() => safeRef('-x')).toThrow(UnsafeRefError)
  })
})
