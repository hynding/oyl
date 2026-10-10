import { render, h, describe, it, expect, vi } from '@stencil/vitest'
import { User } from '@oyl/all-of-oyl'
import { core } from '../../../vitest-setup.js'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const click = (el: Element) => (el.shadowRoot?.querySelector('button, a') ?? el).dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
const flush = () => new Promise((r) => setTimeout(r, 0))
const text = (el: Element | null) => el?.textContent?.trim() ?? ''

async function setup(over: { profile?: User | null; google?: { state: string; email?: string } } = {}) {
  const { signal } = await core()
  const session = signal<{ token: string; user: { username: string; email: string } } | null>({ token: 't', user: { username: 'steve', email: 'steve@example.com' } })
  const profile = signal<User | null>(over.profile ?? null)
  const connection = signal(over.google ?? { state: 'unknown' })
  const google = { connection, connect: vi.fn(), disconnect: vi.fn() }
  const r = await render(<oyl-profile session={session} profile={profile} today="2026-10-09" google={google as never} zones={['UTC', 'Europe/Paris']} />)
  return { ...r, session, profile, connection, google }
}

describe('oyl-profile', () => {
  it('shows the heading, identity, the form seeded from the profile, the Status note and Log out', async () => {
    const { root } = await setup()
    expect(q(root, 'h2')).toHaveTextContent('Profile')
    expect(q(root, 'h2')).toHaveAttribute('tabindex', '-1')
    expect(text(q(root, '[data-role="identity"]'))).toBe('steve · steve@example.com')
    expect(q(root, '[data-role="body-summary"]')).toBeNull()
    expect((q(root, 'oyl-profile-form') as any).value).toEqual({})
    expect(q(root, 'a[href="/status"]')).not.toBeNull()
    expect(q(root, 'ui-button[data-act="logout"]')).toHaveAttribute('variant', 'danger')
    expect(q(root, '[data-role="google-drive"]')).toBeNull()
  })

  it('summarises the body and seeds the form with the profile patch; the patch keeps its identity across unrelated changes', async () => {
    const user = new User({ displayName: 'You', timezone: 'Europe/Paris', defaultCurrency: 'EUR', weightKg: 81.5, heightCm: 179.5, birthday: '1990-06-15' })
    const { root, connection, waitForChanges } = await setup({ profile: user, google: { state: 'disconnected' } })
    expect(text(q(root, '[data-role="body-summary"]'))).toBe('81.5 kg · 180 cm · 36 yrs')
    const form = q(root, 'oyl-profile-form') as any
    expect(form.value).toEqual({ displayName: 'You', timezone: 'Europe/Paris', defaultCurrency: 'EUR', weightKg: 81.5, heightCm: 179.5, birthday: '1990-06-15' })
    const before = form.value
    connection.set({ state: 'connected', email: 'x@gmail.test' })
    await flush(); await waitForChanges()
    expect((q(root, 'oyl-profile-form') as any).value).toBe(before)
  })

  it('re-emits the form save as saveProfile and emits logout', async () => {
    const { root } = await setup()
    const saved = vi.fn(), loggedOut = vi.fn()
    root.addEventListener('saveProfile', (e) => saved((e as CustomEvent).detail))
    root.addEventListener('logout', loggedOut)
    q(root, 'oyl-profile-form')!.dispatchEvent(new CustomEvent('save', { detail: { timezone: 'UTC', units: 'metric' }, bubbles: true }))
    expect(saved).toHaveBeenCalledWith({ timezone: 'UTC', units: 'metric' })
    click(q(root, 'ui-button[data-act="logout"]')!)
    expect(loggedOut).toHaveBeenCalledTimes(1)
  })

  it('renders the Google Drive card per connection state', async () => {
    const { root, connection, google, waitForChanges } = await setup({ google: { state: 'unconfigured' } })
    expect(q(root, '[data-role="google-drive"]')).toBeNull()
    connection.set({ state: 'disconnected' })
    await flush(); await waitForChanges()
    expect(q(root, 'ui-button[data-act="google-connect"]')).toHaveTextContent('Connect Google Drive')
    click(q(root, 'ui-button[data-act="google-connect"]')!)
    expect(google.connect).toHaveBeenCalledTimes(1)
    connection.set({ state: 'connected', email: 'x@gmail.test' })
    await flush(); await waitForChanges()
    expect(text(q(root, '[data-role="google-drive"]'))).toContain('Connected as x@gmail.test')
    click(q(root, 'ui-button[data-act="google-disconnect"]')!)
    expect(google.disconnect).toHaveBeenCalledTimes(1)
    connection.set({ state: 'reconnect-needed' })
    await flush(); await waitForChanges()
    expect(text(q(root, '[data-role="google-reconnect"]'))).toBe('Google access expired — reconnect to keep using Drive.')
    expect(q(root, 'ui-button[data-act="google-connect"]')).toHaveTextContent('Reconnect')
  })
})
