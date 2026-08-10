import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { MOBILE_SHEET_CSS, closeOnOutside } from './popover-sheet.js'
import { THEMES, MODES } from '../theme/theme-manager.js'
import { THEME_CATALOG } from '../theme/theme-catalog.js'

/** @typedef {ReturnType<typeof import('../state/theme.js').createThemeState>} ThemeState */
/** @typedef {import('../theme/theme-manager.js').Theme} Theme */
/** @typedef {import('../theme/theme-manager.js').Mode} Mode */

const MODE_LABELS = /** @type {Record<Mode, string>} */ ({ system: 'System', light: 'Light', dark: 'Dark' })

const styles = sheet(`
  :host { position: relative; display: inline-block; }
  .trigger {
    display: inline-flex; align-items: center; gap: var(--space-2);
    background: var(--color-surface); color: var(--color-text);
    border: 1px solid var(--color-border); border-radius: 999px;
    padding: 0.3rem 0.8rem 0.3rem 0.5rem; font: inherit; font-size: 0.85rem; cursor: pointer;
  }
  .trigger:hover { border-color: var(--color-accent); }
  .trigger:active { transform: scale(0.98); }
  .chips { display: inline-flex; }
  .chip {
    inline-size: 0.95rem; block-size: 0.95rem; border-radius: 50%;
    border: 1px solid var(--color-border);
  }
  .chip + .chip { margin-inline-start: -0.4rem; }
  .panel {
    position: absolute; inset-inline-end: 0; inset-block-start: calc(100% + var(--space-2));
    z-index: 30; inline-size: min(21rem, calc(100vw - 2rem));
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius-2); padding: var(--space-3);
    box-shadow: 0 12px 32px color-mix(in oklch, var(--color-text) 18%, transparent);
    display: grid; gap: var(--space-3);
  }
  /* display:grid would otherwise defeat the hidden attribute's display:none. */
  .panel[hidden] { display: none; }
  /* Mobile: shared viewport-anchored sheet (see popover-sheet.js for the why).
     Must stay AFTER the base .panel rule (same specificity — order decides). */
  ${MOBILE_SHEET_CSS}
  .group-label { margin: 0; font-size: 0.72rem; font-weight: 600; color: var(--color-muted); }
  .themes {
    display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2);
    max-block-size: min(65vh, 29rem); overflow: auto;
  }
  .option {
    display: grid; gap: 0.3rem; padding: var(--space-2);
    border: 1px solid var(--color-border); border-radius: var(--radius-1);
    background: var(--color-surface); font: inherit; text-align: start; cursor: pointer;
  }
  .option:hover { border-color: var(--color-accent); }
  .option:active { transform: scale(0.98); }
  .option[aria-checked="true"] { border-color: var(--color-accent); box-shadow: inset 0 0 0 1px var(--color-accent); }
  .swatch { position: relative; block-size: 2.1rem; border-radius: var(--radius-1); border: 1px solid var(--color-border); overflow: hidden; }
  .swatch-surface { position: absolute; inset-block-end: 0; inset-inline: 0; block-size: 40%; }
  .swatch-accent {
    position: absolute; inset-block-start: 0.35rem; inset-inline-start: 0.4rem;
    inline-size: 0.7rem; block-size: 0.7rem; border-radius: 50%;
  }
  .name { font-size: 0.8rem; font-weight: 600; color: var(--color-text); }
  .tagline { font-size: 0.7rem; color: var(--color-muted); }
  .modes { display: grid; grid-auto-flow: column; border: 1px solid var(--color-border); border-radius: 999px; padding: 2px; }
  .mode {
    border: 0; background: transparent; color: var(--color-muted);
    font: inherit; font-size: 0.8rem; padding: 0.3rem 0.6rem; border-radius: 999px; cursor: pointer;
  }
  .mode[aria-checked="true"] { background: var(--color-accent); color: var(--color-on-accent, white); font-weight: 600; }
`)

export class OylThemeToggle extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    // Assigned by the host before connect; typed non-optional so usages need no null-guards.
    /** @type {ThemeState} */
    this.themeState = /** @type {ThemeState} */ (/** @type {unknown} */ (undefined))
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)

    const trigger = document.createElement('button')
    trigger.className = 'trigger'
    trigger.setAttribute('data-picker-trigger', '')
    trigger.setAttribute('aria-haspopup', 'true')
    trigger.setAttribute('aria-expanded', 'false')
    const chips = document.createElement('span')
    chips.className = 'chips'
    const chipEls = ['bg', 'surface', 'accent'].map(() => {
      const c = document.createElement('span')
      c.className = 'chip'
      chips.append(c)
      return c
    })
    const triggerLabel = document.createElement('span')
    trigger.append(chips, triggerLabel)

    const panel = document.createElement('div')
    panel.setAttribute('data-picker-panel', '')
    panel.className = 'panel'
    panel.hidden = true

    const themeGroup = this._radiogroup('Theme', 'themes')
    /** @type {Map<Theme, HTMLButtonElement>} */
    const themeButtons = new Map()
    for (const theme of THEMES) {
      const btn = this._themeOption(theme)
      themeButtons.set(theme, btn)
      themeGroup.group.append(btn)
    }

    const modeGroup = this._radiogroup('Appearance', 'modes')
    /** @type {Map<Mode, HTMLButtonElement>} */
    const modeButtons = new Map()
    for (const mode of MODES) {
      const btn = document.createElement('button')
      btn.className = 'mode'
      btn.setAttribute('role', 'radio')
      btn.setAttribute('data-mode-option', mode)
      btn.textContent = MODE_LABELS[mode]
      btn.addEventListener('click', () => this.themeState.update({ mode }), { signal: this.lifecycle })
      modeButtons.set(mode, btn)
      modeGroup.group.append(btn)
    }

    panel.append(themeGroup.label, themeGroup.group, modeGroup.label, modeGroup.group)
    root.append(trigger, panel)

    const setOpen = (/** @type {boolean} */ open) => {
      panel.hidden = !open
      trigger.setAttribute('aria-expanded', String(open))
    }
    trigger.addEventListener('click', () => setOpen(panel.hidden), { signal: this.lifecycle })
    root.addEventListener(
      'keydown',
      (e) => {
        if (/** @type {KeyboardEvent} */ (e).key === 'Escape' && !panel.hidden) {
          setOpen(false)
          trigger.focus()
        }
      },
      { signal: this.lifecycle },
    )
    closeOnOutside(this, panel, setOpen, this.lifecycle)

    // Reflect settings (local changes and multi-tab refreshes) into every control.
    this.track(() => {
      const { theme, mode } = this.themeState.settings.get()
      const info = THEME_CATALOG[theme]
      triggerLabel.textContent = info.label
      trigger.setAttribute('aria-label', `Theme: ${info.label}. Open theme picker`)
      const previews = [info.preview.bg, info.preview.surface, info.preview.accent]
      chipEls.forEach((chip, i) => chip.style.setProperty('background', previews[i] ?? ''))
      for (const [value, btn] of themeButtons) {
        const checked = value === theme
        btn.setAttribute('aria-checked', String(checked))
        btn.tabIndex = checked ? 0 : -1
      }
      for (const [value, btn] of modeButtons) {
        const checked = value === mode
        btn.setAttribute('aria-checked', String(checked))
        btn.tabIndex = checked ? 0 : -1
      }
    })
  }

  /**
   * A labeled radiogroup container with roving arrow-key selection.
   * @param {string} label @param {string} className
   */
  _radiogroup(label, className) {
    const p = document.createElement('p')
    p.className = 'group-label'
    p.textContent = label
    const group = document.createElement('div')
    group.className = className
    group.setAttribute('role', 'radiogroup')
    group.setAttribute('aria-label', label)
    group.addEventListener(
      'keydown',
      (e) => {
        const key = /** @type {KeyboardEvent} */ (e).key
        const delta = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0
        if (!delta) return
        e.preventDefault()
        const radios = /** @type {HTMLButtonElement[]} */ ([...group.querySelectorAll('[role="radio"]')])
        const current = radios.findIndex((r) => r.getAttribute('aria-checked') === 'true')
        const next = radios[(current + delta + radios.length) % radios.length]
        if (!next) return
        next.focus()
        next.click() // radios select on arrow movement; selection applies the theme live
      },
      { signal: this.lifecycle },
    )
    return { label: p, group }
  }

  /** A theme option button with a live swatch. @param {Theme} theme @returns {HTMLButtonElement} */
  _themeOption(theme) {
    const info = THEME_CATALOG[theme]
    const btn = document.createElement('button')
    btn.className = 'option'
    btn.setAttribute('role', 'radio')
    btn.setAttribute('data-theme-option', theme)

    const swatch = document.createElement('span')
    swatch.className = 'swatch'
    swatch.style.setProperty('background', info.preview.bg)
    const surface = document.createElement('span')
    surface.className = 'swatch-surface'
    surface.style.setProperty('background', info.preview.surface)
    const accent = document.createElement('span')
    accent.className = 'swatch-accent'
    accent.style.setProperty('background', info.preview.accent)
    swatch.append(surface, accent)

    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = info.label
    const tagline = document.createElement('span')
    tagline.className = 'tagline'
    tagline.textContent = info.tagline

    btn.append(swatch, name, tagline)
    btn.addEventListener('click', () => this.themeState.update({ theme }), { signal: this.lifecycle })
    return btn
  }
}

/** Register the element (idempotent — safe across test files). */
export function defineThemeToggle() {
  if (!customElements.get('oyl-theme-toggle')) customElements.define('oyl-theme-toggle', OylThemeToggle)
}
