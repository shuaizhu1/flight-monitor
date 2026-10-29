/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Mapbox public access token (pk.…), set in .env.local
  readonly VITE_MAPBOX_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
