import { render, h, describe, it, expect } from '@stencil/vitest'
import { core } from '../../../vitest-setup.js'

const el = (tag: string, text: string) => { const e = document.createElement(tag); e.textContent = text; return e }

describe('oyl-router', () => {
  it('renders the current route and swaps on change', async () => {
    const { signal } = await core()
    const route = signal('status')
    const routes = { status: () => el('p', 'S'), journal: () => el('p', 'J') }
    const { root, waitForChanges } = await render(<oyl-router routeSignal={route} routes={routes} />)
    expect(root.children).toHaveLength(1)
    expect(root.firstElementChild).toHaveTextContent('S')
    route.set('journal')
    await new Promise((r) => setTimeout(r, 0))
    await waitForChanges()
    expect(root.children).toHaveLength(1)
    expect(root.firstElementChild).toHaveTextContent('J')
  })

  it('renders not-found for an unknown route, with the name as inert text', async () => {
    const { signal } = await core()
    const route = signal('<b>x</b>')
    const { root } = await render(<oyl-router routeSignal={route} routes={{}} />)
    const nf = root.querySelector('oyl-not-found')!
    expect(nf).not.toBeNull()
    expect(nf).toHaveTextContent('<b>x</b>')
    expect(nf.shadowRoot!.querySelector('b')).toBeNull()
  })

  it('stops reacting after disconnect', async () => {
    const { signal } = await core()
    const route = signal('status')
    const routes = { status: () => el('p', 'S'), journal: () => el('p', 'J') }
    const { root, unmount } = await render(<oyl-router routeSignal={route} routes={routes} />)
    unmount()
    route.set('journal')
    await new Promise((r) => setTimeout(r, 0))
    expect(root.firstElementChild).toHaveTextContent('S')
  })
})
