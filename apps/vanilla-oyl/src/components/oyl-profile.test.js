import { describe, expect, it, beforeAll, vi } from 'vitest'
import { signal } from '../lib/reactive/signal.js'
import { User } from '@oyl/all-of-oyl'
import { defineProfile } from './oyl-profile.js'

beforeAll(() => defineProfile())

/**
 * @param {any} session
 * @param {any} profile
 * @param {() => void} [onSaveProfile]
 * @param {() => void} [onLogout]
 * @returns {any}
 */
function mount(session, profile, onSaveProfile = () => {}, onLogout = () => {}) {
  const el = /** @type {any} */ (document.createElement('oyl-profile'))
  el.session = session; el.profile = profile; el.onSaveProfile = onSaveProfile; el.onLogout = onLogout
  document.body.append(el)
  return el
}

describe('<oyl-profile>', () => {
  it('shows identity + logout when signed in', () => {
    const session = signal({ token: 't', user: { id: 1, username: 'avery', email: 'a@b.c' } })
    const profile = signal(new User({ displayName: 'Avery', timezone: 'UTC', defaultCurrency: 'USD' }))
    const el = mount(session, profile)
    const root = el.shadowRoot
    expect(root.querySelector('[data-role="identity"]').textContent).toContain('avery')
    expect(root.querySelector('[data-act="logout"]')).toBeTruthy()
    expect(root.querySelector('oyl-profile-fields')).toBeTruthy()
    el.remove()
  })

  it('shows a sign-in CTA and no logout when signed out', () => {
    const el = mount(signal(null), signal(null))
    const root = el.shadowRoot
    expect(root.querySelector('a[href="/login"]')).toBeTruthy()
    expect(root.querySelector('[data-act="logout"]')).toBeFalsy()
    expect(root.querySelector('oyl-profile-fields')).toBeTruthy()
    el.remove()
  })

  it('forwards the saved patch from the field set', () => {
    const onSaveProfile = vi.fn()
    const profile = signal(new User({ displayName: 'A', timezone: 'UTC', defaultCurrency: 'USD' }))
    const el = mount(signal({ token: 't', user: { id: 1, username: 'a', email: 'a@b.c' } }), profile, onSaveProfile)
    el.shadowRoot.querySelector('oyl-profile-fields').shadowRoot.querySelector('[data-act="save"]').click()
    expect(onSaveProfile).toHaveBeenCalledTimes(1)
    el.remove()
  })

  it('renders connection + sync + remote data actions, wiring resync/export/upload', () => {
    const onResync = vi.fn(); const onExport = vi.fn(); const onUploadLocal = vi.fn()
    const profile = signal(new User({ displayName: 'A', timezone: 'UTC', defaultCurrency: 'USD' }))
    const el = /** @type {any} */ (document.createElement('oyl-profile'))
    el.session = signal({ token: 't', user: { id: 1, username: 'a', email: 'a@b.c' } })
    el.profile = profile; el.onSaveProfile = () => {}; el.onLogout = () => {}
    el.connection = { mode: 'remote', apiBaseUrl: 'http://x/api', defaultApiBaseUrl: 'http://x/api', onApply: () => {} }
    el.sync = { state: signal(null), onResync }
    el.dataActions = { mode: 'remote', canUploadLocal: true, onExport, onImport: () => {}, onUploadLocal }
    document.body.append(el)
    const root = el.shadowRoot
    expect(root.querySelector('oyl-connection')).toBeTruthy()
    expect(root.querySelector('oyl-sync-status')).toBeTruthy()
    root.querySelector('[data-act="resync"]').click(); expect(onResync).toHaveBeenCalled()
    root.querySelector('[data-act="export"]').click(); expect(onExport).toHaveBeenCalled()
    root.querySelector('[data-act="upload-local"]').click(); expect(onUploadLocal).toHaveBeenCalled()
    expect(root.querySelector('[data-act="import"]')).toBeFalsy() // import is local-only
    el.remove()
  })

  it('shows Import (not Upload) in local mode', () => {
    const el = /** @type {any} */ (document.createElement('oyl-profile'))
    el.session = signal(null); el.profile = signal(null); el.onSaveProfile = () => {}; el.onLogout = () => {}
    el.dataActions = { mode: 'local', canUploadLocal: false, onExport: () => {}, onImport: () => {}, onUploadLocal: () => {} }
    document.body.append(el)
    const root = el.shadowRoot
    expect(root.querySelector('[data-act="import"]')).toBeTruthy()
    expect(root.querySelector('[data-act="upload-local"]')).toBeFalsy()
    el.remove()
  })
})
