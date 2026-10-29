import useSWR from 'swr'
import { toFlights } from '../hooks/useNearbyFlights.ts'
import type { StateVector } from '../hooks/useNearbyFlights.ts'
import type { Frame } from './interpolate.ts'

// Matches server/recordingsPlugin.ts
export type RecordingInfo = { name: string; size: number; modified: string }

// In development the Vite plugin lists the local recordings/ folder; a
// production build (e.g. on Vercel) serves the demo recordings committed to
// public/recordings/ as static files
const LIST_URL = import.meta.env.DEV ? '/api/recordings' : '/recordings/index.json'
const RECORDINGS_BASE = import.meta.env.DEV ? '/api/recordings' : '/recordings'

// One line of a recording written by scripts/record-opensky.ts
type RecordedLine = {
  fetchedAt: string
  body: { time?: number; states: StateVector[] | null }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} returned ${res.status}`)
  return res.json()
}

// Parses a JSON Lines recording into frames sorted by time
export function parseRecording(text: string): Frame[] {
  const frames: Frame[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const { fetchedAt, body } = JSON.parse(line) as RecordedLine
      // Prefer OpenSky's data timestamp over when the script happened to fetch it
      const time = body.time ? body.time * 1000 : Date.parse(fetchedAt)
      if (Number.isFinite(time)) frames.push({ time, flights: toFlights(body.states) })
    } catch {
      // Skip malformed lines, e.g. a half-written last line while still recording
    }
  }
  frames.sort((a, b) => a.time - b.time)
  // Polling faster than OpenSky updates records the same snapshot twice
  return frames.filter((f, i) => i === 0 || f.time !== frames[i - 1].time)
}

async function fetchRecording(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Recording returned ${res.status}`)
  return parseRecording(await res.text())
}

export function useRecordingList() {
  return useSWR(LIST_URL, fetchJson<RecordingInfo[]>)
}

// Loads and parses a recording once; null loads nothing
export function useRecording(name: string | null) {
  return useSWR(name ? `${RECORDINGS_BASE}/${encodeURIComponent(name)}` : null, fetchRecording, {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  })
}
