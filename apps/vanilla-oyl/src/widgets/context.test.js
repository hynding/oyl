import { describe, expect, it } from 'vitest'
import { DayKey, DayRange, Journal, Task } from '@oyl/all-of-oyl'
import { createWidgetContext } from './context.js'
import { signal } from '../lib/reactive/signal.js'

function makeCtx() {
  const journal = new Journal('UTC')
  const revision = signal(0)
  const journalStore = { peek: () => { revision.get(); return journal } }
  const plans = [new Task({ title: 'Run 5k', due: DayKey.of('2026-08-09') })]
  const planner = { agendaFor: () => plans }
  const profile = signal(/** @type {any} */ ({ displayName: 'Steve' }))
  const reviewOn = (/** @type {any} */ range) => ({ period: range, goals: [] })
  const ctx = createWidgetContext({
    journal: journalStore,
    planner,
    reviewOn: /** @type {any} */ (reviewOn),
    profile,
    tz: 'UTC',
    now: () => new Date('2026-08-09T14:30:00Z'),
  })
  return { ctx, journal }
}

describe('createWidgetContext', () => {
  it('exposes exactly the read-only surface, frozen', () => {
    const { ctx } = makeCtx()
    expect(Object.isFrozen(ctx)).toBe(true)
    expect(Object.keys(ctx).sort()).toEqual(
      ['activeDays', 'hour', 'plansOn', 'profileName', 'review', 'series', 'today', 'tz'].sort(),
    )
    for (const [key, member] of Object.entries(ctx)) {
      if (key === 'tz') expect(typeof member).toBe('string')
      else expect(typeof member).toBe('function')
    }
  })

  it('today() buckets now() in the context tz; hour() gives the greeting hour', () => {
    const { ctx } = makeCtx()
    expect(ctx.today().value).toBe('2026-08-09')
    expect(typeof ctx.hour()).toBe('number')
  })

  it('profileName reads the signal; null profile gives undefined', () => {
    const { ctx } = makeCtx()
    expect(ctx.profileName()).toBe('Steve')
  })

  it('plansOn maps agenda plans to plain {status,label} data — no domain objects leak', () => {
    const { ctx } = makeCtx()
    const items = ctx.plansOn(DayKey.of('2026-08-09'))
    expect(items).toEqual([{ status: 'open', label: 'Run 5k' }])
    // plain data: no complete()/cancel() reachable
    expect(/** @type {any} */ (items[0]).complete).toBeUndefined()
  })

  it('activeDays and series consult the live journal', () => {
    const { ctx } = makeCtx()
    const range = DayRange.of(DayKey.of('2026-08-01'), DayKey.of('2026-08-09'))
    expect(ctx.activeDays(range).size).toBe(0)
    expect(ctx.series(range, 'spending')).toHaveLength(9)
    expect(ctx.series(range, 'spending').every((v) => v === 0)).toBe(true)
  })
})
