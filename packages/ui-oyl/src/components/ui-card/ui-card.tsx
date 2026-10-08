import { Component, Element, Prop, State, h } from '@stencil/core'

/**
 * A bordered surface with optional header and footer regions. The `header` slot replaces
 * the `heading` prop; the `footer` region appears only when the `footer` slot is filled.
 */
@Component({ tag: 'ui-card', styleUrl: 'ui-card.css', shadow: true })
export class UiCard {
  @Element() host!: HTMLElement

  /** Section title, rendered as an `<h2>` unless the `header` slot is used. */
  @Prop() heading?: string
  /** `none` removes the body padding (for lists whose rows carry their own). */
  @Prop({ reflect: true }) padding: 'md' | 'none' = 'md'

  @State() hasHeaderSlot = false
  @State() hasFooterSlot = false

  componentWillLoad() {
    this.readSlots()
  }

  private readSlots() {
    this.hasHeaderSlot = this.host.querySelector(':scope > [slot="header"]') !== null
    this.hasFooterSlot = this.host.querySelector(':scope > [slot="footer"]') !== null
  }

  render() {
    const showHeader = this.hasHeaderSlot || this.heading !== undefined
    return (
      <div class="card">
        {showHeader && (
          <header>{this.hasHeaderSlot ? <slot name="header" /> : <h2>{this.heading}</h2>}</header>
        )}
        <div class={{ body: true, flush: this.padding === 'none' }}>
          <slot />
        </div>
        {this.hasFooterSlot && (
          <footer>
            <slot name="footer" />
          </footer>
        )}
      </div>
    )
  }
}
