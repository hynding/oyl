import { beforeAll, describe, expect, it } from 'vitest'
import { DayKey } from '@oyl/all-of-oyl'
import { defineGreetingDigest, OylGreetingDigest } from './oyl-greeting-digest.js'
import { SAMPLE } from './sample-data.js'

beforeAll(() => defineGreetingDigest())

/**
 * @param {{ hour?: number, name?: string | undefined, plans?: readonly any[], goals?: readonly any[], activeDays?: string[] }} opts
 */
function mount(opts = {}) {
  const { hour = 9, plans = [], goals = [], activeDays = [] } = opts
  // 'in'-check (not a default) so `name: undefined` really means a nameless profile.
  const name = 'name' in opts ? opts.name : 'Steve'
  const el = /** @type {OylGreetingDigest} */ (document.createElement('oyl-greeting-digest'))
  el.context = /** @type {any} */ ({
    hour: () => hour,
    profileName: () => name,
    today: () => DayKey.of('2026-08-09'),
    plansOn: () => plans,
    review: () => ({ goals }),
    activeDays: () => new Set(activeDays),
  })
  document.body.append(el)
  return /** @type {ShadowRoot} */ (el.shadowRoot)
}

const goalReview = (/** @type {boolean} */ met) => ({
  goalId: 'g', streak: 9,
  progress: { current: 0, target: 1, ratio: 0, met, paused: false, empty: false },
})

describe('oyl-greeting-digest', () => {
  it('greets by time of day and name', () => {
    expect(mount({ hour: 9 }).querySelector('.hello')?.textContent).toBe('Good morning, Steve')
    expect(mount({ hour: 15 }).querySelector('.hello')?.textContent).toBe('Good afternoon, Steve')
    expect(mount({ hour: 21 }).querySelector('.hello')?.textContent).toBe('Good evening, Steve')
    expect(mount({ hour: 11 }).querySelector('.hello')?.textContent).toBe('Good morning, Steve')
    expect(mount({ hour: 12 }).querySelector('.hello')?.textContent).toBe('Good afternoon, Steve')
    expect(mount({ hour: 17 }).querySelector('.hello')?.textContent).toBe('Good afternoon, Steve')
    expect(mount({ hour: 18 }).querySelector('.hello')?.textContent).toBe('Good evening, Steve')
  })

  it('greets without a name when the profile has none', () => {
    expect(mount({ name: undefined }).querySelector('.hello')?.textContent).toBe('Good morning')
  })

  it('summarizes real plans, goals, and day streak', () => {
    const root = mount({
      plans: [{ status: 'done', label: 'a' }, { status: 'open', label: 'b' }],
      goals: [goalReview(true), goalReview(false)],
      activeDays: ['2026-08-09', '2026-08-08'],
    })
    expect(root.querySelector('.line')?.textContent).toBe('1/2 plans · 1/2 goals this week · 🔥 2')
    expect(root.querySelector('[data-sample-badge]')).toBeNull()
  })

  it('a fully empty account shows the sample digest with a badge', () => {
    const root = mount({})
    const d = SAMPLE.digest
    expect(root.querySelector('.line')?.textContent).toBe(
      `${d.plansDone}/${d.plansTotal} plans · ${d.goalsMet}/${d.goalsTotal} goals this week · 🔥 ${d.streak}`,
    )
    expect(root.querySelector('[data-sample-badge]')?.textContent).toBe('Sample')
  })
})
