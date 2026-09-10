/**
 * Boot the camis-generated PHP backend (apps/camis-php-oyl/laravel) for e2e runs on the
 * dedicated port, on the SAME database file the Strapi backend uses. Strapi owns the schema, so:
 *   1. run start-backend.mjs as a child (it deletes/recreates apps/strapi-oyl/.tmp/e2e.db, boots
 *      Strapi on the e2e port and seeds the roles through its bootstrap), wait for /_health, stop it;
 *   2. verify the tables with `php artisan camis:strapi-schema-check`;
 *   3. serve PHP on that file with the same JWT_SECRET, so a Strapi-minted session would be
 *      accepted here and vice versa.
 * Selected by E2E_BACKEND=php in playwright.config.ts; Playwright's webServer manages the
 * process (health check: GET /api/_health). Playwright keeps polling while Strapi holds the
 * port because Strapi answers 404 on /api/_health.
 */
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LARAVEL = path.resolve(__dirname, '..', '..', 'camis-php-oyl', 'laravel')
const STRAPI = path.resolve(__dirname, '..', '..', 'strapi-oyl')
const DB = path.join(STRAPI, '.tmp', 'e2e.db')
const PORT = Number(process.env.E2E_BACKEND_PORT ?? 1341)
// Shared with Strapi (start-backend.mjs keeps an already-set value). At least 32 bytes:
// firebase/php-jwt refuses shorter HS256 keys.
const JWT_SECRET = 'e2e-test-jwt-secret-shared-by-strapi-and-php'

if (!existsSync(path.join(LARAVEL, 'artisan'))) {
  console.error('[e2e] apps/camis-php-oyl/laravel is not built — run `pnpm php-app build` first')
  process.exit(1)
}

const waitFor = async (url, status, timeoutMs) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.status === status) return
    } catch {
      // not up yet
    }
    await sleep(500)
  }
  throw new Error(`[e2e] ${url} did not answer ${status} within ${timeoutMs}ms`)
}

// 1. Strapi creates the schema and the roles.
let strapi = null
let server = null
/** A child that has neither exited nor been killed (a killed one reports signalCode). */
const live = (child) =>
  child !== null && child.exitCode === null && child.signalCode === null
const stopStrapi = () => {
  if (live(strapi)) strapi.kill('SIGTERM')
}
// Registered before the spawn below: a signal arriving while Strapi is still booting must
// kill whichever child is live rather than orphan it on the e2e port.
const stopAll = (signal) => {
  if (live(strapi)) strapi.kill(signal)
  if (live(server)) server.kill(signal)
}
process.on('SIGTERM', () => stopAll('SIGTERM'))
process.on('SIGINT', () => stopAll('SIGINT'))
process.on('exit', stopStrapi)

const strapiEnv = { ...process.env, JWT_SECRET }
strapi = spawn(process.execPath, [path.join(__dirname, 'start-backend.mjs')], {
  env: strapiEnv,
  stdio: 'inherit',
})
const strapiExit = once(strapi, 'exit')
// Raced against the health wait: a Strapi that dies during boot (EADDRINUSE from a leftover
// process on the port is the usual cause) fails in seconds instead of polling a port that
// will never answer until Playwright's own timeout fires.
const strapiDied = strapiExit.then(([code, signal]) => {
  throw new Error(
    `[e2e] strapi exited (code ${code}, signal ${signal}) before answering /_health on port ${PORT} — is another process already listening on ${PORT}?`,
  )
})
strapiDied.catch(() => {}) // the health check normally wins the race; this loser must not reject unhandled

try {
  await Promise.race([
    waitFor(`http://localhost:${PORT}/_health`, 204, 120_000),
    strapiDied,
  ])
} catch (err) {
  console.error(String(err))
  stopStrapi()
  process.exit(1)
}
stopStrapi()
await strapiExit
console.log('[e2e] strapi created the e2e database and stopped; starting php on it')

// 2 + 3. PHP on the same file.
const env = {
  ...process.env,
  APP_ENV: 'testing',
  DB_CONNECTION: 'sqlite',
  DB_DATABASE: DB,
  JWT_SECRET,
  CAMIS_EMAIL_CONFIRMATION: 'false',
  // No Laravel-owned tables in the shared database.
  CACHE_STORE: 'file',
  SESSION_DRIVER: 'array',
  QUEUE_CONNECTION: 'sync',
  // The suite registers a fresh account per test from one address; the production rate
  // (10/min per client) would 429 everything after the tenth. Strapi throttles neither
  // route this way, so lifting it here keeps the two backends comparable.
  CAMIS_AUTH_THROTTLE_PER_MINUTE: '100000',
}

const check = spawnSync('php', ['artisan', 'camis:strapi-schema-check'], {
  cwd: LARAVEL,
  env,
  stdio: 'inherit',
})
if (check.status !== 0) {
  console.error(
    '[e2e] camis:strapi-schema-check failed — the Strapi boot did not create the tables the PHP app expects',
  )
  process.exit(1)
}

server = spawn('php', ['artisan', 'serve', '--host=127.0.0.1', `--port=${PORT}`], {
  cwd: LARAVEL,
  env,
  stdio: 'inherit',
})
server.on('exit', (code) => process.exit(code ?? 0))
console.log(
  `[e2e] php backend starting on http://localhost:${PORT} (db: apps/strapi-oyl/.tmp/e2e.db)`,
)
