import { describe, expect, it } from 'vitest'
import { isRemoteRule, matchRemote, type RemoteRule } from './remotes'

const AZURE: RemoteRule[] = [
  { host: 'dev.azure.com', path: '{org}/{project}/_git/{repo}', repo: { owner: '{org}/{project}', name: '{repo}' } },
  { host: 'ssh.dev.azure.com', path: 'v3/{org}/{project}/{repo}', repo: { host: 'dev.azure.com', owner: '{org}/{project}', name: '{repo}' } },
  { host: '{org}.visualstudio.com', path: '{project}/_git/{repo}', repo: { host: 'dev.azure.com', owner: '{org}/{project}', name: '{repo}' } },
]

describe('matchRemote', () => {
  it('maps every remote form of a provider to the same repo', () => {
    const expected = { provider: 'azure', host: 'dev.azure.com', owner: 'acme/Web Site', name: 'api' }
    expect(matchRemote(AZURE, 'azure', { host: 'dev.azure.com', path: 'acme/Web Site/_git/api' })).toEqual(expected)
    expect(matchRemote(AZURE, 'azure', { host: 'ssh.dev.azure.com', path: 'v3/acme/Web Site/api' })).toEqual(expected)
    expect(matchRemote(AZURE, 'azure', { host: 'acme.visualstudio.com', path: 'Web Site/_git/api' })).toEqual(expected)
  })

  it('does not match other hosts, look-alikes or other path shapes', () => {
    expect(matchRemote(AZURE, 'azure', { host: 'github.com', path: 'acme/api' })).toBeNull()
    expect(matchRemote(AZURE, 'azure', { host: 'dev.azure.com.evil.io', path: 'acme/p/_git/api' })).toBeNull()
    expect(matchRemote(AZURE, 'azure', { host: 'a.b.visualstudio.com', path: 'p/_git/api' })).toBeNull()
    expect(matchRemote(AZURE, 'azure', { host: 'dev.azure.com', path: 'acme/p/x/_git/api' })).toBeNull()
  })
})

describe('isRemoteRule', () => {
  it('requires every variable used in the repo to be captured', () => {
    expect(AZURE.every(isRemoteRule)).toBe(true)
    expect(isRemoteRule({ host: 'git.io', path: '{owner}/{name}', repo: { owner: '{owner}', name: '{repo}' } })).toBe(false)
    expect(isRemoteRule({ host: 'git.io', path: '{a}/{a}', repo: { owner: '{a}', name: '{a}' } })).toBe(false)
  })
})
