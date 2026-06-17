import { Task, Appointment } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { inlineConfirm } from './confirm.js'
import { cadenceLabel, appointmentTime } from '@oyl/all-of-oyl/format'
import { overdueBadge } from '../planner/format.js'

/** @typedef {import('@oyl/all-of-oyl').Plan} Plan */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */

const styles = sheet(`
  :host { display: block; container-type: inline-size; border-top: 1px solid var(--color-border); }
  .row { display: grid; grid-template-columns: auto 1fr auto; gap: .25rem .8rem; align-items: start; padding: .8rem 0; }
  .check { appearance: none; inline-size: 1.25rem; block-size: 1.25rem; border: 1.5px solid var(--color-border); border-radius: 999px; cursor: pointer; margin-block-start: .15rem; display: grid; place-items: center; }
  .check:hover { border-color: var(--color-accent); }
  .check:checked, .check.done { background: var(--color-accent); border-color: var(--color-accent); }
  .check:checked::after, .check.done::after { content: "✓"; color: white; font-size: .8rem; }
  .body { grid-column: 2; }
  .title { color: var(--color-text); }
  .done .title, .canceled .title { text-decoration: line-through; color: var(--color-muted); }
  .meta { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin-block-start: .2rem; }
  .time { font-family: var(--font-mono); font-size: .85rem; color: var(--color-muted); font-variant-numeric: tabular-nums; }
  .badge { font-size: .68rem; font-weight: 650; padding: .1rem .45rem; border-radius: 999px; }
  .badge.appt { color: var(--color-accent); background: color-mix(in oklch, var(--color-accent) 14%, transparent); }
  .badge.recur { color: var(--color-muted); background: color-mix(in oklch, var(--color-text) 8%, transparent); }
  .badge.overdue { color: var(--color-warn); background: color-mix(in oklch, var(--color-warn) 16%, transparent); }
  .badge.cancel { color: var(--color-muted); background: color-mix(in oklch, var(--color-text) 8%, transparent); }
  .actions { grid-column: 3; align-self: center; display: inline-flex; gap: .2rem; }
  button { font: inherit; color: var(--color-muted); border: 0; background: none; cursor: pointer; border-radius: var(--radius-1); padding: .25rem .5rem; font-size: .85rem; }
  button:hover { background: color-mix(in oklch, var(--color-text) 8%, transparent); color: var(--color-text); }
  button.del:hover { color: var(--color-danger); background: color-mix(in oklch, var(--color-danger) 12%, transparent); }
  .confirm { display: inline-flex; gap: .3rem; align-items: center; font-size: .85rem; color: var(--color-danger); }
  .confirm .yes { color: white; background: var(--color-danger); font-weight: 600; }
  @container (max-width: 26rem) { .row { grid-template-columns: auto 1fr; } .actions { grid-column: 2; margin-block-start: .3rem; } }
`)

export class OylPlanRow extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {Plan} */
    this.plan = /** @type {Plan} */ (/** @type {unknown} */ (undefined))
    /** @type {(id: Id) => void} */
    this.onComplete = () => {}
    /** @type {(id: Id) => void} */
    this.onCancel = () => {}
    /** @type {(id: Id) => void} */
    this.onDelete = () => {}
    /** @type {DayKey | undefined} */
    this.overdueAsOf = undefined
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const status = this.plan.status
    const row = document.createElement('div')
    row.className = `row ${status}`

    const check = document.createElement('input')
    check.type = 'checkbox'
    check.className = 'check'
    check.setAttribute('aria-label', status === 'done' ? 'Completed' : 'Complete')
    if (status === 'open') {
      check.addEventListener('click', () => this.onComplete(this.plan.id), { signal: this.lifecycle })
    } else {
      check.checked = status === 'done'
      check.disabled = true
      if (status === 'done') check.classList.add('done')
    }

    const body = document.createElement('div')
    body.className = 'body'
    const title = document.createElement('div')
    title.className = 'title'
    title.textContent = this.plan.title
    body.append(title)

    const meta = document.createElement('div')
    meta.className = 'meta'
    if (this.overdueAsOf !== undefined && this.plan.due !== undefined) {
      meta.append(this._badge('overdue', overdueBadge(this.plan.due, this.overdueAsOf)))
    }
    if (this.plan instanceof Appointment) {
      const t = document.createElement('span')
      t.className = 'time'
      t.textContent = appointmentTime(this.plan)
      meta.append(t, this._badge('appt', 'Appointment'))
    } else if (this.plan instanceof Task && this.plan.cadence !== undefined) {
      meta.append(this._badge('recur', `↻ ${cadenceLabel(this.plan.cadence)}`))
    }
    if (status === 'canceled') meta.append(this._badge('cancel', 'Canceled'))
    if (meta.childNodes.length) body.append(meta)

    const actions = document.createElement('div')
    actions.className = 'actions'
    this._renderActions(actions)

    row.append(check, body, actions)
    root.append(row)
  }

  /** @param {string} cls @param {string} text @returns {HTMLElement} */
  _badge(cls, text) {
    const b = document.createElement('span')
    b.className = `badge ${cls}`
    b.textContent = text
    return b
  }

  /** @param {HTMLElement} mount */
  _renderActions(mount) {
    mount.replaceChildren()
    if (this.plan.status === 'open') {
      mount.append(this._actionButton('cancelplan', 'Cancel', false, () => this.onCancel(this.plan.id)))
    }
    mount.append(this._actionButton('delete', 'Delete', true, () => this.onDelete(this.plan.id)))
  }

  /** @param {string} act @param {string} label @param {boolean} danger @param {() => void} onYes @returns {HTMLButtonElement} */
  _actionButton(act, label, danger, onYes) {
    const b = document.createElement('button')
    b.dataset.act = act
    if (danger) b.className = 'del'
    b.textContent = label
    b.addEventListener('click', () => this._confirm(act, onYes), { signal: this.lifecycle })
    return b
  }

  /** @param {string} act @param {() => void} onYes */
  _confirm(act, onYes) {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const mount = /** @type {HTMLElement} */ (root.querySelector('.actions'))
    inlineConfirm({
      mount,
      prompt: act === 'delete' ? 'Delete?' : 'Cancel plan?',
      lifecycle: this.lifecycle,
      onYes,
      restore: () => this._renderActions(mount),
    })
  }
}

/** Register the element (idempotent). */
export function definePlanRow() {
  if (!customElements.get('oyl-plan-row')) customElements.define('oyl-plan-row', OylPlanRow)
}
