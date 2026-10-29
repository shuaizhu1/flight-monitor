import { useFlights } from '../flights/FlightsContext'
import { NEAREST_COUNT, POLL_INTERVAL_MS, formatAltitude, formatSpeed } from '../hooks/useNearbyFlights'
import './NearbyFlights.css'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

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
    <section className="flights-card">
      <header className="flights-header">
        <h2>
          Nearest {plural(flights.length, 'flight')} of {plural(data.flights.length, 'flight')}
        </h2>
        {mode === 'replay' ? (
          <p className="flights-status">Replaying · {updatedAt.toLocaleTimeString()}</p>
        ) : (
          <p className="flights-status">
            Updated {updatedAt.toLocaleTimeString()} · refreshes every {POLL_INTERVAL_MS / 1000}s
            {failure && ` · ${rateLimitedUntil ? failure : `Last refresh failed: ${failure}`}`}
          </p>
        )}
      </header>
      <div className="flights-scroll">
        <table className="flights-table">
          <thead>
            <tr>
              <th>Callsign</th>
              <th className="hide-narrow">Country</th>
              <th className="num">Altitude</th>
              <th className="num">Speed</th>
              <th className="num">Distance</th>
            </tr>
          </thead>
          <tbody>
            {flights.map((f, i) => (
              <tr key={f.icao24}>
                <td>
                  <span className="callsign">
                    <span className="rank" aria-label={`Rank ${i + 1}`}>
                      {i + 1}
                    </span>
                    {f.callsign}
                  </span>
                </td>
                <td className="hide-narrow muted">{f.originCountry}</td>
                <td className="num">
                  {f.onGround ? <span className="ground-badge">On ground</span> : formatAltitude(f)}
                </td>
                <td className="num">{formatSpeed(f)}</td>
                <td className="num">{f.distanceKm.toFixed(1)} km</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default NearbyFlights
