import { beforeAll, describe, expect, it } from 'vitest'
import { DayKey } from '@oyl/all-of-oyl'
import { defineStreakRing, OylStreakRing } from './oyl-streak-ring.js'
import { SAMPLE } from './sample-data.js'

beforeAll(() => defineStreakRing())

function mountReal(/** @type {string[]} */ days) {
  const el = /** @type {OylStreakRing} */ (document.createElement('oyl-streak-ring'))
  el.context = /** @type {any} */ ({ today: () => DayKey.of('2026-08-09'), activeDays: () => new Set(days) })
  document.body.append(el)
  return /** @type {ShadowRoot} */ (el.shadowRoot)
}

describe('oyl-streak-ring', () => {
  it('shows the real streak with no badge when there is any activity', () => {
    const root = mountReal(['2026-08-08', '2026-08-09'])
    expect(root.querySelector('.count')?.textContent).toBe('2')
    expect(root.querySelector('[data-sample-badge]')).toBeNull()
    expect(root.querySelector('svg')).toBeTruthy()
  })

  it('falls back to the sample fixture with a badge on an empty account', () => {
    const root = mountReal([])
    expect(root.querySelector('.count')?.textContent).toBe(String(SAMPLE.streak))
    expect(root.querySelector('[data-sample-badge]')?.textContent).toBe('Sample')
  })

  it('caps the display at 365+', () => {
    const days = []
    let d = DayKey.of('2026-08-09')
    for (let i = 0; i < 366; i++) { days.push(d.value); d = d.addDays(-1) }
    const root = mountReal(days)
    expect(root.querySelector('.count')?.textContent).toBe('365+')
  })
})
