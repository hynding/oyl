import { Component, Element, Event, Prop, State, h, type EventEmitter } from '@stencil/core'
import type { Signal } from '@oyl/all-of-oyl/client'
import { bindSignal } from '../../bridge/signal-state.js'

export interface AuthApi {
  login(identifier: string, password: string): Promise<unknown>
  register(username: string, email: string, password: string): Promise<unknown>
}

/**
 * Login / registration form on ui-field + ui-button, submitted through a native <form>
 * (the primitives are form-associated, so FormData sees their values). Emits `success`
 * after the auth call resolves; a rejection renders inline as a polite live region.
 */
@Component({ tag: 'oyl-auth-form', styleUrl: 'oyl-auth-form.css', shadow: true })
export class OylAuthForm {
  @Element() host!: HTMLElement

  @Prop({ reflect: true }) mode: 'login' | 'register' = 'login'
  @Prop() auth!: AuthApi
  /** Google sign-in link, when the backend has Google configured (null hides it). */
  @Prop() googleAuth?: Signal<{ href: string } | null>

  @Event() success!: EventEmitter<void>

  @State() error = ''
  @State() busy = false
  @State() googleHref: string | null = null
  private stop = () => {}

  connectedCallback() {
    if (this.googleAuth) this.stop = bindSignal(this.googleAuth, (g) => (this.googleHref = g?.href ?? null))
  }

  disconnectedCallback() {
    this.stop()
  }

  private value(name: string): string {
    const el = this.host.shadowRoot?.querySelector(`ui-field[name="${name}"]`) as (HTMLElement & { value: string }) | null
    return el?.value ?? ''
  }

  private onSubmit = async (ev: Event) => {
    ev.preventDefault()
    this.error = ''
    this.busy = true
    try {
      if (this.mode === 'login') await this.auth.login(this.value('identifier'), this.value('password'))
      else await this.auth.register(this.value('username'), this.value('email'), this.value('password'))
      this.success.emit()
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.busy = false
    }
  }

  render() {
    const isLogin = this.mode === 'login'
    return (
      <div>
        <form onSubmit={this.onSubmit}>
          {isLogin ? (
            <ui-field label="Username or email" name="identifier" autocomplete="username" required />
          ) : (
            [
              <ui-field label="Username" name="username" autocomplete="username" required />,
              <ui-field label="Email" name="email" type="email" autocomplete="email" required />,
            ]
          )}
          <ui-field label="Password" name="password" type="password" autocomplete={isLogin ? 'current-password' : 'new-password'} required />
          <ui-button type="submit" variant="primary" disabled={this.busy}>
            {isLogin ? 'Sign in' : 'Create account'}
          </ui-button>
          <p data-role="error" aria-live="polite">{this.error}</p>
        </form>
        {this.googleHref && (
          <div class="alt">
            <p class="divider">or</p>
            {/* rel=external escapes the SPA link interceptor: this must be a server navigation. */}
            <a data-act="google" rel="external" href={this.googleHref}>
              Continue with Google
            </a>
          </div>
        )}
      </div>
    )
  }
}
