import { z } from 'zod'
import type { HostMethod, HostMethods, HttpRequest, Json, ProviderCredential, ReplyMessage, SessionRef } from '@mjolnir/plugin-sdk'
import type { PluginPermissions } from '@mjolnir/plugin-sdk/manifest'
import type { PluginData } from './data'
import { HostFailure } from './failure'
import { performRequest, type Fetch } from './http'
import { deleteRepoFile, listRepoFiles, readRepoFile, writeRepoFile } from './repo-files'

export interface BrokerDeps {
  data: PluginData
  permissions(pluginId: string): PluginPermissions | null
  fetch(pluginId: string): Fetch
  worktreeRoot(session: SessionRef): Promise<string>
  accountCredential(provider: string, host: string): Promise<ProviderCredential | null>
  openExternal(url: string): void
}

const key = z.string().min(1).max(200)
const json: z.ZodType<Json> = z.json()
const secret = z.string().max(16_000)
const url = z.url({ protocol: /^https?$/ })

const sessionRef: z.ZodType<SessionRef> = z.object({ repoId: z.string().min(1).max(200), worktree: z.string().min(1).max(4096) }).strict()
const repoPath = z.string().max(1024)
const fileContent = z.string()
const account = z.tuple([z.string().min(1).max(200), z.string().min(1).max(253)])

const httpRequest: z.ZodType<HttpRequest> = z
  .object({
    method: z.string().regex(/^[A-Za-z]{1,16}$/),
    url,
    headers: z.record(z.string().min(1).max(256), z.string().max(16_000)).optional(),
    body: z.object({ encoding: z.enum(['utf8', 'base64']), data: z.string() }).strict().optional(),
    timeoutMs: z.number().int().positive().optional(),
    followRedirects: z.boolean().optional(),
  })
  .strict()

type Handler<M extends HostMethod> = (pluginId: string, ...params: HostMethods[M]['params']) => HostMethods[M]['result'] | Promise<HostMethods[M]['result']>

interface Route<M extends HostMethod> {
  params: z.ZodType<HostMethods[M]['params']>
  run: Handler<M>
}

type Routes = { [M in HostMethod]: Route<M> }

const call = z.object({ id: z.number().int().nonnegative(), method: z.string().max(100), params: z.array(z.unknown()).max(10) })

function routes(deps: BrokerDeps): Routes {
  const store = (pluginId: string) => deps.data.for(pluginId)
  const globs = (pluginId: string) => deps.permissions(pluginId)?.repoFiles
  const root = (pluginId: string, session: SessionRef) => {
    if (!globs(pluginId)?.length) throw new HostFailure('permissionDenied', 'repoFiles')
    return deps.worktreeRoot(session)
  }
  const credential = (pluginId: string, provider: string, host: string) => {
    const own = provider.startsWith(`${pluginId}.`)
    if (!own && !deps.permissions(pluginId)?.accounts?.includes(provider)) throw new HostFailure('permissionDenied', provider)
    return deps.accountCredential(provider, host)
  }
  return {
    'storage.get': { params: z.tuple([key]), run: (id, name) => store(id).storage.get(name) },
    'storage.set': { params: z.tuple([key, json]), run: (id, name, value) => store(id).storage.set(name, value) },
    'storage.delete': { params: z.tuple([key]), run: (id, name) => store(id).storage.delete(name) },
    'storage.keys': { params: z.tuple([]), run: (id) => store(id).storage.keys() },
    'secrets.get': { params: z.tuple([key]), run: (id, name) => store(id).secrets.get(name) },
    'secrets.set': { params: z.tuple([key, secret]), run: (id, name, value) => store(id).secrets.set(name, value) },
    'secrets.delete': { params: z.tuple([key]), run: (id, name) => store(id).secrets.delete(name) },
    'http.request': {
      params: z.tuple([httpRequest]),
      run: (id, request) => performRequest(deps.fetch(id), deps.permissions(id)?.network, request),
    },
    'repoFiles.list': { params: z.tuple([sessionRef, repoPath]), run: async (id, session, dir) => listRepoFiles(await root(id, session), dir, globs(id)) },
    'repoFiles.read': { params: z.tuple([sessionRef, repoPath]), run: async (id, session, path) => readRepoFile(await root(id, session), path, globs(id)) },
    'repoFiles.write': {
      params: z.tuple([sessionRef, repoPath, fileContent]),
      run: async (id, session, path, content) => writeRepoFile(await root(id, session), path, content, globs(id)),
    },
    'repoFiles.delete': { params: z.tuple([sessionRef, repoPath]), run: async (id, session, path) => deleteRepoFile(await root(id, session), path, globs(id)) },
    'accounts.token': { params: account, run: async (id, provider, host) => (await credential(id, provider, host))?.token ?? null },
    'accounts.credential': { params: account, run: credential },
    'ui.openExternal': { params: z.tuple([url]), run: (_id, target) => deps.openExternal(target) },
  }
}

export type Broker = (pluginId: string, message: unknown) => Promise<ReplyMessage | null>

export function createBroker(deps: BrokerDeps): Broker {
  const table = routes(deps) as Record<string, Route<HostMethod>>

  return async (pluginId, message) => {
    const parsed = call.safeParse(message)
    if (!parsed.success) return null
    const { id, method, params } = parsed.data
    const fail = (failure: HostFailure): ReplyMessage => ({ id, error: failure.toPayload() })

    if (!deps.permissions(pluginId)) return fail(new HostFailure('unavailable', 'the plugin is not enabled'))
    const route = Object.hasOwn(table, method) ? table[method] : undefined
    if (!route) return fail(new HostFailure('unknownMethod', method))
    const args = route.params.safeParse(params)
    if (!args.success) return fail(new HostFailure('invalidRequest', `${method}: ${args.error.issues[0]?.message ?? 'invalid params'}`))

    try {
      const result = await (route.run as (pluginId: string, ...params: unknown[]) => unknown)(pluginId, ...(args.data as unknown[]))
      return { id, result: result ?? null }
    } catch (error) {
      if (error instanceof HostFailure) return fail(error)
      return fail(new HostFailure('requestFailed', error instanceof Error ? error.message : String(error)))
    }
  }
}
