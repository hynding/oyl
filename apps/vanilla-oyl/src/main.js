import { effect } from './lib/reactive/effect.js'
import { applyTheme } from './theme/theme-manager.js'
import { createThemeState } from './state/theme.js'
import { createRouteState } from './state/route.js'
import { createDataState } from './state/data.js'
import { loadDemoData, isEmpty } from './storage/seed.js'
import { exportData, importData } from './storage/backup.js'
import { isOylKey, SETTINGS_KEY } from './storage/keys.js'
import { defaultTimezone } from './storage/clock.js'
import { defineShell } from './components/oyl-shell.js'
import { defineThemeToggle } from './components/oyl-theme-toggle.js'
import { defineRouter } from './components/oyl-router.js'
import { defineStatusPanel } from './components/oyl-status-panel.js'
import { defineNav } from './components/oyl-nav.js'
import { defineJournal } from './components/oyl-journal.js'

async function boot() {
  const storage = window.localStorage
  defineShell()
  defineThemeToggle()
  defineRouter()
  defineStatusPanel()
  defineNav()
  defineJournal()

  const themeState = createThemeState(storage)
  const routeState = createRouteState(window)
  const dataState = createDataState(storage, themeState)

  // Theme applied reactively (the inline head script already set the first paint).
  effect(() => applyTheme(document, themeState.settings.get()))
  routeState.start()
  await dataState.refresh()

  // Multi-tab coherence: react to writes from other tabs.
  window.addEventListener('storage', (e) => {
    if (!e.key || !isOylKey(e.key)) return
    if (e.key === SETTINGS_KEY) themeState.refresh()
    else void dataState.refresh()
  })

  // ?seed convenience for dev.
  if (new URLSearchParams(location.search).has('seed')) {
    await loadDemoData(storage)
    await dataState.refresh()
  }

  const shell = document.createElement('oyl-shell')

  const navEl = /** @type {import('./components/oyl-nav.js').OylNav} */ (document.createElement('oyl-nav'))
  navEl.slot = 'nav'
  navEl.routeSignal = routeState.route

  const toggle = /** @type {import('./components/oyl-theme-toggle.js').OylThemeToggle} */ (document.createElement('oyl-theme-toggle'))
  toggle.slot = 'toolbar'
  toggle.themeState = themeState

  const router = /** @type {import('./components/oyl-router.js').OylRouter} */ (document.createElement('oyl-router'))
  router.slot = 'main'
  router.routeSignal = routeState.route
  router.routes = {
    status: () => {
      const panel = /** @type {import('./components/oyl-status-panel.js').OylStatusPanel} */ (document.createElement('oyl-status-panel'))
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
  }

  shell.append(navEl, toggle, router)
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
