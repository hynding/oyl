import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const STRAPI_PORT = Number(process.env.E2E_STRAPI_PORT ?? 3337)
const VITE_PORT = Number(process.env.E2E_VITE_PORT ?? 5173)

// Load the e2e Strapi env (isolated SQLite, dev-only secrets) so the harness
// never touches whatever the developer's local .env points at.
const __dirname = dirname(fileURLToPath(import.meta.url))
const strapiEnv: Record<string, string> = Object.fromEntries(
  readFileSync(join(__dirname, '.env.e2e'), 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1)] as const
    }),
)
strapiEnv.PORT = String(STRAPI_PORT)

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${VITE_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: [
    {
      command: `pnpm --filter @oyl/strapi-oyl develop`,
      port: STRAPI_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: strapiEnv,
    },
    {
      command: `pnpm --filter @oyl/react-oyl dev -- --port ${VITE_PORT}`,
      port: VITE_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        VITE_STRAPI_API_BASE_URL: `http://localhost:${STRAPI_PORT}/api`,
      },
    },
  ],
})
