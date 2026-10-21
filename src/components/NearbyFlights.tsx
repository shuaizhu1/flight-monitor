import { useEffect, useState } from 'react'

// SFO airport coordinates
const SFO = { lat: 37.6213, lon: -122.379 }
// Half-width of the search box in degrees (~55 km north/south)
const RADIUS_DEG = 0.5
const MAX_FLIGHTS = 5

const POLL_INTERVAL_MS = 10000

type Flight = {
  icao24: string
  callsign: string
  originCountry: string
  latitude: number
  longitude: number
  altitudeM: number | null
  velocityMs: number | null
  onGround: boolean
  distanceKm: number
}

// OpenSky returns each aircraft state as a positional array:
// https://openskynetwork.github.io/opensky-api/rest.html#all-state-vectors
type StateVector = [
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
  ...unknown[],
]

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(a))
}

function toFlight(s: StateVector): Flight | null {
  const [icao24, callsign, originCountry, , , longitude, latitude, altitudeM, onGround, velocityMs] = s
  if (latitude == null || longitude == null) return null
  return {
    icao24,
    callsign: callsign?.trim() || icao24,
    originCountry,
    latitude,
    longitude,
    altitudeM,
    velocityMs,
    onGround,
    distanceKm: distanceKm(SFO.lat, SFO.lon, latitude, longitude),
  }
}

function NearbyFlights() {
  const [flights, setFlights] = useState<Flight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const params = new URLSearchParams({
      lamin: String(SFO.lat - RADIUS_DEG),
      lomin: String(SFO.lon - RADIUS_DEG),
      lamax: String(SFO.lat + RADIUS_DEG),
      lomax: String(SFO.lon + RADIUS_DEG),
    })

    async function fetchFlights() {
      try {
        // /opensky is proxied to https://opensky-network.org/api in vite.config.ts
        const res = await fetch(`/opensky/states/all?${params}`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`OpenSky returned ${res.status}`)
        const data: { states: StateVector[] | null } = await res.json()

        const nearest = (data.states ?? [])
          .map(toFlight)
          .filter((f): f is Flight => f !== null)
          .sort((a, b) => a.distanceKm - b.distanceKm)
          .slice(0, MAX_FLIGHTS)

        setFlights(nearest)
        setUpdatedAt(new Date())
        setError(null)
      } catch (err) {
        if (controller.signal.aborted) return
        // Keep showing the last good results alongside the error
        setError(err instanceof Error ? err.message : 'Failed to fetch flights')
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          scheduleNext()
        }
      }
    }

    // Chain timeouts rather than setInterval so slow requests never overlap
    function scheduleNext() {
      clearTimeout(timeoutId)
      if (document.hidden) return
      timeoutId = setTimeout(fetchFlights, POLL_INTERVAL_MS)
    }

    // Pause polling while the tab is hidden to save API quota
    function handleVisibilityChange() {
      clearTimeout(timeoutId)
      if (!document.hidden) fetchFlights()
    }

    fetchFlights()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      controller.abort()
      clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  if (loading) return <p>Loading flights near SFO…</p>
  if (flights.length === 0) {
    return <p>{error ? `Error: ${error}` : 'No flights found near SFO.'}</p>
  }

  return (
    <section>
      <h2>{flights.length} flights near SFO</h2>
      <p>
        Updated {updatedAt?.toLocaleTimeString()} · refreshes every {POLL_INTERVAL_MS / 1000}s
        {error && ` · Last refresh failed: ${error}`}
      </p>
      <table>
        <thead>
          <tr>
            <th>Callsign</th>
            <th>Country</th>
            <th>Altitude</th>
            <th>Speed</th>
            <th>Distance</th>
          </tr>
        </thead>
        <tbody>
          {flights.map((f) => (
            <tr key={f.icao24}>
              <td>{f.callsign}</td>
              <td>{f.originCountry}</td>
              <td>{f.onGround ? 'On ground' : f.altitudeM != null ? `${Math.round(f.altitudeM * 3.281).toLocaleString()} ft` : '—'}</td>
              <td>{f.velocityMs != null ? `${Math.round(f.velocityMs * 1.944)} kt` : '—'}</td>
              <td>{f.distanceKm.toFixed(1)} km</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export default NearbyFlights
