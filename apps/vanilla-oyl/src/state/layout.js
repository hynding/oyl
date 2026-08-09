import { signal } from '../lib/reactive/signal.js'
import { SETTINGS_KEY } from '../storage/keys.js'
import { readRawSettings } from '../storage/settings.js'
import { DEFAULT_LAYOUT, isLayoutId } from '../layouts/layout-catalog.js'

/** @typedef {{ getItem(k: string): string | null, setItem(k: string, v: string): void }} AppStorage */

/** @param {AppStorage} storage @returns {string} */
function readLayout(storage) {
  const id = readRawSettings(storage).layout
  return isLayoutId(id) ? /** @type {string} */ (id) : DEFAULT_LAYOUT
}

/**
 * Layout state: a layout-id signal plus setLayout() that validates, persists
 * (merging onto the RAW stored blob so theme/mode survive), and emits.
 * @param {AppStorage} storage
 */
export function createLayoutState(storage) {
  const layout = signal(readLayout(storage))
  return {
    layout,
    /** @param {string} id */
    setLayout(id) {
      if (!isLayoutId(id)) return
      layout.set(id)
      storage.setItem(SETTINGS_KEY, JSON.stringify({ ...readRawSettings(storage), layout: id }))
    },
    /** Re-read from storage (multi-tab sync). */
    refresh() {
      layout.set(readLayout(storage))
    },
  }
}
