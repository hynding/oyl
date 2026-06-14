import { DayKey, periodWindowOf } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { signal } from '../lib/reactive/signal.js'
import { sheet } from './sheet.js'
import { now } from '../storage/clock.js'
import { money, reviewGoalLabel } from '../insights/format.js'

/** @typedef {import('@oyl/all-of-oyl').Review} Review */
/** @typedef {(range: import('@oyl/all-of-oyl').DayRange) => Review} ReviewOn */

const PERIODS = /** @type {ReadonlyArray<readonly [string, string]>} */ ([
  ['month', 'This month'],
  ['week', 'This week'],
])

const styles = sheet(`
  :host { display: block; }
  h2 { font-size: var(--step-2); margin-block-end: var(--space-4); }
  .head { display: flex; justify-content: flex-end; margin-block-end: 1rem; }
  select { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .3rem .5rem; }
  .section-label { font-size: .72rem; text-transform: uppercase; letter-spacing: .07em; font-weight: 700; color: var(--color-muted); margin: 1.6rem 0 .4rem; }
  .totals { display: grid; grid-template-columns: repeat(3, 1fr); gap: .8rem; }
  .stat { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-2); padding: .8rem; }
  .stat .k { color: var(--color-muted); font-size: var(--step--1); }
  .stat .v { font-size: var(--step-1); font-variant-numeric: tabular-nums; margin-block-start: .2rem; }
  .stat .d { color: var(--color-muted); font-size: var(--step--1); font-variant-numeric: tabular-nums; margin-block-start: .1rem; }
  ol { list-style: none; margin: 0; padding: 0; }
  li { display: flex; justify-content: space-between; gap: 1rem; padding: .4rem 0; border-top: 1px solid var(--color-border); }
  .completion { font-variant-numeric: tabular-nums; }
  .muted { color: var(--color-muted); padding: .5rem 0; }
`)

export class OylInsights extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {ReviewOn} */
    this.reviewOn = /** @type {ReviewOn} */ (/** @type {unknown} */ (undefined))
    /** @type {string} */
    this.tz = 'UTC'
    /** @type {import('../lib/reactive/signal.js').Signal<string>} */
    this._period = /** @type {any} */ (undefined)
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    this._period = signal('month')

    const h2 = document.createElement('h2')
    h2.textContent = 'Insights'
    h2.tabIndex = -1

    const head = document.createElement('div')
    head.className = 'head'
    const sel = document.createElement('select')
    sel.setAttribute('aria-label', 'Period')
    for (const [val, label] of PERIODS) {
      const o = document.createElement('option')
      o.value = val
      o.textContent = label
      sel.append(o)
    }
    sel.addEventListener('change', () => this._period.set(sel.value), { signal: this.lifecycle })
    head.append(sel)

    const totals = document.createElement('div')
    totals.className = 'totals'
    const completionLabel = this._label('Plan completion')
    const completion = document.createElement('div')
    completion.className = 'completion'
    const goalsLabel = this._label('Goals')
    const goalsList = document.createElement('ol')
    const goalsEmpty = this._empty()
    const spendLabel = this._label('Top spending')
    const spendList = document.createElement('ol')
    const spendEmpty = this._empty()
    const actLabel = this._label('Activity')
    const actList = document.createElement('ol')
    const actEmpty = this._empty()

    root.append(h2, head, totals, completionLabel, completion, goalsLabel, goalsList, goalsEmpty, spendLabel, spendList, spendEmpty, actLabel, actList, actEmpty)

    this.track(() => {
      const today = DayKey.from(now(), this.tz)
      const range = periodWindowOf(/** @type {any} */ (this._period.get()), today)
      const r = this.reviewOn(range)

      totals.replaceChildren(
        this._stat('Spending', money(r.totals.spending), r.deltas.spending, true),
        this._stat('Active min', String(Math.round(r.totals.activityMinutes)), r.deltas.activityMinutes, false),
        this._stat('Calories', String(Math.round(r.totals.calories)), r.deltas.calories, false),
      )

      completion.textContent = r.completionRate === undefined ? '—' : `${Math.round(r.completionRate * 100)}%`

      goalsList.replaceChildren()
      for (const g of r.goals) {
        const meta = reviewGoalLabel(g.progress) + (g.streak > 0 ? ` · 🔥 ${g.streak}` : '')
        goalsList.append(this._row(g.name ?? 'Goal', meta))
      }
      goalsEmpty.hidden = r.goals.length > 0
      goalsEmpty.textContent = goalsEmpty.hidden ? '' : 'No goals yet'

      spendList.replaceChildren()
      for (const s of r.topSpending) spendList.append(this._row(s.category, money(s.total)))
      spendEmpty.hidden = r.topSpending.length > 0
      spendEmpty.textContent = spendEmpty.hidden ? '' : 'Nothing this period'

      actList.replaceChildren()
      for (const a of r.activityTotals) {
        const parts = []
        if (a.minutes) parts.push(`${Math.round(a.minutes)} min`)
        if (a.count) parts.push(`${a.count}×`)
        actList.append(this._row(a.slug, parts.join(' · ')))
      }
      actEmpty.hidden = r.activityTotals.length > 0
      actEmpty.textContent = actEmpty.hidden ? '' : 'Nothing this period'
    })
  }

  /** @param {string} text @returns {HTMLElement} */
  _label(text) {
    const d = document.createElement('div')
    d.className = 'section-label'
    d.textContent = text
    return d
  }

  /** @returns {HTMLElement} */
  _empty() {
    const d = document.createElement('div')
    d.className = 'muted'
    return d
  }

  /** @param {string} k @param {string} v @returns {HTMLLIElement} */
  _row(k, v) {
    const li = document.createElement('li')
    const ke = document.createElement('span')
    ke.textContent = k
    const ve = document.createElement('span')
    ve.textContent = v
    li.append(ke, ve)
    return li
  }

  /** @param {string} k @param {string} v @param {number} delta @param {boolean} isMoney @returns {HTMLElement} */
  _stat(k, v, delta, isMoney) {
    const wrap = document.createElement('div')
    wrap.className = 'stat'
    const ke = document.createElement('div')
    ke.className = 'k'
    ke.textContent = k
    const ve = document.createElement('div')
    ve.className = 'v'
    ve.textContent = v
    wrap.append(ke, ve)
    if (delta !== 0) {
      const de = document.createElement('div')
      de.className = 'd'
      const mag = isMoney ? money(Math.abs(delta)) : String(Math.round(Math.abs(delta)))
      de.textContent = `${delta > 0 ? '↑' : '↓'} ${mag}`
      wrap.append(de)
    }
    return wrap
  }
}

/** Register the element (idempotent). */
export function defineInsights() {
  if (!customElements.get('oyl-insights')) customElements.define('oyl-insights', OylInsights)
}
