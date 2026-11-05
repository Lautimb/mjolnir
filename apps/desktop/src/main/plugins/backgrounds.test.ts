import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InvokeMessage } from '@mjolnir/plugin-sdk'
import { PluginBackgrounds, type BackgroundPort } from './backgrounds'

const TIMEOUTS = { startMs: 1000, callMs: 1000, idleMs: 5000 }

function setup(window = true) {
  const started: string[] = []
  const stopped: string[] = []
  const backgrounds = new PluginBackgrounds(
    {
      start: (id) => (window ? (started.push(id), true) : false),
      stop: (id) => void stopped.push(id),
    },
    TIMEOUTS,
  )
  const port = () => {
    const sent: InvokeMessage[] = []
    const value: BackgroundPort & { sent: InvokeMessage[]; closed: boolean } = { sent, closed: false, postMessage: (m) => void sent.push(m), close: () => void (value.closed = true) }
    return value
  }
  return { backgrounds, started, stopped, port }
}

afterEach(() => vi.useRealTimers())

describe('PluginBackgrounds', () => {
  it('starts the background on the first call and sends it once its port is attached', async () => {
    const { backgrounds, started, port } = setup()
    const call = backgrounds.invoke('azure', 'azure-devops', 'identify', ['cred'])
    await Promise.resolve()
    expect(started).toEqual(['azure'])
    const host = port()
    backgrounds.attach('azure', host)
    await vi.waitFor(() => expect(host.sent).toHaveLength(1))
    backgrounds.reply('azure', { invoke: host.sent[0]!.invoke, result: { login: 'ada' } })
    expect(await call).toEqual({ login: 'ada' })
    expect(started).toEqual(['azure'])
  })

  it('rejects with the code the plugin answered', async () => {
    const { backgrounds, port } = setup()
    const host = port()
    backgrounds.attach('azure', host)
    const call = backgrounds.invoke('azure', 'azure-devops', 'pulls.list', [])
    await vi.waitFor(() => expect(host.sent).toHaveLength(1))
    backgrounds.reply('azure', { invoke: host.sent[0]!.invoke, error: { code: 'unauthorized', message: 'expired' } })
    await expect(call).rejects.toMatchObject({ code: 'unauthorized' })
  })

  it('fails fast when there is no window and times out when the background never connects', async () => {
    await expect(setup(false).backgrounds.invoke('azure', 'p', 'identify', [])).rejects.toMatchObject({ code: 'unavailable' })
    vi.useFakeTimers()
    const call = setup().backgrounds.invoke('azure', 'p', 'identify', []).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(TIMEOUTS.startMs)
    expect(await call).toMatchObject({ code: 'unavailable' })
  })

  it('stops an idle background and fails the calls of one that went away', async () => {
    vi.useFakeTimers()
    const { backgrounds, stopped, port } = setup()
    const host = port()
    backgrounds.attach('azure', host)
    const call = backgrounds.invoke('azure', 'p', 'identify', []).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    backgrounds.detach('azure', host)
    expect(await call).toMatchObject({ code: 'unavailable' })
    backgrounds.attach('azure', port())
    await vi.advanceTimersByTimeAsync(TIMEOUTS.idleMs)
    expect(stopped).toEqual(['azure'])
  })
})
