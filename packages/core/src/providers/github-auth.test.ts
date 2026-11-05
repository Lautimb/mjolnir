import { describe, expect, it } from 'vitest'
import { pollDeviceToken, requestDeviceCode, type DeviceCode } from './github-auth'

function scripted(responses: unknown[]) {
  const bodies: unknown[] = []
  const fetch = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)))
    return new Response(JSON.stringify(responses.shift()), { status: 200 })
  }) as typeof globalThis.fetch
  return { fetch, bodies }
}

const code: DeviceCode = { deviceCode: 'dc', userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device', expiresIn: 900, interval: 5 }

describe('GitHub device flow', () => {
  it('requests a device code for the client with the scopes Mjolnir needs', async () => {
    const { fetch, bodies } = scripted([
      { device_code: 'dc', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 },
    ])
    expect(await requestDeviceCode({ clientId: 'client', fetch })).toEqual(code)
    expect(bodies[0]).toEqual({ client_id: 'client', scope: 'repo read:org' })
  })

  it('keeps polling while authorization is pending, backs off on slow_down and returns the token', async () => {
    const waits: number[] = []
    const { fetch } = scripted([{ error: 'authorization_pending' }, { error: 'slow_down', interval: 10 }, { access_token: 'gho_token' }])
    const result = await pollDeviceToken({ clientId: 'client', fetch, sleep: async (ms) => void waits.push(ms) }, code)
    expect(result).toEqual({ status: 'authorized', token: 'gho_token' })
    expect(waits).toEqual([5000, 5000, 10000])
  })

  it('stops when the user denies access or the code expires', async () => {
    const sleep = async () => {}
    expect(await pollDeviceToken({ clientId: 'c', fetch: scripted([{ error: 'access_denied' }]).fetch, sleep }, code)).toEqual({ status: 'denied' })
    expect(await pollDeviceToken({ clientId: 'c', fetch: scripted([{ error: 'expired_token' }]).fetch, sleep }, code)).toEqual({ status: 'expired' })
  })
})
