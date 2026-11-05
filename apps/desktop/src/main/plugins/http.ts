import { allowsUrl, type HttpBody, type HttpRequest, type HttpResponse } from '@mjolnir/plugin-sdk'
import { HostFailure } from './failure'

export type Fetch = (url: string, init: RequestInit) => Promise<Response>

export const HTTP_LIMITS = {
  requestBytes: 10_000_000,
  responseBytes: 20_000_000,
  defaultTimeoutMs: 30_000,
  maxTimeoutMs: 300_000,
  redirects: 10,
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const TEXT_TYPES = /^(text\/|application\/([\w.+-]+\+)?(json|xml|javascript|x-www-form-urlencoded|graphql))/i

function requestBody(body: HttpBody | undefined): Uint8Array<ArrayBuffer> | undefined {
  if (!body) return undefined
  const buffer = Buffer.from(body.data, body.encoding)
  if (buffer.byteLength > HTTP_LIMITS.requestBytes) throw new HostFailure('quotaExceeded', `request body larger than ${HTTP_LIMITS.requestBytes} bytes`)
  return Uint8Array.from(buffer)
}

async function readBody(response: Response): Promise<Buffer> {
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = response.body?.getReader()
  if (!reader) return Buffer.alloc(0)
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > HTTP_LIMITS.responseBytes) {
      await reader.cancel()
      throw new HostFailure('quotaExceeded', `response larger than ${HTTP_LIMITS.responseBytes} bytes`)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

const utf8 = new TextDecoder('utf-8', { fatal: true })

function decodeText(buffer: Buffer): string | null {
  try {
    return utf8.decode(buffer)
  } catch {
    return null
  }
}

function encodeBody(buffer: Buffer, contentType: string | null): HttpBody {
  const text = !contentType || TEXT_TYPES.test(contentType) ? decodeText(buffer) : null
  return text === null ? { encoding: 'base64', data: buffer.toString('base64') } : { encoding: 'utf8', data: text }
}

function changesToGet(status: number, method: string): boolean {
  return status === 303 ? method !== 'HEAD' : (status === 301 || status === 302) && method === 'POST'
}

export async function performRequest(fetch: Fetch, allowed: readonly string[] | undefined, request: HttpRequest, now = () => performance.now()): Promise<HttpResponse> {
  const started = now()
  const timeoutMs = Math.min(request.timeoutMs ?? HTTP_LIMITS.defaultTimeoutMs, HTTP_LIMITS.maxTimeoutMs)
  const signal = AbortSignal.timeout(timeoutMs)
  const redirects: string[] = []
  let url = request.url
  let method = request.method.toUpperCase()
  let body = requestBody(request.body)

  for (;;) {
    if (!allowsUrl(allowed, url)) throw new HostFailure('permissionDenied', `network access to ${new URL(url).origin} was not granted`)
    let response: Response
    try {
      response = await fetch(url, { method, headers: request.headers, body, redirect: 'manual', signal })
    } catch (error) {
      if (signal.aborted) throw new HostFailure('timeout', `no response after ${timeoutMs} ms`)
      throw new HostFailure('requestFailed', error instanceof Error ? error.message : String(error))
    }

    const location = response.headers.get('location')
    if (request.followRedirects !== false && REDIRECT_STATUSES.has(response.status) && location) {
      if (redirects.length >= HTTP_LIMITS.redirects) throw new HostFailure('requestFailed', 'too many redirects')
      await response.body?.cancel()
      redirects.push(url)
      url = new URL(location, url).href
      if (changesToGet(response.status, method)) {
        method = 'GET'
        body = undefined
      }
      continue
    }

    const content = await readBody(response).catch((error: unknown) => {
      if (signal.aborted) throw new HostFailure('timeout', `no response after ${timeoutMs} ms`)
      throw error
    })
    return {
      url,
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
      body: encodeBody(content, response.headers.get('content-type')),
      redirects,
      durationMs: Math.round(now() - started),
    }
  }
}
