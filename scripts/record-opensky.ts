// Records raw OpenSky responses for the app's SFO search box to a JSON Lines
// file, one {"fetchedAt", "body"} object per successful poll.
//
//   npm run record -- --hours 3 --interval 30
//
// Set OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET in .env.local to use an
// account's higher rate limit.
import { appendFileSync, mkdirSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { OPENSKY_API, createOpenSkyClient, credentialsFromEnv } from '../server/opensky.ts'
import { POLL_INTERVAL_MS, STATES_PATH } from '../src/hooks/useNearbyFlights.ts'

// Rough daily request allowance for anonymous users at this box size:
// https://openskynetwork.github.io/opensky-api/rest.html#limitations
const ANONYMOUS_DAILY_LIMIT = 400

const { values } = parseArgs({
  options: {
    hours: { type: 'string', default: '3' },
    interval: { type: 'string', default: String(POLL_INTERVAL_MS / 1000) },
  },
})
const hours = Number(values.hours)
const intervalSec = Number(values.interval)
if (!(hours > 0) || !(intervalSec > 0)) {
  console.error('--hours and --interval must be positive numbers')
  process.exit(1)
}

const client = createOpenSkyClient(credentialsFromEnv(process.env))

const plannedPolls = Math.ceil((hours * 3600) / intervalSec)
if (!client.authenticated && plannedPolls > ANONYMOUS_DAILY_LIMIT) {
  console.warn(
    `Warning: ~${plannedPolls} polls exceeds OpenSky's anonymous limit of ~${ANONYMOUS_DAILY_LIMIT}/day; ` +
      `expect 429s. Use a longer --interval (e.g. 30) or set OPENSKY_CLIENT_ID/OPENSKY_CLIENT_SECRET.`,
  )
}

const url = `${OPENSKY_API}${STATES_PATH}`
mkdirSync('recordings', { recursive: true })
const file = `recordings/opensky-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`

// Ctrl-C cancels the current fetch or wait and falls through to the summary
const stop = new AbortController()
process.once('SIGINT', () => stop.abort())

const endAt = Date.now() + hours * 3600 * 1000
let successes = 0
let failures = 0

console.log(`Recording ${url}\nevery ${intervalSec}s for ${hours}h to ${file} (Ctrl-C to stop)`)

while (Date.now() < endAt && !stop.signal.aborted) {
  try {
    const res = await client.get(STATES_PATH, stop.signal)
    if (!res.ok) throw new Error(`OpenSky returned ${res.status}`)
    const body = await res.json()
    appendFileSync(file, JSON.stringify({ fetchedAt: new Date().toISOString(), body }) + '\n')
    successes++
    console.log(`${new Date().toLocaleTimeString()} ${body.states?.length ?? 0} aircraft`)
  } catch (err) {
    if (stop.signal.aborted) break
    failures++
    console.error(`${new Date().toLocaleTimeString()} ${(err as Error).message}`)
  }

  try {
    await sleep(Math.min(intervalSec * 1000, Math.max(0, endAt - Date.now())), undefined, {
      signal: stop.signal,
    })
  } catch {
    break
  }
}

console.log(`\nDone: ${successes} recorded, ${failures} failed → ${file}`)
