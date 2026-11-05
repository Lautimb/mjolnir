import { describe, expect, it } from 'vitest'
import type { PluginInfo } from '../../../shared/api'
import { pluginText, pluginViews, touch } from './model'

const plugin = (overrides: Partial<PluginInfo> = {}): PluginInfo => ({
  id: 'hello',
  source: { kind: 'folder', path: '/p' },
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
