import { useEffect, useMemo, useState } from 'react'
import type { NearbyFlightsData } from '../hooks/useNearbyFlights.ts'
import { flightsAt, frameIndexAt } from './interpolate.ts'
import { useRecording } from './recordings.ts'

export const SPEEDS = [1, 5, 10]
// Advance the playhead every animation frame but re-render at most ~20 times a
// second: smooth on the globe without rebuilding its data 60 times a second
const COMMIT_INTERVAL_MS = 50

export function useReplay() {
  const [selected, setSelected] = useState<string | null>(null)
  const { data: frames, error, isLoading } = useRecording(selected)
  // Playhead in ms since the start of the recording
  const [offset, setOffset] = useState(0)
  const [playRequested, setPlayRequested] = useState(false)
  const [speed, setSpeed] = useState(10)

  const start = frames?.[0]?.time ?? 0
  const duration = frames && frames.length > 0 ? frames[frames.length - 1].time - start : 0
  const position = Math.min(offset, duration)
  const time = start + position
  // Playback stops by itself at the end of the recording
  const playing = playRequested && frames !== undefined && position < duration

  useEffect(() => {
    if (!playing) return
    let frameId = 0
    let last = performance.now()
    let lastCommit = last
    let pending = 0

    const tick = (now: number) => {
      pending += (now - last) * speed
      last = now
      if (now - lastCommit >= COMMIT_INTERVAL_MS) {
        const advance = pending
        pending = 0
        lastCommit = now
        setOffset((o) => Math.min(o + advance, duration))
      }
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [playing, speed, duration])

  const data = useMemo<NearbyFlightsData | undefined>(
    () => (frames ? { flights: flightsAt(frames, time), updatedAt: new Date(time) } : undefined),
    [frames, time],
  )

  return {
    // A recording is selected; null means live
    selected,
    active: selected !== null,
    // Picking a recording plays it from the start as soon as it has loaded
    select(name: string | null) {
      setSelected(name)
      setOffset(0)
      setPlayRequested(name !== null)
    },
    frames,
    error: error as Error | undefined,
    isLoading,
    data,
    time,
    position,
    duration,
    frameIndex: frames ? frameIndexAt(frames, time) : 0,
    playing,
    play() {
      // Play from the end restarts the recording
      if (position >= duration) setOffset(0)
      setPlayRequested(true)
    },
    pause() {
      setPlayRequested(false)
    },
    seek(newPosition: number) {
      setOffset(Math.max(0, Math.min(newPosition, duration)))
    },
    speed,
    setSpeed,
  }
}

export type Replay = ReturnType<typeof useReplay>
