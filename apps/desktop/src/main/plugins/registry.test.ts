import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createZip } from '@mjolnir/plugin-sdk/pack'
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
  const packagesDir = join(file, '..', 'plugins')
  const instance = new PluginRegistry({ file, packagesDir, appVersion, onChange: () => changes.push(1) })
  await instance.init()
  return { instance, file, packagesDir, changes }
}

function mjp(overrides: Record<string, unknown> = {}, files: Record<string, string> = { 'index.html': '<p>v</p>' }) {
  const path = join(mkdtempSync(join(tmpdir(), 'mjolnir-mjp-')), 'plugin.mjp')
  const entries: [string, Buffer][] = [
    ['mjolnir-plugin.json', Buffer.from(JSON.stringify({ ...manifest, locales: undefined, ...overrides }))],
    ...Object.entries(files).map(([name, content]): [string, Buffer] => [name, Buffer.from(content)]),
  ]
  writeFileSync(path, createZip(entries))
  return path
}

const appError = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => appErrorCode(error))

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

  it('installs a package into its own versioned folder, disabled until approved', async () => {
    const { instance, packagesDir } = await registry()
    const info = await instance.installPackage(mjp())
    expect(info).toMatchObject({ id: 'hello', enabled: false, source: { kind: 'package', version: '0.1.0' }, update: null })
    instance.enable('hello', { network: ['https://api.io'] })
    const root = instance.root('hello')!
    expect(root.startsWith(join(packagesDir, 'hello'))).toBe(true)
    expect(readFileSync(join(root, 'index.html'), 'utf8')).toBe('<p>v</p>')
  })

  it('updates in place when the new version asks for nothing new, and removes the old files', async () => {
    const { instance, packagesDir } = await registry()
    await instance.installPackage(mjp())
    instance.enable('hello', { network: ['https://api.io'] })
    await instance.installPackage(mjp({ version: '0.2.0' }, { 'index.html': '<p>v2</p>' }))
    expect(instance.list()[0]).toMatchObject({ source: { version: '0.2.0' }, update: null, active: true })
    expect(readFileSync(join(instance.root('hello')!, 'index.html'), 'utf8')).toBe('<p>v2</p>')
    expect(readdirSync(join(packagesDir, 'hello'))).toHaveLength(1)
  })

  it('keeps running the current version while an update with new permissions waits for approval', async () => {
    const { instance } = await registry()
    await instance.installPackage(mjp())
    instance.enable('hello', { network: ['https://api.io'] })
    await instance.installPackage(mjp({ version: '0.2.0', permissions: { network: ['https://api.io', 'https://other.io'] } }))
    expect(instance.list()[0]).toMatchObject({ source: { version: '0.1.0' }, active: true, update: { version: '0.2.0', pending: { network: ['https://other.io'] } } })
    expect(instance.permissions('hello')).toEqual({ network: ['https://api.io'] })
    expect(await appError(instance.applyUpdate('hello', {}))).toBe('pluginPermissionsChanged')
    await instance.applyUpdate('hello', { network: ['https://other.io'] })
    expect(instance.list()[0]).toMatchObject({ source: { version: '0.2.0' }, active: true, update: null })
  })

  it('can discard a pending update', async () => {
    const { instance, packagesDir } = await registry()
    await instance.installPackage(mjp())
    instance.enable('hello', { network: ['https://api.io'] })
    await instance.installPackage(mjp({ version: '0.2.0', permissions: { network: ['*'] } }))
    await instance.discardUpdate('hello')
    expect(instance.list()[0]).toMatchObject({ source: { version: '0.1.0' }, update: null })
    expect(readdirSync(join(packagesDir, 'hello'))).toHaveLength(1)
  })

  it('remembers installed packages and pending updates across restarts', async () => {
    const first = await registry()
    await first.instance.installPackage(mjp())
    first.instance.enable('hello', { network: ['https://api.io'] })
    await first.instance.installPackage(mjp({ version: '0.2.0', permissions: { network: ['*'] } }))
    const { instance } = await registry(first.file)
    expect(instance.list()[0]).toMatchObject({ source: { version: '0.1.0' }, active: true, update: { version: '0.2.0' } })
  })

  it('rejects invalid, incompatible or conflicting packages without installing anything', async () => {
    const { instance, packagesDir } = await registry()
    expect(await appError(instance.installPackage(mjp({ id: 'Bad Id' })))).toBe('pluginInvalid')
    expect(await appError(instance.installPackage(mjp({ engines: { mjolnir: '>=9.0.0', api: 1 } })))).toBe('pluginIncompatible')
    const notZip = join(mkdtempSync(join(tmpdir(), 'mjolnir-mjp-')), 'x.mjp')
    writeFileSync(notZip, 'definitely not a zip file, but long enough to scan')
    expect(await appError(instance.installPackage(notZip))).toBe('pluginInvalid')
    await instance.addFolder(plugin())
    expect(await appError(instance.installPackage(mjp()))).toBe('pluginExists')
    expect(existsSync(join(packagesDir, 'hello'))).toBe(false)
  })

  it('deletes the files of an uninstalled package', async () => {
    const { instance, packagesDir } = await registry()
    await instance.installPackage(mjp())
    await instance.remove('hello')
    expect(existsSync(join(packagesDir, 'hello'))).toBe(false)
    expect(instance.list()).toEqual([])
  })
})
