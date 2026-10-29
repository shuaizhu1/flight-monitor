import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts so tests don't load the dev-server plugins
// (OpenSky proxy, recordings) or read OpenSky credentials from .env.local
export default defineConfig({
  test: {
    // Hook tests opt into a browser-like environment with a
    // `// @vitest-environment jsdom` comment
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts', 'api/**/*.test.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
})
