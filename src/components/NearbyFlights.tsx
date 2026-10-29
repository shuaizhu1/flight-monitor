import { useFlights } from '../flights/FlightsContext'
import { NEAREST_COUNT, POLL_INTERVAL_MS, formatAltitude, formatSpeed } from '../hooks/useNearbyFlights'
import './NearbyFlights.css'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function NearbyFlights() {
  const { data, error, isLoading, mode, rateLimitedUntil } = useFlights()
  const failure = rateLimitedUntil
    ? `OpenSky rate limit reached, resuming at ${rateLimitedUntil.toLocaleTimeString()}`
    : error?.message

  const all = data?.flights ?? []
  const flights = all.slice(0, NEAREST_COUNT)
  // Always render NEAREST_COUNT rows, so the card keeps its size while loading,
  // on errors and when fewer aircraft are around
  const placeholders = NEAREST_COUNT - flights.length

  let heading = `Nearest ${plural(flights.length, 'flight')} of ${plural(all.length, 'flight')}`
  let status: string
  if (isLoading) {
    heading = 'Nearest flights'
    status = mode === 'replay' ? 'Loading recording…' : 'Loading flights near SFO…'
  } else if (!data) {
    heading = 'Nearest flights'
    status = failure ? `Error: ${failure}` : 'No data yet'
  } else if (mode === 'replay') {
    status = `Replaying · ${data.updatedAt.toLocaleTimeString()}`
  } else {
    status = `Updated ${data.updatedAt.toLocaleTimeString()} · refreshes every ${POLL_INTERVAL_MS / 1000}s`
    if (failure) status += ` · ${rateLimitedUntil ? failure : `Last refresh failed: ${failure}`}`
  }

  return (
    <section className="card flights-card" aria-busy={isLoading}>
      <header className="flights-header">
        <h2>{heading}</h2>
        <p className="flights-status">{status}</p>
      </header>
      <div className="flights-scroll">
        <table className="flights-table">
          <thead>
            <tr>
              <th className="col-callsign">Callsign</th>
              <th className="col-country hide-narrow">Country</th>
              <th className="col-altitude num">Altitude</th>
              <th className="col-speed num">Speed</th>
              <th className="col-distance num">Distance</th>
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
                    <span className="truncate">{f.callsign}</span>
                  </span>
                </td>
                <td className="hide-narrow muted truncate">{f.originCountry}</td>
                <td className="num">
                  {f.onGround ? <span className="ground-badge">On ground</span> : formatAltitude(f)}
                </td>
                <td className="num">{formatSpeed(f)}</td>
                <td className="num">{f.distanceKm.toFixed(1)} km</td>
              </tr>
            ))}
            {Array.from({ length: placeholders }, (_, i) => (
              <tr key={`placeholder-${i}`} className="placeholder-row" aria-hidden="true">
                <td>
                  <span className="callsign">
                    <span className="rank">{flights.length + i + 1}</span>—
                  </span>
                </td>
                <td className="hide-narrow">—</td>
                <td className="num">—</td>
                <td className="num">—</td>
                <td className="num">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default NearbyFlights
