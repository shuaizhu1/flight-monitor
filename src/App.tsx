import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import Logo from './components/Logo'
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

// GitHub mark, filled with the text color so it works in light and dark mode
function GitHubIcon() {
  return (
    <svg viewBox="0 0 19 19" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.356 1.85C5.05 1.85 1.57 5.356 1.57 9.694a7.84 7.84 0 0 0 5.324 7.44c.387.079.528-.168.528-.376 0-.182-.013-.805-.013-1.454-2.165.467-2.616-.935-2.616-.935-.349-.91-.864-1.143-.864-1.143-.71-.48.051-.48.051-.48.787.051 1.2.805 1.2.805.695 1.194 1.817.857 2.268.649.064-.507.27-.857.49-1.052-1.728-.182-3.545-.857-3.545-3.87 0-.857.31-1.558.8-2.104-.078-.195-.349-1 .077-2.078 0 0 .657-.208 2.14.805a7.5 7.5 0 0 1 1.946-.26c.657 0 1.328.092 1.946.26 1.483-1.013 2.14-.805 2.14-.805.426 1.078.155 1.883.078 2.078.502.546.799 1.247.799 2.104 0 3.013-1.818 3.675-3.558 3.87.284.247.528.714.528 1.454 0 1.052-.012 1.896-.012 2.156 0 .208.142.455.528.377a7.84 7.84 0 0 0 5.324-7.441c.013-4.338-3.48-7.844-7.773-7.844"
      />
    </svg>
  )
}

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
          <Logo />
          <p className="page-subtitle">Air traffic within about 55 km of San Francisco International (SFO)</p>
        </div>
        <a className="demo-link" href="https://github.com/shuaizhu1/flight-monitor" target="_blank" rel="noreferrer">
          <GitHubIcon />
          Demo
        </a>
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
        Flight data from{' '}
        <a href="https://opensky-network.org" target="_blank" rel="noreferrer">
          The OpenSky Network
        </a>{' '}
        · Map by{' '}
        <a href="https://www.mapbox.com" target="_blank" rel="noreferrer">
          Mapbox
        </a>
      </footer>
    </main>
  )
}

export default App
