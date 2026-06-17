import { effect } from './lib/reactive/effect.js'
import { applyTheme } from './theme/theme-manager.js'
import { createThemeState } from './state/theme.js'
import { createRouteState } from './state/route.js'
import { createDataState } from './state/data.js'
import { createAuthState } from './state/auth.js'
import { loadDemoData, isEmpty } from './storage/seed.js'
import { exportData, importData } from './storage/backup.js'
import { hasUnmigratedLocal, countLocalRecords } from './storage/migrate.js'
import { isOylKey, SETTINGS_KEY, AUTH_KEY, MIGRATE_DECLINED_KEY } from './storage/keys.js'
import { getApiBaseUrl, getStorageMode, setApiBaseUrl, setStorageMode, DEFAULT_API_BASE_URL } from './storage/config.js'
import { defaultTimezone } from './storage/clock.js'
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
import { defineSyncStatus } from './components/oyl-sync-status.js'
import { createNoticeState } from './state/notice.js'
import { defineNotice } from './components/oyl-notice.js'
import { createHttpClient } from '@oyl/all-of-oyl'
import { createBrowserConnectivity } from './storage/connectivity.js'
import { debounce } from './lib/debounce.js'

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

  const themeState = createThemeState(storage)
  const routeState = createRouteState(window)
  const authState = createAuthState(storage, { baseUrl: getApiBaseUrl(storage), fetch: window.fetch.bind(window) })
  const noticeState = createNoticeState()
  const mode = getStorageMode(storage)
  const client = mode === 'remote'
    ? createHttpClient({
        baseUrl: getApiBaseUrl(storage),
        fetch: window.fetch.bind(window),
        getToken: authState.getToken,
        onAuthError: () => authState.logout(),
        timeoutMs: 15000,
        newAbortController: () => new AbortController(),
        timer: { set: (fn, ms) => setTimeout(fn, ms), clear: (/** @type {any} */ id) => clearTimeout(id) },
      })
    : undefined
  const connectivity = mode === 'remote' ? createBrowserConnectivity(window) : undefined
  const dataState = createDataState(storage, themeState, client ? { client, ...(connectivity ? { connectivity } : {}) } : {})

  // Theme applied reactively (the inline head script already set the first paint).
  effect(() => applyTheme(document, themeState.settings.get()))
  routeState.start()
  try {
    await dataState.refresh()
  } catch (err) {
    if (mode === 'remote') noticeState.show("Couldn't reach the backend — sign in (Status → Account) or reload to retry.")
    else throw err
  }

  function maybeOfferMigration() {
    if (mode !== 'remote' || !authState.session.get()) return
    const offer = dataState.migrationOffer()
    if (!offer) return
    if (confirm(`You have ${offer.count} local item(s). Upload them to your account?`)) {
      void dataState.migrateLocal().then((n) => noticeState.show(`Uploaded ${n} local item(s) to your account.`)).catch(() => {})
    } else {
      storage.setItem(MIGRATE_DECLINED_KEY, '1')
    }
  }

  if (mode === 'remote') {
    void dataState.startSync().catch(() => {})
    maybeOfferMigration()
  }

  let wasSignedIn = !!authState.session.get()
  effect(() => {
    const signedIn = !!authState.session.get()
    if (signedIn && !wasSignedIn) { dataState.syncFlush(); maybeOfferMigration() }
    wasSignedIn = signedIn
  })

  // Multi-tab coherence: react to writes from other tabs.
  const debouncedRefresh = debounce(() => void dataState.refresh(), 150)
  window.addEventListener('storage', (e) => {
    if (!e.key || !isOylKey(e.key)) return
    if (e.key === SETTINGS_KEY) themeState.refresh()
    else if (e.key === AUTH_KEY) authState.refresh()
    else debouncedRefresh()
  })

  window.addEventListener('unhandledrejection', (e) => {
    const r = /** @type {any} */ (e).reason
    if (r && (r.name === 'HttpRepositoryError' || r.code === 'REVISION_CONFLICT')) {
      noticeState.show('Sync failed — your last change may not be saved.')
      e.preventDefault()
    }
  })

  // ?seed convenience for dev.
  if (new URLSearchParams(location.search).has('seed')) {
    await loadDemoData(storage)
    await dataState.refresh()
  }

  const shell = document.createElement('oyl-shell')

  const notice = /** @type {import('./components/oyl-notice.js').OylNotice} */ (document.createElement('oyl-notice'))
  notice.notice = noticeState.notice
  notice.onDismiss = () => noticeState.clear()
  document.body.append(notice)

  const navEl = /** @type {import('./components/oyl-nav.js').OylNav} */ (document.createElement('oyl-nav'))
  navEl.slot = 'nav'
  navEl.routeSignal = routeState.route

  let syncChip = null
  if (mode === 'remote') {
    defineSyncStatus()
    syncChip = /** @type {import('./components/oyl-sync-status.js').OylSyncStatus} */ (document.createElement('oyl-sync-status'))
    syncChip.slot = 'toolbar'
    syncChip.syncState = dataState.syncState
  }

  const toggle = /** @type {import('./components/oyl-theme-toggle.js').OylThemeToggle} */ (document.createElement('oyl-theme-toggle'))
  toggle.slot = 'toolbar'
  toggle.themeState = themeState

  const router = /** @type {import('./components/oyl-router.js').OylRouter} */ (document.createElement('oyl-router'))
  router.slot = 'main'
  router.routeSignal = routeState.route
  router.routes = {
    status: () => {
      const panel = /** @type {import('./components/oyl-status-panel.js').OylStatusPanel} */ (document.createElement('oyl-status-panel'))
      panel.auth = authState
      panel.connection = {
        mode,
        apiBaseUrl: getApiBaseUrl(storage),
        defaultApiBaseUrl: DEFAULT_API_BASE_URL,
        onApply: (m, url) => { setStorageMode(storage, m); setApiBaseUrl(storage, url); location.reload() },
      }
      panel.sync = mode === 'remote'
        ? { state: dataState.syncState, onResync: dataState.resync, onRetryFailed: () => void dataState.retryFailed(), onDiscardFailed: () => void dataState.discardFailed() }
        : null
      panel.migration = mode === 'remote' && hasUnmigratedLocal(storage)
        ? { count: countLocalRecords(storage), onUpload: () => void dataState.migrateLocal() }
        : null
      panel.actions = {
        onSeed: () => void seedWithConfirm(storage, dataState),
        onExport: () => download(exportData(storage)),
        onImport: () => pickAndImport(storage, dataState),
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
      view.tz = defaultTimezone()
      return view
    },
    planner: () => {
      const view = /** @type {import('./components/oyl-planner.js').OylPlanner} */ (document.createElement('oyl-planner'))
      view.store = dataState.planner
      view.tz = defaultTimezone()
      return view
    },
    vault: () => {
      const view = /** @type {import('./components/oyl-vault.js').OylVault} */ (document.createElement('oyl-vault'))
      view.store = dataState.vault
      view.renew = dataState.renewSubscription
      view.tz = defaultTimezone()
      return view
    },
    goals: () => {
      const view = /** @type {import('./components/oyl-goals.js').OylGoals} */ (document.createElement('oyl-goals'))
      view.store = dataState.goals
      view.journal = dataState.journal
      view.tz = defaultTimezone()
      return view
    },
    insights: () => {
      const view = /** @type {import('./components/oyl-insights.js').OylInsights} */ (document.createElement('oyl-insights'))
      view.reviewOn = dataState.reviewOn
      view.tz = defaultTimezone()
      return view
    },
    finance: () => {
      const view = /** @type {import('./components/oyl-finance.js').OylFinance} */ (document.createElement('oyl-finance'))
      view.store = dataState.journal
      view.budgets = dataState.budgets
      view.accounts = dataState.accounts
      view.tz = defaultTimezone()
      return view
    },
    nutrition: () => {
      const view = /** @type {import('./components/oyl-nutrition.js').OylNutrition} */ (document.createElement('oyl-nutrition'))
      view.store = dataState.journal
      view.foods = dataState.foods
      view.tz = defaultTimezone()
      return view
    },
  }

  shell.append(navEl, ...(syncChip ? [syncChip] : []), toggle, router)
  const root = document.getElementById('app')
  if (root) root.replaceChildren(shell)
  document.getElementById('boot-fallback')?.remove()
}

/** @param {Storage} storage @param {ReturnType<typeof createDataState>} dataState */
async function seedWithConfirm(storage, dataState) {
  const empty = await isEmpty(storage)
  if (empty || confirm('Replace current data with demo data?')) {
    await loadDemoData(storage)
    await dataState.refresh()
  }
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

/** @param {Storage} storage @param {ReturnType<typeof createDataState>} dataState */
function pickAndImport(storage, dataState) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json'
  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      await importData(storage, await file.text())
      await dataState.refresh()
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
