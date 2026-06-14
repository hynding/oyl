import { describe, expect, it, beforeAll } from 'vitest'
import { DayKey, Task, Appointment } from '@oyl/all-of-oyl'
import { definePlanComposer } from './oyl-plan-composer.js'

beforeAll(() => definePlanComposer())

const TZ = 'America/New_York'
/** @param {{ add: (p: any) => Promise<any> }} store @param {DayKey} [day] */
function composer(store, day = DayKey.of('2026-06-16')) {
  const el = /** @type {import('./oyl-plan-composer.js').OylPlanComposer} */ (document.createElement('oyl-plan-composer'))
  el.store = /** @type {any} */ (store)
  el.tz = TZ
  el.getDay = () => day
  document.body.append(el)
  return el
}
/** @param {any} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (root(el).querySelector(sel))

describe('<oyl-plan-composer>', () => {
  it('adds a one-off task with the typed title and due', async () => {
    const added = /** @type {any[]} */ ([])
    const store = { add: async (/** @type {any} */ p) => { added.push(p); return p } }
    const el = composer(store)
    q(el, 'input[name="title"]').value = 'File taxes'
    q(el, 'input[name="due"]').value = '2026-06-16'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await Promise.resolve(); await Promise.resolve()
    expect(added[0]).toBeInstanceOf(Task)
    expect(added[0].title).toBe('File taxes')
    expect(added[0].due?.value).toBe('2026-06-16')
    expect(added[0].cadence).toBeUndefined()
    el.remove()
  })

  it('adds a recurring task when repeat is enabled', async () => {
    const added = /** @type {any[]} */ ([])
    const store = { add: async (/** @type {any} */ p) => { added.push(p); return p } }
    const el = composer(store)
    q(el, 'input[name="title"]').value = 'Water'
    const repeat = q(el, 'input[name="repeat"]')
    repeat.checked = true
    repeat.dispatchEvent(new Event('change', { bubbles: true }))
    q(el, 'input[name="repeatN"]').value = '2'
    q(el, 'select[name="repeatUnit"]').value = 'weeks'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await Promise.resolve(); await Promise.resolve()
    expect(added[0]).toBeInstanceOf(Task)
    expect(added[0].cadence?.n).toBe(2)
    expect(added[0].cadence?.unit).toBe('weeks')
    el.remove()
  })

  it('adds an appointment with a tz-derived due', async () => {
    const added = /** @type {any[]} */ ([])
    const store = { add: async (/** @type {any} */ p) => { added.push(p); return p } }
    const el = composer(store)
    q(el, 'button[data-type="appointment"]').click()
    q(el, 'input[name="title"]').value = 'Dentist'
    q(el, 'input[name="startsAt"]').value = '2026-06-16T15:00'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await Promise.resolve(); await Promise.resolve()
    expect(added[0]).toBeInstanceOf(Appointment)
    expect(added[0].title).toBe('Dentist')
    expect(added[0].due).toBeDefined()
    el.remove()
  })

  it('renders a domain error inline on empty title and does not call store.add', async () => {
    let calls = 0
    const store = { add: async (/** @type {any} */ p) => { calls++; return p } }
    const el = composer(store)
    q(el, 'input[name="title"]').value = ''
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await Promise.resolve(); await Promise.resolve()
    expect(calls).toBe(0)
    expect((root(el).querySelector('[data-role="error"]')?.textContent ?? '').length).toBeGreaterThan(0)
    el.remove()
  })
})
