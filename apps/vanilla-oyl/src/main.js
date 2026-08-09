import { effect } from './lib/reactive/effect.js'
import { createThemeApplier } from './theme/theme-manager.js'
import { createThemeState } from './state/theme.js'
import { createLayoutState } from './state/layout.js'
import { createRouteState } from './state/route.js'
import { createDataState } from './state/data.js'
import { createAuthState } from './state/auth.js'
import { seedAccount } from './storage/seed.js'
import { exportData, importData } from './storage/backup.js'
import { isOylKey, SETTINGS_KEY, AUTH_KEY, TZ_RELOADED_KEY, OUTBOX_KEY } from './storage/keys.js'
import { getApiBaseUrl, getStorageMode, setApiBaseUrl, setStorageMode, defaultApiBaseUrl } from './storage/config.js'
import { defaultTimezone, now } from './storage/clock.js'
import { defineShell } from './components/oyl-shell.js'
import { defineThemeToggle } from './components/oyl-theme-toggle.js'
import { defineRouter } from './components/oyl-router.js'
import { defineStatusPanel } from './components/oyl-status-panel.js'
import { defineNav } from './components/oyl-nav.js'
import { defineJournal } from './components/oyl-journal.js'
import { definePlanner } from './components/oyl-planner.js'
import { defineVault } from './components/oyl-vault.js'
import { defineGoals } from './components/oyl-goals.js'
import { defineInsights } from './components/oyl-insights.js'
import { defineFinance } from './components/oyl-finance.js'
import { defineNutrition } from './components/oyl-nutrition.js'
import { createNoticeState } from './state/notice.js'
import { defineNotice } from './components/oyl-notice.js'
import { createApiClient, DayKey, entitiesByKind } from '@oyl/all-of-oyl'
import { createBrowserConnectivity } from './storage/connectivity.js'
import { debounce } from './lib/debounce.js'
import { makeRepositories } from './storage/bootstrap.js'
import { createProfileStore, resolveTimezone } from './state/profile-store.js'
import { shouldRedirectToLogin, tzNeedsReload } from './state/auth-guard.js'
import { defineLogin } from './components/oyl-login.js'
import { defineRegister } from './components/oyl-register.js'
import { defineProfile } from './components/oyl-profile.js'
import { defineAccountMenu } from './components/oyl-account-menu.js'
import { defineLayoutPicker } from './components/oyl-layout-picker.js'
import { createWidgetContext } from './widgets/context.js'
import { defineWidgets } from './widgets/oyl-widgets.js'
import { byId } from './layouts/layout-catalog.js'

async function boot() {
  const storage = window.localStorage
  defineShell()
  defineThemeToggle()
  defineRouter()
  defineStatusPanel()
  defineNav()
  defineJournal()
  definePlanner()
  defineVault()
  defineGoals()
  defineInsights()
  defineFinance()
  defineNutrition()
  defineNotice()
  defineLogin(); defineRegister(); defineProfile(); defineAccountMenu()
  defineLayoutPicker()

  const themeState = createThemeState(storage)
  const layoutState = createLayoutState(storage)
  const routeState = createRouteState(window)
  const host = window.location.hostname
  const authState = createAuthState(storage, { baseUrl: getApiBaseUrl(storage, host), fetch: window.fetch.bind(window) })
  const noticeState = createNoticeState()
  const mode = getStorageMode(storage, host)

  // Online-first, account-required: always build ONE api client + outbox + cache + repos
  // and start the flusher. The server is the source of truth; writes enqueue to the outbox
  // and flush when online (on the `online` event and after each enqueue).
  const api = createApiClient({
    baseUrl: getApiBaseUrl(storage, host),
    fetch: window.fetch.bind(window),
    getToken: authState.getToken,
    onAuthError: () => authState.logout(),
  })
  const connectivity = createBrowserConnectivity(window)
  const { repos, outbox, flush } = makeRepositories(storage, { api, connectivity })
  const profileStore = createProfileStore(repos, storage)
  await profileStore.load()
  const browserTz = defaultTimezone()
  const tz = resolveTimezone(profileStore.profile.get(), browserTz)
  // refresh() boots from ONE GET /bootstrap (all collections in a single round trip);
  // it falls back to per-collection reads if the backend lacks the endpoint.
  const dataState = createDataState(storage, themeState, { repos, outbox, timezone: tz, bootstrap: () => api.bootstrap() })

  // Theme applied reactively (the inline head script already set the first paint).
  // Cross-fades theme switches via the View Transitions API (instant at boot,
  // under reduced motion, and on browsers without the API).
  const applyThemeSettings = createThemeApplier(document)
  effect(() => applyThemeSettings(themeState.settings.get()))
  routeState.start()

  // Force the login page in Remote mode with no session (before touching the network).
  if (shouldRedirectToLogin(mode, authState.session.get(), routeState.route.get())) {
    routeState.navigate('/login', { replace: true })
  }

  const hasSession = !!authState.session.get()
  if (hasSession) {
    try {
      await dataState.refresh()
      // New-device correction: if the pulled profile tz differs from what we built with, reload once.
      await profileStore.load()
      if (tzNeedsReload(tz, profileStore.profile.get(), browserTz) && !sessionStorage.getItem(TZ_RELOADED_KEY)) {
        sessionStorage.setItem(TZ_RELOADED_KEY, '1')
        location.reload()
      }
    } catch {
      noticeState.show("Couldn't reach the backend — sign in at /login or reload to retry.")
    }
    // Drain any writes queued offline / from a prior session.
    void flush().then(() => dataState.refreshPending()).catch(() => {})
  }

  // Flush the outbox whenever connectivity returns online, then refresh the pending indicator.
  connectivity.subscribe((online) => {
    if (online) void flush().then(() => dataState.refreshPending()).catch(() => {})
  })

  let wasSignedIn = !!authState.session.get()
  effect(() => {
    const signedIn = !!authState.session.get()
    if (signedIn && !wasSignedIn) { void flush().then(() => dataState.refreshPending()).catch(() => {}) }
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
  window.addEventListener('storage', (e) => {
    if (!e.key || !isOylKey(e.key)) return
    if (e.key === SETTINGS_KEY) {
      themeState.refresh()
      layoutState.refresh()
    } else if (e.key === AUTH_KEY) authState.refresh()
    else if (e.key === OUTBOX_KEY) void flush().then(() => dataState.refreshPending()).catch(() => {})
    else debouncedRefresh()
  })

  window.addEventListener('unhandledrejection', (e) => {
    const r = /** @type {any} */ (e).reason
    if (r && (r.name === 'HttpRepositoryError' || r.code === 'REVISION_CONFLICT')) {
      noticeState.show('A change could not be saved to the server — it will retry.')
      e.preventDefault()
    }
  })

  // ?seed convenience for dev/demo: populate an EMPTY signed-in account through the
  // stores (writes flush to the server). Non-empty accounts are left alone — reloads
  // with the query present must not duplicate data.
  if (new URLSearchParams(location.search).has('seed') && hasSession && accountIsEmpty(dataState)) {
    await seedAccount(dataState, DayKey.from(now(), tz))
  }

  const shell = /** @type {import('./components/oyl-shell.js').OylShell} */ (document.createElement('oyl-shell'))
  shell.layoutSignal = layoutState.layout

  // Engagement deck: mounted only for widget-bearing layouts (no
  // hidden-but-computing work on classic/focus/wide). The shell reflects
  // mode via slotchange, so append order vs. the layout track is immaterial.
  defineWidgets()
  const widgetContext = createWidgetContext({
    journal: dataState.journal,
    planner: dataState.planner,
    reviewOn: dataState.reviewOn,
    profile: profileStore.profile,
    tz,
    now,
  })
  /** @type {import('./widgets/oyl-widgets.js').OylWidgets | null} */
  let deck = null
  effect(() => {
    const wantsDeck = byId(layoutState.layout.get()).widgets !== 'none'
    if (wantsDeck && !deck) {
      deck = /** @type {import('./widgets/oyl-widgets.js').OylWidgets} */ (document.createElement('oyl-widgets'))
      deck.slot = 'widgets'
      deck.context = widgetContext
      shell.append(deck)
    } else if (!wantsDeck && deck) {
      deck.remove()
      deck = null
    }
  })

  const notice = /** @type {import('./components/oyl-notice.js').OylNotice} */ (document.createElement('oyl-notice'))
  notice.notice = noticeState.notice
  notice.onDismiss = () => noticeState.clear()
  document.body.append(notice)

  const navEl = /** @type {import('./components/oyl-nav.js').OylNav} */ (document.createElement('oyl-nav'))
  navEl.slot = 'nav'
  navEl.routeSignal = routeState.route

  const toggle = /** @type {import('./components/oyl-theme-toggle.js').OylThemeToggle} */ (document.createElement('oyl-theme-toggle'))
  toggle.slot = 'toolbar'
  toggle.themeState = themeState

  const layoutPicker = /** @type {import('./components/oyl-layout-picker.js').OylLayoutPicker} */ (
    document.createElement('oyl-layout-picker')
  )
  layoutPicker.slot = 'toolbar'
  layoutPicker.layoutState = layoutState

  const router = /** @type {import('./components/oyl-router.js').OylRouter} */ (document.createElement('oyl-router'))
  router.slot = 'main'
  router.routeSignal = routeState.route
  router.routes = {
    status: () => {
      const panel = /** @type {import('./components/oyl-status-panel.js').OylStatusPanel} */ (document.createElement('oyl-status-panel'))
      panel.connection = {
        mode,
        apiBaseUrl: getApiBaseUrl(storage, host),
        defaultApiBaseUrl: defaultApiBaseUrl(host),
        onApply: (m, url) => { setStorageMode(storage, m); setApiBaseUrl(storage, url); location.reload() },
      }
      // Sync/migration sections are deferred to the connection-UI reshape (Sub-project D);
      // pending writes are surfaced via dataState.pending. Migration is obsolete under
      // account-required (no local-only data to upload).
      panel.sync = null
      panel.migration = null
      panel.actions = {
        // Inline (not a helper): dataState's inferred type stays in closure scope —
        // annotating it via ReturnType<createDataState> trips TS2502 self-reference.
        onSeed: () => {
          void (async () => {
            if (accountIsEmpty(dataState) || confirm('Add demo data to this account?')) {
              await seedAccount(dataState, DayKey.from(now(), tz))
              dataState.refreshPending()
            }
          })()
        },
        onExport: () => download(exportData(storage, dataState)),
        onImport: () => pickAndImport(dataState),
        onReset: () => {
          if (confirm('Erase all local OYL data? This cannot be undone.')) {
            resetData(storage)
            void dataState.refresh()
          }
        },
      }
      panel.track(() => {
        panel.diagnostics = dataState.readDiagnostics()
      })
      return panel
    },
    journal: () => {
      const view = /** @type {import('./components/oyl-journal.js').OylJournal} */ (document.createElement('oyl-journal'))
      view.store = dataState.journal
      view.tz = tz
      return view
    },
    planner: () => {
      const view = /** @type {import('./components/oyl-planner.js').OylPlanner} */ (document.createElement('oyl-planner'))
      view.store = dataState.planner
      view.tz = tz
      return view
    },
    vault: () => {
      const view = /** @type {import('./components/oyl-vault.js').OylVault} */ (document.createElement('oyl-vault'))
      view.store = dataState.vault
      view.renew = dataState.renewSubscription
      view.tz = tz
      return view
    },
    goals: () => {
      const view = /** @type {import('./components/oyl-goals.js').OylGoals} */ (document.createElement('oyl-goals'))
      view.store = dataState.goals
      view.journal = dataState.journal
      view.tz = tz
      return view
    },
    insights: () => {
      const view = /** @type {import('./components/oyl-insights.js').OylInsights} */ (document.createElement('oyl-insights'))
      view.reviewOn = dataState.reviewOn
      view.tz = tz
      return view
    },
    finance: () => {
      const view = /** @type {import('./components/oyl-finance.js').OylFinance} */ (document.createElement('oyl-finance'))
      view.store = dataState.journal
      view.budgets = dataState.budgets
      view.accounts = dataState.accounts
      view.tz = tz
      return view
    },
    nutrition: () => {
      const view = /** @type {import('./components/oyl-nutrition.js').OylNutrition} */ (document.createElement('oyl-nutrition'))
      view.store = dataState.journal
      view.consumables = dataState.consumables
      view.consumableProducts = dataState.consumableProducts
      view.tz = tz
      return view
    },
    login: () => {
      const page = /** @type {import('./components/oyl-login.js').OylLogin} */ (document.createElement('oyl-login'))
      page.auth = authState
      page.onAuthenticated = () => { setStorageMode(storage, 'remote'); location.assign('/status') }
      return page
    },
    register: () => {
      const page = /** @type {import('./components/oyl-register.js').OylRegister} */ (document.createElement('oyl-register'))
      page.auth = authState
      page.onAuthenticated = (patch) => {
        void profileStore.save(patch).finally(() => { setStorageMode(storage, 'remote'); location.assign('/status') })
      }
      return page
    },
    profile: () => {
      const page = /** @type {import('./components/oyl-profile.js').OylProfile} */ (document.createElement('oyl-profile'))
      page.session = authState.session
      page.profile = profileStore.profile
      page.today = DayKey.from(now(), tz).value
      page.onLogout = () => authState.logout()
      page.onSaveProfile = (patch) => {
        const tzChanged = 'timezone' in patch && patch.timezone !== tz
        const unitsChanged = 'units' in patch && patch.units !== profileStore.profile.get()?.units
        void profileStore.save(patch).then(() => {
          if (tzChanged || unitsChanged) location.assign('/profile')
          else noticeState.show('Profile saved.')
        })
      }
      page.connection = {
        mode,
        apiBaseUrl: getApiBaseUrl(storage, host),
        defaultApiBaseUrl: defaultApiBaseUrl(host),
        onApply: (m, url) => { setStorageMode(storage, m); setApiBaseUrl(storage, url); location.reload() },
      }
      // Sync section is deferred to the connection-UI reshape (Sub-project D); upload-local
      // is obsolete under account-required. Export stays for a manual backup.
      page.sync = null
      page.dataActions = {
        mode,
        canUploadLocal: false,
        onExport: () => download(exportData(storage, dataState)),
        onImport: () => pickAndImport(dataState),
        onUploadLocal: () => {},
      }
      return page
    },
  }

  const accountMenu = /** @type {import('./components/oyl-account-menu.js').OylAccountMenu} */ (document.createElement('oyl-account-menu'))
  accountMenu.slot = 'toolbar'
  accountMenu.session = authState.session
  accountMenu.onLogout = () => authState.logout()

  shell.append(navEl, toggle, layoutPicker, accountMenu, router)
  const root = document.getElementById('app')
  if (root) root.replaceChildren(shell)
  document.getElementById('boot-fallback')?.remove()
}

/**
 * Whether the account holds no records yet — from the boot-refresh counts snapshot.
 * Only PERSONAL (owner-scoped) collections count: the shared catalog (public-or-mine)
 * can be non-empty for a brand-new account and says nothing about ITS data.
 * @param {{ counts: { get(): Record<string, number> } }} dataState
 */
function accountIsEmpty(dataState) {
  const counts = dataState.counts.get()
  return entitiesByKind('personal').every((name) => (counts[name] ?? 0) === 0)
}


/** @param {ReturnType<typeof exportData>} doc */
function download(doc) {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `oyl-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

/** @param {ReturnType<typeof createDataState>} dataState */
function pickAndImport(dataState) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json'
  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      await importData(dataState, await file.text())
      alert('Import complete.')
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  })
  input.click()
}

/** @param {Storage} storage */
function resetData(storage) {
  for (let i = storage.length - 1; i >= 0; i--) {
    const k = storage.key(i)
    if (k && isOylKey(k)) storage.removeItem(k)
  }
}

boot().catch((err) => {
  const fb = document.getElementById('boot-fallback')
  if (fb) fb.textContent = `OYL failed to start: ${err instanceof Error ? err.message : String(err)}`
})
