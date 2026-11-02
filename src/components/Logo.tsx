import { useEffect, useState } from 'react'
import { SplitFlap } from './SplitFlap'
import './Logo.css'

// Departures-board wordmark. Each word wraps as a unit on narrow screens.
const WORDS = ['FLIGHT', 'MONITOR']

function Logo() {
  // Start on blank tiles, then flip in once mounted
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    // The tiles are announced letter by letter otherwise
    <h1 className="logo" aria-label="Flight Monitor">
      {WORDS.map((word) => (
        <SplitFlap key={word} text={shown ? word : ''} length={word.length} className="logo-word" />
      ))}
    </h1>
  )
}

export default Logo
