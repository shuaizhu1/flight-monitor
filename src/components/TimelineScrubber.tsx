import { SPEEDS } from '../replay/useReplay'
import type { Replay } from '../replay/useReplay'
import { useRecordingList } from '../replay/recordings'
import type { RecordingInfo } from '../replay/recordings'

// "opensky-2026-10-29T19-29-02-198Z.jsonl" → "Oct 29, 12:29 PM · 190 KB"
function recordingLabel({ name, size }: RecordingInfo) {
  const sizeLabel = `${Math.round(size / 1024).toLocaleString()} KB`
  const match = name.match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/)
  if (!match) return `${name} · ${sizeLabel}`
  const [, date, h, m, s, ms] = match
  const started = new Date(`${date}T${h}:${m}:${s}.${ms}Z`)
  const when = started.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return `${when} · ${sizeLabel}`
}

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path fill="currentColor" d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
  </svg>
)

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <rect fill="currentColor" x="6" y="5" width="4" height="14" rx="1" />
    <rect fill="currentColor" x="14" y="5" width="4" height="14" rx="1" />
  </svg>
)

type Props = {
  replay: Replay
  notice?: string | null
  // False in production builds, which only replay recordings
  liveAvailable?: boolean
}

function TimelineScrubber({ replay, notice, liveAvailable = true }: Props) {
  const { data: recordings, error: listError } = useRecordingList()
  const { frames } = replay
  // The list is sorted newest first
  const latest = recordings?.[0]
  const current = recordings?.find((r) => r.name === replay.selected)

  return (
    <section className="card timeline" aria-label="Replay timeline">
      <div className="timeline-top">
        <p className="timeline-source">
          {replay.active
            ? current && `Playing from recording · ${recordingLabel(current)}`
            : 'Showing live data from OpenSky'}
        </p>
        {replay.active
          ? liveAvailable && (
              <button type="button" className="button" onClick={() => replay.select(null)}>
                Back to live
              </button>
            )
          : latest && (
              <button type="button" className="button" onClick={() => replay.select(latest.name)}>
                Show latest recording · {recordingLabel(latest)}
              </button>
            )}
      </div>

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {recordings?.length === 0 && (
        <p className="timeline-message">
          No recordings yet — run <code>npm run record</code>
        </p>
      )}
      {listError && <p className="timeline-message">Couldn't list recordings: {listError.message}</p>}
      {replay.active && replay.isLoading && <p className="timeline-message">Loading recording…</p>}
      {replay.error && <p className="timeline-message">Couldn't load recording: {replay.error.message}</p>}

      {replay.active && frames && frames.length > 0 && (
        <div className="timeline-controls">
          <button
            type="button"
            className="play-button"
            aria-label={replay.playing ? 'Pause' : 'Play'}
            onClick={replay.playing ? replay.pause : replay.play}
          >
            {replay.playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <input
            type="range"
            className="scrubber"
            aria-label="Replay position"
            min={0}
            max={replay.duration}
            step="any"
            value={replay.position}
            onChange={(e) => replay.seek(Number(e.target.value))}
          />
          <span className="timeline-time">
            {new Date(replay.time).toLocaleTimeString()}
            <span className="timeline-frame">
              frame {replay.frameIndex + 1}/{frames.length}
            </span>
          </span>
          <div className="speed" role="group" aria-label="Playback speed">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={replay.speed === s}
                onClick={() => replay.setSpeed(s)}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export default TimelineScrubber
