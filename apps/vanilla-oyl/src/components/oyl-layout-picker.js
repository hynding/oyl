import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { LAYOUTS, byId } from '../layouts/layout-catalog.js'

/** @typedef {ReturnType<typeof import('../state/layout.js').createLayoutState>} LayoutState */

const styles = sheet(`
  :host { position: relative; display: inline-block; }
  .trigger {
    display: inline-flex; align-items: center; gap: var(--space-2);
    background: var(--color-surface); color: var(--color-text);
    border: 1px solid var(--color-border); border-radius: 999px;
    padding: 0.3rem 0.8rem; font: inherit; font-size: 0.85rem; cursor: pointer;
  }
  .trigger:hover { border-color: var(--color-accent); }
  .trigger:active { transform: scale(0.98); }
  .panel {
    position: absolute; inset-inline-end: 0; inset-block-start: calc(100% + var(--space-2));
    z-index: 30; inline-size: min(17rem, calc(100vw - 2rem));
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius-2); padding: var(--space-3);
    box-shadow: 0 12px 32px color-mix(in oklch, var(--color-text) 18%, transparent);
    display: grid; gap: var(--space-2);
  }
  .panel[hidden] { display: none; }
  .group-label { margin: 0; font-size: 0.72rem; font-weight: 600; color: var(--color-muted); }
  .option {
    display: grid; gap: 0.15rem; padding: var(--space-2);
    border: 1px solid var(--color-border); border-radius: var(--radius-1);
    background: var(--color-surface); font: inherit; text-align: start; cursor: pointer;
  }
  .option:hover { border-color: var(--color-accent); }
  .option[aria-checked="true"] { border-color: var(--color-accent); box-shadow: inset 0 0 0 1px var(--color-accent); }
  .name { font-size: 0.8rem; font-weight: 600; color: var(--color-text); }
  .hint { font-size: 0.7rem; color: var(--color-muted); }
`)

export class OylLayoutPicker extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** Assigned by the host before connect. @type {LayoutState} */
    this.layoutState = /** @type {LayoutState} */ (/** @type {unknown} */ (undefined))
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)

    const trigger = document.createElement('button')
    trigger.className = 'trigger'
    trigger.setAttribute('data-layout-trigger', '')
    trigger.setAttribute('aria-haspopup', 'true')
    trigger.setAttribute('aria-expanded', 'false')
    const triggerLabel = document.createElement('span')
    trigger.append(triggerLabel)

    const panel = document.createElement('div')
    panel.setAttribute('data-layout-panel', '')
    panel.className = 'panel'
    panel.hidden = true

    const label = document.createElement('p')
    label.className = 'group-label'
    label.textContent = 'Layout'
    const group = document.createElement('div')
    group.setAttribute('role', 'radiogroup')
    group.setAttribute('aria-label', 'Layout')
    group.style.display = 'grid'
    group.style.gap = 'var(--space-2)'
    // Roving arrow-key selection — copied verbatim from oyl-theme-toggle.js `_radiogroup`.
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
        next.click() // radios select on arrow movement; selection applies the layout live
      },
      { signal: this.lifecycle },
    )

    /** @type {Map<string, HTMLButtonElement>} */
    const buttons = new Map()
    for (const l of LAYOUTS) {
      const btn = document.createElement('button')
      btn.className = 'option'
      btn.setAttribute('role', 'radio')
      btn.setAttribute('data-layout-option', l.id)
      const name = document.createElement('span')
      name.className = 'name'
      name.textContent = l.label
      const hint = document.createElement('span')
      hint.className = 'hint'
      hint.textContent = l.description
      btn.append(name, hint)
      btn.addEventListener('click', () => this.layoutState.setLayout(l.id), { signal: this.lifecycle })
      buttons.set(l.id, btn)
      group.append(btn)
    }

    panel.append(label, group)
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
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (!panel.hidden && !e.composedPath().includes(this)) setOpen(false)
      },
      { signal: this.lifecycle },
    )

    this.track(() => {
      const active = byId(this.layoutState.layout.get())
      triggerLabel.textContent = active.label
      trigger.setAttribute('aria-label', `Layout: ${active.label}. Open layout picker`)
      for (const [id, btn] of buttons) {
        const checked = id === active.id
        btn.setAttribute('aria-checked', String(checked))
        btn.tabIndex = checked ? 0 : -1
      }
    })
  }
}

/** Register the element (idempotent — safe across test files). */
export function defineLayoutPicker() {
  if (!customElements.get('oyl-layout-picker')) customElements.define('oyl-layout-picker', OylLayoutPicker)
}
