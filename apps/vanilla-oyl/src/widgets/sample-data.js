/**
 * Aspirational sample fixtures for a fresh account — rendered with a visible
 * `Sample` badge and NEVER written to any store (plain frozen values on
 * render paths only).
 */
export const SAMPLE = Object.freeze({
  streak: 12,
  todayPlan: Object.freeze({ done: 3, total: 5, next: 'Run 5k' }),
  series: Object.freeze({
    spending: Object.freeze([12, 0, 34, 18, 0, 52, 7, 23, 11, 0, 41, 16, 29, 8]),
    calories: Object.freeze([1850, 2100, 1720, 1980, 2240, 1600, 1890, 2050, 1770, 1930, 2110, 1680, 1820, 1950]),
    activeMinutes: Object.freeze([30, 0, 45, 60, 20, 0, 75, 40, 15, 55, 0, 35, 50, 25]),
  }),
  goals: Object.freeze([
    Object.freeze({ name: 'Run', ratio: 0.8, streak: 4 }),
    Object.freeze({ name: 'Read', ratio: 0.5, streak: 2 }),
    Object.freeze({ name: 'Save', ratio: 0.25, streak: 0 }),
  ]),
  digest: Object.freeze({ plansDone: 3, plansTotal: 5, goalsMet: 1, goalsTotal: 3, streak: 12 }),
})

/**
 * The one shared empty→fixture switch (spec: "the empty-check + swap lives in
 * one shared helper, not repeated per widget"). Each widget computes its own
 * emptiness predicate and hands it in.
 * @template T
 * @param {boolean} isEmpty @param {T} real @param {T} fixture
 * @returns {{ value: T, sample: boolean }}
 */
export function withSample(isEmpty, real, fixture) {
  return isEmpty ? { value: fixture, sample: true } : { value: real, sample: false }
}
