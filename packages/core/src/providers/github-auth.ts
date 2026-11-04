export const GITHUB_SCOPES = ['repo', 'read:org']

export interface DeviceCode {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export type DeviceFlowResult = { status: 'authorized'; token: string } | { status: 'denied' } | { status: 'expired' }

interface Options {
  clientId: string
  fetch?: typeof globalThis.fetch
  baseUrl?: string
}

async function post<T>({ fetch = globalThis.fetch, baseUrl = 'https://github.com' }: Options, path: string, body: Record<string, string>): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`GitHub device flow failed with ${response.status}`)
  return (await response.json()) as T
}

export async function requestDeviceCode(options: Options): Promise<DeviceCode> {
  const raw = await post<{ device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number }>(
    options,
    '/login/device/code',
    { client_id: options.clientId, scope: GITHUB_SCOPES.join(' ') },
  )
  return {
    deviceCode: raw.device_code,
    userCode: raw.user_code,
    verificationUri: raw.verification_uri,
    expiresIn: raw.expires_in,
    interval: raw.interval,
  }
}

export async function pollDeviceToken(
  options: Options & { sleep?: (ms: number) => Promise<void>; signal?: AbortSignal },
  code: DeviceCode,
): Promise<DeviceFlowResult> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const deadline = Date.now() + code.expiresIn * 1000
  let interval = code.interval

  while (Date.now() < deadline && !options.signal?.aborted) {
    await sleep(interval * 1000)
    const result = await post<{ access_token?: string; error?: string; interval?: number }>(options, '/login/oauth/access_token', {
      client_id: options.clientId,
      device_code: code.deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    })
    if (result.access_token) return { status: 'authorized', token: result.access_token }
    if (result.error === 'access_denied') return { status: 'denied' }
    if (result.error === 'expired_token') return { status: 'expired' }
    if (result.error === 'slow_down') interval = result.interval ?? interval + 5
  }
  return { status: 'expired' }
}
