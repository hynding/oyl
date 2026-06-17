import { DayKey } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { signal } from '../lib/reactive/signal.js'
import { sheet } from './sheet.js'
import { now } from '../storage/clock.js'
import { relativeDayLabel, formatDayHeading } from '@oyl/all-of-oyl/format'
import { definePlanComposer } from './oyl-plan-composer.js'
import { definePlanRow } from './oyl-plan-row.js'

/** @typedef {ReturnType<typeof import('../state/planner-store.js').createPlannerStore>} PlannerStore */
/** @typedef {import('@oyl/all-of-oyl').Plan} Plan */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */

const styles = sheet(`
  :host { display: block; }
  .daynav { display: flex; align-items: center; justify-content: center; gap: .4rem; margin-block-end: 1.4rem; }
  .daynav button { font: inherit; color: var(--color-muted); border: 0; background: none; cursor: pointer; inline-size: 2.1rem; block-size: 2.1rem; border-radius: 999px; font-size: 1.1rem; }
  .daynav button:hover { background: color-mix(in oklch, var(--color-text) 6%, transparent); color: var(--color-text); }
  .day { text-align: center; min-inline-size: 13rem; }
  h2 { font-size: var(--step-2); font-weight: 640; letter-spacing: -.02em; line-height: 1.1; }
  .rel { color: var(--color-muted); font-size: .85rem; margin-block-start: .15rem; }
  oyl-plan-composer { display: block; margin-block-end: 1.6rem; }
  .section-label { font-size: .72rem; text-transform: uppercase; letter-spacing: .07em; font-weight: 700; color: var(--color-muted); margin: 1.4rem 0 .2rem; }
  .section-label.overdue { color: var(--color-warn); }
  ol { list-style: none; margin: 0; padding: 0; }
  .empty { text-align: center; color: var(--color-muted); padding: 2.5rem 1rem; }
  .sr-only { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip: rect(0 0 0 0); }
`)

export class OylPlanner extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {PlannerStore} */
    this.store = /** @type {PlannerStore} */ (/** @type {unknown} */ (undefined))
    /** @type {string} */
    this.tz = 'UTC'
    /** @type {import('../lib/reactive/signal.js').Signal<DayKey>} */
    this._day = /** @type {any} */ (undefined)
  }

  render() {
    definePlanComposer()
    definePlanRow()
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    this._day = signal(DayKey.from(now(), this.tz), (a, b) => a.equals(b))

    const daynav = document.createElement('div')
    daynav.className = 'daynav'
    const prev = this._navButton('prev', '‹', 'Previous day')
    const next = this._navButton('next', '›', 'Next day')
    const dayBox = document.createElement('div')
    dayBox.className = 'day'
    const h2 = document.createElement('h2')
    h2.tabIndex = -1
    const rel = document.createElement('div')
    rel.className = 'rel'
    dayBox.append(h2, rel)
    daynav.append(prev, dayBox, next)

    const live = document.createElement('div')
    live.className = 'sr-only'
    live.setAttribute('aria-live', 'polite')

    const composer = /** @type {import('./oyl-plan-composer.js').OylPlanComposer} */ (document.createElement('oyl-plan-composer'))
    composer.store = this.store
    composer.tz = this.tz
    composer.getDay = () => this._day.get()
    composer.onAdded = () => { live.textContent = 'Added to plan' }

    const overdueLabel = document.createElement('div')
    overdueLabel.className = 'section-label overdue'
    overdueLabel.textContent = 'Overdue'
    const overdueList = document.createElement('ol')
    const agendaLabel = document.createElement('div')
    agendaLabel.className = 'section-label'
    const agendaList = document.createElement('ol')
    const empty = document.createElement('div')
    empty.className = 'empty'

    root.append(daynav, live, composer, overdueLabel, overdueList, agendaLabel, agendaList, empty)

    this.addEventListener('keydown', (e) => {
      const t = /** @type {HTMLElement | null} */ (e.composedPath()[0] ?? null)
      const tag = t ? t.tagName : ''
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowLeft') this._go(-1, h2, live)
      else if (e.key === 'ArrowRight') this._go(1, h2, live)
    }, { signal: this.lifecycle })
    prev.addEventListener('click', () => this._go(-1, h2, live), { signal: this.lifecycle })
    next.addEventListener('click', () => this._go(1, h2, live), { signal: this.lifecycle })

    this.track(() => {
      const day = this._day.get()
      const today = DayKey.from(now(), this.tz)
      const isToday = day.equals(today)
      h2.textContent = formatDayHeading(day)
      rel.textContent = relativeDayLabel(day, today)

      const overdue = isToday ? this.store.overdue(today) : []
      overdueLabel.hidden = overdue.length === 0
      overdueList.replaceChildren()
      for (const plan of overdue) overdueList.append(this._rowEl(plan, today, today))

      const agenda = [...this.store.agendaFor(day), ...this.store.canceledOn(day)]
      agendaLabel.hidden = agenda.length === 0
      agendaLabel.textContent = formatDayHeading(day)
      agendaList.replaceChildren()
      for (const plan of agenda) agendaList.append(this._rowEl(plan, today))

      empty.hidden = overdue.length > 0 || agenda.length > 0
      empty.textContent = empty.hidden ? '' : `Nothing planned for ${formatDayHeading(day)}. Add a task or appointment above.`
    })
  }

  /** @param {Plan} plan @param {DayKey} today @param {DayKey} [overdueAsOf] @returns {HTMLLIElement} */
  _rowEl(plan, today, overdueAsOf) {
    const row = /** @type {import('./oyl-plan-row.js').OylPlanRow} */ (document.createElement('oyl-plan-row'))
    row.plan = plan
    if (overdueAsOf !== undefined) row.overdueAsOf = overdueAsOf
    row.onComplete = (id) => { void this.store.complete(id, today); this._announce('Completed') }
    row.onCancel = (id) => { void this.store.cancel(id); this._announce('Canceled') }
    row.onDelete = (id) => { void this.store.remove(id); this._announce('Deleted') }
    const li = document.createElement('li')
    li.append(row)
    return li
  }

  /** @param {string} msg */
  _announce(msg) {
    const live = /** @type {ShadowRoot} */ (this.shadowRoot).querySelector('.sr-only')
    if (live) live.textContent = msg
  }

  /** @param {number} delta @param {HTMLElement} h2 @param {HTMLElement} live */
  _go(delta, h2, live) {
    this._day.set(this._day.get().addDays(delta))
    h2.focus()
    live.textContent = `Showing ${formatDayHeading(this._day.get())}`
  }

  /** @param {string} dir @param {string} glyph @param {string} label @returns {HTMLButtonElement} */
  _navButton(dir, glyph, label) {
    const b = document.createElement('button')
    b.dataset.nav = dir
    b.textContent = glyph
    b.setAttribute('aria-label', label)
    return b
  }
}

/** Register the element (idempotent). */
export function definePlanner() {
  if (!customElements.get('oyl-planner')) customElements.define('oyl-planner', OylPlanner)
}
