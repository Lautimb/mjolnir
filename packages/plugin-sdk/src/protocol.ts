import type { ProviderMethod } from './providers'

export const API_VERSION = 1

export const PLUGIN_SCHEME = 'mjolnir-plugin'

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

export interface HttpBody {
  encoding: 'utf8' | 'base64'
  data: string
}

export interface HttpRequest {
  method: string
  url: string
  headers?: Record<string, string>
  body?: HttpBody
  timeoutMs?: number
  followRedirects?: boolean
}

export interface HttpResponse {
  url: string
  status: number
  statusText: string
  headers: [name: string, value: string][]
  body: HttpBody
  redirects: string[]
  durationMs: number
}

export interface SessionRef {
  repoId: string
  worktree: string
}

export interface WorkspaceSession extends SessionRef {
  repoName: string
  branch: string | null
}

export interface RepoFileEntry {
  path: string
  size: number
  modifiedMs: number
}

export interface HostMethods {
  'storage.get': { params: [key: string]; result: Json | null }
  'storage.set': { params: [key: string, value: Json]; result: void }
  'storage.delete': { params: [key: string]; result: void }
  'storage.keys': { params: []; result: string[] }
  'secrets.get': { params: [key: string]; result: string | null }
  'secrets.set': { params: [key: string, value: string]; result: void }
  'secrets.delete': { params: [key: string]; result: void }
  'http.request': { params: [request: HttpRequest]; result: HttpResponse }
  'repoFiles.list': { params: [session: SessionRef, dir: string]; result: RepoFileEntry[] }
  'repoFiles.read': { params: [session: SessionRef, path: string]; result: string | null }
  'repoFiles.write': { params: [session: SessionRef, path: string, content: string]; result: void }
  'repoFiles.delete': { params: [session: SessionRef, path: string]; result: void }
  'accounts.token': { params: [provider: string, host: string]; result: string | null }
  'ui.openExternal': { params: [url: string]; result: void }
}

export type HostMethod = keyof HostMethods

export type HostErrorCode =
  | 'invalidRequest'
  | 'unknownMethod'
  | 'permissionDenied'
  | 'quotaExceeded'
  | 'timeout'
  | 'requestFailed'
  | 'unavailable'
  | 'unauthorized'

export interface HostErrorPayload {
  code: HostErrorCode
  message: string
}

export interface CallMessage {
  id: number
  method: string
  params: unknown[]
}

export type ReplyMessage = { id: number; result: unknown } | { id: number; error: HostErrorPayload }

export interface InvokeMessage {
  invoke: number
  provider: string
  method: ProviderMethod
  params: unknown[]
}

export type InvokeReply = { invoke: number; result: unknown } | { invoke: number; error: HostErrorPayload }

export interface PluginContext {
  locale: string
  theme: Record<string, string>
  session: WorkspaceSession | null
}

export type NotifyKind = 'info' | 'error'

export type ShellMessage = { type: 'mjolnir:connect'; context: PluginContext } | { type: 'mjolnir:context'; context: PluginContext }

export type PluginMessage = { type: 'mjolnir:notify'; message: string; kind: NotifyKind }
