import { Component, Event, Prop, h, type EventEmitter } from '@stencil/core'
import type { Signal } from '@oyl/all-of-oyl/client'
import type { AuthApi } from '../oyl-auth-form/oyl-auth-form.js'

@Component({ tag: 'oyl-login', styleUrl: 'oyl-login.css', shadow: true })
export class OylLogin {
  @Prop() auth!: AuthApi
  @Prop() googleAuth?: Signal<{ href: string } | null>

  /** The user signed in; the app sets remote mode and navigates into the app. */
  @Event() authenticated!: EventEmitter<void>

  render() {
    return (
      <ui-card>
        <h2 tabindex="-1">Sign in</h2>
        <oyl-auth-form mode="login" auth={this.auth} googleAuth={this.googleAuth} onSuccess={(e: Event) => { e.stopPropagation(); this.authenticated.emit() }} />
        <p class="alt">
          <a href="/register">Create an account</a>
        </p>
      </ui-card>
    )
  }
}
