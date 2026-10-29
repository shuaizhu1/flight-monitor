// Vercel function serving /opensky/* in production, the deployed counterpart
// of the Vite dev plugin in server/openskyProxy.ts. vercel.json rewrites
// /opensky/<path>?<query> to /api/opensky?path=<path>&<query>.
//
// Uses the OpenSky account from the Vercel project's OPENSKY_CLIENT_ID /
// OPENSKY_CLIENT_SECRET environment variables, and falls back to anonymous
// access when they're missing or rejected. If OpenSky can't be reached at
// all, the app falls back to its demo recording.
import { createOpenSkyClient, credentialsFromEnv } from '../server/opensky.js'

// Only the endpoint the app uses, so the deployment can't be used as an open
// proxy that spends the account's credits
const ALLOWED_PATHS = new Set(['states/all'])
const FORWARDED_HEADERS = ['content-type', 'x-rate-limit-remaining', 'x-rate-limit-retry-after-seconds']
// Every visitor shares one CDN-cached OpenSky response for this long, so the
// credit cost doesn't grow with the number of viewers. Sized to each daily
// budget: ~2,900 requests within an account's 4,000, ~360 within the
// anonymous 400
const ACCOUNT_CACHE_SECONDS = 30
const ANONYMOUS_CACHE_SECONDS = 240
// A 429 is cached until OpenSky's retry-after time, up to this long
const MAX_RATE_LIMIT_CACHE_SECONDS = 300

// Created once per function instance, so warm instances reuse the OAuth token
const client = createOpenSkyClient(credentialsFromEnv(process.env))

function cacheControl(upstream: Response) {
  if (upstream.ok) {
    const seconds = client.usingAccount() ? ACCOUNT_CACHE_SECONDS : ANONYMOUS_CACHE_SECONDS
    return `public, s-maxage=${seconds}, stale-while-revalidate=${seconds}`
  }
  if (upstream.status === 429) {
    const retryAfter = Number(upstream.headers.get('x-rate-limit-retry-after-seconds')) || 60
    return `public, s-maxage=${Math.min(retryAfter, MAX_RATE_LIMIT_CACHE_SECONDS)}`
  }
  return 'no-store'
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const path = url.searchParams.get('path') ?? ''
  if (!ALLOWED_PATHS.has(path)) return new Response('Not found', { status: 404 })
  url.searchParams.delete('path')

  try {
    const upstream = await client.get(`/${path}?${url.searchParams}`, request.signal)
    const headers = new Headers({ 'cache-control': cacheControl(upstream) })
    for (const name of FORWARDED_HEADERS) {
      const value = upstream.headers.get(name)
      if (value) headers.set(name, value)
    }
    return new Response(upstream.body, { status: upstream.status, headers })
  } catch (err) {
    return new Response(err instanceof Error ? err.message : 'OpenSky request failed', {
      status: 502,
      headers: { 'cache-control': 'no-store' },
    })
  }
}
