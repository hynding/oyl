import { describe, expect, it, beforeAll, vi } from 'vitest'
import { Task, Appointment, Cadence, DayKey } from '@oyl/all-of-oyl'
import { definePlanRow } from './oyl-plan-row.js'

beforeAll(() => definePlanRow())

/** @typedef {(id: import('@oyl/all-of-oyl').Id) => void} Handler */
/** @param {any} plan @param {{onComplete?:Handler,onCancel?:Handler,onDelete?:Handler,overdueAsOf?:any}} [h] */
function row(plan, h = {}) {
  const el = /** @type {import('./oyl-plan-row.js').OylPlanRow} */ (document.createElement('oyl-plan-row'))
  el.plan = plan
  el.onComplete = h.onComplete ?? (() => {})
  el.onCancel = h.onCancel ?? (() => {})
  el.onDelete = h.onDelete ?? (() => {})
  if (h.overdueAsOf) el.overdueAsOf = h.overdueAsOf
  document.body.append(el)
  return el
}
/** @param {import('./oyl-plan-row.js').OylPlanRow} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)

describe('<oyl-plan-row>', () => {
  it('renders a task title with a recurrence badge', () => {
    const el = row(new Task({ title: 'Water', due: DayKey.of('2026-06-16'), cadence: Cadence.of(1, 'weeks') }))
    const text = root(el).textContent ?? ''
    expect(text).toContain('Water')
    expect(text.toLowerCase()).toContain('every week')
    el.remove()
  })

  it('renders an appointment with its time and an appointment badge', () => {
    const el = row(new Appointment({ title: 'Dentist', startsAt: new Date('2026-06-16T15:00:00'), durationMinutes: 60, tz: 'America/New_York' }))
    const text = root(el).textContent ?? ''
    expect(text).toContain('Dentist')
    expect(text.toLowerCase()).toContain('appointment')
    expect(text).toMatch(/\d{1,2}:\d{2}/)
    el.remove()
  })

  it('complete checkbox calls onComplete(id)', () => {
    const t = new Task({ title: 'x', due: DayKey.of('2026-06-16') })
    const onComplete = vi.fn()
    const el = row(t, { onComplete })
    const cb = /** @type {HTMLInputElement} */ (root(el).querySelector('input[type="checkbox"]'))
    cb.click()
    expect(onComplete).toHaveBeenCalledWith(t.id)
    el.remove()
  })

  it('cancel and delete each use an inline two-step confirm', () => {
    const t = new Task({ title: 'x', due: DayKey.of('2026-06-16') })
    const onCancel = vi.fn()
    const onDelete = vi.fn()
    const el = row(t, { onCancel, onDelete })
    const r = root(el)
    // delete → No reverts
    const delBtn = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="delete"]'))
    delBtn.click()
    const noBtn = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="cancel-confirm"][data-for="delete"]'))
    noBtn.click()
    expect(onDelete).not.toHaveBeenCalled()
    // cancel → Yes confirms
    const cancelBtn = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="cancelplan"]'))
    cancelBtn.click()
    const yesBtn = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="confirm"][data-for="cancelplan"]'))
    yesBtn.click()
    expect(onCancel).toHaveBeenCalledWith(t.id)
    el.remove()
  })

  it('done plan: no cancel action, only delete', () => {
    const t = new Task({ title: 'done one', due: DayKey.of('2026-06-16') })
    t.complete(DayKey.of('2026-06-16'))
    const el = row(t)
    const r = root(el)
    expect(r.querySelector('button[data-act="cancelplan"]')).toBeNull()
    expect(r.querySelector('button[data-act="delete"]')).toBeTruthy()
    el.remove()
  })

  it('overdueAsOf shows an overdue badge', () => {
    const el = row(new Task({ title: 'late', due: DayKey.of('2026-06-13') }), { overdueAsOf: DayKey.of('2026-06-16') })
    expect((root(el).textContent ?? '').toLowerCase()).toContain('ago')
    el.remove()
  })
})
