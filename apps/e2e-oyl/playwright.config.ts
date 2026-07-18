import { defineConfig, devices } from '@playwright/test'
import { APP_URL, APP_PORT, BACKEND_PORT } from './lib/urls'

/**
 * E2E stack layout (dedicated ports — never collides with native dev on 8041/1340):
 *   - strapi-oyl backend on :1341 (fresh SQLite DB per server start, CORS opened to :8042)
 *   - vanilla-oyl app via http-server on :8042 (SPA fallback proxy, vendored lib rebuilt first)
 *
 * Both servers auto-start (and are reused when already running, so `pnpm e2e` iterates fast).
 * Every test runs on BOTH the desktop and mobile projects unless it opts out.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      // ≤640px triggers the fixed bottom tab bar (oyl-nav) — real mobile emulation (touch, DPR).
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: [
    {
      command: 'node scripts/start-backend.mjs',
      url: `http://localhost:${BACKEND_PORT}/_health`,
      reuseExistingServer: true,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `pnpm -C ../.. vanilla build:lib && pnpm exec http-server ../vanilla-oyl -p ${APP_PORT} -c-1 --proxy "${APP_URL}?" --silent`,
      url: APP_URL,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
