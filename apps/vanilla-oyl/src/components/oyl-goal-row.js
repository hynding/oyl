import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { inlineConfirm } from './confirm.js'
import { metricUnit, goalProgressLabel } from '../goal/format.js'

/** @typedef {import('@oyl/all-of-oyl').Goal} Goal */
/** @typedef {import('@oyl/all-of-oyl').GoalProgress} GoalProgress */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */

const styles = sheet(`
  :host { display: block; border-top: 1px solid var(--color-border); }
  .row { display: grid; grid-template-columns: 1fr auto; gap: .3rem 1rem; align-items: center; padding: .85rem 0; }
  .title { grid-column: 1; grid-row: 1; color: var(--color-text); }
  .title .ok { color: var(--color-accent); font-weight: 700; }
  .actions { grid-column: 2; grid-row: 1; align-self: center; display: inline-flex; gap: .2rem; }
  .bar { grid-column: 1 / -1; grid-row: 2; block-size: .5rem; background: color-mix(in oklch, var(--color-text) 10%, transparent); border-radius: 999px; overflow: hidden; }
  .fill { block-size: 100%; inline-size: 0; background: var(--color-muted); }
  .bar.met .fill { background: var(--color-accent); }
  .bar.muted .fill { background: color-mix(in oklch, var(--color-text) 22%, transparent); }
  .label { grid-column: 1 / -1; grid-row: 3; color: var(--color-muted); font-size: var(--step--1); }
  button { font: inherit; color: var(--color-muted); border: 0; background: none; cursor: pointer; border-radius: var(--radius-1); padding: .25rem .5rem; font-size: .85rem; }
  button:hover { background: color-mix(in oklch, var(--color-text) 8%, transparent); color: var(--color-text); }
  .del:hover { color: var(--color-danger); background: color-mix(in oklch, var(--color-danger) 12%, transparent); }
  .confirm { display: inline-flex; gap: .3rem; align-items: center; font-size: .85rem; color: var(--color-danger); }
  .confirm .yes { color: white; background: var(--color-danger); font-weight: 600; }
  .confirm .no { color: var(--color-muted); background: color-mix(in oklch, var(--color-text) 8%, transparent); }
`)

export class OylGoalRow extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {Goal} */
    this.goal = /** @type {Goal} */ (/** @type {unknown} */ (undefined))
    /** @type {GoalProgress} */
    this.progress = /** @type {GoalProgress} */ (/** @type {unknown} */ (undefined))
    /** @type {(id: Id) => void} */
    this.onPause = () => {}
    /** @type {(id: Id) => void} */
    this.onResume = () => {}
    /** @type {(id: Id) => void} */
    this.onDelete = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const p = this.progress
    const row = document.createElement('div')
    row.className = 'row'

    const title = document.createElement('div')
    title.className = 'title'
    title.textContent = this.goal.name ?? this.goal.metric
    if (p.met === true) {
      const ok = document.createElement('span')
      ok.className = 'ok'
      ok.textContent = ' ✓'
      title.append(ok)
    }

    const actions = document.createElement('div')
    actions.className = 'actions'
    this._renderActions(actions)

    const bar = document.createElement('div')
    bar.className = 'bar'
    if (p.met === true) bar.classList.add('met')
    if (p.paused || p.empty) bar.classList.add('muted')
    const fill = document.createElement('div')
    fill.className = 'fill'
    fill.style.setProperty('inline-size', `${Math.round(p.ratio * 100)}%`)
    bar.append(fill)

    const label = document.createElement('div')
    label.className = 'label'
    label.textContent = goalProgressLabel(p, this.goal.direction, metricUnit(this.goal.metric))

    row.append(title, actions, bar, label)
    root.append(row)
  }

  /** @param {HTMLElement} mount */
  _renderActions(mount) {
    mount.replaceChildren()
    const toggle = document.createElement('button')
    if (this.progress.paused) {
      toggle.dataset.act = 'resume'
      toggle.textContent = 'Resume'
      toggle.addEventListener('click', () => this.onResume(this.goal.id), { signal: this.lifecycle })
    } else {
      toggle.dataset.act = 'pause'
      toggle.textContent = 'Pause'
      toggle.addEventListener('click', () => this.onPause(this.goal.id), { signal: this.lifecycle })
    }
    const del = document.createElement('button')
    del.className = 'del'
    del.dataset.act = 'delete'
    del.textContent = 'Delete'
    del.addEventListener('click', () => {
      inlineConfirm({
        mount,
        prompt: 'Delete?',
        lifecycle: this.lifecycle,
        onYes: () => this.onDelete(this.goal.id),
        restore: () => this._renderActions(mount),
      })
    }, { signal: this.lifecycle })
    mount.append(toggle, del)
  }
}

/** Register the element (idempotent). */
export function defineGoalRow() {
  if (!customElements.get('oyl-goal-row')) customElements.define('oyl-goal-row', OylGoalRow)
}
