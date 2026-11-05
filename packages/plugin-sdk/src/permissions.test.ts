import { describe, expect, it } from 'vitest'
import { allowsUrl, matchesOrigin, mergePermissions, missingPermissions } from './permissions'

describe('matchesOrigin', () => {
  it('matches the exact origin, ignoring path and query', () => {
    expect(matchesOrigin('https://dev.azure.com', 'https://dev.azure.com/org/_apis?x=1')).toBe(true)
    expect(matchesOrigin('https://dev.azure.com', 'http://dev.azure.com/')).toBe(false)
    expect(matchesOrigin('https://dev.azure.com', 'https://dev.azure.com:8443/')).toBe(false)
    expect(matchesOrigin('http://localhost:3000', 'http://localhost:3000/api')).toBe(true)
  })

  it('does not let look-alike hosts through', () => {
    expect(matchesOrigin('https://dev.azure.com', 'https://dev.azure.com.evil.io/')).toBe(false)
    expect(matchesOrigin('https://dev.azure.com', 'https://evil.io/?https://dev.azure.com')).toBe(false)
    expect(matchesOrigin('https://dev.azure.com', 'https://user@evil.io/')).toBe(false)
  })

  it('matches subdomains with a wildcard, but not the bare domain or a suffix', () => {
    expect(matchesOrigin('https://*.visualstudio.com', 'https://org.visualstudio.com/')).toBe(true)
    expect(matchesOrigin('https://*.visualstudio.com', 'https://visualstudio.com/')).toBe(false)
    expect(matchesOrigin('https://*.visualstudio.com', 'https://evilvisualstudio.com/')).toBe(false)
  })

  it('lets * reach any http(s) url and nothing else', () => {
    expect(matchesOrigin('*', 'https://anything.io/x')).toBe(true)
    expect(matchesOrigin('*', 'file:///etc/passwd')).toBe(false)
    expect(matchesOrigin('*', 'mjolnir-plugin://other/index.html')).toBe(false)
  })

  it('denies everything when nothing was granted', () => {
    expect(allowsUrl(undefined, 'https://dev.azure.com')).toBe(false)
  })
})

describe('missingPermissions', () => {
  it('returns what an update asks for beyond what was approved', () => {
    expect(missingPermissions({ network: ['https://a.io', 'https://b.io'] }, { network: ['https://a.io'] })).toEqual({ network: ['https://b.io'] })
    expect(missingPermissions({ network: ['https://a.io'] }, { network: ['https://a.io', 'https://b.io'] })).toEqual({})
  })

  it('asks again for workspace access and new repo globs', () => {
    expect(missingPermissions({ workspace: 'read', repoFiles: ['a/**', 'b/**'] }, { repoFiles: ['a/**'] })).toEqual({ workspace: 'read', repoFiles: ['b/**'] })
    expect(missingPermissions({ workspace: 'read' }, { workspace: 'read' })).toEqual({})
  })
})

describe('mergePermissions', () => {
  it('keeps what was granted before and adds what was approved', () => {
    expect(mergePermissions({ network: ['https://a.io'] }, { network: ['https://a.io', 'https://b.io'], workspace: 'read', repoFiles: ['x/**'] })).toEqual({
      network: ['https://a.io', 'https://b.io'],
      workspace: 'read',
      repoFiles: ['x/**'],
    })
    expect(mergePermissions({}, {})).toEqual({})
  })
})
