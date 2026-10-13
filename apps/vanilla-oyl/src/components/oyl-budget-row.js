import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { inlineConfirm } from './confirm.js'
import { budgetLabel } from '../budget/format.js'

/** @typedef {import('@oyl/all-of-oyl').Budget} Budget */
/** @typedef {{ progress: import('@oyl/all-of-oyl').GoalProgress, spent: import('@oyl/all-of-oyl').Money }} BudgetStatus */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */

const styles = sheet(`
  :host { display: block; border-top: 1px solid var(--color-border); }
  .row { display: grid; grid-template-columns: 1fr auto; gap: .3rem 1rem; align-items: center; padding: .85rem 0; }
  .title { grid-column: 1; grid-row: 1; color: var(--color-text); text-transform: capitalize; }
  .actions { grid-column: 2; grid-row: 1; align-self: center; display: inline-flex; }
  .bar { grid-column: 1 / -1; grid-row: 2; block-size: .5rem; background: color-mix(in oklch, var(--color-text) 10%, transparent); border-radius: 999px; overflow: hidden; }
  .fill { block-size: 100%; inline-size: 0; background: var(--color-accent); }
  .bar.over .fill { background: var(--color-warn); }
  .label { grid-column: 1 / -1; grid-row: 3; color: var(--color-muted); font-size: var(--step--1); }
  .label.over { color: var(--color-warn); }
  button { font: inherit; color: var(--color-muted); border: 0; background: none; cursor: pointer; border-radius: var(--radius-1); padding: .25rem .5rem; font-size: .85rem; }
  .del:hover { color: var(--color-danger); background: color-mix(in oklch, var(--color-danger) 12%, transparent); }
  .confirm { display: inline-flex; gap: .3rem; align-items: center; font-size: .85rem; color: var(--color-danger); }
  .confirm .yes { color: white; background: var(--color-danger); font-weight: 600; }
  .confirm .no { color: var(--color-muted); background: color-mix(in oklch, var(--color-text) 8%, transparent); }
`)

export class OylBudgetRow extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {Budget} */
    this.budget = /** @type {Budget} */ (/** @type {unknown} */ (undefined))
    /** @type {BudgetStatus} */
    this.status = /** @type {BudgetStatus} */ (/** @type {unknown} */ (undefined))
    /** @type {(id: Id) => void} */
    this.onDelete = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const { progress, spent } = this.status
    const over = progress.met === false
    const row = document.createElement('div')
    row.className = 'row'

    const title = document.createElement('div')
    title.className = 'title'
    title.textContent = this.budget.name ?? this.budget.category

    const actions = document.createElement('div')
    actions.className = 'actions'
    this._renderDelete(actions)

    const bar = document.createElement('div')
    bar.className = over ? 'bar over' : 'bar'
    const fill = document.createElement('div')
    fill.className = 'fill'
    fill.style.setProperty('inline-size', `${Math.round(progress.ratio * 100)}%`)
    bar.append(fill)

    const label = document.createElement('div')
    label.className = over ? 'label over' : 'label'
    label.textContent = budgetLabel(progress, spent, this.budget.limit)

    row.append(title, actions, bar, label)
    root.append(row)
  }

  /** @param {HTMLElement} mount */
  _renderDelete(mount) {
    mount.replaceChildren()
    const del = document.createElement('button')
    del.className = 'del'
    del.dataset.act = 'delete'
    del.textContent = 'Delete'
    del.addEventListener('click', () => {
      inlineConfirm({
        mount,
        prompt: 'Delete?',
        lifecycle: this.lifecycle,
        onYes: () => this.onDelete(this.budget.id),
        restore: () => this._renderDelete(mount),
      })
    }, { signal: this.lifecycle })
    mount.append(del)
  }
}

/** Register the element (idempotent). */
export function defineBudgetRow() {
  if (!customElements.get('oyl-budget-row')) customElements.define('oyl-budget-row', OylBudgetRow)
}
