import { effect } from './lib/reactive/effect.js'
import { applyTheme } from './theme/theme-manager.js'
import { createThemeState } from './state/theme.js'
import { createRouteState } from './state/route.js'
import { createDataState } from './state/data.js'
import { createAuthState } from './state/auth.js'
import { loadDemoData, isEmpty } from './storage/seed.js'
import { exportData, importData } from './storage/backup.js'
import { hasUnmigratedLocal, countLocalRecords } from './storage/migrate.js'
import { isOylKey, SETTINGS_KEY, AUTH_KEY, TZ_RELOADED_KEY } from './storage/keys.js'
import { getApiBaseUrl, getStorageMode, setApiBaseUrl, setStorageMode, DEFAULT_API_BASE_URL } from './storage/config.js'
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
import { defineSyncStatus } from './components/oyl-sync-status.js'
import { createNoticeState } from './state/notice.js'
import { defineNotice } from './components/oyl-notice.js'
import { createHttpClient, DayKey } from '@oyl/all-of-oyl'
import { createBrowserConnectivity } from './storage/connectivity.js'
import { debounce } from './lib/debounce.js'
import { makeRepositories } from './storage/bootstrap.js'
import { createProfileStore, resolveTimezone } from './state/profile-store.js'
import { shouldRedirectToLogin, tzNeedsReload } from './state/auth-guard.js'
import { defineLogin } from './components/oyl-login.js'
import { defineRegister } from './components/oyl-register.js'
import { defineProfile } from './components/oyl-profile.js'
import { defineAccountMenu } from './components/oyl-account-menu.js'

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
  const { repos, engine } = makeRepositories(storage, client ? { client, ...(connectivity ? { connectivity } : {}) } : {})
  const profileStore = createProfileStore(repos, storage)
  await profileStore.load()
  const browserTz = defaultTimezone()
  const tz = resolveTimezone(profileStore.profile.get(), browserTz)
  const dataState = createDataState(storage, themeState, { repos, engine, timezone: tz })

  // Theme applied reactively (the inline head script already set the first paint).
  effect(() => applyTheme(document, themeState.settings.get()))
  routeState.start()

  // Force the login page in Remote mode with no session (before touching the network).
  if (shouldRedirectToLogin(mode, authState.session.get(), routeState.route.get())) {
    routeState.navigate('/login', { replace: true })
  }

  const hasSession = !!authState.session.get()
  if (mode !== 'remote' || hasSession) {
    try {
      await dataState.refresh()
    } catch (err) {
      if (mode === 'remote') noticeState.show("Couldn't reach the backend — sign in at /login or reload to retry.")
      else throw err
    }
  }

  /** Immediately back up any local-only data to the API (idempotent via MIGRATED_KEY). */
  function backupLocalNow() {
    if (mode === 'remote' && authState.session.get() && hasUnmigratedLocal(storage)) {
      void dataState.migrateLocal().then((n) => { if (n > 0) noticeState.show(`Backed up ${n} local item(s) to your account.`) }).catch(() => {})
    }
  }

  if (mode === 'remote' && hasSession) {
    void dataState.startSync()
      .then(async () => {
        // New-device correction: if the pulled profile tz differs from what we built with, reload once.
        await profileStore.load()
        if (tzNeedsReload(tz, profileStore.profile.get(), browserTz) && !sessionStorage.getItem(TZ_RELOADED_KEY)) {
          sessionStorage.setItem(TZ_RELOADED_KEY, '1')
          location.reload()
        }
      })
      .catch(() => {})
    backupLocalNow()
  }

  let wasSignedIn = !!authState.session.get()
  effect(() => {
    const signedIn = !!authState.session.get()
    if (signedIn && !wasSignedIn) { dataState.syncFlush(); backupLocalNow() }
    wasSignedIn = signedIn
    if (shouldRedirectToLogin(mode, authState.session.get(), routeState.route.get())) {
      routeState.navigate('/login', { replace: true })
    }
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
      view.tz = tz
      return view
    },
    login: () => {
      const page = /** @type {import('./components/oyl-login.js').OylLogin} */ (document.createElement('oyl-login'))
      page.auth = authState
      page.onAuthenticated = () => { setStorageMode(storage, 'remote'); location.assign('/status') }
      page.onSkip = () => { setStorageMode(storage, 'local'); location.assign('/status') }
      return page
    },
    register: () => {
      const page = /** @type {import('./components/oyl-register.js').OylRegister} */ (document.createElement('oyl-register'))
      page.auth = authState
      page.onAuthenticated = (patch) => {
        void profileStore.save(patch).finally(() => { setStorageMode(storage, 'remote'); location.assign('/status') })
      }
      page.onSkip = () => { setStorageMode(storage, 'local'); location.assign('/status') }
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
        apiBaseUrl: getApiBaseUrl(storage),
        defaultApiBaseUrl: DEFAULT_API_BASE_URL,
        onApply: (m, url) => { setStorageMode(storage, m); setApiBaseUrl(storage, url); location.reload() },
      }
      page.sync = mode === 'remote' ? { state: dataState.syncState, onResync: dataState.resync } : null
      page.dataActions = {
        mode,
        canUploadLocal: mode === 'remote' && hasUnmigratedLocal(storage),
        onExport: () => download(exportData(storage)),
        onImport: () => pickAndImport(storage, dataState),
        onUploadLocal: () => void dataState.migrateLocal(),
      }
      return page
    },
  }

  const accountMenu = /** @type {import('./components/oyl-account-menu.js').OylAccountMenu} */ (document.createElement('oyl-account-menu'))
  accountMenu.slot = 'toolbar'
  accountMenu.session = authState.session
  accountMenu.onLogout = () => authState.logout()

  shell.append(navEl, ...(syncChip ? [syncChip] : []), toggle, accountMenu, router)
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
