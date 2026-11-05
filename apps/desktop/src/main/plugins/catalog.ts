import { createHash } from 'node:crypto'
import { z } from 'zod'
import { verifyEntry } from '@mjolnir/plugin-sdk/catalog'
import { checkCompatibility, parseManifest } from '@mjolnir/plugin-sdk/manifest'
import type { CatalogPlugin, PluginCatalogState } from '../../shared/api'
import { AppError } from '../../shared/errors'
import { readJson, writeJsonAtomic } from '../json-file'
import { PACKAGE_LIMITS } from './package'

export const CATALOG_URL = 'https://raw.githubusercontent.com/Lautimb/mjolnir-plugins/main/index.json'

export const CATALOG_KEYS = ['MCowBQYDK2VwAyEAdX5mQ6AiGT1wcBL1Ao9UbFQ+FQxvjCtVyeJhKdzNmB4=']

export const CATALOG_LIMITS = { indexBytes: 5_000_000, plugins: 1_000, maxAgeMs: 60 * 60_000 }

const DOWNLOAD_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/releases\/download\/[^?#]+\.mjp$/

const entrySchema = z.object({
  id: z.string().max(64),
  version: z.string().max(64),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  url: z.string().max(2000).regex(DOWNLOAD_URL),
  size: z.number().int().positive().max(PACKAGE_LIMITS.packageBytes),
  manifest: z.unknown(),
  strings: z.record(z.string().regex(/^[a-z]{2}$/), z.record(z.string().max(200), z.string().max(500))).default({}),
  signature: z.string().max(200).optional(),
})

const indexSchema = z.object({ schema: z.literal(1), plugins: z.array(z.unknown()).max(CATALOG_LIMITS.plugins) })

type Entry = z.infer<typeof entrySchema> & { manifest: CatalogPlugin['manifest']; verified: boolean }

interface Cache {
  fetchedAt: number
  etag: string | null
  index: unknown
}

export interface CatalogOptions {
  cacheFile: string
  appVersion: string
  apiVersions: readonly number[]
  fetch(url: string, init?: RequestInit): Promise<Response>
  url?: string
  publicKeys?: readonly string[]
  now?(): number
}

function verified(entry: z.infer<typeof entrySchema>, publicKeys: readonly string[]): boolean {
  if (!entry.signature) return false
  try {
    return verifyEntry(entry, entry.signature, publicKeys)
  } catch {
    return false
  }
}

export function parseIndex(raw: unknown, publicKeys: readonly string[]): Entry[] {
  const index = indexSchema.safeParse(raw)
  if (!index.success) return []
  const seen = new Set<string>()
  return index.data.plugins.flatMap((candidate) => {
    const entry = entrySchema.safeParse(candidate)
    if (!entry.success || seen.has(entry.data.id)) return []
    const manifest = parseManifest(entry.data.manifest)
    if (!manifest.ok || manifest.manifest.id !== entry.data.id || manifest.manifest.version !== entry.data.version) return []
    seen.add(entry.data.id)
    return [{ ...entry.data, manifest: manifest.manifest, verified: verified(entry.data, publicKeys) }]
  })
}

async function readLimited(response: Response, limit: number): Promise<Buffer> {
  if (Number(response.headers.get('content-length') ?? 0) > limit) throw new Error(`larger than ${limit} bytes`)
  if (!response.body) return Buffer.alloc(0)
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = response.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > limit) {
      await reader.cancel()
      throw new Error(`larger than ${limit} bytes`)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

export class PluginCatalog {
  private cache: Cache | null
  private entries: Entry[]
  private failed = false
  private refreshing: Promise<void> | null = null

  constructor(private readonly options: CatalogOptions) {
    const cached = readJson(options.cacheFile) as Cache | null
    this.cache = cached && typeof cached.fetchedAt === 'number' ? cached : null
    this.entries = this.cache ? parseIndex(this.cache.index, this.publicKeys) : []
  }

  async state(refresh: boolean): Promise<PluginCatalogState> {
    const now = this.options.now?.() ?? Date.now()
    if (refresh || !this.cache || now - this.cache.fetchedAt > CATALOG_LIMITS.maxAgeMs) {
      this.refreshing ??= this.refresh(now).finally(() => (this.refreshing = null))
      await this.refreshing
    }
    return { plugins: this.entries.map((entry) => this.describe(entry)), fetchedAt: this.cache?.fetchedAt ?? null, failed: this.failed }
  }

  async download(pluginId: string): Promise<{ zip: Buffer; entry: Entry }> {
    const entry = this.entries.find((candidate) => candidate.id === pluginId)
    if (!entry) throw new AppError('unknownPlugin', { id: pluginId })
    let zip: Buffer
    try {
      const response = await this.options.fetch(entry.url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      zip = await readLimited(response, entry.size)
    } catch (error) {
      throw new AppError('pluginDownloadFailed', { message: error instanceof Error ? error.message : String(error) })
    }
    if (createHash('sha256').update(zip).digest('hex') !== entry.sha256) throw new AppError('pluginDownloadFailed', { message: 'sha256 mismatch' })
    return { zip, entry }
  }

  private get publicKeys(): readonly string[] {
    return this.options.publicKeys ?? CATALOG_KEYS
  }

  private describe(entry: Entry): CatalogPlugin {
    const compatibility = checkCompatibility(entry.manifest, { appVersion: this.options.appVersion, apiVersions: this.options.apiVersions })
    return {
      id: entry.id,
      version: entry.version,
      size: entry.size,
      verified: entry.verified,
      manifest: entry.manifest,
      strings: entry.strings,
      status: compatibility.ok ? { kind: 'ready' } : { kind: 'incompatible', reason: compatibility.reason, required: String(compatibility.required) },
    }
  }

  private async refresh(now: number): Promise<void> {
    try {
      const headers: Record<string, string> = this.cache?.etag ? { 'if-none-match': this.cache.etag } : {}
      const response = await this.options.fetch(this.options.url ?? CATALOG_URL, { headers })
      if (response.status === 304 && this.cache) {
        this.cache = { ...this.cache, fetchedAt: now }
      } else if (response.ok) {
        const index: unknown = JSON.parse((await readLimited(response, CATALOG_LIMITS.indexBytes)).toString('utf8'))
        if (!indexSchema.safeParse(index).success) throw new Error('invalid catalog')
        this.cache = { fetchedAt: now, etag: response.headers.get('etag'), index }
        this.entries = parseIndex(index, this.publicKeys)
      } else {
        throw new Error(`HTTP ${response.status}`)
      }
      this.failed = false
      writeJsonAtomic(this.options.cacheFile, this.cache)
    } catch {
      this.failed = true
    }
  }
}
