import { Component, Event, Prop, State, h, type EventEmitter } from '@stencil/core'
import type { Signal } from '@oyl/all-of-oyl/client'
import { bindSignal } from '../../bridge/signal-state.js'

/** The app's single transient notice (boot/sync errors), fixed at the top of the viewport. */
@Component({ tag: 'oyl-notice-host', styleUrl: 'oyl-notice-host.css', shadow: true })
export class OylNoticeHost {
  @Prop() notice!: Signal<string | null>
  /** The user dismissed the notice; the host clears the signal. */
  @Event() dismiss!: EventEmitter<void>

  @State() message: string | null = null
  private stop = () => {}

  connectedCallback() {
    this.stop = bindSignal(this.notice, (m) => (this.message = m))
  }

  disconnectedCallback() {
    this.stop()
  }

  render() {
    if (this.message == null) return null
    return (
      <ui-notice tone="warn" dismissible onDismiss={(e: Event) => { e.stopPropagation(); this.dismiss.emit() }}>
        {this.message}
      </ui-notice>
    )
  }
}
