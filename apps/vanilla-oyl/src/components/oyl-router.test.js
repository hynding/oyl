import { describe, expect, it, beforeAll } from 'vitest'
import { signal } from '../lib/reactive/signal.js'
import { defineRouter } from './oyl-router.js'

beforeAll(() => defineRouter())

describe('<oyl-router>', () => {
  it('renders the view for the active route and swaps on change', async () => {
    const route = signal('status')
    const el = /** @type {import('./oyl-router.js').OylRouter} */ (document.createElement('oyl-router'))
    el.routeSignal = route
    el.routes = {
      status: () => {
        const d = document.createElement('div')
        d.textContent = 'STATUS VIEW'
        return d
      },
      other: () => {
        const d = document.createElement('div')
        d.textContent = 'OTHER VIEW'
        return d
      },
    }
    document.body.append(el)
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)
    expect(root.textContent).toContain('STATUS VIEW')

    route.set('other')
    await Promise.resolve()
    expect(root.textContent).toContain('OTHER VIEW')
    el.remove()
  })

  it('shows a not-found view for an unknown route', async () => {
    const route = signal('nope')
    const el = /** @type {import('./oyl-router.js').OylRouter} */ (document.createElement('oyl-router'))
    el.routeSignal = route
    el.routes = { status: () => document.createElement('div') }
    document.body.append(el)
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)
    expect(root.textContent?.toLowerCase()).toContain('not found')
    el.remove()
  })
})
