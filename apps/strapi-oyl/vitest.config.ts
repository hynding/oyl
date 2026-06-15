import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Node environment (default) — no browser/dom needed for Strapi
  },
})
