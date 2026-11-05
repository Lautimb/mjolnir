import { describe, expect, it } from 'vitest'
import { fileChange, flag, id, path, pullNumber, ref, settingsPatch } from '../schemas'
import { parseArgs } from './handle'

describe('parseArgs', () => {
  it('returns the parsed arguments when every one matches its schema', () => {
    expect(parseArgs([id, ref, flag], ['repo', 'feat/x', true])).toEqual(['repo', 'feat/x', true])
  })

  it('rejects extra arguments, missing ones and wrong types', () => {
    expect(parseArgs([id], ['repo', 'extra'])).toBeNull()
    expect(parseArgs([id, path], ['repo'])).toBeNull()
    expect(parseArgs([pullNumber], ['7'])).toBeNull()
    expect(parseArgs([pullNumber], [1.5])).toBeNull()
  })

  it('rejects refs that git would read as options or refspecs', () => {
    expect(parseArgs([ref], ['--output=/tmp/x'])).toBeNull()
    expect(parseArgs([ref], ['main:refs/heads/x'])).toBeNull()
  })

  it('accepts file changes as git reports them and nothing else', () => {
    const change = { path: 'a.ts', status: 'modified', additions: 1, deletions: 0, binary: false }
    expect(parseArgs([fileChange], [change])).toEqual([change])
    expect(parseArgs([fileChange], [{ ...change, status: 'exploded' }])).toBeNull()
  })

  it('only lets known settings through, so the renderer cannot write arbitrary keys to disk', () => {
    expect(parseArgs([settingsPatch], [{ panelPosition: 'right' }])).toEqual([{ panelPosition: 'right' }])
    expect(parseArgs([settingsPatch], [{ panelPosition: 'up' }])).toBeNull()
    expect(parseArgs([settingsPatch], [{ __proto__: 1, shell: '/bin/evil' }])).toBeNull()
  })
})
