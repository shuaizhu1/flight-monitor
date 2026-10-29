import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import NearbyFlights from './components/NearbyFlights'
import TimelineScrubber from './components/TimelineScrubber'
import { FlightsProvider } from './flights/FlightsContext'
import type { FlightsState } from './flights/FlightsContext'
import { useNearbyFlights } from './hooks/useNearbyFlights'
import { useRecordingList } from './replay/recordings'
import { useReplay } from './replay/useReplay'
import type { Replay } from './replay/useReplay'
import './App.css'

// mapbox-gl is large, so load the globe separately and let the table render first
const FlightGlobe = lazy(() => import('./components/FlightGlobe'))

// Live OpenSky data only exists in development, where the Vite dev server
// proxies it. Production builds (e.g. on Vercel) never contact OpenSky and
// replay the demo recordings in public/recordings/ instead.
const LIVE_AVAILABLE = import.meta.env.DEV
// Shown on production builds, where live data is never available
const PRODUCTION_NOTICE =
  'Live data unavailable: the OpenSky API blocks Vercel requests. Run locally with npm run dev to view live data.'

function App() {
  const replay = useReplay()
  // No OpenSky requests (or credits) while a recording is being replayed
  const live = useNearbyFlights({ paused: replay.active || !LIVE_AVAILABLE })
  const { data: recordings } = useRecordingList()
  const newestRecording = recordings?.[0]?.name

  // Production has nothing but recordings, so play the newest one straight away
  useEffect(() => {
    if (!LIVE_AVAILABLE && !replay.active && newestRecording) replay.select(newestRecording)
  }, [newestRecording, replay])

  // If live data can't load at all (OpenSky down, blocked or out of credits),
  // play the newest recording instead of showing an error. Only once: after
  // "Back to live" a failure shows normally.
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null)
  const fallbackUsed = useRef(false)
  const liveFailed = LIVE_AVAILABLE && !replay.active && !live.data && live.error !== undefined
  useEffect(() => {
    if (!liveFailed || !newestRecording || fallbackUsed.current) return
    fallbackUsed.current = true
    setFallbackNotice(`Live data unavailable (${live.error?.message}), playing a recording instead`)
    replay.select(newestRecording)
  }, [liveFailed, newestRecording, live.error, replay])

  // Any recording change made from the timeline clears the fallback notice
  const timelineReplay: Replay = {
    ...replay,
    select(name) {
      setFallbackNotice(null)
      replay.select(name)
    },
  }

  const flights: FlightsState =
    replay.active || !LIVE_AVAILABLE
      ? {
          data: replay.data,
          error: replay.error,
          // In production, still loading until the first recording is picked
          isLoading: replay.isLoading || !replay.active,
          mode: 'replay',
          rateLimitedUntil: null,
        }
      : {
        data: live.data,
        error: live.error,
        isLoading: live.isLoading,
        mode: 'live',
        rateLimitedUntil: live.rateLimitedUntil,
      }

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <h1>Flight Monitor</h1>
          <p className="page-subtitle">Air traffic within about 55 km of San Francisco International (SFO)</p>
        </div>
        <span className={`mode-badge mode-${flights.mode}`}>{flights.mode === 'live' ? 'Live' : 'Replay'}</span>
      </header>

      <FlightsProvider value={flights}>
        <div className="card globe-card">
          <Suspense fallback={<div className="globe-placeholder">Loading globe…</div>}>
            <FlightGlobe />
          </Suspense>
        </div>
        <TimelineScrubber
          replay={timelineReplay}
          notice={LIVE_AVAILABLE ? fallbackNotice : PRODUCTION_NOTICE}
          liveAvailable={LIVE_AVAILABLE}
        />
        <NearbyFlights />
      </FlightsProvider>

      <footer className="page-footer">
        Flight data from <a href="https://opensky-network.org">The OpenSky Network</a> · Map by{' '}
        <a href="https://www.mapbox.com">Mapbox</a>
      </footer>
    </main>
  )
}

export default App
