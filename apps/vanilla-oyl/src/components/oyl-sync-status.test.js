import { describe, it, expect, beforeAll } from 'vitest'
import { defineSyncStatus } from './oyl-sync-status.js'
import { signal } from '../lib/reactive/signal.js'

beforeAll(() => defineSyncStatus())
/** @type {import('@oyl/all-of-oyl').SyncState} */
const synced = { online: true, pending: 0, status: 'idle', conflicts: 0 }
/** @param {import('@oyl/all-of-oyl').SyncState | null} initial */
function mount(initial) {
  const sig = signal(/** @type {any} */ (initial))
  const el = /** @type {any} */ (document.createElement('oyl-sync-status'))
  el.syncState = sig
  document.body.append(el)
  return { el, sig }
}

describe('<oyl-sync-status>', () => {
  it('is hidden when idle+synced', () => {
    const { el } = mount(synced)
    expect(el.hasAttribute('hidden')).toBe(true)
    el.remove()
  })
  it('shows Offline · N when offline with pending', () => {
    const { el } = mount({ ...synced, online: false, status: 'offline', pending: 2 })
    expect(el.hasAttribute('hidden')).toBe(false)
    expect(el.shadowRoot.textContent).toContain('Offline · 2')
    el.remove()
  })
  it('shows Syncing… and Sync error', () => {
    const a = mount({ ...synced, status: 'syncing' })
    expect(a.el.shadowRoot.textContent).toContain('Syncing')
    a.el.remove()
    const b = mount({ ...synced, status: 'error', lastError: 'boom' })
    expect(b.el.shadowRoot.textContent).toContain('Sync error')
    b.el.remove()
  })
  it('reacts to signal changes (synced→syncing un-hides)', async () => {
    const { el, sig } = mount(synced)
    expect(el.hasAttribute('hidden')).toBe(true)
    sig.set({ ...synced, status: 'syncing' })
    await Promise.resolve()
    expect(el.hasAttribute('hidden')).toBe(false)
    el.remove()
  })
})
