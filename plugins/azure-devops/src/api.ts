import { HostError, type HttpRequest, type HttpResponse, type ProviderCredential } from '@mjolnir/plugin-sdk'

export const API_VERSION = '7.1'

export type Request = (request: HttpRequest) => Promise<HttpResponse>

export type Call = <T>(credential: ProviderCredential, method: string, url: string, body?: unknown, contentType?: string) => Promise<T>

export const segment = encodeURIComponent

export function authorization({ token, source }: ProviderCredential): string {
  return source === 'cli' ? `Bearer ${token}` : `Basic ${btoa(`:${token}`)}`
}

export function apiUrl(base: string, query: Record<string, string> = {}): string {
  return `${base}?${new URLSearchParams({ ...query, 'api-version': API_VERSION })}`
}

export function createCall(request: Request): Call {
  return async <T>(credential: ProviderCredential, method: string, url: string, body?: unknown, contentType = 'application/json'): Promise<T> => {
    const response = await request({
      method,
      url,
      headers: { Authorization: authorization(credential), Accept: 'application/json', ...(body !== undefined && { 'Content-Type': contentType }) },
      ...(body !== undefined && { body: { encoding: 'utf8', data: JSON.stringify(body) } }),
      followRedirects: false,
    })
    if (response.status === 401 || response.status === 203 || (response.status >= 300 && response.status < 400)) {
      throw new HostError('unauthorized', `Azure DevOps rejected the credentials (${response.status})`)
    }
    let parsed: unknown = null
    try {
      parsed = response.body.encoding === 'utf8' && response.body.data ? JSON.parse(response.body.data) : null
    } catch {}
    if (response.status >= 400) {
      const message = (parsed as { message?: string } | null)?.message ?? response.statusText
      throw new HostError('requestFailed', `${response.status}: ${message}`)
    }
    return parsed as T
  }
}
