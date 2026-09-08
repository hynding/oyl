/**
 * Boot the camis-generated PHP backend (apps/camis-php-oyl/laravel) for e2e runs on the
 * dedicated port with a fresh SQLite DB. Selected by E2E_BACKEND=php in playwright.config.ts;
 * the Strapi counterpart is start-backend.mjs. Playwright's webServer manages the process
 * (health check: GET /api/_health).
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LARAVEL = path.resolve(__dirname, '..', '..', 'camis-php-oyl', 'laravel')
const DB = path.join(LARAVEL, 'database', 'e2e.sqlite')
const PORT = Number(process.env.E2E_BACKEND_PORT ?? 1341)

if (!existsSync(path.join(LARAVEL, 'artisan'))) {
  console.error('[e2e] apps/camis-php-oyl/laravel is not built — run `pnpm php-app build` first')
  process.exit(1)
}

const env = {
  ...process.env,
  APP_ENV: 'testing',
  DB_CONNECTION: 'sqlite',
  DB_DATABASE: DB,
  SANCTUM_TOKEN_EXPIRATION: '',
  // The suite registers a fresh account per test from one address; the production rate
  // (10/min per client) would 429 everything after the tenth. Strapi throttles neither
  // route this way, so lifting it here keeps the two backends comparable.
  CAMIS_AUTH_THROTTLE_PER_MINUTE: '100000',
}

rmSync(DB, { force: true })
writeFileSync(DB, '')
for (const args of [
  ['migrate', '--force'],
  ['db:seed', '--class=RolePermissionSeeder', '--force'],
]) {
  const res = spawnSync('php', ['artisan', ...args], { cwd: LARAVEL, env, stdio: 'inherit' })
  if (res.status !== 0) {
    console.error(`[e2e] php artisan ${args.join(' ')} failed`)
    process.exit(1)
  }
}

const server = spawn('php', ['artisan', 'serve', '--host=127.0.0.1', `--port=${PORT}`], {
  cwd: LARAVEL,
  env,
  stdio: 'inherit',
})
process.on('SIGTERM', () => server.kill('SIGTERM'))
process.on('SIGINT', () => server.kill('SIGINT'))
server.on('exit', (code) => process.exit(code ?? 0))
console.log(`[e2e] php backend starting on http://localhost:${PORT} (db: laravel/database/e2e.sqlite)`)
