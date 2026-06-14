import { DayKey } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { now } from '../storage/clock.js'
import { defineGoalComposer } from './oyl-goal-composer.js'
import { defineGoalRow } from './oyl-goal-row.js'

/** @typedef {ReturnType<typeof import('../state/goals-store.js').createGoalsStore>} GoalsStore */
/** @typedef {ReturnType<typeof import('../state/journal-store.js').createJournalStore>} JournalStore */

const styles = sheet(`
  :host { display: block; }
  h2 { font-size: var(--step-2); margin-block-end: var(--space-4); }
  oyl-goal-composer { display: block; margin-block-end: 1.6rem; }
  ol { list-style: none; margin: 0; padding: 0; }
  .empty { color: var(--color-muted); padding: 1rem 0; }
  .sr-only { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip: rect(0 0 0 0); }
`)

export class OylGoals extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {GoalsStore} */
    this.store = /** @type {GoalsStore} */ (/** @type {unknown} */ (undefined))
    /** @type {JournalStore} */
    this.journal = /** @type {JournalStore} */ (/** @type {unknown} */ (undefined))
    /** @type {string} */
    this.tz = 'UTC'
  }

  render() {
    defineGoalComposer()
    defineGoalRow()
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)

    const h2 = document.createElement('h2')
    h2.textContent = 'Goals'
    h2.tabIndex = -1
    const live = document.createElement('div')
    live.className = 'sr-only'
    live.setAttribute('aria-live', 'polite')
    const composer = /** @type {import('./oyl-goal-composer.js').OylGoalComposer} */ (document.createElement('oyl-goal-composer'))
    composer.store = this.store
    composer.onAdded = () => { live.textContent = 'Goal added' }
    const list = document.createElement('ol')
    const empty = document.createElement('div')
    empty.className = 'empty'

    root.append(h2, live, composer, list, empty)

    this.track(() => {
      const today = DayKey.from(now(), this.tz)
      const goals = this.store.all()
      list.replaceChildren()
      for (const g of goals) {
        const rowEl = /** @type {import('./oyl-goal-row.js').OylGoalRow} */ (document.createElement('oyl-goal-row'))
        rowEl.goal = g
        rowEl.progress = this.journal.progressOf(g, today)
        rowEl.onPause = (id) => { void this.store.pause(id, today); live.textContent = 'Paused' }
        rowEl.onResume = (id) => { void this.store.resume(id, today); live.textContent = 'Resumed' }
        rowEl.onDelete = (id) => { void this.store.remove(id); live.textContent = 'Deleted' }
        const li = document.createElement('li')
        li.append(rowEl)
        list.append(li)
      }
      empty.hidden = goals.length > 0
      empty.textContent = empty.hidden ? '' : 'No goals yet.'
    })
  }
}

/** Register the element (idempotent). */
export function defineGoals() {
  if (!customElements.get('oyl-goals')) customElements.define('oyl-goals', OylGoals)
}
