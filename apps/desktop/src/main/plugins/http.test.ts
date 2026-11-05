import { describe, expect, it } from 'vitest'
import { HTTP_LIMITS, performRequest, type Fetch } from './http'

function scripted(responses: Record<string, () => Response>) {
  const calls: { url: string; method?: string; body?: unknown }[] = []
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body })
    const respond = responses[url]
    if (!respond) throw new Error(`unexpected ${url}`)
    return respond()
  }
  return { fetch, calls }
}

const redirect = (location: string, status = 302) => () => new Response(null, { status, headers: { location } })

describe('performRequest', () => {
  it('returns status, headers and a text body for text responses', async () => {
    const { fetch } = scripted({ 'https://api.io/zen': () => new Response('Keep it simple', { status: 200, headers: { 'content-type': 'text/plain' } }) })
    const response = await performRequest(fetch, ['https://api.io'], { method: 'get', url: 'https://api.io/zen' })
    expect(response).toMatchObject({ status: 200, body: { encoding: 'utf8', data: 'Keep it simple' }, redirects: [] })
    expect(response.headers).toContainEqual(['content-type', 'text/plain'])
  })

  it('returns binary bodies as base64', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff])
    const { fetch } = scripted({ 'https://api.io/a.jpg': () => new Response(bytes, { headers: { 'content-type': 'image/jpeg' } }) })
    const response = await performRequest(fetch, ['https://api.io'], { method: 'GET', url: 'https://api.io/a.jpg' })
    expect(response.body).toEqual({ encoding: 'base64', data: Buffer.from(bytes).toString('base64') })
  })

  it('refuses origins the plugin was not granted, before sending anything', async () => {
    const { fetch, calls } = scripted({})
    await expect(performRequest(fetch, ['https://api.io'], { method: 'GET', url: 'https://evil.io/' })).rejects.toMatchObject({ code: 'permissionDenied' })
    expect(calls).toEqual([])
  })

  it('checks the permission again on every redirect, so a granted host cannot bounce the request elsewhere', async () => {
    const { fetch, calls } = scripted({ 'https://api.io/go': redirect('https://evil.io/steal') })
    await expect(performRequest(fetch, ['https://api.io'], { method: 'GET', url: 'https://api.io/go' })).rejects.toMatchObject({ code: 'permissionDenied' })
    expect(calls.map((call) => call.url)).toEqual(['https://api.io/go'])
  })

  it('follows redirects like a browser: relative locations, and POST turning into GET on 303', async () => {
    const { fetch, calls } = scripted({
      'https://api.io/form': redirect('/done', 303),
      'https://api.io/done': () => new Response('ok'),
    })
    const response = await performRequest(fetch, ['https://api.io'], { method: 'POST', url: 'https://api.io/form', body: { encoding: 'utf8', data: 'a=1' } })
    expect(response).toMatchObject({ url: 'https://api.io/done', redirects: ['https://api.io/form'] })
    expect(calls[1]).toMatchObject({ method: 'GET', body: undefined })
  })

  it('returns the redirect itself when the plugin asks not to follow it', async () => {
    const { fetch } = scripted({ 'https://api.io/go': redirect('https://api.io/there') })
    const response = await performRequest(fetch, ['https://api.io'], { method: 'GET', url: 'https://api.io/go', followRedirects: false })
    expect(response.status).toBe(302)
  })

  it('stops reading a response that goes over the size limit', async () => {
    const huge = new Uint8Array(HTTP_LIMITS.responseBytes + 1)
    const { fetch } = scripted({ 'https://api.io/big': () => new Response(huge) })
    await expect(performRequest(fetch, ['*'], { method: 'GET', url: 'https://api.io/big' })).rejects.toMatchObject({ code: 'quotaExceeded' })
  })

  it('reports network errors as requestFailed with the reason', async () => {
    const fetch: Fetch = async () => {
      throw new Error('getaddrinfo ENOTFOUND api.io')
    }
    await expect(performRequest(fetch, ['*'], { method: 'GET', url: 'https://api.io/' })).rejects.toMatchObject({
      code: 'requestFailed',
      message: 'getaddrinfo ENOTFOUND api.io',
    })
  })
})
