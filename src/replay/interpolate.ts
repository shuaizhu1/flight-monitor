import { SFO, distanceKm } from '../hooks/useNearbyFlights.ts'
import type { Flight } from '../hooks/useNearbyFlights.ts'

// One recorded snapshot: `time` is the data timestamp in ms
export type Frame = { time: number; flights: Flight[] }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function lerpNullable(a: number | null, b: number | null, t: number) {
  return a == null || b == null ? (a ?? b) : lerp(a, b, t)
}

// Interpolate headings the short way round, so 350° → 10° passes through 0°
function lerpAngle(a: number | null, b: number | null, t: number) {
  if (a == null || b == null) return a ?? b
  const delta = ((b - a + 540) % 360) - 180
  return (a + delta * t + 360) % 360
}

// Index of the last frame at or before `time` (0 if `time` is before them all)
export function frameIndexAt(frames: Frame[], time: number) {
  let lo = 0
  let hi = frames.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (frames[mid].time <= time) lo = mid
    else hi = mid - 1
  }
  return lo
}

// Flights at any moment of a recording. Aircraft in both surrounding frames
// glide between their two positions; one that's missing from the next frame
// stays put until that frame, and a new one appears once its frame is reached.
// At an exact frame time this returns that frame's flights unchanged.
export function flightsAt(frames: Frame[], time: number): Flight[] {
  if (frames.length === 0) return []
  const i = frameIndexAt(frames, time)
  const from = frames[i]
  const to = frames[i + 1]
  if (!to || time <= from.time) return from.flights

  const alpha = (time - from.time) / (to.time - from.time)
  const next = new Map(to.flights.map((f) => [f.icao24, f]))

  return from.flights
    .map((a) => {
      const b = next.get(a.icao24)
      if (!b) return a
      const latitude = lerp(a.latitude, b.latitude, alpha)
      const longitude = lerp(a.longitude, b.longitude, alpha)
      return {
        ...a,
        latitude,
        longitude,
        altitudeM: lerpNullable(a.altitudeM, b.altitudeM, alpha),
        velocityMs: lerpNullable(a.velocityMs, b.velocityMs, alpha),
        trueTrack: lerpAngle(a.trueTrack, b.trueTrack, alpha),
        onGround: alpha < 0.5 ? a.onGround : b.onGround,
        distanceKm: distanceKm(SFO.lat, SFO.lon, latitude, longitude),
      }
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
}
