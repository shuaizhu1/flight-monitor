import { Suspense, lazy } from 'react'
import NearbyFlights from './components/NearbyFlights'
import TimelineScrubber from './components/TimelineScrubber'
import { FlightsProvider } from './flights/FlightsContext'
import type { FlightsState } from './flights/FlightsContext'
import { useNearbyFlights } from './hooks/useNearbyFlights'
import { useReplay } from './replay/useReplay'
import './App.css'

// mapbox-gl is large, so load the globe separately and let the table render first
const FlightGlobe = lazy(() => import('./components/FlightGlobe'))

function App() {
  const replay = useReplay()
  // No OpenSky requests (or credits) while a recording is being replayed
  const live = useNearbyFlights({ paused: replay.active })

  const flights: FlightsState = replay.active
    ? { data: replay.data, error: replay.error, isLoading: replay.isLoading, mode: 'replay' }
    : { data: live.data, error: live.error, isLoading: live.isLoading, mode: 'live' }

  return (
    <main>
      <h1>Flight Monitor</h1>
      <FlightsProvider value={flights}>
        <Suspense fallback={<p>Loading globe…</p>}>
          <FlightGlobe />
        </Suspense>
        <TimelineScrubber replay={replay} />
        <NearbyFlights />
      </FlightsProvider>
    </main>
  )
}

export default App
