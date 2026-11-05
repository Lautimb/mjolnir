import { describe, expect, it } from 'vitest'
import { createMjolnir, HostError } from './client'
import type { CallMessage, PluginMessage, ReplyMessage } from './protocol'

function setup(reply: (call: CallMessage) => ReplyMessage) {
  const { port1: plugin, port2: host } = new MessageChannel()
  const calls: CallMessage[] = []
  host.addEventListener('message', (event: MessageEvent<CallMessage>) => {
    calls.push(event.data)
    host.postMessage(reply(event.data))
  })
  host.start()
  const posted: PluginMessage[] = []
  const mjolnir = createMjolnir(plugin, { post: (message) => posted.push(message) }, { locale: 'es', theme: {} })
  return { mjolnir, calls, posted, close: () => (plugin.close(), host.close()) }
}

describe('createMjolnir', () => {
  it('sends each call with its method and params and resolves with the reply that has its id', async () => {
    const { mjolnir, calls, close } = setup((call) => ({ id: call.id, result: call.method === 'storage.get' ? { count: 2 } : null }))
    const [value] = await Promise.all([mjolnir.storage.get('counter'), mjolnir.storage.set('counter', 3)])
    expect(value).toEqual({ count: 2 })
    expect(calls.map(({ method, params }) => ({ method, params }))).toEqual([
      { method: 'storage.get', params: ['counter'] },
      { method: 'storage.set', params: ['counter', 3] },
    ])
    close()
  })

  it('rejects with a HostError that keeps the code the host sent', async () => {
    const { mjolnir, close } = setup((call) => ({ id: call.id, error: { code: 'permissionDenied', message: 'https://evil.io' } }))
    const error = await mjolnir.http.request({ method: 'GET', url: 'https://evil.io' }).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(HostError)
    expect(error).toMatchObject({ code: 'permissionDenied' })
    close()
  })

  it('sends notifications to the shell instead of the host', () => {
    const { mjolnir, calls, posted, close } = setup((call) => ({ id: call.id, result: null }))
    mjolnir.ui.notify('Guardado')
    expect(posted).toEqual([{ type: 'mjolnir:notify', message: 'Guardado', kind: 'info' }])
    expect(calls).toEqual([])
    close()
  })

  it('tells listeners when the shell updates the context', () => {
    const { mjolnir, close } = setup((call) => ({ id: call.id, result: null }))
    const seen: string[] = []
    const off = mjolnir.onContextChange((context) => seen.push(context.locale))
    mjolnir.updateContext({ locale: 'en', theme: {} })
    off()
    mjolnir.updateContext({ locale: 'es', theme: {} })
    expect(seen).toEqual(['en'])
    expect(mjolnir.context.locale).toBe('es')
    close()
  })
})
