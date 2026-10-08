import { Component, Prop, h } from '@stencil/core'
import type { IconName } from '../ui-icon/icons.js'

export interface NavItem {
  /** Route name compared with `current` (the first path segment in OYL). */
  name: string
  href: string
  label: string
  icon: IconName
}

/**
 * Primary navigation: a horizontal tab row, or a fixed bottom tab bar when
 * `orientation="bottom"` (the app flips it from a media query). Items are plain
 * same-origin anchors so the app's link interceptor handles navigation — the
 * component never calls `preventDefault` or emits a navigate event.
 */
@Component({ tag: 'ui-nav', styleUrl: 'ui-nav.css', shadow: true })
export class UiNav {
  @Prop() items: NavItem[] = []
  /** Route name of the active item. */
  @Prop() current?: string
  @Prop({ reflect: true }) orientation: 'top' | 'bottom' = 'top'

  render() {
    return (
      <nav aria-label="Primary">
        {this.items.map((item) => (
          <a href={item.href} aria-current={item.name === this.current ? 'page' : undefined}>
            <ui-icon name={item.icon} />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
    )
  }
}
