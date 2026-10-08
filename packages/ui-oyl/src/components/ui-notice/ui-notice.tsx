import { Component, Event, Prop, h, type EventEmitter } from '@stencil/core'
import type { IconName } from '../ui-icon/icons.js'

export type NoticeTone = 'info' | 'ok' | 'warn' | 'danger'

const ICON: Record<NoticeTone, IconName> = { info: 'info', ok: 'check', warn: 'warning', danger: 'danger' }

/**
 * Inline banner. Positioning (a fixed top bar, a toast stack) is the app's job.
 * `danger` is announced assertively (`role="alert"`); the other tones are polite.
 */
@Component({ tag: 'ui-notice', styleUrl: 'ui-notice.css', shadow: true })
export class UiNotice {
  @Prop({ reflect: true }) tone: NoticeTone = 'info'
  /** Shows a close control that emits `dismiss`. */
  @Prop() dismissible = false

  /** Fired when the close control is activated. The host decides whether to remove the notice. */
  @Event() dismiss!: EventEmitter<void>

  render() {
    return (
      <div class="notice" role={this.tone === 'danger' ? 'alert' : 'status'}>
        <ui-icon name={ICON[this.tone]} />
        <div class="message">
          <slot />
        </div>
        {this.dismissible && (
          <ui-button variant="ghost" aria-label="Dismiss" onClick={() => this.dismiss.emit()}>
            <ui-icon name="close" size="s" />
          </ui-button>
        )}
      </div>
    )
  }
}
