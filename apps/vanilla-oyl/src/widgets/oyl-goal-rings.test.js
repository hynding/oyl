import { beforeAll, describe, expect, it } from 'vitest'
import { DayKey } from '@oyl/all-of-oyl'
import { defineGoalRings, OylGoalRings } from './oyl-goal-rings.js'
import { SAMPLE } from './sample-data.js'

beforeAll(() => defineGoalRings())

/** @param {readonly any[]} goals */
function mount(goals) {
  const el = /** @type {OylGoalRings} */ (document.createElement('oyl-goal-rings'))
  el.context = /** @type {any} */ ({
    today: () => DayKey.of('2026-08-09'),
    review: () => ({ goals }),
  })
  document.body.append(el)
  return /** @type {ShadowRoot} */ (el.shadowRoot)
}

const goalReview = (/** @type {string} */ name, /** @type {number} */ ratio, /** @type {number} */ streak) => ({
  goalId: name, name, streak,
  progress: { current: 0, target: 1, ratio, paused: false, empty: false },
})

describe('oyl-goal-rings', () => {
  it('renders a ring, name, and streak flame per goal', () => {
    const root = mount([goalReview('Run', 0.8, 4), goalReview('Read', 0.5, 0)])
    const items = [...root.querySelectorAll('.goal')]
    expect(items).toHaveLength(2)
    expect(items[0]?.textContent).toContain('Run')
    expect(items[0]?.textContent).toContain('🔥 4')
    expect(items[1]?.textContent).not.toContain('🔥')
    expect(root.querySelectorAll('svg')).toHaveLength(2)
    expect(root.querySelector('[data-sample-badge]')).toBeNull()
  })

  it('unnamed goals get a fallback label', () => {
    const root = mount([{ goalId: 'x', streak: 0, progress: { current: 0, target: 1, ratio: 0.1, paused: false, empty: false } }])
    expect(root.querySelector('.goal')?.textContent).toContain('Goal')
  })

  it('no goals falls back to the sample set with a badge', () => {
    const root = mount([])
    expect(root.querySelectorAll('.goal')).toHaveLength(SAMPLE.goals.length)
    expect(root.querySelector('[data-sample-badge]')?.textContent).toBe('Sample')
  })
})
