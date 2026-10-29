import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOpenSkyClient, credentialsFromEnv } from './opensky.ts'

const CREDENTIALS = { clientId: 'test-client', clientSecret: 'test-secret' }
const PATH = '/states/all?lamin=37.1&lomin=-122.9&lamax=38.1&lomax=-121.9'

type Handler = (init: RequestInit | undefined, url: string) => Response

const isTokenRequest = (url: string) => url.includes('/protocol/openid-connect/token')
const tokenResponse = (accessToken: string) =>
  new Response(JSON.stringify({ access_token: accessToken, expires_in: 1800 }), { status: 200 })
const authHeader = (init: RequestInit | undefined) =>
  (init?.headers as Record<string, string> | undefined)?.Authorization

// Fake OpenSky: routes token requests and API requests to separate handlers
function mockOpenSky({ token, api }: { token?: Handler; api: Handler }) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
    isTokenRequest(url) ? token!(init, url) : api(init, url),
  )
  vi.stubGlobal('fetch', fetchMock)
  return {
    tokenCalls: () => fetchMock.mock.calls.filter(([url]) => isTokenRequest(url)),
    apiCalls: () => fetchMock.mock.calls.filter(([url]) => !isTokenRequest(url)),
  }
}

describe('credentialsFromEnv', () => {
  it('needs both the client id and secret', () => {
    expect(credentialsFromEnv({})).toBeNull()
    expect(credentialsFromEnv({ OPENSKY_CLIENT_ID: 'id' })).toBeNull()
    expect(credentialsFromEnv({ OPENSKY_CLIENT_ID: 'id', OPENSKY_CLIENT_SECRET: 'secret' })).toEqual({
      clientId: 'id',
      clientSecret: 'secret',
    })
  })
})

describe('OpenSky client', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('makes anonymous requests when no credentials are configured', async () => {
    const opensky = mockOpenSky({ api: () => new Response('{}', { status: 200 }) })

    const client = createOpenSkyClient(null)
    const res = await client.get(PATH)

    expect(res.status).toBe(200)
    expect(opensky.tokenCalls()).toHaveLength(0)
    expect(authHeader(opensky.apiCalls()[0][1])).toBeUndefined()
  })

  it('attaches a bearer token and reuses it across requests', async () => {
    const opensky = mockOpenSky({
      token: () => tokenResponse('token-1'),
      api: () => new Response('{}', { status: 200 }),
    })
    const client = createOpenSkyClient(CREDENTIALS)

    await client.get(PATH)
    await client.get(PATH)

    expect(opensky.tokenCalls()).toHaveLength(1)
    const body = new URLSearchParams(String(opensky.tokenCalls()[0][1]?.body))
    expect(Object.fromEntries(body)).toEqual({
      grant_type: 'client_credentials',
      client_id: 'test-client',
      client_secret: 'test-secret',
    })
    expect(opensky.apiCalls().map(([, init]) => authHeader(init))).toEqual(['Bearer token-1', 'Bearer token-1'])
  })

  it('shares one token request between concurrent requests', async () => {
    const opensky = mockOpenSky({
      token: () => tokenResponse('token-1'),
      api: () => new Response('{}', { status: 200 }),
    })
    const client = createOpenSkyClient(CREDENTIALS)

    await Promise.all([client.get(PATH), client.get(PATH), client.get(PATH)])

    expect(opensky.tokenCalls()).toHaveLength(1)
    expect(opensky.apiCalls()).toHaveLength(3)
  })

  it('gets a new token and retries once when the API rejects an expired one', async () => {
    const tokens = ['token-1', 'token-2']
    const opensky = mockOpenSky({
      token: () => tokenResponse(tokens.shift()!),
      api: (init) => new Response('{}', { status: authHeader(init) === 'Bearer token-1' ? 401 : 200 }),
    })

    const res = await createOpenSkyClient(CREDENTIALS).get(PATH)

    expect(res.status).toBe(200)
    expect(opensky.tokenCalls()).toHaveLength(2)
    expect(opensky.apiCalls().map(([, init]) => authHeader(init))).toEqual(['Bearer token-1', 'Bearer token-2'])
  })

  it('falls back to anonymous when the credentials are rejected, without retrying them on every request', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const opensky = mockOpenSky({
      token: () => new Response('', { status: 401 }),
      api: () => new Response('{}', { status: 200 }),
    })
    const client = createOpenSkyClient(CREDENTIALS)

    const first = await client.get(PATH)
    expect(first.status).toBe(200)
    expect(authHeader(opensky.apiCalls()[0][1])).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatch(/token request failed with 401; using anonymous access/)

    // Within the next 5 minutes: anonymous, with no new token attempts or warnings
    vi.advanceTimersByTime(4 * 60_000)
    await client.get(PATH)
    expect(opensky.tokenCalls()).toHaveLength(1)
    expect(warn).toHaveBeenCalledTimes(1)

    // After 5 minutes the credentials are tried again
    vi.advanceTimersByTime(60_000)
    await client.get(PATH)
    expect(opensky.tokenCalls()).toHaveLength(2)
  })

  it('falls back to anonymous when the API rejects even a fresh token', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const opensky = mockOpenSky({
      token: () => tokenResponse('revoked-token'),
      api: (init) => new Response('{}', { status: authHeader(init) ? 401 : 200 }),
    })

    const res = await createOpenSkyClient(CREDENTIALS).get(PATH)

    expect(res.status).toBe(200)
    // First attempt, retry with a fresh token, then anonymous
    expect(opensky.apiCalls().map(([, init]) => authHeader(init))).toEqual([
      'Bearer revoked-token',
      'Bearer revoked-token',
      undefined,
    ])
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/API rejected the account token/))
  })
})
