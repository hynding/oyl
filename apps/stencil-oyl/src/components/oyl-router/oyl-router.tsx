import { Component, Element, Prop, State, Watch } from '@stencil/core'
import type { Signal } from '@oyl/all-of-oyl/client'
import { bindSignal } from '../../bridge/signal-state.js'

export type RouteFactory = () => HTMLElement
export type Routes = Record<string, RouteFactory>

/**
 * Switches one screen element on the route signal. Screens are created by the `routes`
 * factories and placed in the router's LIGHT DOM (so document CSS and e2e selectors like
 * `oyl-status h2` reach them). Unknown routes render <oyl-not-found> with the name as text.
 */
@Component({ tag: 'oyl-router', shadow: false })
export class OylRouter {
  @Element() host!: HTMLElement

  @Prop() routeSignal!: Signal<string>
  @Prop() routes: Routes = {}

  @State() route = ''
  private stop = () => {}

  connectedCallback() {
    this.stop = bindSignal(this.routeSignal, (r) => (this.route = r))
  }

  disconnectedCallback() {
    this.stop()
  }

  componentDidLoad() {
    this.mount()
  }

  @Watch('route')
  onRouteChange() {
    this.mount()
  }

  private mount() {
    const make = this.routes[this.route]
    const screen = make ? make() : notFound(this.route)
    this.host.replaceChildren(screen)
  }

  render() {
    return null
  }
}

function notFound(route: string): HTMLElement {
  const el = document.createElement('oyl-not-found') as HTMLElement & { route: string }
  el.route = route
  return el
}
