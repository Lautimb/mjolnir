import { watch, type FSWatcher } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { API_VERSION, hasPermissions, missingPermissions, type GrantablePermissions } from '@mjolnir/plugin-sdk'
import {
  checkCompatibility,
  localizedKeys,
  MANIFEST_FILE,
  parseManifest,
  type PluginManifest,
  type PluginPermissions,
} from '@mjolnir/plugin-sdk/manifest'
import type { PluginInfo, PluginStatus } from '../../shared/api'
import { AppError } from '../../shared/errors'
import { readJson, writeJsonAtomic } from '../json-file'

interface PluginRecord {
  id: string
  source: { kind: 'folder'; path: string }
  enabled: boolean
  granted: GrantablePermissions
}

interface Loaded {
  record: PluginRecord
  manifest: PluginManifest | null
  status: PluginStatus
  strings: Record<string, Record<string, string>>
  revision: number
}

export interface RegistryOptions {
  file: string
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

function isRecord(value: unknown): value is PluginRecord {
  const record = value as PluginRecord
  return !!record && typeof record.id === 'string' && record.source?.kind === 'folder' && typeof record.source.path === 'string'
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
    return [...this.plugins.values()].map(({ record, manifest, status, strings, revision }) => ({
      id: record.id,
      source: record.source,
      enabled: record.enabled,
      active: !!this.permissions(record.id),
      status,
      manifest,
      strings,
      pending: manifest ? missingPermissions(manifest.permissions, record.granted) : {},
      revision,
    }))
  }

  root(pluginId: string): string | null {
    return this.permissions(pluginId) ? this.plugins.get(pluginId)!.record.source.path : null
  }

  permissions(pluginId: string): PluginPermissions | null {
    const plugin = this.plugins.get(pluginId)
    if (!plugin?.record.enabled || plugin.status.kind !== 'ready' || !plugin.manifest) return null
    if (hasPermissions(missingPermissions(plugin.manifest.permissions, plugin.record.granted))) return null
    return plugin.manifest.permissions
  }

  async addFolder(folder: string): Promise<PluginInfo> {
    const result = await readManifest(folder)
    if (!('manifest' in result)) {
      throw new AppError('pluginInvalid', { issue: result.status.kind === 'invalid' ? result.status.issue : `${MANIFEST_FILE} not found` })
    }
    const { id } = result.manifest
    const existing = this.plugins.get(id)
    if (existing && existing.record.source.path !== folder) throw new AppError('pluginExists', { id, path: existing.record.source.path })
    const record: PluginRecord = existing?.record ?? { id, source: { kind: 'folder', path: folder }, enabled: false, granted: {} }
    await this.load(record, (existing?.revision ?? 0) + 1)
    this.watch(record)
    this.persist()
    return this.list().find((plugin) => plugin.id === id)!
  }

  enable(pluginId: string, approved: GrantablePermissions): void {
    const plugin = this.require(pluginId)
    const granted = { network: [...new Set([...(plugin.record.granted.network ?? []), ...(approved.network ?? [])])] }
    if (plugin.manifest && hasPermissions(missingPermissions(plugin.manifest.permissions, granted))) {
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

  remove(pluginId: string): void {
    this.require(pluginId)
    this.plugins.delete(pluginId)
    this.watchers.get(pluginId)?.close()
    this.watchers.delete(pluginId)
    this.commit()
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

  private async load(record: PluginRecord, revision: number): Promise<void> {
    const result = await readManifest(record.source.path)
    if (!('manifest' in result)) {
      this.plugins.set(record.id, { record, manifest: null, status: result.status, strings: {}, revision })
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
    this.plugins.set(record.id, { record, manifest, status, strings: await readStrings(record.source.path, manifest), revision })
  }

  private watch(record: PluginRecord): void {
    if (!this.options.watch || this.watchers.has(record.id)) return
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
