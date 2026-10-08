import { createApiClient, DayKey, entitiesByKind } from '@oyl/all-of-oyl'
import {
  signal, effect,
  createRouteState, createDataState, createAuthState, googleErrorMessage, createGoogleStore,
  createNoticeState, createBrowserConnectivity, makeRepositories, createProfileStore, resolveTimezone,
  shouldRedirectToLogin, tzNeedsReload, seedAccount,
  isOylKey, SETTINGS_KEY, AUTH_KEY, TZ_RELOADED_KEY, OUTBOX_KEY,
  getApiBaseUrl, getStorageMode, setApiBaseUrl, setStorageMode, defaultApiBaseUrl,
  defaultTimezone, now,
} from '@oyl/all-of-oyl/client'
import { createThemeApplier, createThemeState } from './theme.js'
import { interceptLinks } from './link-interceptor.js'
import { browserDataPorts, type GlobalLike } from './ports.js'
import type { App, BootDeps, BootWindow } from './types.js'

/**
 * The composition root: a port of vanilla-oyl's main.js `boot()` minus DOM construction.
 * Builds every state object in the proven order and returns them for <oyl-app> to wire
 * into components. Pure wiring — `win`/`doc`/`deps` are injectable so the boot order and
 * its decisions are unit-testable against fakes.
 *
 * Online-first, account-required: always build ONE api client + outbox + cache + repos and
 * start the flusher. The server is the source of truth; writes enqueue to the outbox and
 * flush when online (on the `online` event and after each enqueue).
 */
export async function createApp(win: BootWindow, deps: BootDeps = {}): Promise<App> {
  const storage = deps.storage ?? win.localStorage
  const session = deps.sessionStorage ?? win.sessionStorage
  const fetch = deps.fetch ?? win.fetch.bind(win)
  const doc = win.document

  const themeState = createThemeState(storage)
  const routeState = createRouteState(win, { interceptLinks: (navigate) => interceptLinks(win as unknown as Window, navigate) })
  const host = win.location.hostname
  // Deploy-injected API base (see index.html <meta name="oyl-api-base">); '' means hostname rules.
  const metaBase = (doc.querySelector('meta[name="oyl-api-base"]') as { content?: string } | null)?.content ?? ''
  const apiBase = getApiBaseUrl(storage, host, metaBase)
  const apiDefault = defaultApiBaseUrl(host, metaBase)
  const authState = createAuthState(storage, { baseUrl: apiBase, fetch })
  const noticeState = createNoticeState()
  const mode = getStorageMode(storage, host)

  const googleStore = createGoogleStore({ baseUrl: apiBase, fetch, getToken: authState.getToken })
  const googleLoginHref = signal<{ href: string } | null>(null)
  // OAuth return: adopt #google=<jwt> / surface #google_error=<code> BEFORE the login guard
  // runs below, so a fragment-delivered session wins over the "no session → /login" redirect.
  const adoption = await authState.adoptTokenFromHash(win)
  if (adoption.adopted) setStorageMode(storage, 'remote')
  if (adoption.error) noticeState.show(googleErrorMessage(adoption.error))

  const api = createApiClient({ baseUrl: apiBase, fetch, getToken: authState.getToken, onAuthError: () => authState.logout() })
  const connectivity = createBrowserConnectivity(win)
  const ports = browserDataPorts(deps.globals ?? (win as unknown as GlobalLike))
  const { repos, outbox, flush } = makeRepositories(storage, { api, connectivity, newId: ports.newId })
  const profileStore = createProfileStore(repos, storage)
  await profileStore.load()
  const browserTz = defaultTimezone()
  const tz = resolveTimezone(profileStore.profile.get(), browserTz)
  // refresh() boots from ONE GET /bootstrap (all collections in a single round trip);
  // it falls back to per-collection reads if the backend lacks the endpoint.
  const dataState = createDataState(storage, themeState, {
    repos, outbox, timezone: tz, bootstrap: () => api.bootstrap(), estimateStorage: ports.estimateStorage, build: ports.build,
  })

  // Theme applied reactively (the inline head script already set the first paint).
  const applyThemeSettings = createThemeApplier(doc)
  effect(() => applyThemeSettings(themeState.settings.get()))
  routeState.start()

  // Hash-adopted sign-ins never go through the login form, so onAuthenticated never fires —
  // send the user off /login (or /, already redirected to /status by start() above) into the app.
  if (adoption.adopted && (win.location.pathname === '/login' || win.location.pathname === '/')) {
    routeState.navigate('/status', { replace: true })
  }

  // Force the login page in Remote mode with no session (before touching the network).
  if (shouldRedirectToLogin(mode, authState.session.get(), routeState.route.get())) {
    routeState.navigate('/login', { replace: true })
  }

  const flushAndRefresh = () => void flush().then(() => dataState.refreshPending()).catch(() => {})

  const hasSession = !!authState.session.get()
  if (hasSession) {
    try {
      await dataState.refresh()
      // New-device correction: if the pulled profile tz differs from what we built with, reload once.
      await profileStore.load()
      if (tzNeedsReload(tz, profileStore.profile.get(), browserTz) && !session.getItem(TZ_RELOADED_KEY)) {
        session.setItem(TZ_RELOADED_KEY, '1')
        win.location.reload()
      }
    } catch {
      noticeState.show("Couldn't reach the backend — sign in at /login or reload to retry.")
    }
    // Drain any writes queued offline / from a prior session.
    flushAndRefresh()
  }

  // Google affordances: pre-auth config probe feeds the login button; signed-in status feeds
  // Profile. Fire-and-forget — the app renders immediately regardless of network latency.
  // Sequenced (not concurrent): probe() and loadStatus() both write `connection`, and probe()
  // has no "don't downgrade" guard the way loadStatus() does — chaining loadStatus() after
  // probe() guarantees the more authoritative, signed-in-only read is always the last write.
  void googleStore.probe().then(() => {
    const state = googleStore.connection.get().state
    const unconfigured = state === 'unconfigured' || state === 'unknown'
    googleLoginHref.set(unconfigured ? null : { href: `${apiBase}/google/connect?mode=login` })
    // Only hit /google/status when probe() found Google configured — an unconfigured backend
    // 501s that route and the browser logs a console.error for any non-2xx fetch (e2e hygiene).
    if (hasSession && !unconfigured) return googleStore.loadStatus()
  })

  // Flush the outbox whenever connectivity returns online, then refresh the pending indicator.
  connectivity.subscribe((online) => { if (online) flushAndRefresh() })

  let wasSignedIn = !!authState.session.get()
  effect(() => {
    const signedIn = !!authState.session.get()
    if (signedIn && !wasSignedIn) flushAndRefresh()
    wasSignedIn = signedIn
    if (shouldRedirectToLogin(mode, authState.session.get(), routeState.route.get())) {
      // Deferred: this effect deliberately tracks the route (it guards every navigation),
      // so a synchronous navigate() here would write a signal the effect reads (a cycle).
      queueMicrotask(() => {
        if (shouldRedirectToLogin(mode, authState.session.get(), routeState.route.get())) {
          routeState.navigate('/login', { replace: true })
        }
      })
    }
  })

  // Multi-tab coherence: react to writes from other tabs. An outbox write in another tab
  // also triggers a flush here (the originating tab flushes on its own online/sign-in path).
  const debouncedRefresh = debounce(() => void dataState.refresh(), 150)
  win.addEventListener('storage', (e: StorageEvent) => {
    if (!e.key || !isOylKey(e.key)) return
    if (e.key === SETTINGS_KEY) themeState.refresh()
    else if (e.key === AUTH_KEY) authState.refresh()
    else if (e.key === OUTBOX_KEY) flushAndRefresh()
    else debouncedRefresh()
  })

  win.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const r = e.reason as { name?: string; code?: string } | null
    if (r && (r.name === 'HttpRepositoryError' || r.code === 'REVISION_CONFLICT')) {
      noticeState.show('A change could not be saved to the server — it will retry.')
      e.preventDefault()
    }
  })

  // ?seed convenience for dev/demo: populate an EMPTY signed-in account through the
  // stores (writes flush to the server). Non-empty accounts are left alone — reloads
  // with the query present must not duplicate data.
  if (new URLSearchParams(win.location.search).has('seed') && hasSession && accountIsEmpty(dataState)) {
    await seedAccount(dataState, DayKey.from(now(), tz))
  }

  return {
    win, storage, mode, apiBase, apiDefault, tz,
    routeState, authState, noticeState, themeState, dataState, profileStore, googleStore, googleLoginHref,
    flush: flushAndRefresh,
    connection: {
      mode, apiBaseUrl: apiBase, defaultApiBaseUrl: apiDefault,
      onApply: (m, url) => { setStorageMode(storage, m); setApiBaseUrl(storage, url); win.location.reload() },
    },
    onAuthenticated: () => { setStorageMode(storage, 'remote'); win.location.assign('/status') },
  }
}

/**
 * Whether the account holds no records yet — from the boot-refresh counts snapshot.
 * Only PERSONAL (owner-scoped) collections count: the shared catalog (public-or-mine)
 * can be non-empty for a brand-new account and says nothing about ITS data.
 */
export function accountIsEmpty(dataState: { counts: { get(): Record<string, number> } }): boolean {
  const counts = dataState.counts.get()
  return entitiesByKind('personal').every((name) => (counts[name] ?? 0) === 0)
}

function debounce(fn: () => void, ms: number): () => void {
  let t: ReturnType<typeof setTimeout> | undefined
  return () => { clearTimeout(t); t = setTimeout(fn, ms) }
}
