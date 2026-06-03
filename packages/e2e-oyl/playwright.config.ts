import { defineConfig, devices } from '@playwright/test'

const STRAPI_PORT = Number(process.env.E2E_STRAPI_PORT ?? 3337)
const VITE_PORT = Number(process.env.E2E_VITE_PORT ?? 5173)

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
      command: `PORT=${STRAPI_PORT} pnpm --filter @oyl/strapi-oyl develop`,
      port: STRAPI_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `pnpm --filter @oyl/react-oyl dev -- --port ${VITE_PORT}`,
      port: VITE_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
