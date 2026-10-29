import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import type { OpenSkyClient } from './opensky.ts'

// Response headers worth passing through to the browser
const FORWARDED_HEADERS = ['content-type', 'x-rate-limit-remaining', 'x-rate-limit-retry-after-seconds']

// Serves /opensky/* from the OpenSky API on the dev server. Production builds
// (including `npm run preview`) never request live data, only recordings.
// OpenSky only allows CORS from its own origin, and the OAuth token has to be
// attached server-side so the client secret stays out of the browser.
export function openskyProxy(client: OpenSkyClient): Plugin {
  async function handle(req: IncomingMessage, res: ServerResponse) {
    // Stop the upstream request if the browser goes away first
    const controller = new AbortController()
    res.on('close', () => controller.abort())

    try {
      // Mounted at /opensky, so req.url is already the API path
      const upstream = await client.get(req.url ?? '/', controller.signal)
      res.statusCode = upstream.status
      for (const name of FORWARDED_HEADERS) {
        const value = upstream.headers.get(name)
        if (value) res.setHeader(name, value)
      }
      res.end(Buffer.from(await upstream.arrayBuffer()))
    } catch (err) {
      if (controller.signal.aborted) return
      res.statusCode = 502
      res.end(err instanceof Error ? err.message : 'OpenSky request failed')
    }
  }

  return {
    name: 'opensky-proxy',
    configureServer(server) {
      server.config.logger.info(
        `  OpenSky: ${client.authenticated ? 'using account credentials' : 'anonymous (set OPENSKY_CLIENT_ID/OPENSKY_CLIENT_SECRET in .env.local)'}`,
      )
      server.middlewares.use('/opensky', handle)
    },
  }
}
