import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'

// SFO airport coordinates
export const SFO = { lat: 37.6213, lon: -122.379 }
// Half-width of the search box in degrees (~55 km north/south)
const RADIUS_DEG = 0.5

export const POLL_INTERVAL_MS = 10000
// How many of the closest flights the table lists and the globe highlights
export const NEAREST_COUNT = 5

export type Flight = {
  icao24: string
  callsign: string
  originCountry: string
  latitude: number
  longitude: number
  altitudeM: number | null
  velocityMs: number | null
  trueTrack: number | null
  onGround: boolean
  distanceKm: number
}

// OpenSky returns each aircraft state as a positional array:
// https://openskynetwork.github.io/opensky-api/rest.html#all-state-vectors
export type StateVector = [
  string, // 0 icao24
  string | null, // 1 callsign
  string, // 2 origin_country
  number | null, // 3 time_position
  number, // 4 last_contact
  number | null, // 5 longitude
  number | null, // 6 latitude
  number | null, // 7 baro_altitude (m)
  boolean, // 8 on_ground
  number | null, // 9 velocity (m/s)
  number | null, // 10 true_track (degrees clockwise from north)
  ...unknown[],
]

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(a))
}

function toFlight(s: StateVector): Flight | null {
  const [icao24, callsign, originCountry, , , longitude, latitude, altitudeM, onGround, velocityMs, trueTrack] = s
  if (latitude == null || longitude == null) return null
  return {
    icao24,
    callsign: callsign?.trim() || icao24,
    originCountry,
    latitude,
    longitude,
    altitudeM,
    velocityMs,
    trueTrack,
    onGround,
    distanceKm: distanceKm(SFO.lat, SFO.lon, latitude, longitude),
  }
}

// Parses an OpenSky states array into flights, nearest to SFO first
export function toFlights(states: StateVector[] | null): Flight[] {
  return (states ?? [])
    .map(toFlight)
    .filter((f): f is Flight => f !== null)
    .sort((a, b) => a.distanceKm - b.distanceKm)
}

export function formatAltitude(f: Flight) {
  if (f.onGround) return 'On ground'
  return f.altitudeM != null ? `${Math.round(f.altitudeM * 3.281).toLocaleString()} ft` : '—'
}

export function formatSpeed(f: Flight) {
  return f.velocityMs != null ? `${Math.round(f.velocityMs * 1.944)} kt` : '—'
}

// OpenSky API path for every aircraft in the search box; also used by
// scripts/record-opensky.ts
export const STATES_PATH = `/states/all?${new URLSearchParams({
  lamin: String(SFO.lat - RADIUS_DEG),
  lomin: String(SFO.lon - RADIUS_DEG),
  lamax: String(SFO.lat + RADIUS_DEG),
  lomax: String(SFO.lon + RADIUS_DEG),
})}`

// /opensky is proxied to https://opensky-network.org/api in vite.config.ts
const FLIGHTS_URL = `/opensky${STATES_PATH}`

export type NearbyFlightsData = {
  // Every aircraft in the search box, nearest to SFO first
  flights: Flight[]
  updatedAt: Date
}

// Used when a 429 arrives without OpenSky's retry-after header
const DEFAULT_RATE_LIMIT_WAIT_MS = 5 * 60_000

// The daily API credit budget is used up
export class RateLimitError extends Error {
  readonly retryAfterMs: number

  constructor(retryAfterMs: number) {
    super('OpenSky rate limit reached')
    this.retryAfterMs = retryAfterMs
  }
}

async function fetchNearbyFlights(url: string): Promise<NearbyFlightsData> {
  const res = await fetch(url)
  if (res.status === 429) {
    const retryAfterSec = Number(res.headers.get('x-rate-limit-retry-after-seconds'))
    throw new RateLimitError(retryAfterSec > 0 ? retryAfterSec * 1000 : DEFAULT_RATE_LIMIT_WAIT_MS)
  }
  if (!res.ok) throw new Error(`OpenSky returned ${res.status}`)
  const data: { states: StateVector[] | null } = await res.json()
  return { flights: toFlights(data.states), updatedAt: new Date() }
}

// Polls live flights. SWR waits for each request to settle before scheduling
// the next, pauses polling while the tab is hidden, and keeps the last data
// when a refresh fails. `paused` (used while replaying a recording) sends no
// requests at all.
//
// When OpenSky's credit budget runs out, all requests (polling, error retries
// and refetch-on-focus) stop until the time OpenSky says to retry; then one
// request is made and normal polling resumes.
export function useNearbyFlights({ paused = false } = {}) {
  // Read by SWR's isPaused at request time; the state copy is for rendering
  const rateLimitedUntilRef = useRef(0)
  const [rateLimitedUntil, setRateLimitedUntil] = useState<Date | null>(null)

  const swr = useSWR(paused ? null : FLIGHTS_URL, fetchNearbyFlights, {
    refreshInterval: POLL_INTERVAL_MS,
    isPaused: () => Date.now() < rateLimitedUntilRef.current,
    // SWR's own exponential retry would ignore OpenSky's retry-after time
    shouldRetryOnError: (err) => !(err instanceof RateLimitError),
    onError(err) {
      if (!(err instanceof RateLimitError)) return
      rateLimitedUntilRef.current = Date.now() + err.retryAfterMs
      setRateLimitedUntil(new Date(rateLimitedUntilRef.current))
    },
  })

  const { mutate } = swr
  useEffect(() => {
    if (!rateLimitedUntil) return
    const timer = setTimeout(() => {
      setRateLimitedUntil(null)
      // SWR doesn't poll after a failed request, so resume with a fetch
      mutate()
    }, rateLimitedUntil.getTime() - Date.now())
    return () => clearTimeout(timer)
  }, [rateLimitedUntil, mutate])

  return { ...swr, rateLimitedUntil }
}
