import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve, sep } from 'node:path'
import type { Plugin } from 'vite'

// Recordings written by scripts/record-opensky.ts
const RECORDINGS_DIR = resolve('recordings')
// Plain file names only, so a request can't escape the recordings folder
const RECORDING_NAME = /^[\w.-]+\.jsonl$/

export type RecordingInfo = { name: string; size: number; modified: string }

async function listRecordings(): Promise<RecordingInfo[]> {
  let names: string[]
  try {
    names = await readdir(RECORDINGS_DIR)
  } catch {
    return [] // nothing recorded yet
  }
  const recordings = await Promise.all(
    names
      .filter((name) => RECORDING_NAME.test(name))
      .map(async (name) => {
        const info = await stat(resolve(RECORDINGS_DIR, name))
        return { name, size: info.size, modified: info.mtime.toISOString() }
      }),
  )
  return recordings.sort((a, b) => b.modified.localeCompare(a.modified))
}

function notFound(res: ServerResponse) {
  res.statusCode = 404
  res.end('Recording not found')
}

// Serves recordings/ to the replay timeline on the dev and preview servers:
//   GET /api/recordings         → RecordingInfo[], newest first
//   GET /api/recordings/<name>  → the raw JSON Lines file
export function recordingsPlugin(): Plugin {
  async function handle(req: IncomingMessage, res: ServerResponse) {
    // Mounted at /api/recordings, so req.url is "/" or "/<name>"
    const name = decodeURIComponent((req.url ?? '/').split('?')[0].slice(1))

    if (name === '') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(await listRecordings()))
      return
    }

    const file = resolve(RECORDINGS_DIR, name)
    if (!RECORDING_NAME.test(name) || !file.startsWith(RECORDINGS_DIR + sep)) return notFound(res)
    try {
      await stat(file)
    } catch {
      return notFound(res)
    }
    res.setHeader('content-type', 'application/x-ndjson')
    createReadStream(file).pipe(res)
  }

  return {
    name: 'recordings',
    configureServer(server) {
      server.middlewares.use('/api/recordings', handle)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/recordings', handle)
    },
  }
}
