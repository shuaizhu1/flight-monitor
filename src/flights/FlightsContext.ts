import { createContext, useContext } from 'react'
import type { NearbyFlightsData } from '../hooks/useNearbyFlights.ts'

// What the globe and table render: live polling, or a moment of a recording
export type FlightsState = {
  data: NearbyFlightsData | undefined
  error: Error | undefined
  isLoading: boolean
  mode: 'live' | 'replay'
  // Set while live polling waits out OpenSky's rate limit
  rateLimitedUntil: Date | null
}

const FlightsContext = createContext<FlightsState | null>(null)

export const FlightsProvider = FlightsContext.Provider

export function useFlights() {
  const flights = useContext(FlightsContext)
  if (!flights) throw new Error('useFlights must be used inside a FlightsProvider')
  return flights
}
