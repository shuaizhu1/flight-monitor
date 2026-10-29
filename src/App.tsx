import { Suspense, lazy } from 'react'
import NearbyFlights from './components/NearbyFlights'
import './App.css'

// mapbox-gl is large, so load the globe separately and let the table render first
const FlightGlobe = lazy(() => import('./components/FlightGlobe'))

function App() {
  return (
    <main>
      <h1>Flight Monitor</h1>
      <Suspense fallback={<p>Loading globe…</p>}>
        <FlightGlobe />
      </Suspense>
      <NearbyFlights />
    </main>
  )
}

export default App
