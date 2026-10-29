# Flight Monitor

Live aircraft around San Francisco International (SFO), drawn on a Mapbox globe
with a table of the five nearest flights. Data comes from the
[OpenSky Network](https://opensky-network.org) API and refreshes every 10
seconds. Recorded sessions can be replayed with a timeline scrubber, and the app
falls back to a recording when live data is unavailable.

## Requirements

- Node.js 24 or newer (the recorder script runs TypeScript directly with Node)
- A [Mapbox](https://account.mapbox.com/access-tokens/) public access token
  (`pk.…`) for the globe. Without one the table still works and the globe shows
  setup instructions.
- Optional: an OpenSky API client for a higher rate limit (see below)

## Setup

```bash
npm install
```

Create `.env.local` in the project root (it's gitignored):

```bash
# Mapbox public token for the globe; exposed to the browser, which is fine for pk.… tokens
VITE_MAPBOX_TOKEN=pk.your-token

# Optional OpenSky API client from https://opensky-network.org/my-opensky/account
# Kept server-side only; never prefix these with VITE_
OPENSKY_CLIENT_ID=your-client-id
OPENSKY_CLIENT_SECRET=your-client-secret
```

Without OpenSky credentials the app uses anonymous access, which allows roughly
400 requests a day. At one request every 10 seconds, that runs out after about an
hour of polling. With an account the limit is about 4,000 a day. When the limit
is reached, the app pauses until OpenSky says to retry and shows when it will
resume.

## Run the app

```bash
npm run dev
```

Open the URL Vite prints, usually <http://localhost:5173>. On startup the dev
server logs whether OpenSky is using your account or anonymous access.

The dev server proxies `/opensky/*` to the OpenSky API and attaches the OAuth
token on the server, so your client secret never reaches the browser. Restart
`npm run dev` after changing `.env.local`.

## Record and replay flights

Record live OpenSky responses for the same area the app shows:

```bash
npm run record -- --hours 3 --interval 30
```

- `--hours`: how long to record (default 3)
- `--interval`: seconds between requests (default 10). Without OpenSky
  credentials, use 30 or more to stay within the anonymous limit.

Each successful response is appended as one line to
`recordings/opensky-<start time>.jsonl`. Press Ctrl-C to stop early; everything
recorded so far is kept. To get a single JSON array:

```bash
jq -s . recordings/opensky-<start time>.jsonl > recording.json
```

While `npm run dev` is running, recordings in `recordings/` appear in the app's
timeline, where you can play and scrub through them. Replaying sends no OpenSky
requests.

## Production builds

Live data only works with `npm run dev`. A production build (`npm run build`,
`npm run preview`, or a Vercel deployment) never contacts OpenSky. It plays the
newest demo recording in `public/recordings/` as soon as it loads, and hides the
"Live" option. To ship a different recording, copy its `.jsonl` file into
`public/recordings/` and add it to `public/recordings/index.json`.

## Other scripts

| Command | What it does |
| --- | --- |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint with Oxlint |
| `npm run build` | Type-check and build for production into `dist/` |
| `npm run preview` | Serve the production build locally |

