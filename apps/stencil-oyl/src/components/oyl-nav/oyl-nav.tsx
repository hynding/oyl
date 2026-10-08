import { Component, Prop, State, h } from '@stencil/core'
import type { Signal } from '@oyl/all-of-oyl/client'
import { bindSignal } from '../../bridge/signal-state.js'
import { NAV_ITEMS } from '../../boot/nav-items.js'

@Component({ tag: 'oyl-nav', styleUrl: 'oyl-nav.css', shadow: true })
export class OylNav {
  @Prop() routeSignal!: Signal<string>
  @Prop() orientation: 'top' | 'bottom' = 'top'

  @State() route = ''
  private stop = () => {}

  connectedCallback() {
    this.stop = bindSignal(this.routeSignal, (r) => (this.route = r))
  }

  disconnectedCallback() {
    this.stop()
  }

  render() {
    return <ui-nav items={[...NAV_ITEMS]} current={this.route} orientation={this.orientation} />
  }
}
