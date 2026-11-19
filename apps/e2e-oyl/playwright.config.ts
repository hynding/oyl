import { defineConfig, devices } from '@playwright/test'
import { APP_URL, APP_PORT, BACKEND_PORT, FAKE_GOOGLE_PORT } from './lib/urls'

/**
 * E2E stack layout (dedicated ports — never collides with native dev on 3344/1340):
 *   - strapi-oyl backend on :1341 (fresh SQLite DB per server start, CORS opened to :8043)
 *   - the app (apps/stencil-oyl) via http-server on :8043 from its production www/ build
 *     (SPA fallback proxy; the build chains all-of-oyl + ui-oyl)
 *
 * All servers auto-start (and are reused when already running, so `pnpm e2e` iterates fast).
 * Every test runs on BOTH the desktop and mobile projects unless it opts out.
 *
 * E2E_BACKEND=php runs the same suite against the camis-generated PHP backend
 * (apps/camis-php-oyl) — the Strapi-compatibility gate.
 */
const PHP = process.env.E2E_BACKEND === 'php'
/**
 * Optional: a Chromium binary to launch instead of Playwright's managed download (sandboxes
 * without CDN access set PW_CHROMIUM_PATH to a preinstalled browser). Unset = default.
 */
const launchOptions = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}

export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  use: {
    baseURL: APP_URL,
    launchOptions,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testDir: './tests',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      // ≤640px triggers the fixed bottom tab bar (oyl-nav) — real mobile emulation (touch, DPR).
      name: 'mobile',
      testDir: './tests',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: [
    {
      command: 'node scripts/start-fake-google.mjs',
      url: `http://localhost:${FAKE_GOOGLE_PORT}/health`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: PHP ? 'node scripts/start-php-backend.mjs' : 'node scripts/start-backend.mjs',
      url: PHP
        ? `http://localhost:${BACKEND_PORT}/api/_health`
        : `http://localhost:${BACKEND_PORT}/_health`,
      reuseExistingServer: true,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      // The app: prod build (chains all-of-oyl + ui-oyl builds), then the static www/ with SPA fallback.
      command: `pnpm -C ../.. stencil build && pnpm exec http-server ../stencil-oyl/www -p ${APP_PORT} -c-1 --proxy "${APP_URL}?" --silent`,
      url: APP_URL,
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
})
