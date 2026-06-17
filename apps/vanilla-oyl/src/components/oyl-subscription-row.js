import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { inlineConfirm } from './confirm.js'
import { formatMoney, dueInLabel, cadenceLabel } from '@oyl/all-of-oyl/format'

/** @typedef {import('@oyl/all-of-oyl').Subscription} Subscription */
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */

const styles = sheet(`
  :host { display: block; border-top: 1px solid var(--color-border); }
  .row { display: grid; grid-template-columns: 1fr auto; gap: .25rem 1rem; align-items: start; padding: .85rem 0; }
  .title { color: var(--color-text); }
  .meta { color: var(--color-muted); font-size: var(--step--1); margin-block-start: .2rem; }
  .due { color: var(--color-muted); font-size: var(--step--1); margin-block-start: .2rem; }
  .due.overdue { color: var(--color-warn); }
  .actions { grid-column: 2; align-self: center; display: inline-flex; gap: .2rem; }
  button { font: inherit; color: var(--color-muted); border: 0; background: none; cursor: pointer; border-radius: var(--radius-1); padding: .25rem .5rem; font-size: .85rem; }
  button:hover { background: color-mix(in oklch, var(--color-text) 8%, transparent); color: var(--color-text); }
  .del:hover { color: var(--color-danger); background: color-mix(in oklch, var(--color-danger) 12%, transparent); }
  .confirm { display: inline-flex; gap: .3rem; align-items: center; font-size: .85rem; color: var(--color-danger); }
  .confirm .yes { color: white; background: var(--color-danger); font-weight: 600; }
  .confirm .no { color: var(--color-muted); background: color-mix(in oklch, var(--color-text) 8%, transparent); }
`)

export class OylSubscriptionRow extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {Subscription} */
    this.subscription = /** @type {Subscription} */ (/** @type {unknown} */ (undefined))
    /** @type {DayKey} */
    this.today = /** @type {DayKey} */ (/** @type {unknown} */ (undefined))
    /** @type {(id: Id) => void} */
    this.onRenew = () => {}
    /** @type {(id: Id) => void} */
    this.onDelete = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const row = document.createElement('div')
    row.className = 'row'

    const main = document.createElement('div')
    const title = document.createElement('div')
    title.className = 'title'
    title.textContent = this.subscription.name
    const meta = document.createElement('div')
    meta.className = 'meta'
    meta.textContent = `${formatMoney(this.subscription.amount)} · ${cadenceLabel(this.subscription.cadence)}`
    main.append(title, meta)
    const due = this.subscription.nextDueOn(this.today)
    if (due) {
      const dueEl = document.createElement('div')
      dueEl.className = 'due'
      if (due.compare(this.today) < 0) dueEl.classList.add('overdue')
      dueEl.textContent = `Renews ${due.value} · ${dueInLabel(due, this.today)}`
      main.append(dueEl)
    }

    const actions = document.createElement('div')
    actions.className = 'actions'
    this._renderActions(actions)

    row.append(main, actions)
    root.append(row)
  }

  /** @param {HTMLElement} mount */
  _renderActions(mount) {
    mount.replaceChildren()
    const renew = document.createElement('button')
    renew.dataset.act = 'renew'
    renew.textContent = 'Renew'
    renew.addEventListener('click', () => this.onRenew(this.subscription.id), { signal: this.lifecycle })
    const del = document.createElement('button')
    del.className = 'del'
    del.dataset.act = 'delete'
    del.textContent = 'Delete'
    del.addEventListener('click', () => {
      inlineConfirm({
        mount,
        prompt: 'Delete?',
        lifecycle: this.lifecycle,
        onYes: () => this.onDelete(this.subscription.id),
        restore: () => this._renderActions(mount),
      })
    }, { signal: this.lifecycle })
    mount.append(renew, del)
  }
}

/** Register the element (idempotent). */
export function defineSubscriptionRow() {
  if (!customElements.get('oyl-subscription-row')) customElements.define('oyl-subscription-row', OylSubscriptionRow)
}
