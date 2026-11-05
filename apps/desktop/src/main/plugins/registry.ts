import { watch, type FSWatcher } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { API_VERSION, hasPermissions, mergePermissions, missingPermissions, type GrantablePermissions } from '@mjolnir/plugin-sdk'
import {
  checkCompatibility,
  localizedKeys,
  MANIFEST_FILE,
  parseManifest,
  requestedPermissions,
  type PluginManifest,
  type PluginPermissions,
  type ProviderContribution,
} from '@mjolnir/plugin-sdk/manifest'
import type { PluginInfo, PluginSource, PluginStatus } from '../../shared/api'
import { AppError } from '../../shared/errors'
import { readJson, writeJsonAtomic } from '../json-file'
import { PACKAGE_LIMITS, PackageError, readPackage } from './package'

type PackageRef = Extract<PluginSource, { kind: 'package' }>

interface PluginRecord {
  id: string
  source: PluginSource
  enabled: boolean
  granted: GrantablePermissions
  update?: PackageRef
}

interface Loaded {
  record: PluginRecord
  manifest: PluginManifest | null
  status: PluginStatus
  strings: Record<string, Record<string, string>>
  revision: number
  update: PluginManifest | null
}

export interface RegistryOptions {
  file: string
  packagesDir: string
  appVersion: string
  watch?: boolean
  onChange(): void
}

const SUPPORTED_API = [API_VERSION]
const RELOAD_DELAY_MS = 150

async function readManifest(folder: string): Promise<{ manifest: PluginManifest } | { status: PluginStatus }> {
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(join(folder, MANIFEST_FILE), 'utf8'))
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT'
    return { status: missing ? { kind: 'missing' } : { kind: 'invalid', issue: `${MANIFEST_FILE}: ${(error as Error).message}` } }
  }
  const parsed = parseManifest(raw)
  return parsed.ok ? { manifest: parsed.manifest } : { status: { kind: 'invalid', issue: parsed.issue } }
}

async function readStrings(folder: string, manifest: PluginManifest): Promise<Record<string, Record<string, string>>> {
  const keys = localizedKeys(manifest)
  if (!keys.length || !manifest.locales) return {}
  const entries = await Promise.all(
    Object.entries(manifest.locales).map(async ([locale, file]) => {
      const raw = (await readFile(join(folder, file), 'utf8').then(JSON.parse, () => ({}))) as Record<string, unknown>
      const strings = Object.fromEntries(keys.flatMap((key) => (typeof raw[key] === 'string' ? [[key, raw[key]]] : [])))
      return [locale, strings] as const
    }),
  )
  return Object.fromEntries(entries)
}

const isPackageRef = (value: unknown): value is PackageRef => {
  const ref = value as PackageRef | undefined
  return ref?.kind === 'package' && typeof ref.version === 'string' && /^[0-9a-f]{64}$/.test(ref.sha256)
}

function isRecord(value: unknown): value is PluginRecord {
  const record = value as PluginRecord
  if (!record || !/^[a-z0-9-]+$/.test(record.id ?? '')) return false
  const source = record.source as PluginSource | undefined
  return (source?.kind === 'folder' && typeof source.path === 'string') || isPackageRef(source)
}

export class PluginRegistry {
  private readonly plugins = new Map<string, Loaded>()
  private readonly watchers = new Map<string, FSWatcher>()
  private readonly reloads = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(private readonly options: RegistryOptions) {}

  async init(): Promise<void> {
    const raw = readJson(this.options.file) as { plugins?: unknown[] } | null
    const records = (raw?.plugins ?? []).filter(isRecord)
    await Promise.all(records.map((record) => this.load({ ...record, granted: record.granted ?? {} }, 0)))
    for (const record of records) this.watch(record)
  }

  list(): PluginInfo[] {
    return [...this.plugins.values()].map(({ record, manifest, status, strings, revision, update }) => ({
      id: record.id,
      source: record.source,
      update: record.update && update ? { version: update.version, pending: missingPermissions(requestedPermissions(update), record.granted) } : null,
      enabled: record.enabled,
      active: !!this.permissions(record.id),
      status,
      manifest,
      strings,
      pending: manifest ? missingPermissions(requestedPermissions(manifest), record.granted) : {},
      revision,
    }))
  }

  root(pluginId: string): string | null {
    return this.permissions(pluginId) ? this.folder(this.plugins.get(pluginId)!.record) : null
  }

  permissions(pluginId: string): PluginPermissions | null {
    const plugin = this.plugins.get(pluginId)
    if (!plugin?.record.enabled || plugin.status.kind !== 'ready' || !plugin.manifest) return null
    if (hasPermissions(missingPermissions(requestedPermissions(plugin.manifest), plugin.record.granted))) return null
    return plugin.manifest.permissions
  }

  providers(): { pluginId: string; provider: ProviderContribution; strings: Record<string, Record<string, string>> }[] {
    return [...this.plugins.values()].flatMap(({ record, manifest, strings }) =>
      manifest && this.permissions(record.id) ? manifest.contributes.providers.map((provider) => ({ pluginId: record.id, provider, strings })) : [],
    )
  }

  async addFolder(folder: string): Promise<PluginInfo> {
    const result = await readManifest(folder)
    if (!('manifest' in result)) {
      throw new AppError('pluginInvalid', { issue: result.status.kind === 'invalid' ? result.status.issue : `${MANIFEST_FILE} not found` })
    }
    const { id } = result.manifest
    const existing = this.plugins.get(id)
    if (existing && (existing.record.source.kind !== 'folder' || existing.record.source.path !== folder)) {
      throw new AppError('pluginExists', { id, path: this.folder(existing.record) })
    }
    const record: PluginRecord = existing?.record ?? { id, source: { kind: 'folder', path: folder }, enabled: false, granted: {} }
    await this.load(record, (existing?.revision ?? 0) + 1)
    this.watch(record)
    this.persist()
    return this.list().find((plugin) => plugin.id === id)!
  }

  async installPackage(file: string): Promise<PluginInfo> {
    if ((await stat(file)).size > PACKAGE_LIMITS.packageBytes) throw new AppError('pluginInvalid', { issue: `${basename(file)}: too large` })
    const { files, sha256 } = await readFile(file)
      .then((zip) => readPackage(zip))
      .catch((error: unknown) => {
        if (error instanceof PackageError) throw new AppError('pluginInvalid', { issue: `${basename(file)}: ${error.message}` })
        throw error
      })
    const raw = files.get(MANIFEST_FILE)
    let parsed: ReturnType<typeof parseManifest>
    try {
      parsed = raw ? parseManifest(JSON.parse(raw.toString('utf8'))) : { ok: false, issue: `${MANIFEST_FILE} not found` }
    } catch (error) {
      parsed = { ok: false, issue: `${MANIFEST_FILE}: ${(error as Error).message}` }
    }
    if (!parsed.ok) throw new AppError('pluginInvalid', { issue: parsed.issue })
    const { manifest } = parsed
    const compatibility = checkCompatibility(manifest, { appVersion: this.options.appVersion, apiVersions: SUPPORTED_API })
    if (!compatibility.ok) throw new AppError('pluginIncompatible', { required: String(compatibility.required), reason: compatibility.reason })

    const existing = this.plugins.get(manifest.id)
    if (existing?.record.source.kind === 'folder') throw new AppError('pluginExists', { id: manifest.id, path: existing.record.source.path })
    const ref: PackageRef = { kind: 'package', version: manifest.version, sha256 }
    await this.extract(manifest.id, ref, files)

    if (!existing) {
      await this.load({ id: manifest.id, source: ref, enabled: false, granted: {} }, 0)
    } else {
      const needsApproval = existing.record.enabled && hasPermissions(missingPermissions(requestedPermissions(manifest), existing.record.granted))
      const { update: _previous, ...record } = existing.record
      await this.load(needsApproval ? { ...record, update: ref } : { ...record, source: ref }, existing.revision + 1)
    }
    await this.prune(manifest.id)
    this.commit()
    return this.list().find((plugin) => plugin.id === manifest.id)!
  }

  async applyUpdate(pluginId: string, approved: GrantablePermissions): Promise<void> {
    const plugin = this.require(pluginId)
    const { update, ...record } = plugin.record
    if (!update || !plugin.update) throw new AppError('unknownPlugin', { id: pluginId })
    const granted = mergePermissions(record.granted, approved)
    if (hasPermissions(missingPermissions(requestedPermissions(plugin.update), granted))) throw new AppError('pluginPermissionsChanged', {})
    await this.load({ ...record, source: update, granted }, plugin.revision + 1)
    await this.prune(pluginId)
    this.commit()
  }

  async discardUpdate(pluginId: string): Promise<void> {
    const plugin = this.require(pluginId)
    const { update: _discarded, ...record } = plugin.record
    plugin.record = record
    plugin.update = null
    await this.prune(pluginId)
    this.commit()
  }

  enable(pluginId: string, approved: GrantablePermissions): void {
    const plugin = this.require(pluginId)
    const granted = mergePermissions(plugin.record.granted, approved)
    if (plugin.manifest && hasPermissions(missingPermissions(requestedPermissions(plugin.manifest), granted))) {
      throw new AppError('pluginPermissionsChanged', {})
    }
    plugin.record = { ...plugin.record, enabled: true, granted }
    this.commit()
  }

  disable(pluginId: string): void {
    const plugin = this.require(pluginId)
    plugin.record = { ...plugin.record, enabled: false }
    this.commit()
  }

  async remove(pluginId: string): Promise<void> {
    const plugin = this.require(pluginId)
    this.plugins.delete(pluginId)
    this.watchers.get(pluginId)?.close()
    this.watchers.delete(pluginId)
    this.commit()
    if (plugin.record.source.kind === 'package') await rm(join(this.options.packagesDir, pluginId), { recursive: true, force: true })
  }

  dispose(): void {
    for (const watcher of this.watchers.values()) watcher.close()
    for (const timer of this.reloads.values()) clearTimeout(timer)
  }

  private require(pluginId: string): Loaded {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) throw new AppError('unknownPlugin', { id: pluginId })
    return plugin
  }

  private folder(record: PluginRecord): string {
    return record.source.kind === 'folder' ? record.source.path : this.packageFolder(record.id, record.source)
  }

  private packageFolder(pluginId: string, ref: PackageRef): string {
    return join(this.options.packagesDir, pluginId, `${ref.version}-${ref.sha256.slice(0, 12)}`)
  }

  private async extract(pluginId: string, ref: PackageRef, files: Map<string, Buffer>): Promise<void> {
    const target = this.packageFolder(pluginId, ref)
    if (await stat(target).then(() => true, () => false)) return
    const staging = `${target}.partial`
    await rm(staging, { recursive: true, force: true })
    for (const [path, content] of files) {
      const destination = join(staging, ...path.split('/'))
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, content)
    }
    await rename(staging, target)
  }

  private async prune(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId)
    const keep = new Set(
      [plugin?.record.source, plugin?.record.update].flatMap((ref) => (ref?.kind === 'package' ? [basename(this.packageFolder(pluginId, ref))] : [])),
    )
    const dir = join(this.options.packagesDir, pluginId)
    const entries = await readdir(dir).catch(() => [])
    await Promise.all(entries.filter((entry) => !keep.has(entry)).map((entry) => rm(join(dir, entry), { recursive: true, force: true })))
  }

  private async load(record: PluginRecord, revision: number): Promise<void> {
    const update = record.update ? await readManifest(this.packageFolder(record.id, record.update)) : null
    const updateManifest = update && 'manifest' in update && update.manifest.id === record.id ? update.manifest : null
    const { update: _missing, ...withoutUpdate } = record
    const loaded = { record: updateManifest ? record : withoutUpdate, update: updateManifest, revision }
    const folder = this.folder(record)
    const result = await readManifest(folder)
    if (!('manifest' in result)) {
      this.plugins.set(record.id, { ...loaded, manifest: null, status: result.status, strings: {} })
      return
    }
    const { manifest } = result
    const compatibility = checkCompatibility(manifest, { appVersion: this.options.appVersion, apiVersions: SUPPORTED_API })
    const status: PluginStatus =
      manifest.id !== record.id
        ? { kind: 'invalid', issue: `id changed from ${record.id} to ${manifest.id}` }
        : compatibility.ok
          ? { kind: 'ready' }
          : { kind: 'incompatible', reason: compatibility.reason, required: String(compatibility.required) }
    this.plugins.set(record.id, { ...loaded, manifest, status, strings: await readStrings(folder, manifest) })
  }

  private watch(record: PluginRecord): void {
    if (!this.options.watch || this.watchers.has(record.id) || record.source.kind !== 'folder') return
    try {
      const watcher = watch(record.source.path, { recursive: true }, () => this.scheduleReload(record.id))
      watcher.on('error', () => watcher.close())
      this.watchers.set(record.id, watcher)
    } catch {
      return
    }
  }

  private scheduleReload(pluginId: string): void {
    clearTimeout(this.reloads.get(pluginId))
    this.reloads.set(
      pluginId,
      setTimeout(() => {
        this.reloads.delete(pluginId)
        const plugin = this.plugins.get(pluginId)
        if (plugin) void this.load(plugin.record, plugin.revision + 1).then(() => this.options.onChange())
      }, RELOAD_DELAY_MS),
    )
  }

  private commit(): void {
    this.persist()
    this.options.onChange()
  }

  private persist(): void {
    writeJsonAtomic(this.options.file, { plugins: [...this.plugins.values()].map(({ record }) => record) })
  }
}
