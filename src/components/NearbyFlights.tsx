import { useFlights } from '../flights/FlightsContext'
import { NEAREST_COUNT, POLL_INTERVAL_MS, formatAltitude, formatSpeed } from '../hooks/useNearbyFlights'

function NearbyFlights() {
  const { data, error, isLoading, mode, rateLimitedUntil } = useFlights()
  const failure = rateLimitedUntil
    ? `OpenSky rate limit reached, resuming at ${rateLimitedUntil.toLocaleTimeString()}`
    : error?.message

  if (isLoading) return <p>{mode === 'replay' ? 'Loading recording…' : 'Loading flights near SFO…'}</p>
  if (!data || data.flights.length === 0) {
    return <p>{failure ? `Error: ${failure}` : 'No flights found near SFO.'}</p>
  }

  const { updatedAt } = data
  const flights = data.flights.slice(0, NEAREST_COUNT)

  return (
    <section>
      <h2>
        {flights.length} nearest of {data.flights.length} flights near SFO
      </h2>
      {mode === 'replay' ? (
        <p>Replaying · {updatedAt.toLocaleTimeString()}</p>
      ) : (
        <p>
          Updated {updatedAt.toLocaleTimeString()} · refreshes every {POLL_INTERVAL_MS / 1000}s
          {failure && ` · ${rateLimitedUntil ? failure : `Last refresh failed: ${failure}`}`}
        </p>
      )}
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
              <td>{formatAltitude(f)}</td>
              <td>{formatSpeed(f)}</td>
              <td>{f.distanceKm.toFixed(1)} km</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export default NearbyFlights
