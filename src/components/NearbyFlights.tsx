import { useFlights } from '../flights/FlightsContext'
import { NEAREST_COUNT, POLL_INTERVAL_MS, formatAltitude, formatSpeed } from '../hooks/useNearbyFlights'
import { useThrottledValue } from '../hooks/useThrottledValue'
import { FLAP_DURATION_MS, SplitFlap } from './SplitFlap'
import './NearbyFlights.css'

// Replay updates many times a second; hold each table update until the
// callsign split-flap animation for the previous one has finished, so the
// rest of the row never shows a different aircraft than its callsign
const TABLE_UPDATE_MS = Math.max(1000, FLAP_DURATION_MS)

// Callsigns are at most 7 characters; longer recorded values are cut off
const CALLSIGN_LENGTH = 7

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function NearbyFlights() {
  const { data: latest, error, isLoading, mode, rateLimitedUntil } = useFlights()
  const data = useThrottledValue(latest, TABLE_UPDATE_MS)
  const failure = rateLimitedUntil
    ? `OpenSky rate limit reached, resuming at ${rateLimitedUntil.toLocaleTimeString()}`
    : error?.message

  const all = data?.flights ?? []
  const flights = all.slice(0, NEAREST_COUNT)

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
            {/* Always NEAREST_COUNT rows, keyed by rank so each row stays put and
                its callsign flips to the new aircraft, like a departures board.
                Empty slots (loading, errors, few aircraft) show dashes. */}
            {Array.from({ length: NEAREST_COUNT }, (_, i) => {
              const f = flights[i]
              return (
                <tr key={i} className={f ? undefined : 'placeholder-row'} aria-hidden={!f || undefined}>
                  <td>
                    <span className="callsign">
                      <span className="rank" aria-label={`Rank ${i + 1}`}>
                        {i + 1}
                      </span>
                      <SplitFlap className="truncate" length={CALLSIGN_LENGTH} text={f ? f.callsign : '—'} />
                    </span>
                  </td>
                  <td className="hide-narrow muted truncate">{f ? f.originCountry : '—'}</td>
                  <td className="num">
                    {!f ? '—' : f.onGround ? <span className="ground-badge">On ground</span> : formatAltitude(f)}
                  </td>
                  <td className="num">{f ? formatSpeed(f) : '—'}</td>
                  <td className="num">{f ? `${f.distanceKm.toFixed(1)} km` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default NearbyFlights
