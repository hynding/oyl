import { Component, Element, Event, Prop, State, h, type EventEmitter } from '@stencil/core'
import type { User } from '@oyl/all-of-oyl'
import type { AuthSession, GoogleConnection, ProfilePatch, Signal } from '@oyl/all-of-oyl/client'
import { bindSignal } from '../../bridge/signal-state.js'
import { bodySummary, toPatch } from '../../profile/format.js'

export interface GoogleLink {
  connection: Signal<GoogleConnection>
  connect(): void
  disconnect(): void
}

const EMPTY: ProfilePatch = {}

/**
 * Profile: who is signed in (+ a body summary), the editable profile form, the Google Drive
 * link, a pointer to Status (connection + backups live there) and Log out. Three signals are
 * mirrored into state; the form's `value` is derived in the profile mirror — never in render —
 * so a Google-status change does not hand the form a fresh patch and re-seed it mid-edit.
 */
@Component({ tag: 'oyl-profile', styleUrl: 'oyl-profile.css', shadow: true })
export class OylProfile {
  @Element() host!: HTMLElement

  @Prop() session!: Signal<AuthSession>
  @Prop() profile!: Signal<User | null>
  /** Today as YYYY-MM-DD in the effective timezone (for the age). */
  @Prop() today = ''
  @Prop() google!: GoogleLink
  /** Passed through to the form (tests inject a short list). */
  @Prop() zones?: readonly string[] | null

  /** The user submitted the profile form; detail = the patch. */
  @Event() saveProfile!: EventEmitter<ProfilePatch>
  /** The user asked to log out. */
  @Event() logout!: EventEmitter<void>

  @State() user: AuthSession = null
  @State() prof: User | null = null
  @State() patch: ProfilePatch = EMPTY
  @State() link: GoogleConnection = { state: 'unknown' }

  private stops: (() => void)[] = []

  connectedCallback() {
    this.stops = [
      bindSignal(this.session, (s) => (this.user = s)),
      bindSignal(this.profile, (p) => { this.prof = p; this.patch = p ? toPatch(p) : EMPTY }),
      bindSignal(this.google.connection, (c) => (this.link = c)),
    ]
  }

  disconnectedCallback() {
    for (const stop of this.stops) stop()
    this.stops = []
  }

  private onSave = (e: CustomEvent<ProfilePatch>) => {
    e.stopPropagation()
    this.saveProfile.emit(e.detail)
  }

  private onLogout = () => this.logout.emit()
  /** One stable handler for the Google button (a ui-* host keeps its first render's listener): connected → disconnect, else connect. */
  private onGoogle = () => (this.link.state === 'connected' ? this.google.disconnect() : this.google.connect())

  private googleCard() {
    const c = this.link
    if (c.state === 'unknown' || c.state === 'unconfigured') return null
    return (
      <ui-card heading="Google Drive" data-role="google-drive">
        {c.state === 'connected' ? (
          <div class="row">
            <span>Connected as {c.email ?? ''}</span>
            <ui-button data-act="google-disconnect" onClick={this.onGoogle}>Disconnect</ui-button>
          </div>
        ) : c.state === 'reconnect-needed' ? (
          <div class="stack">
            <p class="muted" data-role="google-reconnect">Google access expired — reconnect to keep using Drive.</p>
            <ui-button data-act="google-connect" onClick={this.onGoogle}>Reconnect</ui-button>
          </div>
        ) : (
          <div class="row">
            <span class="muted">Not connected</span>
            <ui-button data-act="google-connect" onClick={this.onGoogle}>Connect Google Drive</ui-button>
          </div>
        )}
      </ui-card>
    )
  }

  render() {
    const summary = bodySummary(this.prof, this.today)
    const formProps = this.zones === undefined ? {} : { zones: this.zones }
    return (
      <div class="screen">
        <h2 tabindex="-1">Profile</h2>
        <ui-card>
          <div class="identity" data-role="identity">{this.user ? `${this.user.user.username} · ${this.user.user.email}` : ''}</div>
          {summary ? <div class="body-summary" data-role="body-summary">{summary}</div> : null}
        </ui-card>
        <ui-card heading="About you">
          <oyl-profile-form value={this.patch} onSave={this.onSave} {...formProps} />
        </ui-card>
        {this.googleCard()}
        <p class="note">Connection settings and backups live on <a href="/status">Status</a>.</p>
        <div class="logout">
          <ui-button variant="danger" data-act="logout" onClick={this.onLogout}>Log out</ui-button>
        </div>
      </div>
    )
  }
}
