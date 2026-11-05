import type { InvokeMessage, InvokeReply, ProviderMethod } from '@mjolnir/plugin-sdk'
import { HostFailure } from './failure'

export interface BackgroundPort {
  postMessage(message: InvokeMessage): void
  close(): void
}

export interface BackgroundHost {
  start(pluginId: string): boolean
  stop(pluginId: string): void
}

export const BACKGROUND_TIMEOUTS = { startMs: 15_000, callMs: 60_000, idleMs: 5 * 60_000 }

interface Pending {
  resolve(value: unknown): void
  reject(error: Error): void
  timer: ReturnType<typeof setTimeout>
}

interface Running {
  port: BackgroundPort
  pending: Map<number, Pending>
  idle: ReturnType<typeof setTimeout> | null
}

export class PluginBackgrounds {
  private readonly running = new Map<string, Running>()
  private readonly starting = new Map<string, { waiters: Pending[] }>()
  private nextId = 1

  constructor(
    private readonly host: BackgroundHost,
    private readonly timeouts = BACKGROUND_TIMEOUTS,
  ) {}

  attach(pluginId: string, port: BackgroundPort): void {
    this.detach(pluginId)
    this.running.set(pluginId, { port, pending: new Map(), idle: null })
    this.schedule(pluginId)
    const starting = this.starting.get(pluginId)
    this.starting.delete(pluginId)
    for (const waiter of starting?.waiters ?? []) {
      clearTimeout(waiter.timer)
      waiter.resolve(port)
    }
  }

  detach(pluginId: string, port?: BackgroundPort): void {
    const running = this.running.get(pluginId)
    if (!running || (port && running.port !== port)) return
    this.running.delete(pluginId)
    if (running.idle) clearTimeout(running.idle)
    for (const pending of running.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new HostFailure('unavailable', 'the plugin background stopped'))
    }
    running.port.close()
  }

  reply(pluginId: string, message: InvokeReply): void {
    const running = this.running.get(pluginId)
    const pending = running?.pending.get(message.invoke)
    if (!running || !pending) return
    running.pending.delete(message.invoke)
    clearTimeout(pending.timer)
    if ('error' in message) pending.reject(new HostFailure(message.error.code, message.error.message))
    else pending.resolve(message.result)
  }

  async invoke(pluginId: string, provider: string, method: ProviderMethod, params: unknown[]): Promise<unknown> {
    const port = await this.port(pluginId)
    const running = this.running.get(pluginId)!
    const invoke = this.nextId++
    this.schedule(pluginId)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        running.pending.delete(invoke)
        reject(new HostFailure('timeout', `${provider}: ${method} did not answer`))
      }, this.timeouts.callMs)
      running.pending.set(invoke, { resolve, reject, timer })
      port.postMessage({ invoke, provider, method, params })
    })
  }

  stop(pluginId: string): void {
    const wasRunning = this.running.has(pluginId)
    this.detach(pluginId)
    if (wasRunning) this.host.stop(pluginId)
  }

  stopInactive(isActive: (pluginId: string) => boolean): void {
    for (const pluginId of [...this.running.keys()]) if (!isActive(pluginId)) this.stop(pluginId)
  }

  private port(pluginId: string): Promise<BackgroundPort> {
    const running = this.running.get(pluginId)
    if (running) return Promise.resolve(running.port)
    return new Promise((resolve, reject) => {
      const starting = this.starting.get(pluginId)
      const waiter: Pending = {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer: setTimeout(() => {
          const current = this.starting.get(pluginId)
          if (current) current.waiters = current.waiters.filter((candidate) => candidate !== waiter)
          reject(new HostFailure('unavailable', 'the plugin background did not start'))
        }, this.timeouts.startMs),
      }
      if (starting) return void starting.waiters.push(waiter)
      this.starting.set(pluginId, { waiters: [waiter] })
      if (!this.host.start(pluginId)) {
        this.starting.delete(pluginId)
        clearTimeout(waiter.timer)
        reject(new HostFailure('unavailable', 'Mjolnir has no window to run the plugin in'))
      }
    })
  }

  private schedule(pluginId: string): void {
    const running = this.running.get(pluginId)
    if (!running) return
    if (running.idle) clearTimeout(running.idle)
    running.idle = setTimeout(() => {
      if (running.pending.size) return this.schedule(pluginId)
      this.stop(pluginId)
    }, this.timeouts.idleMs)
  }
}
