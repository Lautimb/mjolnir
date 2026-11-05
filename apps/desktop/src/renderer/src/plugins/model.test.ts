import { describe, expect, it } from 'vitest'
import type { CatalogPlugin, PluginInfo } from '../../../shared/api'
import { asNewSession, catalogUpdate, pluginText, pluginViews, touch } from './model'

const plugin = (overrides: Partial<PluginInfo> = {}): PluginInfo => ({
  id: 'hello',
  source: { kind: 'folder', path: '/p' },
  update: null,
  enabled: true,
  active: true,
  status: { kind: 'ready' },
  manifest: {
    id: 'hello',
    version: '0.1.0',
    engines: { mjolnir: '>=0.1.0', api: 1 },
    name: '%name%',
    contributes: { views: [{ id: 'main', title: 'Main', entry: 'index.html' }], providers: [] },
    permissions: {},
  },
  strings: { es: { name: 'Hola' }, en: { name: 'Hello' } },
  pending: {},
  revision: 0,
  ...overrides,
})

describe('touch', () => {
  it('keeps the most recently opened views mounted and drops the oldest', () => {
    let keys = touch([], 'plugin:a/x')
    keys = touch(keys, 'plugin:b/x')
    keys = touch(keys, 'plugin:c/x')
    keys = touch(keys, 'plugin:a/x')
    keys = touch(keys, 'plugin:d/x')
    expect(keys).toEqual(['plugin:d/x', 'plugin:a/x', 'plugin:c/x'])
  })
})

describe('pluginViews', () => {
  it('only offers views of active plugins', () => {
    expect(pluginViews([plugin(), plugin({ id: 'off', active: false })]).map((entry) => entry.key)).toEqual(['plugin:hello/main'])
  })
})

describe('pluginText', () => {
  it('uses the current locale and falls back to the other ones the plugin ships', () => {
    expect(pluginText(plugin(), '%name%', 'en')).toBe('Hello')
    expect(pluginText(plugin({ strings: { es: { name: 'Hola' } } }), '%name%', 'en')).toBe('Hola')
    expect(pluginText(plugin({ strings: { en: { name: 'Hello' } } }), '%name%', 'fr')).toBe('Hello')
  })
})

describe('catalogUpdate', () => {
  const packaged = (version: string, update: string | null = null) =>
    plugin({ source: { kind: 'package', version, sha256: 'a'.repeat(64), origin: 'catalog', verified: true }, update: update ? { version: update, pending: {} } : null })
  const available = (version: string, status: CatalogPlugin['status'] = { kind: 'ready' }): CatalogPlugin => ({
    id: 'hello',
    version,
    size: 1,
    verified: true,
    manifest: plugin().manifest!,
    strings: {},
    status,
  })

  it('offers a newer compatible version of an installed package', () => {
    expect(catalogUpdate(packaged('0.1.0'), available('0.2.0'))?.version).toBe('0.2.0')
    expect(catalogUpdate(packaged('0.2.0'), available('0.2.0'))).toBeNull()
    expect(catalogUpdate(packaged('0.1.0'), available('0.2.0', { kind: 'incompatible', reason: 'app', required: '>=9.0.0' }))).toBeNull()
  })

  it('does not offer what is already waiting for approval, nor replace a folder being developed', () => {
    expect(catalogUpdate(packaged('0.1.0', '0.2.0'), available('0.2.0'))).toBeNull()
    expect(catalogUpdate(packaged('0.1.0', '0.2.0'), available('0.3.0'))?.version).toBe('0.3.0')
    expect(catalogUpdate(plugin(), available('9.0.0'))).toBeNull()
  })
})

describe('asNewSession', () => {
  it('keeps only the repo and the branch, trimmed', () => {
    expect(asNewSession({ type: 'mjolnir:newSession', repoId: 'r1', branch: ' feat/42-login ', extra: true })).toEqual({ repoId: 'r1', branch: 'feat/42-login' })
  })

  it('ignores other messages and malformed requests', () => {
    expect(asNewSession({ type: 'mjolnir:notify', message: 'x' })).toBeNull()
    expect(asNewSession({ type: 'mjolnir:newSession', repoId: 'r1' })).toBeNull()
    expect(asNewSession({ type: 'mjolnir:newSession', repoId: '', branch: 'b' })).toBeNull()
    expect(asNewSession(null)).toBeNull()
  })
})
