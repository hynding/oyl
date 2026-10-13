import { render, h, describe, it, expect } from '@stencil/vitest'
import { core } from '../../../vitest-setup.js'

const el = (tag: string, text: string) => { const e = document.createElement(tag); e.textContent = text; return e }
/** A screen whose heading sits in the light DOM. */
const screen = (text: string) => { const s = document.createElement('div'); const h2 = el('h2', text); h2.tabIndex = -1; s.append(h2); return s }
/** A screen whose heading sits inside an open shadow root (every real screen does). */
const shadowScreen = (text: string) => { const s = document.createElement('div'); const sr = s.attachShadow({ mode: 'open' }); const h2 = el('h2', text); h2.tabIndex = -1; sr.append(h2); return s }
const tick = () => new Promise((r) => setTimeout(r, 0))
const announcer = (root: HTMLElement) => root.querySelector('[aria-live="polite"]')!
const deepActive = () => { let a: Element | null = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return a }

describe('oyl-router', () => {
  it('renders the current route and swaps on change, keeping one announcer', async () => {
    const { signal } = await core()
    const route = signal('status')
    const routes = { status: () => el('p', 'S'), journal: () => el('p', 'J') }
    const { root, waitForChanges } = await render(<oyl-router routeSignal={route} routes={routes} />)
    expect(root.children).toHaveLength(2)
    expect(root.firstElementChild).toHaveTextContent('S')
    expect(announcer(root)).toHaveTextContent('')
    const live = announcer(root)
    route.set('journal')
    await tick()
    await waitForChanges()
    expect(root.children).toHaveLength(2)
    expect(root.firstElementChild).toHaveTextContent('J')
    expect(announcer(root)).toBe(live)
    expect(live).toHaveTextContent('Navigated to journal')
  })

  it('announces nothing and leaves focus alone on the first mount; focuses the heading on a change (through shadow roots)', async () => {
    const { signal } = await core()
    const route = signal('status')
    const routes = { status: () => screen('Status'), goals: () => shadowScreen('Goals'), plain: () => el('p', 'no heading') }
    const { root, waitForChanges } = await render(<oyl-router routeSignal={route} routes={routes} />)
    expect(deepActive()?.tagName).not.toBe('H2')
    route.set('goals')
    await tick(); await waitForChanges(); await tick()
    expect(deepActive()?.tagName).toBe('H2')
    expect(deepActive()).toHaveTextContent('Goals')
    expect(announcer(root)).toHaveTextContent('Navigated to goals')
    route.set('plain')
    await tick(); await waitForChanges(); await tick()
    expect(announcer(root)).toHaveTextContent('Navigated to plain')
    expect(root.firstElementChild).toHaveTextContent('no heading')
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
    await tick()
    expect(root.firstElementChild).toHaveTextContent('S')
  })
})
