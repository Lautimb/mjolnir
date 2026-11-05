import { describe, expect, it } from 'vitest'
import { ProviderRequestError } from '@mjolnir/core'
import type { ProviderContribution } from '@mjolnir/plugin-sdk/manifest'
import { HostFailure } from './failure'
import { pluginProviderAdapter, type Invoke } from './provider-adapter'

const contribution: ProviderContribution = {
  id: 'azure-devops',
  displayName: 'Azure DevOps',
  defaultHost: 'dev.azure.com',
  remotes: [{ host: 'dev.azure.com', path: '{org}/{project}/_git/{repo}', repo: { owner: '{org}/{project}', name: '{repo}' } }],
  auth: { token: true, cli: { command: 'az', args: ['account', 'get-access-token'] } },
  pulls: { refspec: 'refs/pull/{number}/merge' },
}

const credential = { host: 'dev.azure.com', token: 't', source: 'token' as const }
const repo = { provider: 'azure.azure-devops', host: 'dev.azure.com', owner: 'acme/web', name: 'api' }

const summary = {
  number: 3,
  title: 'Fix',
  author: { login: 'ada', avatarUrl: null },
  state: 'open',
  draft: false,
  headRef: 'fix',
  baseRef: 'main',
  url: 'https://dev.azure.com/acme/web/_git/api/pullrequest/3',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

function adapter(invoke: Invoke) {
  return pluginProviderAdapter('azure', contribution, 'Azure DevOps', invoke)
}

describe('pluginProviderAdapter', () => {
  it('namespaces the provider by plugin and matches its declared remotes', () => {
    const { definition, cli } = adapter(async () => null)
    expect(definition.id).toBe('azure.azure-devops')
    expect(definition.matchRemote({ host: 'dev.azure.com', path: 'acme/web/_git/api' })).toEqual(repo)
    expect(cli?.tokenArgs('dev.azure.com')).toEqual(['account', 'get-access-token'])
  })

  it('forwards calls with the credential to the plugin and builds the refspec from the manifest', async () => {
    const calls: unknown[][] = []
    const pulls = adapter(async (provider, method, params) => {
      calls.push([provider, method, ...params])
      return [summary]
    }).connect(credential).pulls!
    expect(await pulls.list(repo, { filter: 'all', state: 'open' })).toEqual([summary])
    expect(calls).toEqual([['azure-devops', 'pulls.list', credential, repo, { filter: 'all', state: 'open' }]])
    expect(pulls.headRefspec(3)).toBe('refs/pull/3/merge')
  })

  it('rejects responses that do not match the types, so the UI never sees them', async () => {
    const pulls = adapter(async () => [{ ...summary, url: 'javascript:alert(1)' }]).connect(credential).pulls!
    await expect(pulls.list(repo, { filter: 'all', state: 'open' })).rejects.toThrow(/pluginProviderFailed/)
  })

  it('turns an unauthorized answer into the error the accounts flow already handles', async () => {
    const { identify } = adapter(async () => {
      throw new HostFailure('unauthorized', 'expired')
    }).connect(credential)
    await expect(identify()).rejects.toBeInstanceOf(ProviderRequestError)
  })
})
