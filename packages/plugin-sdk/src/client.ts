import type {
  CallMessage,
  HostErrorCode,
  HostMethod,
  HostMethods,
  HttpRequest,
  HttpResponse,
  Json,
  NotifyKind,
  PluginContext,
  PluginMessage,
  ReplyMessage,
  ShellMessage,
} from './protocol'
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

export interface Shell {
  post(message: PluginMessage): void
}

export function createMjolnir(port: MessagePort, shell: Shell, initial: PluginContext): Mjolnir & { updateContext(context: PluginContext): void } {
  const call = createCaller(port)
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
