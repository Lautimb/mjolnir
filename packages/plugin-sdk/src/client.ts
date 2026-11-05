import type {
  CallMessage,
  HostErrorCode,
  HostMethod,
  HostMethods,
  HttpRequest,
  HttpResponse,
  InvokeMessage,
  InvokeReply,
  Json,
  NotifyKind,
  PluginContext,
  PluginMessage,
  RepoFileEntry,
  ReplyMessage,
  SessionRef,
  ShellMessage,
} from './protocol'
import type { ProviderImplementation } from './providers'
import { applyTheme } from './theme'

export class HostError extends Error {
  constructor(
    readonly code: HostErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'HostError'
  }
}

export interface Mjolnir {
  readonly context: PluginContext
  onContextChange(listener: (context: PluginContext) => void): () => void
  storage: {
    get<T extends Json = Json>(key: string): Promise<T | null>
    set(key: string, value: Json): Promise<void>
    delete(key: string): Promise<void>
    keys(): Promise<string[]>
  }
  secrets: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
    delete(key: string): Promise<void>
  }
  http: {
    request(request: HttpRequest): Promise<HttpResponse>
  }
  repoFiles: {
    list(session: SessionRef, dir?: string): Promise<RepoFileEntry[]>
    read(session: SessionRef, path: string): Promise<string | null>
    write(session: SessionRef, path: string, content: string): Promise<void>
    delete(session: SessionRef, path: string): Promise<void>
  }
  accounts: {
    token(provider: string, host: string): Promise<string | null>
  }
  providers: {
    register(providerId: string, implementation: ProviderImplementation): () => void
  }
  ui: {
    notify(message: string, kind?: NotifyKind): void
    openExternal(url: string): Promise<void>
  }
}

type Call = <M extends HostMethod>(method: M, ...params: HostMethods[M]['params']) => Promise<HostMethods[M]['result']>

export function createCaller(port: MessagePort): Call {
  let nextId = 1
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>()

  port.addEventListener('message', (event: MessageEvent<ReplyMessage>) => {
    const reply = event.data
    const request = pending.get(reply.id)
    if (!request) return
    pending.delete(reply.id)
    if ('error' in reply) request.reject(new HostError(reply.error.code, reply.error.message))
    else request.resolve(reply.result)
  })
  port.start()

  return (method, ...params) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      port.postMessage({ id, method, params } satisfies CallMessage)
    })
}

const ref = ({ repoId, worktree }: SessionRef): SessionRef => ({ repoId, worktree })

const REGISTER_TIMEOUT_MS = 10_000

function serveProviders(port: MessagePort) {
  const implementations = new Map<string, ProviderImplementation>()
  const waiting = new Map<string, Set<() => void>>()

  const implementation = (providerId: string) =>
    implementations.get(providerId) ??
    new Promise<ProviderImplementation>((resolve, reject) => {
      const listeners = waiting.get(providerId) ?? new Set()
      const ready = () => {
        clearTimeout(timer)
        resolve(implementations.get(providerId)!)
      }
      const timer = setTimeout(() => {
        listeners.delete(ready)
        reject(new HostError('unavailable', `provider ${providerId} was not registered`))
      }, REGISTER_TIMEOUT_MS)
      waiting.set(providerId, listeners.add(ready))
    })

  const run = async ({ provider, method, params }: InvokeMessage): Promise<unknown> => {
    const target = await implementation(provider)
    const [group, name] = method.includes('.') ? method.split('.') : [null, method]
    const owner = (group ? target[group as 'pulls'] : target) as Record<string, unknown> | undefined
    const handler = name && owner && Object.hasOwn(owner, name) ? owner[name] : undefined
    if (typeof handler !== 'function') throw new HostError('unknownMethod', `${provider}: ${method}`)
    return (handler as (...args: unknown[]) => unknown).apply(owner, params)
  }

  port.addEventListener('message', (event: MessageEvent<InvokeMessage>) => {
    const message = event.data
    if (typeof message?.invoke !== 'number') return
    run(message).then(
      (result) => port.postMessage({ invoke: message.invoke, result: result ?? null } satisfies InvokeReply),
      (error: unknown) =>
        port.postMessage({
          invoke: message.invoke,
          error: { code: error instanceof HostError ? error.code : 'requestFailed', message: error instanceof Error ? error.message : String(error) },
        } satisfies InvokeReply),
    )
  })

  return (providerId: string, provided: ProviderImplementation) => {
    implementations.set(providerId, provided)
    for (const ready of waiting.get(providerId) ?? []) ready()
    waiting.delete(providerId)
    return () => {
      if (implementations.get(providerId) === provided) implementations.delete(providerId)
    }
  }
}

export interface Shell {
  post(message: PluginMessage): void
}

export function createMjolnir(port: MessagePort, shell: Shell, initial: PluginContext): Mjolnir & { updateContext(context: PluginContext): void } {
  const call = createCaller(port)
  const register = serveProviders(port)
  const listeners = new Set<(context: PluginContext) => void>()
  let context = initial

  return {
    get context() {
      return context
    },
    updateContext(next) {
      context = next
      for (const listener of listeners) listener(next)
    },
    onContextChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    storage: {
      get: (key) => call('storage.get', key) as never,
      set: (key, value) => call('storage.set', key, value),
      delete: (key) => call('storage.delete', key),
      keys: () => call('storage.keys'),
    },
    secrets: {
      get: (key) => call('secrets.get', key),
      set: (key, value) => call('secrets.set', key, value),
      delete: (key) => call('secrets.delete', key),
    },
    http: {
      request: (request) => call('http.request', request),
    },
    repoFiles: {
      list: (session, dir = '') => call('repoFiles.list', ref(session), dir),
      read: (session, path) => call('repoFiles.read', ref(session), path),
      write: (session, path, content) => call('repoFiles.write', ref(session), path, content),
      delete: (session, path) => call('repoFiles.delete', ref(session), path),
    },
    accounts: {
      token: (provider, host) => call('accounts.token', provider, host),
    },
    providers: {
      register,
    },
    ui: {
      notify: (message, kind = 'info') => shell.post({ type: 'mjolnir:notify', message, kind }),
      openExternal: (url) => call('ui.openExternal', url),
    },
  }
}

function applyContext(context: PluginContext): void {
  const root = document.documentElement
  applyTheme(root.style, context.theme)
  root.lang = context.locale
}

let connection: Promise<Mjolnir> | null = null

export function connect(): Promise<Mjolnir> {
  connection ??= new Promise((resolve) => {
    let mjolnir: ReturnType<typeof createMjolnir> | null = null
    const shell: Shell = { post: (message) => window.parent.postMessage(message, '*') }

    window.addEventListener('message', (event: MessageEvent<ShellMessage>) => {
      if (event.source !== window.parent) return
      const message = event.data
      if (message.type === 'mjolnir:connect' && !mjolnir && event.ports[0]) {
        applyContext(message.context)
        mjolnir = createMjolnir(event.ports[0], shell, message.context)
        resolve(mjolnir)
      } else if (message.type === 'mjolnir:context' && mjolnir) {
        applyContext(message.context)
        mjolnir.updateContext(message.context)
      }
    })
  })
  return connection
}
