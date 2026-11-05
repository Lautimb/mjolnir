import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBroker } from './broker'
import { PluginData } from './data'

function setup(active: Record<string, string[]> = { hello: ['https://api.io'] }, repoFiles: Record<string, string[]> = {}) {
  const data = new PluginData(mkdtempSync(join(tmpdir(), 'mjolnir-broker-')), { encrypt: (v) => v, decrypt: (v) => v })
  const opened: string[] = []
  const fetched: string[] = []
  const resolved: string[] = []
  const repo = mkdtempSync(join(tmpdir(), 'mjolnir-broker-repo-'))
  const broker = createBroker({
    data,
    permissions: (id) => (active[id] ? { network: active[id], repoFiles: repoFiles[id] } : null),
    fetch: (id) => async (url) => {
      fetched.push(`${id} ${url}`)
      return new Response('ok')
    },
    worktreeRoot: async ({ repoId }) => {
      resolved.push(repoId)
      return repo
    },
    openExternal: (url) => void opened.push(url),
  })
  return { broker, opened, fetched, resolved }
}

describe('createBroker', () => {
  it('runs the method and replies with the same id', async () => {
    const { broker } = setup()
    expect(await broker('hello', { id: 1, method: 'storage.set', params: ['k', { a: 1 }] })).toEqual({ id: 1, result: null })
    expect(await broker('hello', { id: 2, method: 'storage.get', params: ['k'] })).toEqual({ id: 2, result: { a: 1 } })
  })

  it('scopes storage by the plugin that owns the port, not by anything in the message', async () => {
    const { broker } = setup({ hello: [], other: [] })
    await broker('hello', { id: 1, method: 'storage.set', params: ['k', 'mine'] })
    expect(await broker('other', { id: 2, method: 'storage.get', params: ['k'] })).toEqual({ id: 2, result: null })
  })

  it('refuses calls from plugins that are not active', async () => {
    const { broker } = setup()
    expect(await broker('disabled', { id: 1, method: 'storage.keys', params: [] })).toMatchObject({ id: 1, error: { code: 'unavailable' } })
  })

  it('validates params against the method schema', async () => {
    const { broker } = setup()
    expect(await broker('hello', { id: 1, method: 'storage.get', params: [42] })).toMatchObject({ error: { code: 'invalidRequest' } })
    expect(await broker('hello', { id: 1, method: 'storage.set', params: ['k', () => 1] })).toMatchObject({ error: { code: 'invalidRequest' } })
    expect(await broker('hello', { id: 1, method: 'http.request', params: [{ method: 'GET', url: 'file:///etc/passwd' }] })).toMatchObject({
      error: { code: 'invalidRequest' },
    })
  })

  it('rejects unknown methods, including ones inherited from Object', async () => {
    const { broker } = setup()
    for (const method of ['fs.read', 'toString', '__proto__', 'constructor']) {
      expect(await broker('hello', { id: 1, method, params: [] })).toMatchObject({ error: { code: 'unknownMethod' } })
    }
  })

  it('ignores messages that are not calls instead of answering them', async () => {
    const { broker } = setup()
    expect(await broker('hello', 'hi')).toBeNull()
    expect(await broker('hello', { method: 'storage.keys' })).toBeNull()
  })

  it('uses the network permissions and the session of the calling plugin', async () => {
    const { broker, fetched } = setup()
    expect(await broker('hello', { id: 1, method: 'http.request', params: [{ method: 'GET', url: 'https://api.io/x' }] })).toMatchObject({
      result: { status: 200 },
    })
    expect(await broker('hello', { id: 2, method: 'http.request', params: [{ method: 'GET', url: 'https://evil.io/' }] })).toMatchObject({
      error: { code: 'permissionDenied' },
    })
    expect(fetched).toEqual(['hello https://api.io/x'])
  })

  it('opens only web links externally', async () => {
    const { broker, opened } = setup()
    await broker('hello', { id: 1, method: 'ui.openExternal', params: ['https://dev.azure.com'] })
    expect(await broker('hello', { id: 2, method: 'ui.openExternal', params: ['file:///C:/x.exe'] })).toMatchObject({ error: { code: 'invalidRequest' } })
    expect(opened).toEqual(['https://dev.azure.com'])
  })

  it('reads and writes repo files only inside the granted globs', async () => {
    const { broker } = setup({ http: [] }, { http: ['.mjolnir/http/**'] })
    const session = { repoId: 'r1', worktree: '/repo' }
    expect(await broker('http', { id: 1, method: 'repoFiles.write', params: [session, '.mjolnir/http/a.json', '{}'] })).toEqual({ id: 1, result: null })
    expect(await broker('http', { id: 2, method: 'repoFiles.read', params: [session, '.mjolnir/http/a.json'] })).toEqual({ id: 2, result: '{}' })
    expect(await broker('http', { id: 3, method: 'repoFiles.write', params: [session, 'package.json', '{}'] })).toMatchObject({ error: { code: 'permissionDenied' } })
  })

  it('does not resolve sessions for plugins without repo access', async () => {
    const { broker, resolved } = setup({ hello: [] })
    const reply = await broker('hello', { id: 1, method: 'repoFiles.list', params: [{ repoId: 'r1', worktree: '/repo' }, ''] })
    expect(reply).toMatchObject({ error: { code: 'permissionDenied' } })
    expect(resolved).toEqual([])
  })
})
