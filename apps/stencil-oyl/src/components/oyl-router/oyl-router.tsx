import { Component, Element, Prop, State, Watch } from '@stencil/core'
import type { Signal } from '@oyl/all-of-oyl/client'
import { bindSignal } from '../../bridge/signal-state.js'

/** Route name → a factory producing the screen element (props already wired by the boot). */
export type Routes = Record<string, () => HTMLElement>

const SR_ONLY = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap'

/**
 * Mounts the screen for the current route into its own LIGHT DOM (so page-level selectors like
 * `oyl-status h2` reach them). Unknown routes render <oyl-not-found> with the name as text.
 * Owns one persistent polite live region (sr-only by inline style — no shadow, no stylesheet)
 * announcing "Navigated to <route>" on every change after the first, and moves focus to the
 * screen's `h2[tabindex=-1]` — found by walking open shadow roots, since every screen renders
 * its heading in shadow DOM (day-scoped ones inside `oyl-day-nav`'s) — once the screen is ready.
 */
@Component({ tag: 'oyl-router', shadow: false })
export class OylRouter {
  @Element() host!: HTMLElement

  @Prop() routeSignal!: Signal<string>
  @Prop() routes: Routes = {}

  @State() route = ''
  private stop = () => {}
  private live = createLive()

  connectedCallback() {
    this.stop = bindSignal(this.routeSignal, (r) => (this.route = r))
  }

  disconnectedCallback() {
    this.stop()
  }

  componentDidLoad() {
    void this.mount(false)
  }

  @Watch('route')
  onRouteChange() {
    void this.mount(true)
  }

  private async mount(announce: boolean) {
    const route = this.route
    const make = this.routes[route]
    const screen = make ? make() : notFound(route)
    this.host.replaceChildren(screen, this.live)
    if (!announce) return
    this.live.textContent = `Navigated to ${route}`
    await (screen as HTMLElement & { componentOnReady?: () => Promise<unknown> }).componentOnReady?.()
    if (this.route !== route) return
    deepQuery(screen, 'h2[tabindex="-1"]')?.focus()
  }

  render() {
    return null
  }
}

function createLive(): HTMLDivElement {
  const live = document.createElement('div')
  live.setAttribute('aria-live', 'polite')
  live.setAttribute('style', SR_ONLY)
  return live
}

/** First match in DOM order, descending into open shadow roots. */
function deepQuery(root: Element, selector: string): HTMLElement | null {
  const direct = root.shadowRoot?.querySelector(selector) ?? root.querySelector(selector)
  if (direct) return direct as HTMLElement
  const scopes: (Element | ShadowRoot)[] = root.shadowRoot ? [root.shadowRoot, root] : [root]
  for (const scope of scopes) {
    for (const child of Array.from(scope.querySelectorAll('*'))) {
      if (child.shadowRoot) {
        const found = deepQuery(child, selector)
        if (found) return found
      }
    }
  }
  return null
}

function notFound(route: string): HTMLElement {
  const el = document.createElement('oyl-not-found') as HTMLElement & { route: string }
  el.route = route
  return el
}
