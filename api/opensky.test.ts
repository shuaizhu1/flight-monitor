import { afterEach, describe, expect, it, vi } from 'vitest'

type Handler = (request: Request) => Promise<Response>

// The function reads credentials when it's first imported, so load a fresh
// copy with each test's environment (empty values = no credentials)
async function loadFunction(env: { OPENSKY_CLIENT_ID?: string; OPENSKY_CLIENT_SECRET?: string } = {}) {
  vi.resetModules()
  vi.stubEnv('OPENSKY_CLIENT_ID', env.OPENSKY_CLIENT_ID ?? '')
  vi.stubEnv('OPENSKY_CLIENT_SECRET', env.OPENSKY_CLIENT_SECRET ?? '')
  const { GET } = await import('./opensky.ts')
  return GET as Handler
}

const PROJECT_CREDENTIALS = { OPENSKY_CLIENT_ID: 'project-client', OPENSKY_CLIENT_SECRET: 'project-secret' }

// How vercel.json's rewrite delivers /opensky/states/all?lamin=…
const rewritten = (path: string) =>
  new Request(`https://demo.vercel.app/api/opensky?path=${encodeURIComponent(path)}&lamin=37.1&lomin=-122.9`)

const isTokenRequest = (url: string) => url.includes('/protocol/openid-connect/token')
const authHeader = (init: RequestInit | undefined) => new Headers(init?.headers).get('authorization')

// Fake OpenSky: `token` answers OAuth token requests, `api` answers the rest
function stubOpenSky({ api, token }: { api: () => Response; token?: () => Response }) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => (isTokenRequest(url) ? token!() : api()))
  vi.stubGlobal('fetch', fetchMock)
  return {
    tokenCalls: () => fetchMock.mock.calls.filter(([url]) => isTokenRequest(url)),
    apiCalls: () => fetchMock.mock.calls.filter(([url]) => !isTokenRequest(url)),
  }
}

describe('/api/opensky', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('forwards states/all to OpenSky and lets the CDN share the response', async () => {
    const GET = await loadFunction()
    const opensky = stubOpenSky({
      api: () =>
        new Response('{"states":[]}', {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-rate-limit-remaining': '390' },
        }),
    })

    const res = await GET(rewritten('states/all'))

    // The rewrite's path parameter is dropped; the app's query is kept
    expect(opensky.apiCalls()[0][0]).toBe('https://opensky-network.org/api/states/all?lamin=37.1&lomin=-122.9')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"states":[]}')
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(res.headers.get('x-rate-limit-remaining')).toBe('390')
  })

  it('uses the project’s OpenSky account, cached to fit its 4,000 daily credits', async () => {
    const GET = await loadFunction(PROJECT_CREDENTIALS)
    const opensky = stubOpenSky({
      token: () => new Response(JSON.stringify({ access_token: 'project-token', expires_in: 1800 })),
      api: () => new Response('{}', { status: 200 }),
    })

    const res = await GET(rewritten('states/all'))

    expect(opensky.tokenCalls()).toHaveLength(1)
    expect(authHeader(opensky.apiCalls()[0][1])).toBe('Bearer project-token')
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=30, stale-while-revalidate=30')
  })

  it('falls back to anonymous when the project’s credentials are rejected, cached to fit 400 daily credits', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const GET = await loadFunction(PROJECT_CREDENTIALS)
    const opensky = stubOpenSky({
      token: () => new Response('', { status: 401 }),
      api: () => new Response('{}', { status: 200 }),
    })

    const res = await GET(rewritten('states/all'))

    expect(res.status).toBe(200)
    expect(authHeader(opensky.apiCalls()[0][1])).toBeNull()
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=240, stale-while-revalidate=240')
  })

  it('is anonymous without credentials, cached to fit 400 daily credits', async () => {
    const GET = await loadFunction()
    const opensky = stubOpenSky({ api: () => new Response('{}', { status: 200 }) })

    const res = await GET(rewritten('states/all'))

    expect(opensky.tokenCalls()).toHaveLength(0)
    expect(authHeader(opensky.apiCalls()[0][1])).toBeNull()
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=240, stale-while-revalidate=240')
  })

  it.each(['flights/all', 'tracks/all', '../states/all', ''])('refuses other paths (%j)', async (path) => {
    const GET = await loadFunction()
    const opensky = stubOpenSky({ api: () => new Response('{}') })

    const res = await GET(rewritten(path))

    expect(res.status).toBe(404)
    expect(opensky.apiCalls()).toHaveLength(0)
  })

  it('caches a 429 until OpenSky’s retry-after time, at most 5 minutes', async () => {
    const GET = await loadFunction()

    stubOpenSky({
      api: () => new Response('', { status: 429, headers: { 'x-rate-limit-retry-after-seconds': '120' } }),
    })
    const short = await GET(rewritten('states/all'))
    expect(short.status).toBe(429)
    expect(short.headers.get('x-rate-limit-retry-after-seconds')).toBe('120')
    expect(short.headers.get('cache-control')).toBe('public, s-maxage=120')

    stubOpenSky({
      api: () => new Response('', { status: 429, headers: { 'x-rate-limit-retry-after-seconds': '7200' } }),
    })
    const long = await GET(rewritten('states/all'))
    expect(long.headers.get('cache-control')).toBe('public, s-maxage=300')
  })

  it('never caches other failures', async () => {
    const GET = await loadFunction()
    stubOpenSky({ api: () => new Response('', { status: 503 }) })

    const res = await GET(rewritten('states/all'))

    expect(res.status).toBe(503)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('returns 502 when OpenSky is unreachable', async () => {
    const GET = await loadFunction()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')))

    const res = await GET(rewritten('states/all'))

    expect(res.status).toBe(502)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
