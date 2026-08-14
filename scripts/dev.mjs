#!/usr/bin/env node
/**
 * Run the full local stack: strapi-oyl (:1340) + vanilla-oyl (:8041).
 *
 * Mirrors the webServer pair in apps/e2e-oyl/playwright.config.ts, but for interactive
 * dev: native ports (which DEFAULT_API_BASE_URL and the dev CORS allowlist already expect),
 * the committed .env + SQLite db rather than a throwaway one, and prefixed interleaved logs.
 *
 *   pnpm dev            start both, wait for health, print URLs
 *   pnpm dev --watch    also rebuild + revendor @oyl/all-of-oyl when its src/ changes
 *   pnpm dev --fresh    delete apps/strapi-oyl/.tmp/data.db first
 *
 * Deliberately NOT on the e2e ports (1341/8042): Playwright sets reuseExistingServer,
 * so a shared port would make `pnpm e2e` silently reuse this stack and write test users
 * into the dev database.
 */
import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STRAPI_DIR = path.join(ROOT, 'apps', 'strapi-oyl')
const LIB_SRC = path.join(ROOT, 'packages', 'all-of-oyl', 'src')
const API_PORT = 1340
const APP_PORT = 8041

const USAGE = `Usage: pnpm dev [--watch] [--fresh]

  --watch   rebuild + revendor @oyl/all-of-oyl whenever its src/ changes
  --fresh   delete apps/strapi-oyl/.tmp/data.db before starting`

const flags = new Set(process.argv.slice(2))
if (flags.has('--help') || flags.has('-h')) {
  console.log(USAGE)
  process.exit(0)
}
const WATCH = flags.has('--watch')
const FRESH = flags.has('--fresh')

const unknown = [...flags].filter((f) => !['--watch', '--fresh'].includes(f))
if (unknown.length) {
  console.error(`Unknown option(s): ${unknown.join(', ')}\n\n${USAGE}`)
  process.exit(1)
}

/** @type {import('node:child_process').ChildProcess[]} */
const children = []
let shuttingDown = false

// Only colorize a real terminal — `pnpm dev > dev.log` should not litter the file with escapes.
const dim = (s) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s)

/** @param {string} tag @param {string} line */
function log(tag, line) {
  process.stdout.write(`${dim(`[${tag}]`)} ${line}`)
}

/** PID listening on `port`, or null. Turns a bare EADDRINUSE into an actionable message. */
function portHolder(port) {
  const res = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
  return (res.stdout || '').trim().split('\n').filter(Boolean).join(' ') || null
}

/** Whether `host:port` can be bound right now. @returns {Promise<boolean>} */
function canBind(host, port) {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => srv.close(() => resolve(true)))
    srv.listen(port, host)
  })
}

/**
 * Probe with lsof AND both bind addresses. No single check is sufficient:
 *  - lsof misses a listener owned by another user, and is absent on some systems;
 *  - with SO_REUSEADDR (Node's default) macOS happily binds 127.0.0.1:P while 0.0.0.0:P is
 *    held, *and* binds 0.0.0.0:P while 127.0.0.1:P is held — so a single-address probe calls
 *    a busy port free and we fall through to a raw EADDRINUSE from the child instead.
 * Getting this wrong is not cosmetic: a second `strapi develop` cleans and rebuilds dist/
 * underneath the already-running one before it discovers it cannot bind.
 */
async function assertPortFree(port, label) {
  const pid = portHolder(port)
  const free = !pid && (await canBind('0.0.0.0', port)) && (await canBind('127.0.0.1', port))
  if (free) return
  // Compose publishes 8041 for the app but 3340 (not 1340) for the backend, so only the
  // app port can collide with the composed stack; 1340 is always a stray native process.
  const hint =
    port === APP_PORT
      ? 'The composed `vanilla` service binds 8041 too — check `docker compose ps`.'
      : 'Most likely a stray `strapi develop` from an earlier session.'
  console.error(
    `\nPort ${port} (${label}) is already in use${pid ? ` by pid ${pid}` : ''}.\n` +
      (pid ? `Stop it with:  kill ${pid}\n` : '') +
      `${hint}\n`,
  )
  process.exit(1)
}

/** Send `signal` to the child's whole process group (strapi develop forks a reload child). */
function killGroup(child, signal) {
  if (child.pid == null) return
  try {
    process.kill(-child.pid, signal)
  } catch {
    /* group already gone */
  }
}

/**
 * Spawn detached so each child gets its own process group and we can signal the whole tree.
 * Detached also means the terminal's Ctrl-C reaches only this script, so shutdown is ours alone.
 */
function run(tag, cmd, args) {
  const child = spawn(cmd, args, { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)
  for (const stream of [child.stdout, child.stderr]) {
    let buf = ''
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      buf += chunk
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) log(tag, line + '\n')
    })
    // A crashing child often writes its last line without a trailing newline; flush the
    // remainder or we would swallow exactly the message explaining the failure.
    stream.on('end', () => {
      if (buf) log(tag, buf + '\n')
      buf = ''
    })
  }
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    console.error(`\n[${tag}] exited (${signal ?? `code ${code}`}) — shutting down the stack.`)
    shutdown(code ?? 1)
  })
  return child
}

async function waitFor(url, label, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (shuttingDown) return false
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (res.status < 500) return true
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  console.error(`Timed out after ${timeoutMs / 1000}s waiting for ${label} at ${url}`)
  shutdown(1)
  return false
}

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  const live = children.filter((c) => c.exitCode === null && c.signalCode === null)
  for (const child of live) killGroup(child, 'SIGTERM')
  // Ref'd timer: hold the loop open long enough for the groups to unwind, then force it.
  setTimeout(() => {
    for (const child of live) killGroup(child, 'SIGKILL')
    process.exit(code)
  }, 2000)
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

// --- preflight ---------------------------------------------------------------
if (!fs.existsSync(path.join(STRAPI_DIR, '.env'))) {
  console.error(
    `Missing apps/strapi-oyl/.env — copy the example and fill in real secrets:\n` +
      `  cp apps/strapi-oyl/.env.example apps/strapi-oyl/.env\n` +
      `  # APP_KEYS (two, comma-separated) / JWT_SECRET / ADMIN_JWT_SECRET /\n` +
      `  # API_TOKEN_SALT / TRANSFER_TOKEN_SALT:\n` +
      `  #   node -e "console.log(require('crypto').randomBytes(16).toString('base64'))"\n` +
      `  # ENCRYPTION_KEY must be exactly 32 characters.\n`,
  )
  process.exit(1)
}
await assertPortFree(API_PORT, 'strapi-oyl')
await assertPortFree(APP_PORT, 'vanilla-oyl')

if (FRESH) {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    fs.rmSync(path.join(STRAPI_DIR, `.tmp/data.db${suffix}`), { force: true })
  }
  console.log('Wiped apps/strapi-oyl/.tmp/data.db — Strapi will re-bootstrap roles + permissions.')
}

// --- build the shared lib before serving anything ----------------------------
// index.html's importmap points at /vendor/all-of-oyl/index.js. Serving before this lands
// would return the SPA fallback HTML for that path instead of the module (see CLAUDE.md).
console.log('Building @oyl/all-of-oyl and vendoring it into apps/vanilla-oyl/vendor …')
if (spawnSync('pnpm', ['vanilla', 'build:lib'], { cwd: ROOT, stdio: 'inherit' }).status !== 0) {
  console.error('build:lib failed — fix the build before starting the stack.')
  process.exit(1)
}

// --- start -------------------------------------------------------------------
run('api', 'pnpm', ['--filter', '@oyl/strapi-oyl-app', 'develop'])
run('app', 'pnpm', [
  '--filter', '@oyl/vanilla-oyl', 'exec',
  'http-server', '.',
  '-p', String(APP_PORT),
  '-c-1',
  '--proxy', `http://localhost:${APP_PORT}?`,
  '--silent',
])

/**
 * Rebuild + revendor the shared lib. Async on purpose: spawnSync would block the event loop
 * for the whole build, stalling the api/app log pumps and delaying Ctrl-C. Not detached and
 * not tracked in `children` — a build interrupted mid-write would leave a partial vendor/
 * copy, so we let an in-flight one finish rather than signalling it on shutdown.
 */
function rebuildLib() {
  return new Promise((resolve) => {
    const proc = spawn('pnpm', ['vanilla', 'build:lib'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    for (const stream of [proc.stdout, proc.stderr]) {
      stream.setEncoding('utf8')
      stream.on('data', (chunk) => {
        out += chunk
      })
    }
    proc.on('error', (err) => resolve({ ok: false, out: String(err) }))
    proc.on('exit', (code) => resolve({ ok: code === 0, out }))
  })
}

if (WATCH) {
  let timer = null
  let building = false
  let dirty = false

  /** @param {string} file */
  async function buildOnce(file) {
    // Coalesce: edits landing during a build queue exactly one follow-up rebuild, so the
    // vendored copy always ends up reflecting the final state of src/.
    if (building) {
      dirty = true
      return
    }
    building = true
    log('lib', `change in ${file} — rebuilding\n`)
    const { ok, out } = await rebuildLib()
    building = false
    log('lib', ok ? 'rebuilt — reload the browser\n' : `rebuild FAILED\n${out}`)
    if (dirty) {
      dirty = false
      void buildOnce('changes during the last build')
    }
  }

  fs.watch(LIB_SRC, { recursive: true }, (_event, file) => {
    if (!file || file.endsWith('.test.ts')) return
    clearTimeout(timer)
    timer = setTimeout(() => void buildOnce(file), 200)
  })
}

/**
 * Park forever and let shutdown()'s timer own the exit. Calling process.exit() here instead
 * would skip the SIGTERM→SIGKILL escalation and could leave a child still holding its port —
 * the exact orphan the preflight then has to diagnose on the next run.
 */
const park = () => new Promise(() => {})

if (!(await waitFor(`http://localhost:${API_PORT}/_health`, 'strapi-oyl'))) await park()
if (!(await waitFor(`http://localhost:${APP_PORT}/`, 'vanilla-oyl'))) await park()

console.log(`
  OYL stack is up.

    app     http://localhost:${APP_PORT}
    api     http://localhost:${API_PORT}/api
    admin   http://localhost:${API_PORT}/admin

  ${WATCH ? 'Watching packages/all-of-oyl/src — edits rebuild the vendored lib.' : 'Run with --watch to rebuild the shared lib on change.'}
  New here? Register an account at http://localhost:${APP_PORT}/register.

  Ctrl-C stops both.
`)
