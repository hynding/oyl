import { exportData, importData, isOylKey, seedAccount, type BackupDoc } from '@oyl/all-of-oyl/client'
import { DayKey } from '@oyl/all-of-oyl'
import { accountIsEmpty } from './compose.js'
import type { App } from './types.js'

/** Download a backup document as oyl-backup-<date>.json (port of vanilla main.js). */
export function download(doc: BackupDoc, doc_ = document): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
  const a = doc_.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `oyl-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Open a file picker and import the chosen backup through the stores. */
export function pickAndImport(dataState: App['dataState'], doc_ = document): void {
  const input = doc_.createElement('input')
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

/** Erase every oyl/ key from storage (Local-mode reset). */
export function resetData(storage: Storage): void {
  for (let i = storage.length - 1; i >= 0; i--) {
    const k = storage.key(i)
    if (k && isOylKey(k)) storage.removeItem(k)
  }
}

export interface StatusActions {
  onSeed(): void
  onExport(): void
  onImport(): void
  onReset(): void
}

/**
 * The Status screen's data tools, wired exactly as vanilla's status route: seed/export/import
 * act on the signed-in ACCOUNT through the stores (Remote mode); reset clears LOCAL storage.
 */
export function statusActions(app: App, now: () => Date): StatusActions {
  const { dataState, storage, tz } = app
  return {
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
}
