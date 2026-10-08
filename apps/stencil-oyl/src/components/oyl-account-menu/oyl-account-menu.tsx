import { Component, Event, Prop, State, h, type EventEmitter } from '@stencil/core'
import type { Signal } from '@oyl/all-of-oyl/client'
import { bindSignal } from '../../bridge/signal-state.js'

/** Toolbar account menu: Profile link always; Log out when signed in, Sign in when not. */
@Component({ tag: 'oyl-account-menu', styleUrl: 'oyl-account-menu.css', shadow: true })
export class OylAccountMenu {
  @Prop() session!: Signal<object | null>
  /** The user asked to log out. */
  @Event() logout!: EventEmitter<void>

  @State() signedIn = false
  private stop = () => {}

  connectedCallback() {
    this.stop = bindSignal(this.session, (s) => (this.signedIn = !!s))
  }

  disconnectedCallback() {
    this.stop()
  }

  render() {
    return (
      <nav aria-label="Account">
        <a href="/profile">Profile</a>
        {this.signedIn ? (
          <ui-button variant="ghost" data-act="logout" onClick={() => this.logout.emit()}>
            Log out
          </ui-button>
        ) : (
          <a href="/login">Sign in</a>
        )}
      </nav>
    )
  }
}
