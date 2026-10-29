// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POLL_INTERVAL_MS, RateLimitError, useNearbyFlights } from './useNearbyFlights'

// OpenSky state vectors in their positional format: one aircraft parked at
// SFO and one airborne at the given latitude
function openSkyBody(airborneLat: number) {
  return {
    time: 1793302138,
    states: [
      ['a0f4f6', 'UAL574  ', 'United States', 1793302138, 1793302138, -122.3, airborneLat, 3000, false, 150, 290, 0, null, 3050, '1515', false, 0],
      ['ac370b', 'SWA2990 ', 'United States', 1793302138, 1793302138, -122.3913, 37.6243, null, true, 0, 120, null, null, null, '3232', false, 0],
    ],
  }
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const serverError = () => new Response('', { status: 500 })
const rateLimited = (retryAfterSec?: number) =>
  new Response('', {
    status: 429,
    headers: retryAfterSec ? { 'x-rate-limit-retry-after-seconds': String(retryAfterSec) } : {},
  })

// Fresh SWR cache per test, and no focus throttling so a focus event would
// trigger a refetch if nothing were blocking it
function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, focusThrottleInterval: 0 }}>
      {children}
    </SWRConfig>
  )
}

async function advance(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms))
}

function refocusWindow() {
  act(() => {
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

describe('useNearbyFlights rate-limit backoff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stops all requests until OpenSky’s retry-after time, keeping the last data, then resumes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(openSkyBody(37.6)))
      .mockResolvedValueOnce(rateLimited(15))
      .mockResolvedValue(ok(openSkyBody(37.62)))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useNearbyFlights(), { wrapper })
    await advance(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Parsed and sorted nearest to SFO first
    expect(result.current.data?.flights.map((f) => f.callsign)).toEqual(['SWA2990', 'UAL574'])

    // Next poll hits the exhausted budget
    await advance(POLL_INTERVAL_MS)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.error).toBeInstanceOf(RateLimitError)
    expect(result.current.rateLimitedUntil!.getTime() - Date.now()).toBe(15_000)
    // The last good flights stay on screen
    expect(result.current.data?.flights).toHaveLength(2)

    // No polling, error retries or refetch-on-focus while rate limited
    for (let second = 1; second < 15; second++) {
      await advance(1000)
      refocusWindow()
    }
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // Exactly one request once the retry-after time has passed
    await advance(1000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result.current.rateLimitedUntil).toBeNull()
    expect(result.current.error).toBeUndefined()
    expect(result.current.data?.flights.find((f) => f.callsign === 'UAL574')?.latitude).toBe(37.62)
  })

  it('waits 5 minutes when a 429 has no retry-after header', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(rateLimited()).mockResolvedValue(ok(openSkyBody(37.6)))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useNearbyFlights(), { wrapper })
    await advance(0)
    expect(result.current.rateLimitedUntil!.getTime() - Date.now()).toBe(5 * 60_000)

    await advance(5 * 60_000 - 1000)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await advance(1000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.data?.flights).toHaveLength(2)
  })

  it('reports other failures as ordinary errors, not rate limits', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(serverError()))

    const { result } = renderHook(() => useNearbyFlights(), { wrapper })
    await advance(0)

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error).not.toBeInstanceOf(RateLimitError)
    expect(result.current.error?.message).toBe('OpenSky returned 500')
    expect(result.current.rateLimitedUntil).toBeNull()
  })
})
