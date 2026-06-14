import { describe, expect, it, beforeAll } from 'vitest'
import { InMemoryRepository, Goal } from '@oyl/all-of-oyl'
import { createGoalsStore } from '../state/goals-store.js'
import { createJournalStore } from '../state/journal-store.js'
import { defineGoals } from './oyl-goals.js'

beforeAll(() => defineGoals())
const TZ = 'UTC'
const settle = () => new Promise((r) => setTimeout(r, 0))

async function stores() {
  const goalsRepo = /** @type {any} */ (new InMemoryRepository())
  const entriesRepo = /** @type {any} */ (new InMemoryRepository())
  await goalsRepo.save(new Goal({ name: 'Sleep enough', metric: 'sleep.hours', target: 7, direction: 'atLeast', period: 'day' }))
  const goals = createGoalsStore(goalsRepo)
  const journal = createJournalStore(entriesRepo, TZ)
  await goals.hydrate()
  await journal.hydrate()
  return { goals, journal }
}
/** @param {any} goals @param {any} journal */
function screen(goals, journal) {
  const el = /** @type {import('./oyl-goals.js').OylGoals} */ (document.createElement('oyl-goals'))
  el.store = goals
  el.journal = journal
  el.tz = TZ
  document.body.append(el)
  return el
}
/** @param {any} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)

describe('<oyl-goals>', () => {
  it('renders a row per goal with its progress', async () => {
    const { goals, journal } = await stores()
    const el = screen(goals, journal)
    await Promise.resolve()
    expect(root(el).querySelectorAll('oyl-goal-row')).toHaveLength(1)
    const grow = /** @type {any} */ (root(el).querySelector('oyl-goal-row'))
    expect(grow.shadowRoot.textContent).toContain('Sleep enough')
    expect(grow.shadowRoot.textContent).toContain('No data this period') // no entries → empty
    el.remove()
  })

  it('pausing a goal flips the row to Resume', async () => {
    const { goals, journal } = await stores()
    const el = screen(goals, journal)
    await Promise.resolve()
    const grow = /** @type {any} */ (root(el).querySelector('oyl-goal-row'))
    const pauseBtn = /** @type {HTMLButtonElement} */ (grow.shadowRoot.querySelector('button[data-act="pause"]'))
    pauseBtn.click()
    await settle()
    const grow2 = /** @type {any} */ (root(el).querySelector('oyl-goal-row'))
    expect(grow2.shadowRoot.querySelector('button[data-act="resume"]')).toBeTruthy()
    expect(grow2.shadowRoot.textContent).toContain('Paused')
    el.remove()
  })

  it('deleting a goal removes its row', async () => {
    const { goals, journal } = await stores()
    const el = screen(goals, journal)
    await Promise.resolve()
    const grow = /** @type {any} */ (root(el).querySelector('oyl-goal-row'))
    const delBtn = /** @type {HTMLButtonElement} */ (grow.shadowRoot.querySelector('button[data-act="delete"]'))
    delBtn.click()
    const yes = /** @type {HTMLButtonElement} */ (grow.shadowRoot.querySelector('button[data-act="confirm-yes"]'))
    yes.click()
    await settle()
    expect(root(el).querySelectorAll('oyl-goal-row')).toHaveLength(0)
    expect(root(el).textContent).toContain('No goals yet.')
    el.remove()
  })
})
