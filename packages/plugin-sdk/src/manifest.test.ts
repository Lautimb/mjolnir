import { describe, expect, it } from 'vitest'
import { localize } from './strings'
import { checkCompatibility, isSafeRelativePath, localizedKeys, parseManifest, satisfiesMinimum, type PluginManifest } from './manifest'

const valid = {
  id: 'azure-devops',
  version: '0.1.0',
  engines: { mjolnir: '>=0.1.0', api: 1 },
  name: '%name%',
  contributes: { views: [{ id: 'boards', title: '%boards.title%', icon: 'icons/boards.svg', entry: 'boards.html' }] },
  permissions: { network: ['https://dev.azure.com', 'https://*.visualstudio.com'] },
}

const manifest = (overrides: Record<string, unknown> = {}) => parseManifest({ ...valid, ...overrides })

describe('parseManifest', () => {
  it('accepts a complete manifest and fills in the optional sections', () => {
    expect(manifest()).toMatchObject({ ok: true, manifest: valid })
    const minimal = parseManifest({ id: 'x', version: '1.0.0', engines: { mjolnir: '>=0.1.0', api: 1 }, name: 'X' })
    expect(minimal).toMatchObject({ ok: true, manifest: { contributes: { views: [] }, permissions: {} } })
  })

  it('rejects ids that would not be safe as an origin host or a folder name', () => {
    for (const id of ['Azure', 'a_b', '-a', 'a--b', '../x', 'a'.repeat(65)]) expect(manifest({ id }).ok).toBe(false)
  })

  it('rejects files outside the plugin folder, so the protocol can never serve them', () => {
    for (const entry of ['../secret.html', '/etc/passwd', 'a/../../b', 'C:\\x.html', 'a//b', '']) {
      expect(manifest({ contributes: { views: [{ id: 'v', title: 'V', entry }] } }).ok).toBe(false)
    }
  })

  it('rejects unknown keys, so a manifest written for a newer Mjolnir fails loudly instead of half working', () => {
    expect(manifest({ background: 'background.js' })).toMatchObject({ ok: false, issue: expect.stringContaining('background') })
    expect(manifest({ permissions: { terminals: true } }).ok).toBe(false)
  })

  it('only takes origins as network permissions', () => {
    expect(manifest({ permissions: { network: ['*'] } }).ok).toBe(true)
    for (const pattern of ['https://dev.azure.com/org', 'dev.azure.com', 'ftp://x.com', 'https://*', 'https://a.*.com']) {
      expect(manifest({ permissions: { network: [pattern] } }).ok).toBe(false)
    }
  })

  it('rejects duplicated view ids', () => {
    const views = [
      { id: 'v', title: 'A', entry: 'a.html' },
      { id: 'v', title: 'B', entry: 'b.html' },
    ]
    expect(manifest({ contributes: { views } }).ok).toBe(false)
  })
})

describe('isSafeRelativePath', () => {
  it('accepts nested files and nothing that escapes the folder', () => {
    expect(isSafeRelativePath('assets/index-abc.js')).toBe(true)
    expect(isSafeRelativePath('./a.js')).toBe(false)
    expect(isSafeRelativePath('a/%2e%2e/b')).toBe(false)
  })
})

describe('compatibility', () => {
  const parsed = (manifest() as { manifest: PluginManifest }).manifest

  it('compares versions numerically and ignores prerelease tags', () => {
    expect(satisfiesMinimum('>=0.10.0', '0.9.9')).toBe(false)
    expect(satisfiesMinimum('>=0.10.0', '0.10.0')).toBe(true)
    expect(satisfiesMinimum('>=0.10.0', '1.0.0-beta.1')).toBe(true)
  })

  it('requires a supported API version and a recent enough app', () => {
    expect(checkCompatibility(parsed, { appVersion: '0.1.0', apiVersions: [1] })).toEqual({ ok: true })
    expect(checkCompatibility(parsed, { appVersion: '0.1.0', apiVersions: [2] })).toEqual({ ok: false, reason: 'api', required: 1 })
    expect(checkCompatibility({ ...parsed, engines: { mjolnir: '>=0.2.0', api: 1 } }, { appVersion: '0.1.0', apiVersions: [1] })).toEqual({
      ok: false,
      reason: 'app',
      required: '>=0.2.0',
    })
  })
})

describe('localization', () => {
  const parsed = (manifest() as { manifest: PluginManifest }).manifest

  it('lists only the keys the manifest references, so the host never ships whole locale files', () => {
    expect(localizedKeys(parsed)).toEqual(['name', 'boards.title'])
  })

  it('resolves %key% strings and leaves literals alone', () => {
    expect(localize('%name%', { name: 'Azure DevOps' })).toBe('Azure DevOps')
    expect(localize('%missing%', {})).toBe('missing')
    expect(localize('Literal 100%', {})).toBe('Literal 100%')
  })
})
