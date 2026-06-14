import { describe, expect, it, beforeAll } from 'vitest'
import { Goal } from '@oyl/all-of-oyl'
import { defineGoalComposer } from './oyl-goal-composer.js'

beforeAll(() => defineGoalComposer())
/** @param {{ add?: (g: any) => Promise<any> }} store */
function composer(store) {
  const el = /** @type {import('./oyl-goal-composer.js').OylGoalComposer} */ (document.createElement('oyl-goal-composer'))
  el.store = /** @type {any} */ (store)
  document.body.append(el)
  return el
}
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (el.shadowRoot.querySelector(sel))
const change = (/** @type {any} */ node) => node.dispatchEvent(new Event('change', { bubbles: true }))
const submit = (/** @type {any} */ el) => q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))

describe('<oyl-goal-composer>', () => {
  it('builds a Goal from the selected preset + target + period', async () => {
    const added = /** @type {any[]} */ ([])
    const el = composer({ add: async (g) => { added.push(g); return g } })
    q(el, 'select[name="preset"]').value = '2' // Calories → nutrition.calories, atMost, sum
    change(q(el, 'select[name="preset"]'))
    q(el, 'input[name="name"]').value = 'Eat lighter'
    q(el, 'input[name="target"]').value = '2200'
    q(el, 'select[name="period"]').value = 'day'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added[0]).toBeInstanceOf(Goal)
    expect(added[0].metric).toBe('nutrition.calories')
    expect(added[0].direction).toBe('atMost')
    expect(added[0].aggregation).toBe('sum')
    expect(added[0].target).toBe(2200)
    expect(added[0].name).toBe('Eat lighter')
    el.remove()
  })

  it('shows the unit hint for the selected preset', async () => {
    const el = composer({})
    q(el, 'select[name="preset"]').value = '0' // Sleep (hours) → h
    change(q(el, 'select[name="preset"]'))
    expect(q(el, '.unit').textContent).toBe('h')
    el.remove()
  })

  it('a non-positive target surfaces an inline error and does not add', async () => {
    const added = /** @type {any[]} */ ([])
    const el = composer({ add: async (g) => { added.push(g); return g } })
    q(el, 'input[name="target"]').value = '0'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added).toHaveLength(0)
    expect((q(el, '[data-role="error"]').textContent ?? '').length).toBeGreaterThan(0)
    el.remove()
  })
})
