import { createHash, generateKeyPairSync } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { signEntry } from '@mjolnir/plugin-sdk/catalog'
import { appErrorCode } from '../../shared/errors'
import { CATALOG_LIMITS, PluginCatalog } from './catalog'

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const publicKeys = [publicKey.export({ type: 'spki', format: 'der' }).toString('base64')]
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

const zip = Buffer.from('package bytes')
const sha256 = createHash('sha256').update(zip).digest('hex')
const url = 'https://github.com/acme/plugins/releases/download/v1/hello-1.0.0.mjp'

function entry(overrides: Record<string, unknown> = {}, manifest: Record<string, unknown> = {}) {
  const base = { id: 'hello', version: '1.0.0', sha256, ...overrides }
  return {
    ...base,
    url,
    size: zip.length,
    manifest: { id: base.id, version: base.version, engines: { mjolnir: '>=0.1.0', api: 1 }, name: 'Hello', ...manifest },
    strings: {},
    signature: signEntry(base as { id: string; version: string; sha256: string }, privateKeyPem),
  }
}

interface Route {
  status?: number
  body?: unknown
  headers?: Record<string, string>
}

function setup(routes: Record<string, Route | (() => Route)>, now = { value: 0 }, cacheFile = join(mkdtempSync(join(tmpdir(), 'mjolnir-catalog-')), 'catalog.json')) {
  const requests: { url: string; headers: Record<string, string> }[] = []
  const fetch = async (requested: string, init?: RequestInit) => {
    requests.push({ url: requested, headers: (init?.headers ?? {}) as Record<string, string> })
    const found = routes[requested]
    const route = typeof found === 'function' ? found() : found
    if (!route) throw new Error('offline')
    const body = route.body === undefined ? null : Buffer.isBuffer(route.body) ? new Uint8Array(route.body) : JSON.stringify(route.body)
    return new Response(route.status === 304 ? null : body, { status: route.status ?? 200, headers: route.headers })
  }
  const catalog = new PluginCatalog({ cacheFile, appVersion: '0.1.0', apiVersions: [1], fetch, url: 'https://index', publicKeys, now: () => now.value })
  return { catalog, requests, now, cacheFile }
}

describe('PluginCatalog', () => {
  it('lists the plugins and marks as verified only those signed with a trusted key', async () => {
    const unsigned = { ...entry({ id: 'other' }), signature: undefined }
    const forged = { ...entry({ id: 'forged' }), signature: entry({ id: 'forged', version: '9.9.9' }).signature }
    const { catalog } = setup({ 'https://index': { body: { schema: 1, plugins: [entry(), unsigned, forged] } } })
    const state = await catalog.state(false)
    expect(state.failed).toBe(false)
    expect(state.plugins.map(({ id, verified }) => [id, verified])).toEqual([
      ['hello', true],
      ['other', false],
      ['forged', false],
    ])
  })

  it('skips broken entries instead of hiding the whole catalog', async () => {
    const plugins = [
      entry(),
      { ...entry({ id: 'evil' }), url: 'https://evil.io/x.mjp' },
      entry({ id: 'liar' }, { id: 'someone-else' }),
      { ...entry({ id: 'big' }), size: 10 ** 9 },
      entry(),
    ]
    const { catalog } = setup({ 'https://index': { body: { schema: 1, plugins } } })
    expect((await catalog.state(false)).plugins.map((plugin) => plugin.id)).toEqual(['hello'])
  })

  it('reports plugins this version of Mjolnir cannot run', async () => {
    const { catalog } = setup({ 'https://index': { body: { schema: 1, plugins: [entry({}, { engines: { mjolnir: '>=2.0.0', api: 1 } })] } } })
    expect((await catalog.state(false)).plugins[0]!.status).toEqual({ kind: 'incompatible', reason: 'app', required: '>=2.0.0' })
  })

  it('reuses the index for an hour and revalidates it with its etag', async () => {
    let served = 0
    const routes = {
      'https://index': () => (served++ ? { status: 304 } : { body: { schema: 1, plugins: [entry()] }, headers: { etag: '"v1"' } }),
    }
    const { catalog, requests, now } = setup(routes)
    await catalog.state(false)
    await catalog.state(false)
    expect(requests).toHaveLength(1)
    now.value = CATALOG_LIMITS.maxAgeMs + 1
    const state = await catalog.state(false)
    expect(requests[1]!.headers['if-none-match']).toBe('"v1"')
    expect(state.plugins).toHaveLength(1)
  })

  it('keeps showing the last index it got when the network fails', async () => {
    const first = setup({ 'https://index': { body: { schema: 1, plugins: [entry()] } } })
    await first.catalog.state(false)
    const offline = setup({}, { value: 0 }, first.cacheFile)
    const state = await offline.catalog.state(true)
    expect(state).toMatchObject({ failed: true, fetchedAt: 0 })
    expect(state.plugins).toHaveLength(1)
  })

  it('downloads a package only if it matches the sha256 of the index', async () => {
    const good = setup({ 'https://index': { body: { schema: 1, plugins: [entry()] } }, [url]: { body: zip } })
    await good.catalog.state(false)
    expect((await good.catalog.download('hello')).zip.equals(zip)).toBe(true)

    const tampered = setup({ 'https://index': { body: { schema: 1, plugins: [entry()] } }, [url]: { body: Buffer.from('package BYTES') } })
    await tampered.catalog.state(false)
    expect(await tampered.catalog.download('hello').then(() => null, appErrorCode)).toBe('pluginDownloadFailed')
  })

  it('stops downloading once the package passes the size the index declared', async () => {
    const { catalog } = setup({ 'https://index': { body: { schema: 1, plugins: [entry()] } }, [url]: { body: Buffer.concat([zip, zip]) } })
    await catalog.state(false)
    expect(await catalog.download('hello').then(() => null, appErrorCode)).toBe('pluginDownloadFailed')
  })
})
