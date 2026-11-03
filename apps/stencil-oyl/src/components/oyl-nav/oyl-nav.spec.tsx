import { render, h, describe, it, expect } from '@stencil/vitest'
import { core } from '../../../vitest-setup.js'

describe('oyl-nav', () => {
  it('lists the eight screens through ui-nav for an admin and tracks the route', async () => {
    const { signal } = await core()
    const route = signal('journal')
    const { root, waitForChanges } = await render(<oyl-nav routeSignal={route} adminSignal={signal(true)} />)
    const nav = root.shadowRoot!.querySelector('ui-nav') as HTMLElement & { items: unknown[]; current?: string }
    expect(nav.items.map((i: any) => i.name)).toEqual(['journal', 'planner', 'nutrition', 'finance', 'goals', 'vault', 'insights', 'status'])
    expect(nav.current).toBe('journal')
    route.set('status')
    await new Promise((r) => setTimeout(r, 0))
    await waitForChanges()
    expect(nav.current).toBe('status')
  })

  it('hides Status from non-admins, and shows it once the user turns out to be an admin', async () => {
    const { signal } = await core()
    const admin = signal(false)
    const { root, waitForChanges } = await render(<oyl-nav routeSignal={signal('journal')} adminSignal={admin} />)
    const nav = root.shadowRoot!.querySelector('ui-nav') as HTMLElement & { items: unknown[] }
    expect(nav.items.map((i: any) => i.name)).not.toContain('status')
    admin.set(true)
    await new Promise((r) => setTimeout(r, 0))
    await waitForChanges()
    expect(nav.items.map((i: any) => i.name)).toContain('status')
  })

  it('without an admin signal, Status stays hidden', async () => {
    const { signal } = await core()
    const { root } = await render(<oyl-nav routeSignal={signal('journal')} />)
    const nav = root.shadowRoot!.querySelector('ui-nav') as HTMLElement & { items: unknown[] }
    expect(nav.items.map((i: any) => i.name)).toHaveLength(7)
  })

  it('passes orientation through', async () => {
    const { signal } = await core()
    const { root } = await render(<oyl-nav routeSignal={signal('status')} orientation="bottom" />)
    expect(root.shadowRoot!.querySelector('ui-nav')).toHaveAttribute('orientation', 'bottom')
  })
})
