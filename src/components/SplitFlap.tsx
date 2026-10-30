import { useEffect, useState } from 'react'
import './SplitFlap.css'

// The last character lands this long after the text changes. Whatever feeds
// SplitFlap should not change the text faster than this, or the flip restarts.
export const FLAP_DURATION_MS = 1500
const TICK_MS = 60
// The first character lands here; the rest follow left to right
const FIRST_SETTLE_MS = 500

const DIGITS = '0123456789'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWER = UPPER.toLowerCase()

// Each flap steps to the next character of the target's kind, the way a real
// board rolls through its drum; punctuation and spaces just drop into place
function nextChar(current: string, target: string) {
  for (const set of [DIGITS, UPPER, LOWER]) {
    if (set.includes(target)) return set[(set.indexOf(current) + 1) % set.length]
  }
  return target
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// `flips` counts the times a flap turned; it keys the face so its CSS
// animation replays on every turn
type Flap = { char: string; flips: number }

const toFlaps = (text: string): Flap[] => [...text].map((char) => ({ char, flips: 0 }))

// `length` fixes the number of tiles, like a real board: shorter text is
// padded with blank tiles and longer text is cut off
type Props = { text: string; length?: number; className?: string }

export function SplitFlap({ text, length = 0, className }: Props) {
  const padded = length ? text.slice(0, length).padEnd(length) : text
  const [flaps, setFlaps] = useState(() => toFlaps(padded))

  useEffect(() => {
    const target = [...padded]
    const settleAt = (i: number) =>
      FIRST_SETTLE_MS + (i / Math.max(target.length - 1, 1)) * (FLAP_DURATION_MS - FIRST_SETTLE_MS)
    const start = performance.now()
    const skip = reducedMotion()

    const tick = () => {
      const elapsed = skip ? Infinity : performance.now() - start
      setFlaps((prev) => {
        const next: Flap[] = []
        let changed = false
        for (let i = 0; i < Math.max(prev.length, target.length); i++) {
          // Extra characters from a longer old text roll down to blanks
          const want = target[i] ?? ' '
          const cur = prev[i] ?? { char: ' ', flips: 0 }
          if (cur.char === want) {
            next.push(cur)
            continue
          }
          changed = true
          const char = elapsed >= settleAt(i) ? want : nextChar(cur.char, want)
          next.push({ char, flips: cur.flips + 1 })
        }
        if (elapsed >= FLAP_DURATION_MS) next.length = target.length
        return changed || next.length !== prev.length ? next : prev
      })
      if (elapsed >= FLAP_DURATION_MS) clearInterval(id)
    }

    const id = setInterval(tick, TICK_MS)
    return () => clearInterval(id)
  }, [padded])

  return (
    <span className={`flap-text ${className ?? ''}`}>
      <span className="visually-hidden">{padded.trimEnd()}</span>
      <span aria-hidden="true">
        {flaps.map((flap, i) => (
          <span key={i} className="flap">
            <span key={flap.flips} className="flap-face">
              {flap.char === ' ' ? ' ' : flap.char}
            </span>
          </span>
        ))}
      </span>
    </span>
  )
}
