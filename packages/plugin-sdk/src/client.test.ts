import { describe, expect, it } from 'vitest'
import { createMjolnir, HostError } from './client'
import type { CallMessage, InvokeMessage, InvokeReply, PluginMessage, ReplyMessage, WorkspaceSession } from './protocol'

function setup(reply: (call: CallMessage) => ReplyMessage) {
  const { port1: plugin, port2: host } = new MessageChannel()
  const calls: CallMessage[] = []
  host.addEventListener('message', (event: MessageEvent<CallMessage>) => {
    calls.push(event.data)
    host.postMessage(reply(event.data))
  })
  host.start()
  const posted: PluginMessage[] = []
  const mjolnir = createMjolnir(plugin, { post: (message) => posted.push(message) }, { locale: 'es', theme: {}, session: null })
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

  it('sends only the session reference the host needs, not the whole session', async () => {
    const { mjolnir, calls, close } = setup((call) => ({ id: call.id, result: null }))
    const session: WorkspaceSession = { repoId: 'r1', worktree: '/repo', repoName: 'repo', branch: 'main' }
    await mjolnir.repoFiles.read(session, '.mjolnir/http/a.json')
    expect(calls[0]?.params).toEqual([{ repoId: 'r1', worktree: '/repo' }, '.mjolnir/http/a.json'])
    close()
  })

  it('tells listeners when the shell updates the context', () => {
    const { mjolnir, close } = setup((call) => ({ id: call.id, result: null }))
    const seen: string[] = []
    const off = mjolnir.onContextChange((context) => seen.push(context.locale))
    mjolnir.updateContext({ locale: 'en', theme: {}, session: null })
    off()
    mjolnir.updateContext({ locale: 'es', theme: {}, session: null })
    expect(seen).toEqual(['en'])
    expect(mjolnir.context.locale).toBe('es')
    close()
  })
})

describe('providers', () => {
  function host() {
    const { port1: plugin, port2: host } = new MessageChannel()
    const replies: InvokeReply[] = []
    host.addEventListener('message', (event: MessageEvent<InvokeReply>) => replies.push(event.data))
    host.start()
    const mjolnir = createMjolnir(plugin, { post: () => {} }, { locale: 'es', theme: {}, session: null })
    const until = async (count: number) => {
      while (replies.length < count) await new Promise((resolve) => setTimeout(resolve, 5))
    }
    return { mjolnir, replies, until, invoke: (message: InvokeMessage) => host.postMessage(message), close: () => (plugin.close(), host.close()) }
  }

  it('answers host calls with the registered provider, even when it registers after the call arrives', async () => {
    const { mjolnir, replies, until, invoke, close } = host()
    invoke({ invoke: 7, provider: 'azure', method: 'pulls.get', params: [{ token: 't' }, 'repo', 3] })
    await new Promise((resolve) => setTimeout(resolve, 10))
    mjolnir.providers.register('azure', {
      identify: async () => ({ login: 'ada', name: null, avatarUrl: null }),
      pulls: { get: async (_credential: unknown, repo: unknown, number: unknown) => ({ repo, number }) } as never,
    })
    await until(1)
    expect(replies).toEqual([{ invoke: 7, result: { repo: 'repo', number: 3 } }])
    close()
  })

  it('reports provider errors with their host error code', async () => {
    const { mjolnir, replies, until, invoke, close } = host()
    mjolnir.providers.register('azure', {
      identify: async () => {
        throw new HostError('unauthorized', 'bad token')
      },
    })
    invoke({ invoke: 1, provider: 'azure', method: 'identify', params: [] })
    invoke({ invoke: 2, provider: 'azure', method: 'pulls.list', params: [] })
    await until(2)
    expect(replies).toEqual([
      { invoke: 1, error: { code: 'unauthorized', message: 'bad token' } },
      { invoke: 2, error: { code: 'unknownMethod', message: 'azure: pulls.list' } },
    ])
    close()
  })
})
