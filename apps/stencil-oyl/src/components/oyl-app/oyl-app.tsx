import { Component, Element, Prop, State, h } from '@stencil/core'
import { createApp } from '../../boot/compose.js'
import { buildRoutes } from '../../boot/routes.js'
import type { App, BootWindow } from '../../boot/types.js'
import type { Routes } from '../oyl-router/oyl-router.js'

const MOBILE = '(max-width: 640px)'

/**
 * The composition root element. Boots the app state (createApp) and renders the shell:
 * notice host, header with theme picker + account menu, nav, router. Owns the ≤640px media
 * query that docks the nav as a bottom tab bar.
 */
@Component({ tag: 'oyl-app', styleUrl: 'oyl-app.css', shadow: true })
export class OylApp {
  @Element() host!: HTMLElement

  /** Injectable boot (specs); defaults to the real createApp over window. */
  @Prop() boot: (win: BootWindow) => Promise<App> = (win) => createApp(win)

  @State() app: App | null = null
  @State() routes: Routes = {}
  @State() bootError = ''
  @State() docked = false
  private mql: MediaQueryList | null = null
  private onMedia = (e: MediaQueryListEvent) => (this.docked = e.matches)

  async componentWillLoad() {
    try {
      const app = await this.boot(window as unknown as BootWindow)
      this.routes = buildRoutes(app, document)
      this.app = app
    } catch (err) {
      this.bootError = err instanceof Error ? err.message : String(err)
    }
    document.getElementById('boot-fallback')?.remove()
  }

  connectedCallback() {
    this.mql = window.matchMedia?.(MOBILE) ?? null
    if (this.mql) {
      this.docked = this.mql.matches
      this.mql.addEventListener('change', this.onMedia)
    }
  }

  disconnectedCallback() {
    this.mql?.removeEventListener('change', this.onMedia)
  }

  render() {
    if (this.bootError) return <p class="fallback">OYL failed to start: {this.bootError}</p>
    const app = this.app
    if (!app) return null
    return (
      <div>
        <oyl-notice-host notice={app.noticeState.notice} onDismiss={() => app.noticeState.clear()} />
        <oyl-shell docked={this.docked}>
          <oyl-theme-picker slot="toolbar" themeState={app.themeState} />
          <oyl-account-menu slot="toolbar" session={app.authState.session} onLogout={() => app.authState.logout()} />
          <oyl-nav slot="nav" routeSignal={app.routeState.route} orientation={this.docked ? 'bottom' : 'top'} />
          <oyl-router slot="main" routeSignal={app.routeState.route} routes={this.routes} />
        </oyl-shell>
      </div>
    )
  }
}
