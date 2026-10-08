import { Component, Prop, h } from '@stencil/core'

/**
 * The app frame: header (brand + toolbar), nav row, page. No `container-type` on :host —
 * layout containment would trap the nav's position:fixed bottom bar on mobile.
 * `docked` (set by <oyl-app> from a ≤640px media query) reserves page padding for it.
 */
@Component({ tag: 'oyl-shell', styleUrl: 'oyl-shell.css', shadow: true })
export class OylShell {
  @Prop({ reflect: true }) docked = false

  render() {
    return (
      <div class="frame">
        <header class="bar">
          <h1>OYL</h1>
          <div class="toolbar">
            <slot name="toolbar" />
          </div>
        </header>
        <div class="nav-dock">
          <slot name="nav" />
        </div>
        <main class="page">
          <slot name="main" />
        </main>
      </div>
    )
  }
}
