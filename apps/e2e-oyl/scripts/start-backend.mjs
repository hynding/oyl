/**
 * Boot the strapi-oyl backend for e2e runs on a dedicated port with a fresh SQLite DB.
 *
 * Mirrors apps/strapi-oyl/test/boot.ts: createRequire forces the CJS entry of
 * @strapi/strapi (the ESM entry has bare directory imports Node rejects), and
 * createStrapi is called directly against the already-compiled dist/ (skipping the
 * tsc re-run compileStrapi would do). If dist/ is missing we run `pnpm build` once.
 *
 * The process stays in the foreground; Playwright's webServer manages its lifecycle
 * (health check: GET /_health).
 */
import { createRequire } from 'module'
import { spawnSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(__dirname, '..', '..', 'strapi-oyl')
const DIST_DIR = path.join(APP_DIR, 'dist')

const PORT = Number(process.env.E2E_BACKEND_PORT ?? 1341)
const APP_ORIGIN = process.env.E2E_APP_ORIGIN ?? 'http://localhost:8042'

// Environment — SQLite test DB (fresh per server start), minimal secrets, CORS open to the e2e app.
process.env.NODE_ENV = 'test'
process.env.DATABASE_CLIENT = 'sqlite'
process.env.DATABASE_FILENAME = '.tmp/e2e.db'
process.env.APP_KEYS ??= 'k1aaaaaaaaaaaaaaaaaaaa==,k2aaaaaaaaaaaaaaaaaaaa=='
process.env.JWT_SECRET ??= 'e2e-test'
process.env.ADMIN_JWT_SECRET ??= 'e2e-test'
process.env.API_TOKEN_SALT ??= 'e2e-test'
process.env.TRANSFER_TOKEN_SALT ??= 'e2e-test'
process.env.ENCRYPTION_KEY ??= 'e2etest-e2etest-e2etest-e2etest-'
process.env.CORS_ORIGINS = `${APP_ORIGIN},http://127.0.0.1:8042`

// DATABASE_FILENAME is resolved relative to the CWD — run from the strapi app dir.
process.chdir(APP_DIR)

// Fresh DB every server start (tests additionally isolate via per-test users).
for (const suffix of ['', '-journal', '-wal', '-shm']) {
  fs.rmSync(path.join(APP_DIR, `.tmp/e2e.db${suffix}`), { force: true })
}

if (!fs.existsSync(path.join(DIST_DIR, 'src', 'index.js'))) {
  console.log('[e2e] strapi dist/ missing — running strapi build once')
  const res = spawnSync('pnpm', ['build'], { cwd: APP_DIR, stdio: 'inherit' })
  if (res.status !== 0) {
    console.error('[e2e] strapi build failed')
    process.exit(1)
  }
}

const req = createRequire(path.join(APP_DIR, 'package.json'))
const { createStrapi } = req('@strapi/strapi')

const app = createStrapi({ appDir: APP_DIR, distDir: DIST_DIR })
await app.load()
await new Promise((resolve, reject) => {
  app.server.listen(PORT, (err) => (err ? reject(err) : resolve(undefined)))
})
console.log(`[e2e] strapi ready on http://localhost:${PORT} (db: .tmp/e2e.db)`)
