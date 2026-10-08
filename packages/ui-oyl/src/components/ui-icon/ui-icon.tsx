import { Component, Prop, h } from '@stencil/core'
import { ICONS, type IconName } from './icons.js'

/**
 * Inline SVG icon from the library's small glyph map. Decorative unless `label` is set.
 */
@Component({ tag: 'ui-icon', styleUrl: 'ui-icon.css', shadow: true })
export class UiIcon {
  /** Glyph name (see `ICON_NAMES`). Unknown names render nothing. */
  @Prop() name!: IconName
  /** `s` = 16px, `m` = 20px. */
  @Prop({ reflect: true }) size: 's' | 'm' = 'm'
  /** Accessible name; when set the icon is announced, otherwise it is hidden from AT. */
  @Prop() label?: string

  render() {
    const d = ICONS[this.name]
    if (!d) return null
    const a11y = this.label ? { role: 'img', 'aria-label': this.label } : { 'aria-hidden': 'true' }
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        {...a11y}
      >
        <path d={d} />
      </svg>
    )
  }
}
