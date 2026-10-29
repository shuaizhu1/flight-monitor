import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createOpenSkyClient, credentialsFromEnv } from './server/opensky.ts'
import { openskyProxy } from './server/openskyProxy.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Only OPENSKY_* vars are loaded here; without a VITE_ prefix they are never
  // exposed to client code
  const env = loadEnv(mode, process.cwd(), 'OPENSKY_')

  return {
    plugins: [react(), openskyProxy(createOpenSkyClient(credentialsFromEnv(env)))],
  }
})
