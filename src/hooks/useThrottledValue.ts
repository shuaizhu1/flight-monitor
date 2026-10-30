import { useEffect, useRef, useState } from 'react'

// Passes `value` through at most once every `intervalMs`. A change that comes
// sooner waits for the interval to end, and only the latest value is shown.
export function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [shown, setShown] = useState(value)
  const lastShownAt = useRef(0)

  useEffect(() => {
    const wait = lastShownAt.current + intervalMs - Date.now()
    const id = setTimeout(
      () => {
        lastShownAt.current = Date.now()
        setShown(value)
      },
      Math.max(0, wait),
    )
    return () => clearTimeout(id)
  }, [value, intervalMs])

  return shown
}
