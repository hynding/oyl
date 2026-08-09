import { beforeAll, describe, expect, it } from 'vitest'
import { DayKey } from '@oyl/all-of-oyl'
import { defineTodayPlan, OylTodayPlan } from './oyl-today-plan.js'
import { SAMPLE } from './sample-data.js'

beforeAll(() => defineTodayPlan())

/** @param {readonly { status: string, label: string }[]} plans */
function mount(plans) {
  const el = /** @type {OylTodayPlan} */ (document.createElement('oyl-today-plan'))
  el.context = /** @type {any} */ ({ today: () => DayKey.of('2026-08-09'), plansOn: () => plans })
  document.body.append(el)
  return /** @type {ShadowRoot} */ (el.shadowRoot)
}

describe('oyl-today-plan', () => {
  it('shows done/total and the next open item', () => {
    const root = mount([
      { status: 'done', label: 'Stretch' },
      { status: 'open', label: 'Run 5k' },
      { status: 'open', label: 'Read' },
    ])
    expect(root.querySelector('.progress')?.textContent).toBe('1/3')
    expect(root.querySelector('.next')?.textContent).toContain('Run 5k')
    expect(root.querySelector('[data-sample-badge]')).toBeNull()
    const fill = /** @type {HTMLElement} */ (root.querySelector('.fill'))
    expect(fill.style.getPropertyValue('inline-size')).toBe('33%')
  })

  it('all-done day shows full bar and no next item', () => {
    const root = mount([{ status: 'done', label: 'Stretch' }])
    expect(root.querySelector('.progress')?.textContent).toBe('1/1')
    expect(root.querySelector('.next')?.textContent).toBe('All done 🎉')
  })

  it('empty agenda falls back to the sample fixture with a badge', () => {
    const root = mount([])
    expect(root.querySelector('.progress')?.textContent).toBe(`${SAMPLE.todayPlan.done}/${SAMPLE.todayPlan.total}`)
    expect(root.querySelector('.next')?.textContent).toContain(SAMPLE.todayPlan.next)
    expect(root.querySelector('[data-sample-badge]')?.textContent).toBe('Sample')
  })
})
