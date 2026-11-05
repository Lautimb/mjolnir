import { describe, expect, it } from 'vitest'
import { allowsRepoDir, allowsRepoPath, isRepoGlob, isSafeRepoPath, matchesRepoGlob } from './repo-paths'

describe('isSafeRepoPath', () => {
  it('accepts ordinary relative paths, spaces included', () => {
    expect(isSafeRepoPath('.mjolnir/http/Get users.json')).toBe(true)
  })

  it('rejects anything that can escape the repo or alias another file', () => {
    for (const path of ['', '/etc/passwd', 'a//b', '../x', 'a/./b', 'a\\b', 'C:x', 'a/b.', 'a/b ', 'file:stream', 'nul', 'COM1.txt']) {
      expect(isSafeRepoPath(path), path).toBe(false)
    }
  })

  it('never reaches .git, even through the names Windows aliases to it', () => {
    for (const path of ['.git/hooks/pre-commit', '.GIT/config', 'sub/.git/config', '.git./config', 'GIT~1/config']) {
      expect(isSafeRepoPath(path), path).toBe(false)
    }
  })
})

describe('repo globs', () => {
  it('validates globs with the same rules as paths', () => {
    expect(isRepoGlob('.mjolnir/http/**')).toBe(true)
    expect(isRepoGlob('**/*.http')).toBe(true)
    expect(isRepoGlob('.git/**')).toBe(false)
    expect(isRepoGlob('../**')).toBe(false)
    expect(isRepoGlob('a/**b')).toBe(false)
  })

  it('matches * within a segment and ** across segments', () => {
    expect(matchesRepoGlob('.mjolnir/http/**', '.mjolnir/http/a/b.json')).toBe(true)
    expect(matchesRepoGlob('.mjolnir/http/*.json', '.mjolnir/http/a.json')).toBe(true)
    expect(matchesRepoGlob('.mjolnir/http/*.json', '.mjolnir/http/a/b.json')).toBe(false)
    expect(matchesRepoGlob('**/*.http', 'api/users.http')).toBe(true)
    expect(matchesRepoGlob('**/*.http', 'users.http')).toBe(true)
    expect(matchesRepoGlob('.mjolnir/http/**', '.mjolnir/other.json')).toBe(false)
  })

  it('only grants paths that are also safe', () => {
    expect(allowsRepoPath(['**'], '.git/config')).toBe(false)
    expect(allowsRepoPath(['**'], 'src/index.ts')).toBe(true)
    expect(allowsRepoPath(undefined, 'src/index.ts')).toBe(false)
  })

  it('lets a plugin list only the folders that can hold granted files', () => {
    expect(allowsRepoDir(['.mjolnir/http/**'], '')).toBe(true)
    expect(allowsRepoDir(['.mjolnir/http/**'], '.mjolnir')).toBe(true)
    expect(allowsRepoDir(['.mjolnir/http/**'], '.mjolnir/http/nested')).toBe(true)
    expect(allowsRepoDir(['.mjolnir/http/**'], 'src')).toBe(false)
    expect(allowsRepoDir(['.mjolnir/http/*.json'], '.mjolnir/http/nested')).toBe(false)
  })
})
