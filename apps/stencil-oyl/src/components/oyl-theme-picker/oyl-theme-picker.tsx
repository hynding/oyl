import { Component, Element, Prop, State, h } from '@stencil/core'
import { bindSignal } from '../../bridge/signal-state.js'
import { THEMES, MODES, MODE_LABELS, THEME_CATALOG, type Mode, type Theme, type ThemeSettings, type ThemeState } from '../../boot/theme.js'

/**
 * Toolbar theme picker (port of vanilla's oyl-theme-toggle UX): a trigger showing the current
 * theme's three color chips + name; a popover with one swatch card per theme (radiogroup) and
 * a System/Light/Dark segmented control. Selection applies instantly and the panel stays open,
 * so browsing is a live preview loop; arrow keys move and select.
 *
 * The radio options are native <button role="radio"> rather than ui-button: they are a
 * radiogroup with roving tabindex and aria-checked, not actions.
 */
@Component({ tag: 'oyl-theme-picker', styleUrl: 'oyl-theme-picker.css', shadow: true })
export class OylThemePicker {
  @Element() host!: HTMLElement
  @Prop() themeState!: ThemeState

  @State() settings: ThemeSettings = { theme: 'classic', mode: 'system' }
  @State() open = false
  private stop = () => {}
  private closers = new AbortController()

  connectedCallback() {
    this.stop = bindSignal(this.themeState.settings, (s) => (this.settings = s))
    // Outside closer: pointer AND keyboard parity (Enter-activated triggers fire no pointerdown).
    this.closers = new AbortController()
    this.host.addEventListener('keydown', this.onKeydown, { signal: this.closers.signal })
    for (const type of ['pointerdown', 'focusin']) {
      document.addEventListener(type, (e) => { if (this.open && !e.composedPath().includes(this.host)) this.open = false }, { signal: this.closers.signal })
    }
  }

  disconnectedCallback() {
    this.stop()
    this.closers.abort()
  }

  private onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.open) {
      this.open = false
      ;(this.host.shadowRoot?.querySelector('[data-picker-trigger]') as HTMLElement | null)?.focus()
    }
  }

  /** Roving arrow-key selection inside a radiogroup; selection applies live. */
  private onGroupKeydown = (e: KeyboardEvent) => {
    const key = e.key
    const delta = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const group = e.currentTarget as HTMLElement
    const radios = [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
    const current = radios.findIndex((r) => r.getAttribute('aria-checked') === 'true')
    const next = radios[(current + delta + radios.length) % radios.length]
    if (!next) return
    next.focus()
    next.click()
  }

  render() {
    const { theme, mode } = this.settings
    const info = THEME_CATALOG[theme]
    const previews = [info.preview.bg, info.preview.surface, info.preview.accent]
    return (
      <div>
        <button
          class="trigger"
          type="button"
          data-picker-trigger
          aria-haspopup="true"
          aria-expanded={String(this.open)}
          aria-label={`Theme: ${info.label}. Open theme picker`}
          onClick={() => (this.open = !this.open)}
        >
          <span class="chips">
            {previews.map((bg) => <span class="chip" style={{ background: bg }} />)}
          </span>
          <span>{info.label}</span>
        </button>
        <div class="panel" data-picker-panel hidden={!this.open}>
          <p class="group-label">Theme</p>
          <div class="themes" role="radiogroup" aria-label="Theme" onKeyDown={this.onGroupKeydown}>
            {THEMES.map((t: Theme) => this.themeOption(t, t === theme))}
          </div>
          <p class="group-label">Appearance</p>
          <div class="modes" role="radiogroup" aria-label="Appearance" onKeyDown={this.onGroupKeydown}>
            {MODES.map((m: Mode) => (
              <button
                class="mode"
                type="button"
                role="radio"
                data-mode-option={m}
                aria-checked={String(m === mode)}
                tabindex={m === mode ? 0 : -1}
                onClick={() => this.themeState.update({ mode: m })}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  private themeOption(t: Theme, checked: boolean) {
    const info = THEME_CATALOG[t]
    return (
      <button
        class="option"
        type="button"
        role="radio"
        data-theme-option={t}
        aria-checked={String(checked)}
        tabindex={checked ? 0 : -1}
        onClick={() => this.themeState.update({ theme: t })}
      >
        <span class="swatch" style={{ background: info.preview.bg }}>
          <span class="swatch-surface" style={{ background: info.preview.surface }} />
          <span class="swatch-accent" style={{ background: info.preview.accent }} />
        </span>
        <span class="name">{info.label}</span>
        <span class="tagline">{info.tagline}</span>
      </button>
    )
  }
}
