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

function TimelineScrubber({ replay, notice }: { replay: Replay; notice?: string | null }) {
  const { data: recordings, error: listError } = useRecordingList()
  const { frames } = replay

  return (
    <section
      aria-label="Replay timeline"
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, margin: '12px 0' }}
    >
      <label>
        Recording{' '}
        <select value={replay.selected ?? ''} onChange={(e) => replay.select(e.target.value || null)}>
          <option value="">Live</option>
          {recordings?.map((r) => (
            <option key={r.name} value={r.name}>
              {recordingLabel(r)}
            </option>
          ))}
        </select>
      </label>

      {notice && <span role="status">{notice}</span>}
      {recordings?.length === 0 && (
        <span>
          No recordings yet — run <code>npm run record</code>
        </span>
      )}
      {listError && <span>Couldn't list recordings: {listError.message}</span>}
      {replay.active && replay.isLoading && <span>Loading recording…</span>}
      {replay.error && <span>Couldn't load recording: {replay.error.message}</span>}

      {replay.active && frames && frames.length > 0 && (
        <>
          <button type="button" onClick={replay.playing ? replay.pause : replay.play}>
            {replay.playing ? 'Pause' : 'Play'}
          </button>
          <input
            type="range"
            aria-label="Replay position"
            min={0}
            max={replay.duration}
            step="any"
            value={replay.position}
            onChange={(e) => replay.seek(Number(e.target.value))}
            style={{ flex: 1, minWidth: 160 }}
          />
          <span>
            {new Date(replay.time).toLocaleTimeString()} · frame {replay.frameIndex + 1}/{frames.length}
          </span>
          <label>
            Speed{' '}
            <select value={replay.speed} onChange={(e) => replay.setSpeed(Number(e.target.value))}>
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => replay.select(null)}>
            Back to live
          </button>
        </>
      )}
    </section>
  )
}

export default TimelineScrubber
