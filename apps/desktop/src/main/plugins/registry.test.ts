import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appErrorCode } from '../../shared/errors'
import { PluginRegistry } from './registry'

const manifest = {
  id: 'hello',
  version: '0.1.0',
  engines: { mjolnir: '>=0.1.0', api: 1 },
  name: '%name%',
  locales: { es: 'locales/es.json', en: 'locales/en.json' },
  contributes: { views: [{ id: 'main', title: '%view%', entry: 'index.html' }] },
  permissions: { network: ['https://api.io'] },
}

function plugin(overrides: Record<string, unknown> = {}, folder = mkdtempSync(join(tmpdir(), 'mjolnir-plugin-'))) {
  mkdirSync(join(folder, 'locales'), { recursive: true })
  writeFileSync(join(folder, 'mjolnir-plugin.json'), JSON.stringify({ ...manifest, ...overrides }))
  writeFileSync(join(folder, 'locales', 'es.json'), JSON.stringify({ name: 'Hola', view: 'Vista', unused: 'x'.repeat(1000) }))
  writeFileSync(join(folder, 'locales', 'en.json'), JSON.stringify({ name: 'Hello' }))
  return folder
}

async function registry(file = join(mkdtempSync(join(tmpdir(), 'mjolnir-registry-')), 'plugins.json'), appVersion = '0.1.0') {
  const changes: number[] = []
  const instance = new PluginRegistry({ file, appVersion, onChange: () => changes.push(1) })
  await instance.init()
  return { instance, file, changes }
}

describe('PluginRegistry', () => {
  it('loads a folder disabled, with the permissions it asks for pending, and serves nothing until enabled', async () => {
    const { instance } = await registry()
    const info = await instance.addFolder(plugin())
    expect(info).toMatchObject({ id: 'hello', enabled: false, active: false, status: { kind: 'ready' }, pending: { network: ['https://api.io'] } })
    expect(instance.root('hello')).toBeNull()
    expect(instance.permissions('hello')).toBeNull()
  })

  it('activates the plugin once the user approves what it asks for', async () => {
    const { instance, changes } = await registry()
    const folder = plugin()
    await instance.addFolder(folder)
    instance.enable('hello', { network: ['https://api.io'] })
    expect(instance.root('hello')).toBe(folder)
    expect(instance.permissions('hello')).toEqual({ network: ['https://api.io'] })
    expect(changes.length).toBe(1)
  })

  it('refuses to enable when the approval does not cover the current manifest', async () => {
    const { instance } = await registry()
    await instance.addFolder(plugin())
    expect(() => instance.enable('hello', {})).toThrow()
    try {
      instance.enable('hello', {})
    } catch (error) {
      expect(appErrorCode(error)).toBe('pluginPermissionsChanged')
    }
  })

  it('deactivates a plugin whose update asks for more than was approved, until it is approved again', async () => {
    const { instance } = await registry()
    const folder = plugin()
    const before = await instance.addFolder(folder)
    instance.enable('hello', { network: ['https://api.io'] })
    plugin({ permissions: { network: ['https://api.io', 'https://other.io'] } }, folder)
    const after = await instance.addFolder(folder)
    expect(after).toMatchObject({ enabled: true, active: false, pending: { network: ['https://other.io'] } })
    expect(after.revision).toBeGreaterThan(before.revision)
    instance.enable('hello', { network: ['https://other.io'] })
    expect(instance.list()[0]!.active).toBe(true)
  })

  it('keeps the state across restarts', async () => {
    const first = await registry()
    await first.instance.addFolder(plugin())
    first.instance.enable('hello', { network: ['https://api.io'] })
    const second = await registry(first.file)
    expect(second.instance.list()[0]).toMatchObject({ id: 'hello', active: true })
  })

  it('sends the renderer only the strings the manifest uses', async () => {
    const { instance } = await registry()
    const info = await instance.addFolder(plugin())
    expect(info.strings).toEqual({ es: { name: 'Hola', view: 'Vista' }, en: { name: 'Hello' } })
  })

  it('rejects invalid folders and a second folder with the same id', async () => {
    const { instance } = await registry()
    await expect(instance.addFolder(mkdtempSync(join(tmpdir(), 'empty-')))).rejects.toThrow(/pluginInvalid/)
    await expect(instance.addFolder(plugin({ id: 'Bad Id' }))).rejects.toThrow(/pluginInvalid/)
    await instance.addFolder(plugin())
    await expect(instance.addFolder(plugin())).rejects.toThrow(/pluginExists/)
  })

  it('keeps an incompatible plugin listed but never active', async () => {
    const { instance } = await registry(undefined, '0.1.0')
    await instance.addFolder(plugin({ engines: { mjolnir: '>=9.0.0', api: 1 } }))
    expect(() => instance.enable('hello', { network: ['https://api.io'] })).not.toThrow()
    expect(instance.list()[0]).toMatchObject({ status: { kind: 'incompatible', reason: 'app', required: '>=9.0.0' }, active: false })
  })
})
