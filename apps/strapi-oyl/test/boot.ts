/**
 * Programmatic Strapi 5.47 boot harness for smoke tests.
 *
 * Uses createRequire to force the CJS entry of @strapi/strapi (dist/index.js)
 * rather than the ESM entry (dist/index.mjs).  The ESM build of @strapi/core
 * has bare directory imports (e.g. `lodash/fp`) that Node's ESM resolver
 * rejects, so we must stay in CJS-land for all Strapi packages.
 *
 * Bypasses `compileStrapi` (which would re-run tsc) and calls `createStrapi`
 * directly with the already-compiled `dist/` directory.  Run `pnpm build`
 * (or the package `build` script) before running tests if you change src.
 *
 * Boot API (verified against @strapi/core@5.47.1):
 *   createStrapi({ appDir, distDir }) → Core.Strapi
 *   app.load()                        → loads plugins, content-types, routes
 *   app.server.listen(port, cb)       → delegates to httpServer.listen;
 *                                       auto-mounts if not already mounted
 *   app.server.httpServer.address()   → { port } after listen
 *   app.destroy()                     → graceful shutdown (does NOT exit),
 *                                       BUT calls process.removeAllListeners()
 *                                       which breaks the vitest forked-worker
 *                                       IPC pipe — see stop() workaround below
 *
 * IMPORTANT quirks of createStrapi in @strapi/core@5.47.1:
 *   1. Registers SIGTERM/SIGINT handlers via destroyOnSignal() → process.exit()
 *      We remove those after boot so the vitest fork isn't killed.
 *   2. app.destroy() calls process.removeAllListeners() — strips vitest's IPC
 *      listeners, causing an EPIPE when vitest tries to talk to the fork after
 *      afterAll.  We snapshot all listeners before destroy() and restore them
 *      afterward.
 */
import { createRequire } from 'module'
import path from 'path'

// tsconfig is CommonJS so __dirname is available natively
const req = createRequire(__dirname + '/dummy')  // need a path within this dir
const { createStrapi } = req('@strapi/strapi') as typeof import('@strapi/strapi')

const APP_DIR = path.resolve(__dirname, '..')
const DIST_DIR = path.resolve(APP_DIR, 'dist')

let app: ReturnType<typeof createStrapi> | null = null

export async function boot(): Promise<{ baseUrl: string; stop: () => Promise<void> }> {
  // Environment — SQLite test DB, minimal secrets
  process.env['NODE_ENV'] ??= 'test'
  process.env['DATABASE_CLIENT'] = 'sqlite'
  process.env['DATABASE_FILENAME'] = `.tmp/test-${process.pid}-${Date.now()}.db`
  process.env['APP_KEYS'] ??= 'k1aaaaaaaaaaaaaaaaaaaa==,k2aaaaaaaaaaaaaaaaaaaa=='
  process.env['JWT_SECRET'] ??= 'test'
  process.env['ADMIN_JWT_SECRET'] ??= 'test'
  process.env['API_TOKEN_SALT'] ??= 'test'
  process.env['TRANSFER_TOKEN_SALT'] ??= 'test'
  process.env['ENCRYPTION_KEY'] ??= 'testtesttesttesttesttesttesttest'

  // Snapshot existing SIGTERM/SIGINT listeners so we can remove the ones
  // Strapi adds (they call process.exit() and would kill the vitest fork).
  const sigtermBefore = process.listeners('SIGTERM').slice()
  const sigintBefore = process.listeners('SIGINT').slice()

  // Create and load the Strapi instance (no HTTP binding yet).
  // createStrapi also registers signal handlers via destroyOnSignal().
  app = createStrapi({ appDir: APP_DIR, distDir: DIST_DIR })
  await app.load()

  // Remove any new SIGTERM/SIGINT listeners Strapi added
  for (const fn of process.listeners('SIGTERM')) {
    if (!sigtermBefore.includes(fn)) process.removeListener('SIGTERM', fn as NodeJS.SignalsListener)
  }
  for (const fn of process.listeners('SIGINT')) {
    if (!sigintBefore.includes(fn)) process.removeListener('SIGINT', fn as NodeJS.SignalsListener)
  }

  // Bind to a random free port (port 0) and wait for the OS to assign one.
  // app.server.listen auto-mounts routes if not already mounted.
  const port = await new Promise<number>((resolve, reject) => {
    app!.server.listen(0, (err?: Error) => {
      if (err) return reject(err)
      const addr = app!.server.httpServer.address()
      if (!addr || typeof addr === 'string') return reject(new Error('Unexpected address: ' + addr))
      resolve(addr.port)
    })
  })

  const baseUrl = `http://127.0.0.1:${port}/api`

  return {
    baseUrl,
    stop: async () => {
      if (!app) return

      // app.destroy() calls process.removeAllListeners() which strips vitest's
      // IPC listeners, causing EPIPE when vitest communicates with the fork
      // after afterAll.  Workaround: snapshot all listeners, call destroy(),
      // then re-attach any that were removed.
      type Listener = (...args: unknown[]) => unknown
      const eventNames = process.eventNames() as (string | symbol)[]
      const listenerSnapshot = new Map<string | symbol, Listener[]>()
      for (const name of eventNames) {
        listenerSnapshot.set(name, (process.listeners(name as any) as Listener[]).slice())
      }

      await app.destroy()
      app = null

      // Restore any listeners that destroy() stripped
      for (const [name, fns] of listenerSnapshot) {
        const remaining = process.listeners(name as any) as Listener[]
        for (const fn of fns) {
          if (!remaining.includes(fn)) {
            process.on(name as any, fn)
          }
        }
      }
    },
  }
}

/** Clear all oyl-record rows between tests. */
export async function truncateRecords(): Promise<void> {
  if (!app) throw new Error('boot() must be called before truncateRecords()')
  await app.db.query('api::oyl-record.oyl-record').deleteMany({ where: {} })
}
