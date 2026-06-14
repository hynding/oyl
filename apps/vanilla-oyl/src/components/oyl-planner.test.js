import { describe, expect, it, beforeAll } from 'vitest'
import { LocalStorageRepository, COLLECTIONS, Task, DayKey } from '@oyl/all-of-oyl'
import { createPlannerStore } from '../state/planner-store.js'
import { definePlanner } from './oyl-planner.js'
import { now } from '../storage/clock.js'

/** @typedef {import('@oyl/all-of-oyl').Plan} Plan */
/** @typedef {import('@oyl/all-of-oyl').Repository<Plan>} PlansRepo */
/** @typedef {import('./oyl-planner.js').OylPlanner} OylPlanner */
/** @typedef {ReturnType<typeof createPlannerStore>} PlannerStore */

const TZ = 'America/New_York'
beforeAll(() => definePlanner())

function plansRepo() {
  const map = new Map()
  const storage = {
    /** @param {string} k */ getItem: (k) => map.get(k) ?? null,
    /** @param {string} k @param {string} v */ setItem: (k, v) => {
      map.set(k, v)
    },
  }
  return /** @type {PlansRepo} */ (/** @type {unknown} */ (new LocalStorageRepository(storage, 'oyl/data/plans', /** @type {any} */ (COLLECTIONS.plans))))
}
/** @param {PlannerStore} store @param {string} [tz] @returns {OylPlanner} */
function screen(store, tz = TZ) {
  const el = /** @type {OylPlanner} */ (document.createElement('oyl-planner'))
  el.store = store
  el.tz = tz
  document.body.append(el)
  return el
}
/** @param {OylPlanner} el */
const rows = (el) => /** @type {ShadowRoot} */ (el.shadowRoot).querySelectorAll('oyl-plan-row')
/** @param {OylPlanner} el */
const txt = (el) => /** @type {ShadowRoot} */ (el.shadowRoot).textContent ?? ''
const today = () => DayKey.from(now(), TZ)

describe('<oyl-planner>', () => {
  it('renders the day agenda and updates reactively on add', async () => {
    const store = createPlannerStore(plansRepo())
    const el = screen(store)
    expect(rows(el)).toHaveLength(0)
    expect(txt(el).toLowerCase()).toContain('nothing')
    await store.add(new Task({ title: 'today task', due: today() }))
    await Promise.resolve()
    expect(rows(el)).toHaveLength(1)
    el.remove()
  })

  it('surfaces an overdue section on the today view', async () => {
    const store = createPlannerStore(plansRepo())
    await store.add(new Task({ title: 'late', due: today().addDays(-2) }))
    const el = screen(store)
    await Promise.resolve()
    expect(txt(el).toLowerCase()).toContain('overdue')
    expect(rows(el).length).toBeGreaterThanOrEqual(1)
    el.remove()
  })

  it('completing a task via its row marks it done (checkbox checked)', async () => {
    const store = createPlannerStore(plansRepo())
    await store.add(new Task({ title: 'do it', due: today() }))
    const el = screen(store)
    await Promise.resolve()
    const row = /** @type {any} */ (/** @type {ShadowRoot} */ (el.shadowRoot).querySelector('oyl-plan-row'))
    const cb = /** @type {HTMLInputElement} */ (row.shadowRoot.querySelector('input[type="checkbox"]'))
    cb.click()
    await Promise.resolve(); await Promise.resolve()
    const doneRow = /** @type {any} */ (/** @type {ShadowRoot} */ (el.shadowRoot).querySelector('oyl-plan-row'))
    const doneCb = /** @type {HTMLInputElement} */ (doneRow.shadowRoot.querySelector('input[type="checkbox"]'))
    expect(doneCb.checked).toBe(true)
    el.remove()
  })

  it('navigating to the previous day shows a different (empty) agenda', async () => {
    const store = createPlannerStore(plansRepo())
    await store.add(new Task({ title: 'today only', due: today() }))
    const el = screen(store)
    await Promise.resolve()
    expect(rows(el)).toHaveLength(1)
    const prev = /** @type {HTMLButtonElement} */ (/** @type {ShadowRoot} */ (el.shadowRoot).querySelector('button[data-nav="prev"]'))
    prev.click()
    await Promise.resolve()
    expect(rows(el)).toHaveLength(0)
    el.remove()
  })
})
