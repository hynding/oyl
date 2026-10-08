import { Component, Event, Prop, h, type EventEmitter } from '@stencil/core'
import type { Signal } from '@oyl/all-of-oyl/client'
import type { AuthApi } from '../oyl-auth-form/oyl-auth-form.js'

@Component({ tag: 'oyl-register', styleUrl: 'oyl-register.css', shadow: true })
export class OylRegister {
  @Prop() auth!: AuthApi
  @Prop() googleAuth?: Signal<{ href: string } | null>

  /** The user signed in; the app sets remote mode and navigates into the app. */
  @Event() authenticated!: EventEmitter<void>

  render() {
    return (
      <ui-card>
        <h2 tabindex="-1">Create account</h2>
        <oyl-auth-form mode="register" auth={this.auth} googleAuth={this.googleAuth} onSuccess={(e: Event) => { e.stopPropagation(); this.authenticated.emit() }} />
        <p class="alt">
          <a href="/login">Already have an account? Sign in</a>
        </p>
      </ui-card>
    )
  }
}
