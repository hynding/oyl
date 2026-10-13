import { describe, expect, it, beforeAll, vi } from 'vitest'
import { Goal } from '@oyl/all-of-oyl'
import { defineGoalRow } from './oyl-goal-row.js'

beforeAll(() => defineGoalRow())
/** @param {Record<string, unknown>} [opts] */
const mkGoal = (opts = {}) => new Goal({ name: 'Sleep enough', metric: 'sleep.hours', target: 7, direction: 'atLeast', period: 'day', ...opts })
/** @param {Partial<import('@oyl/all-of-oyl').GoalProgress>} [o] @returns {any} */
const prog = (o = {}) => ({ current: 0, target: 7, ratio: 0, paused: false, empty: false, ...o })

/** @param {any} goal @param {any} progress @param {{ onPause?: any, onResume?: any, onDelete?: any }} [h] */
function row(goal, progress, h = {}) {
  const el = /** @type {import('./oyl-goal-row.js').OylGoalRow} */ (document.createElement('oyl-goal-row'))
  el.goal = goal
  el.progress = progress
  el.onPause = h.onPause ?? (() => {})
  el.onResume = h.onResume ?? (() => {})
  el.onDelete = h.onDelete ?? (() => {})
  document.body.append(el)
  return el
}
/** @param {any} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)

describe('<oyl-goal-row>', () => {
  it('renders title, a bar sized to ratio, and the label', () => {
    const el = row(mkGoal(), prog({ current: 5, ratio: 5 / 7 }))
    const r = root(el)
    expect(r.textContent).toContain('Sleep enough')
    expect(r.textContent).toContain('5 / 7 h')
    const fill = /** @type {HTMLElement} */ (r.querySelector('.fill'))
    expect(fill.style.getPropertyValue('inline-size')).toBe('71%')
    el.remove()
  })

  it('met goal marks the bar and shows a check', () => {
    const el = row(mkGoal(), prog({ current: 7, ratio: 1, met: true }))
    expect(root(el).querySelector('.bar.met')).toBeTruthy()
    expect(root(el).textContent).toContain('✓')
    el.remove()
  })

  it('paused goal shows "Paused" and a Resume action', () => {
    const onResume = vi.fn()
    const g = mkGoal()
    const el = row(g, prog({ paused: true }), { onResume })
    expect(root(el).textContent).toContain('Paused')
    const b = /** @type {HTMLButtonElement} */ (root(el).querySelector('button[data-act="resume"]'))
    b.click()
    expect(onResume).toHaveBeenCalledWith(g.id)
    el.remove()
  })

  it('non-paused goal shows Pause', () => {
    const onPause = vi.fn()
    const g = mkGoal()
    const el = row(g, prog(), { onPause })
    const b = /** @type {HTMLButtonElement} */ (root(el).querySelector('button[data-act="pause"]'))
    b.click()
    expect(onPause).toHaveBeenCalledWith(g.id)
    el.remove()
  })

  it('Delete uses inline confirm: Yes calls onDelete(id), No reverts', () => {
    const onDelete = vi.fn()
    const g = mkGoal()
    const el = row(g, prog(), { onDelete })
    const r = root(el)
    const del1 = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="delete"]'))
    del1.click()
    const no = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="confirm-no"]'))
    no.click()
    expect(onDelete).not.toHaveBeenCalled()
    const del2 = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="delete"]'))
    del2.click()
    const yes = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="confirm-yes"]'))
    yes.click()
    expect(onDelete).toHaveBeenCalledWith(g.id)
    el.remove()
  })
})
