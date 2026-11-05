import type { HttpRequest, HttpResponse, RepoFileEntry } from '@mjolnir/plugin-sdk'

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const

export const COLLECTION_DIR = '.mjolnir/http'
export const COLLECTION_EXTENSION = '.json'
export const HISTORY_LIMIT = 50
export const DISPLAY_LIMIT = 2_000_000

export interface Header {
  name: string
  value: string
  enabled: boolean
}

export type BodyKind = 'none' | 'json' | 'text'

export interface RequestSpec {
  method: string
  url: string
  headers: Header[]
  body: { kind: BodyKind; text: string }
}

export interface Variable {
  name: string
  value: string
  enabled: boolean
}

export interface Environment {
  id: string
  name: string
  variables: Variable[]
}

export interface HistoryEntry {
  id: string
  at: number
  request: RequestSpec
  status: number | null
  durationMs: number | null
}

export function emptyRequest(): RequestSpec {
  return { method: 'GET', url: '', headers: [], body: { kind: 'none', text: '' } }
}

const VARIABLE = /\{\{\s*([\w.-]+)\s*\}\}/g

export function variablesOf(environment: Environment | null): Map<string, string> {
  return new Map((environment?.variables ?? []).filter((variable) => variable.enabled && variable.name).map((variable) => [variable.name, variable.value]))
}

export function interpolate(text: string, variables: Map<string, string>, missing: Set<string> = new Set()): string {
  return text.replace(VARIABLE, (match, name: string) => {
    const value = variables.get(name)
    if (value === undefined) missing.add(name)
    return value ?? match
  })
}

const hasHeader = (headers: Record<string, string>, name: string) => Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase())

export function buildRequest(spec: RequestSpec, environment: Environment | null): { request: HttpRequest; missing: string[] } {
  const variables = variablesOf(environment)
  const missing = new Set<string>()
  const headers: Record<string, string> = {}
  for (const header of spec.headers) {
    const name = interpolate(header.name, variables, missing).trim()
    if (header.enabled && name) headers[name] = interpolate(header.value, variables, missing)
  }
  const request: HttpRequest = { method: spec.method, url: interpolate(spec.url, variables, missing).trim(), headers }
  if (spec.body.kind !== 'none' && !['GET', 'HEAD'].includes(spec.method)) {
    request.body = { encoding: 'utf8', data: interpolate(spec.body.text, variables, missing) }
    if (spec.body.kind === 'json' && !hasHeader(headers, 'content-type')) headers['Content-Type'] = 'application/json'
  }
  return { request, missing: [...missing] }
}

export function headerValue(response: Pick<HttpResponse, 'headers'>, name: string): string | null {
  return response.headers.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? null
}

export type DisplayBody = { kind: 'text'; text: string; truncated: boolean; json: boolean } | { kind: 'binary'; bytes: number }

export function displayBody(response: HttpResponse): DisplayBody {
  if (response.body.encoding === 'base64') return { kind: 'binary', bytes: Math.floor((response.body.data.length * 3) / 4) }
  const raw = response.body.data
  const type = headerValue(response, 'content-type') ?? ''
  if (/[/+]json\b/i.test(type) && raw.length <= DISPLAY_LIMIT) {
    try {
      return { kind: 'text', text: JSON.stringify(JSON.parse(raw), null, 2), truncated: false, json: true }
    } catch {}
  }
  return { kind: 'text', text: raw.slice(0, DISPLAY_LIMIT), truncated: raw.length > DISPLAY_LIMIT, json: false }
}

export function bodyBytes(response: HttpResponse): number {
  return response.body.encoding === 'base64' ? Math.floor((response.body.data.length * 3) / 4) : new TextEncoder().encode(response.body.data).length
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export type StatusTone = 'success' | 'accent' | 'danger' | 'muted'

export function statusTone(status: number | null): StatusTone {
  if (status === null) return 'danger'
  if (status < 300) return 'success'
  if (status < 400) return 'accent'
  return 'danger'
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function parseHeaders(value: unknown): Header[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value)) return null
  const headers: Header[] = []
  for (const item of value) {
    if (!isRecord(item) || typeof item.name !== 'string' || typeof item.value !== 'string') return null
    headers.push({ name: item.name, value: item.value, enabled: item.enabled !== false })
  }
  return headers
}

function parseBody(value: unknown): RequestSpec['body'] | null {
  if (value === undefined) return { kind: 'none', text: '' }
  if (!isRecord(value) || !['none', 'json', 'text'].includes(value.kind as string)) return null
  if (value.text !== undefined && typeof value.text !== 'string') return null
  return { kind: value.kind as BodyKind, text: (value.text as string | undefined) ?? '' }
}

export function parseRequestFile(content: string): RequestSpec | null {
  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch {
    return null
  }
  if (!isRecord(raw) || typeof raw.method !== 'string' || typeof raw.url !== 'string') return null
  const headers = parseHeaders(raw.headers)
  const body = parseBody(raw.body)
  if (!headers || !body) return null
  return { method: raw.method.toUpperCase(), url: raw.url, headers, body }
}

export function serializeRequest(spec: RequestSpec): string {
  const file = {
    method: spec.method,
    url: spec.url,
    ...(spec.headers.length > 0 && { headers: spec.headers.map(({ name, value, enabled }) => (enabled ? { name, value } : { name, value, enabled })) }),
    ...(spec.body.kind !== 'none' && { body: spec.body }),
  }
  return `${JSON.stringify(file, null, 2)}\n`
}

export function sameRequest(a: RequestSpec, b: RequestSpec): boolean {
  return serializeRequest(a) === serializeRequest(b)
}

const UNSAFE_NAME = /[\\:*?"<>|\x00-\x1f]/

export function requestPath(name: string): string | null {
  const segments = name
    .trim()
    .replace(/\.json$/i, '')
    .split('/')
    .map((segment) => segment.trim())
  if (!segments.every((segment) => segment && !UNSAFE_NAME.test(segment) && !/^\.+$/.test(segment) && !/[. ]$/.test(segment))) return null
  return `${COLLECTION_DIR}/${segments.join('/')}${COLLECTION_EXTENSION}`
}

export function requestName(path: string): string {
  return path.slice(COLLECTION_DIR.length + 1, -COLLECTION_EXTENSION.length)
}

export interface CollectionFolder {
  name: string
  path: string
  folders: CollectionFolder[]
  requests: { name: string; path: string }[]
}

export function collectionTree(entries: RepoFileEntry[]): CollectionFolder {
  const root: CollectionFolder = { name: '', path: '', folders: [], requests: [] }
  for (const entry of entries) {
    if (!entry.path.startsWith(`${COLLECTION_DIR}/`) || !entry.path.endsWith(COLLECTION_EXTENSION)) continue
    const segments = requestName(entry.path).split('/')
    let folder = root
    for (const segment of segments.slice(0, -1)) {
      const path = folder.path ? `${folder.path}/${segment}` : segment
      let next = folder.folders.find((candidate) => candidate.name === segment)
      if (!next) folder.folders.push((next = { name: segment, path, folders: [], requests: [] }))
      folder = next
    }
    folder.requests.push({ name: segments.at(-1)!, path: entry.path })
  }
  const sort = (folder: CollectionFolder) => {
    folder.folders.sort((a, b) => a.name.localeCompare(b.name))
    folder.requests.sort((a, b) => a.name.localeCompare(b.name))
    folder.folders.forEach(sort)
  }
  sort(root)
  return root
}

export function addToHistory(history: HistoryEntry[], entry: HistoryEntry, limit = HISTORY_LIMIT): HistoryEntry[] {
  return [entry, ...history].slice(0, limit)
}
