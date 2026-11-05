import { describe, expect, it } from 'vitest'
import { matchRemote } from '@mjolnir/plugin-sdk'
import { parseManifest } from '@mjolnir/plugin-sdk/manifest'
import raw from '../public/mjolnir-plugin.json'

describe('manifest', () => {
  const parsed = parseManifest(raw)
  if (!parsed.ok) throw new Error(parsed.issue)
  const [provider] = parsed.manifest.contributes.providers

  it('maps every Azure Repos remote form to one dev.azure.com repo, so they share the account', () => {
    const expected = { provider: 'p', host: 'dev.azure.com', owner: 'acme/web', name: 'api' }
    for (const remote of [
      { host: 'dev.azure.com', path: 'acme/web/_git/api' },
      { host: 'ssh.dev.azure.com', path: 'v3/acme/web/api' },
      { host: 'acme.visualstudio.com', path: 'web/_git/api' },
      { host: 'acme.visualstudio.com', path: 'DefaultCollection/web/_git/api' },
      { host: 'vs-ssh.visualstudio.com', path: 'v3/acme/web/api' },
    ]) {
      expect(matchRemote(provider!.remotes, 'p', remote), remote.host).toEqual(expected)
    }
  })
})
