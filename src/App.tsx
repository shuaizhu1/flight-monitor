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

function App() {
  const replay = useReplay()
  // No OpenSky requests (or credits) while a recording is being replayed
  const live = useNearbyFlights({ paused: replay.active })
  const { data: recordings } = useRecordingList()

  // If live data can't load at all (OpenSky down, blocked or out of credits),
  // play the newest recording instead of showing an error. Only once: after
  // "Back to live" a failure shows normally.
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null)
  const fallbackUsed = useRef(false)
  const liveFailed = !replay.active && !live.data && live.error !== undefined
  const fallbackRecording = recordings?.[0]?.name
  useEffect(() => {
    if (!liveFailed || !fallbackRecording || fallbackUsed.current) return
    fallbackUsed.current = true
    setFallbackNotice(`Live data unavailable (${live.error?.message}), playing a recording instead`)
    replay.select(fallbackRecording)
  }, [liveFailed, fallbackRecording, live.error, replay])

  // Any recording change made from the timeline clears the fallback notice
  const timelineReplay: Replay = {
    ...replay,
    select(name) {
      setFallbackNotice(null)
      replay.select(name)
    },
  }

  const flights: FlightsState = replay.active
    ? { data: replay.data, error: replay.error, isLoading: replay.isLoading, mode: 'replay', rateLimitedUntil: null }
    : {
        data: live.data,
        error: live.error,
        isLoading: live.isLoading,
        mode: 'live',
        rateLimitedUntil: live.rateLimitedUntil,
      }

  return (
    <main>
      <h1>Flight Monitor</h1>
      <FlightsProvider value={flights}>
        <Suspense fallback={<p>Loading globe…</p>}>
          <FlightGlobe />
        </Suspense>
        <TimelineScrubber replay={timelineReplay} notice={fallbackNotice} />
        <NearbyFlights />
      </FlightsProvider>
    </main>
  )
}

export default App
