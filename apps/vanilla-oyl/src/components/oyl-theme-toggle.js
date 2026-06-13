import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { THEMES, MODES } from '../theme/theme-manager.js'

/** @typedef {ReturnType<typeof import('../state/theme.js').createThemeState>} ThemeState */

const styles = sheet(`
  :host { display: inline-flex; gap: var(--space-2); align-items: center; }
  label { display: inline-flex; flex-direction: column; font-size: 0.75rem; color: var(--color-muted); }
  select {
    background: var(--color-surface); color: var(--color-text);
    border: 1px solid var(--color-border); border-radius: var(--radius-1);
    padding: var(--space-1) var(--space-2);
  }
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
    const theme = this._select('theme', THEMES)
    const mode = this._select('mode', MODES)
    root.append(this._labeled('Theme', theme), this._labeled('Mode', mode))
    // Reflect external/multi-tab changes back into the controls.
    this.track(() => {
      theme.value = this.themeState.settings.get().theme
      mode.value = this.themeState.settings.get().mode
    })
  }

  /** @param {'theme'|'mode'} name @param {readonly string[]} options @returns {HTMLSelectElement} */
  _select(name, options) {
    const sel = document.createElement('select')
    sel.name = name
    for (const opt of options) {
      const o = document.createElement('option')
      o.value = opt
      o.textContent = opt
      sel.append(o)
    }
    sel.addEventListener(
      'change',
      () => this.themeState.update({ [name]: /** @type {any} */ (sel.value) }),
      { signal: this.lifecycle },
    )
    return sel
  }

  /** @param {string} text @param {HTMLElement} control @returns {HTMLLabelElement} */
  _labeled(text, control) {
    const label = document.createElement('label')
    label.append(text, control)
    return label
  }
}

/** Register the element (idempotent — safe across test files). */
export function defineThemeToggle() {
  if (!customElements.get('oyl-theme-toggle')) customElements.define('oyl-theme-toggle', OylThemeToggle)
}
