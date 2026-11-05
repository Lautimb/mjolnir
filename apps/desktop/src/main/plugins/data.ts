import { join } from 'node:path'
import type { Json } from '@mjolnir/plugin-sdk'
import { readJson, writeJsonAtomic } from '../json-file'
import { HostFailure } from './failure'

export interface Cipher {
  encrypt(value: string): string
  decrypt(value: string): string
}

export interface Limits {
  valueBytes: number
  totalBytes: number
  keys: number
}

export const STORAGE_LIMITS: Limits = { valueBytes: 1_000_000, totalBytes: 10_000_000, keys: 10_000 }
export const SECRET_LIMITS: Limits = { valueBytes: 16_000, totalBytes: 1_000_000, keys: 100 }

const SAVE_DELAY_MS = 250

class JsonDocument<V> {
  private entries: Map<string, V> | null = null
  private readonly sizes = new Map<string, number>()
  private total = 0
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly file: string,
    private readonly limits: Limits,
  ) {}

  get(key: string): V | null {
    return this.load().get(key) ?? null
  }

  keys(): string[] {
    return [...this.load().keys()]
  }

  set(key: string, value: V): void {
    const entries = this.load()
    const size = Buffer.byteLength(JSON.stringify(value))
    if (size > this.limits.valueBytes) throw new HostFailure('quotaExceeded', `value larger than ${this.limits.valueBytes} bytes`)
    if (!entries.has(key) && entries.size >= this.limits.keys) throw new HostFailure('quotaExceeded', `more than ${this.limits.keys} keys`)
    const total = this.total - (this.sizes.get(key) ?? 0) + size
    if (total > this.limits.totalBytes) throw new HostFailure('quotaExceeded', `more than ${this.limits.totalBytes} bytes stored`)
    entries.set(key, value)
    this.sizes.set(key, size)
    this.total = total
    this.schedule()
  }

  delete(key: string): void {
    if (!this.load().delete(key)) return
    this.total -= this.sizes.get(key) ?? 0
    this.sizes.delete(key)
    this.schedule()
  }

  flush(): void {
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = null
    writeJsonAtomic(this.file, Object.fromEntries(this.load()))
  }

  private schedule(): void {
    this.timer ??= setTimeout(() => this.flush(), SAVE_DELAY_MS)
  }

  private load(): Map<string, V> {
    if (this.entries) return this.entries
    const raw = readJson(this.file)
    const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, V>) : {}
    this.entries = new Map(Object.entries(record))
    for (const [key, value] of this.entries) {
      const size = Buffer.byteLength(JSON.stringify(value))
      this.sizes.set(key, size)
      this.total += size
    }
    return this.entries
  }
}

export interface PluginStore {
  storage: JsonDocument<Json>
  secrets: { get(key: string): string | null; set(key: string, value: string): void; delete(key: string): void }
}

export class PluginData {
  private readonly stores = new Map<string, PluginStore>()
  private readonly flushers = new Map<string, () => void>()

  constructor(
    private readonly dir: string,
    private readonly cipher: Cipher,
  ) {}

  for(pluginId: string): PluginStore {
    const existing = this.stores.get(pluginId)
    if (existing) return existing
    const folder = join(this.dir, pluginId)
    const encrypted = new JsonDocument<string>(join(folder, 'secrets.json'), SECRET_LIMITS)
    const store: PluginStore = {
      storage: new JsonDocument<Json>(join(folder, 'storage.json'), STORAGE_LIMITS),
      secrets: {
        get: (key) => {
          const value = encrypted.get(key)
          return value === null ? null : this.cipher.decrypt(value)
        },
        set: (key, value) => encrypted.set(key, this.cipher.encrypt(value)),
        delete: (key) => encrypted.delete(key),
      },
    }
    this.flushers.set(pluginId, () => {
      store.storage.flush()
      encrypted.flush()
    })
    this.stores.set(pluginId, store)
    return store
  }

  flush(): void {
    for (const flush of this.flushers.values()) flush()
  }
}
