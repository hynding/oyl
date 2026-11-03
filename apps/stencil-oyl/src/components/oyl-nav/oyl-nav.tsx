import { Component, Prop, State, h } from '@stencil/core'
import type { Signal } from '@oyl/all-of-oyl/client'
import { bindSignal } from '../../bridge/signal-state.js'
import { visibleNavItems } from '../../boot/admin-routes.js'

@Component({ tag: 'oyl-nav', styleUrl: 'oyl-nav.css', shadow: true })
export class OylNav {
  @Prop() routeSignal!: Signal<string>
  /** Whether the user is an admin; admin-only screens (Status) are hidden otherwise. */
  @Prop() adminSignal?: Signal<boolean>
  @Prop() orientation: 'top' | 'bottom' = 'top'

  @State() route = ''
  @State() admin = false
  private stops: Array<() => void> = []

  connectedCallback() {
    this.stops = [bindSignal(this.routeSignal, (r) => (this.route = r))]
    if (this.adminSignal) this.stops.push(bindSignal(this.adminSignal, (a) => (this.admin = a)))
  }

  disconnectedCallback() {
    for (const stop of this.stops) stop()
    this.stops = []
  }

  render() {
    return <ui-nav items={[...visibleNavItems(this.admin)]} current={this.route} orientation={this.orientation} />
  }
}
