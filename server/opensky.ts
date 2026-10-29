// OpenSky API client with OAuth2 client-credentials auth, shared by the Vite
// dev server (server/openskyProxy.ts) and scripts/record-opensky.ts.
// Node only: the client secret must never be bundled into the browser.
// https://openskynetwork.github.io/opensky-api/rest.html

const TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token'
export const OPENSKY_API = 'https://opensky-network.org/api'
// Refresh a little before expiry so a request never goes out with a stale token
const EXPIRY_MARGIN_MS = 30_000
// When the credentials don't work, stay anonymous this long before trying them
// again, rather than hitting the token endpoint on every request
const AUTH_RETRY_MS = 5 * 60_000

export type OpenSkyCredentials = { clientId: string; clientSecret: string }

// Reads OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET (an API client created on
// https://opensky-network.org/my-opensky/account); null means anonymous access
export function credentialsFromEnv(env: Record<string, string | undefined>): OpenSkyCredentials | null {
  const clientId = env.OPENSKY_CLIENT_ID
  const clientSecret = env.OPENSKY_CLIENT_SECRET
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

export function createOpenSkyClient(credentials: OpenSkyCredentials | null) {
  let token: { value: string; expiresAt: number } | null = null
  let pendingToken: Promise<string> | null = null

  async function requestToken(creds: OpenSkyCredentials) {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      }),
    })
    if (!res.ok) throw new Error(`token request failed with ${res.status}`)
    const data = (await res.json()) as { access_token: string; expires_in?: number }
    // Tokens last 30 minutes when expires_in is missing
    token = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 1800) * 1000 - EXPIRY_MARGIN_MS,
    }
    return token.value
  }

  function getToken(creds: OpenSkyCredentials) {
    if (token && Date.now() < token.expiresAt) return Promise.resolve(token.value)
    // Concurrent requests share a single token fetch
    pendingToken ??= requestToken(creds).finally(() => {
      pendingToken = null
    })
    return pendingToken
  }

  let authRetryAt = 0

  function fallBackToAnonymous(reason: string) {
    token = null
    authRetryAt = Date.now() + AUTH_RETRY_MS
    console.warn(
      `OpenSky: ${reason}; using anonymous access for the next ${AUTH_RETRY_MS / 60_000} minutes`,
    )
  }

  // Bearer header while the credentials work, none (anonymous) otherwise
  async function authHeaders(creds: OpenSkyCredentials): Promise<Record<string, string>> {
    if (Date.now() < authRetryAt) return {}
    try {
      return { Authorization: `Bearer ${await getToken(creds)}` }
    } catch (err) {
      fallBackToAnonymous(err instanceof Error ? err.message : 'token request failed')
      return {}
    }
  }

  // GET an API path such as "/states/all?lamin=…". Authenticated when working
  // credentials are configured; anonymous when they're missing or rejected.
  async function get(path: string, signal?: AbortSignal): Promise<Response> {
    const url = OPENSKY_API + path
    if (!credentials) return fetch(url, { signal })

    const send = async () => fetch(url, { signal, headers: await authHeaders(credentials) })
    const res = await send()
    if (res.status !== 401) return res
    // Token expired early or was revoked: get a fresh one and retry once
    token = null
    const retry = await send()
    if (retry.status !== 401) return retry
    // Rejected even with a fresh token
    fallBackToAnonymous('API rejected the account token')
    return fetch(url, { signal })
  }

  return {
    get,
    // Credentials are configured
    authenticated: credentials !== null,
  }
}

export type OpenSkyClient = ReturnType<typeof createOpenSkyClient>
