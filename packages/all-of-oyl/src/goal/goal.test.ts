import { describe, expect, it } from 'vitest'
import { Goal } from './goal'
import { DayKey } from '../core/day-key'
import { Id } from '../core/id'
import { Journal } from '../core/journal'
import { Measurement } from '../track/measurement'
import { DomainError } from '../core/domain-error'

const NY = 'America/New_York'
const day = (s: string) => DayKey.of(s)
const at = (s: string, hourUtc: number) => new Date(`${s}T${String(hourUtc).padStart(2, '0')}:00:00Z`)

function journalWith(...measurements: [string, string, number][]): Journal {
  const j = new Journal(NY)
  let hour = 10
  for (const [dayValue, metric, value] of measurements) {
    j.add(new Measurement({ occurredAt: at(dayValue, hour), metric, value }))
    hour = hour === 22 ? 10 : hour + 1
  }
  return j
}

describe('Goal', () => {
  it('constructs with defaults: sum aggregation, skip empty periods', () => {
    const goal = new Goal({ metric: 'custom.pages_read', target: 20, direction: 'atLeast', period: 'day' })
    expect(goal.aggregation).toBe('sum')
    expect(goal.emptyPeriods).toBe('skip')
    expect(goal.name).toBeUndefined()
    expect(Id.of(goal.id)).toBe(goal.id)
  })

  it('rejects invalid construction', () => {
    const cases: [() => unknown, string][] = [
      [() => new Goal({ metric: 'pages', target: 20, direction: 'atLeast', period: 'day' }), 'INVALID_METRIC_KEY'],
      [() => new Goal({ metric: 'custom.pages_read', target: 0, direction: 'atLeast', period: 'day' }), 'INVALID_QUANTITY'],
      [() => new Goal({ metric: 'custom.pages_read', target: -5, direction: 'atLeast', period: 'day' }), 'INVALID_QUANTITY'],
      [() => new Goal({ metric: 'custom.pages_read', target: NaN, direction: 'atLeast', period: 'day' }), 'INVALID_QUANTITY'],
      [() => new Goal({ name: '', metric: 'custom.pages_read', target: 20, direction: 'atLeast', period: 'day' }), 'INVALID_QUANTITY'],
    ]
    for (const [build, code] of cases) {
      let caught: unknown
      try {
        build()
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe(code)
    }
  })

  it('atLeast: met when current reaches target; ratio is attainment', () => {
    const j = journalWith(['2026-06-03', 'custom.pages_read', 15])
    const goal = new Goal({ metric: 'custom.pages_read', target: 20, direction: 'atLeast', period: 'day' })
    const p = goal.progressOn(j, day('2026-06-03'))
    expect(p.current).toBe(15)
    expect(p.target).toBe(20)
    expect(p.ratio).toBeCloseTo(0.75)
    expect(p.met).toBe(false)
    expect(p.paused).toBe(false)
    expect(p.empty).toBe(false)

    j.add(new Measurement({ occurredAt: at('2026-06-03', 20), metric: 'custom.pages_read', value: 10 }))
    expect(goal.progressOn(j, day('2026-06-03')).met).toBe(true)
    expect(goal.progressOn(j, day('2026-06-03')).ratio).toBe(1) // clamped
  })

  it('atMost: met while current stays at or under target; ratio is allowance consumed', () => {
    const j = journalWith(['2026-06-03', 'custom.screen_minutes', 90])
    const goal = new Goal({ metric: 'custom.screen_minutes', target: 120, direction: 'atMost', period: 'day' })
    const p = goal.progressOn(j, day('2026-06-03'))
    expect(p.met).toBe(true)
    expect(p.ratio).toBeCloseTo(0.75)

    j.add(new Measurement({ occurredAt: at('2026-06-03', 21), metric: 'custom.screen_minutes', value: 60 }))
    const over = goal.progressOn(j, day('2026-06-03'))
    expect(over.met).toBe(false)
    expect(over.ratio).toBe(1) // clamped
  })

  it('ratio clamps negative currents to 0', () => {
    const j = journalWith(['2026-06-03', 'custom.net_spend', -10])
    const goal = new Goal({ metric: 'custom.net_spend', target: 100, direction: 'atMost', period: 'day' })
    const p = goal.progressOn(j, day('2026-06-03'))
    expect(p.ratio).toBe(0)
    expect(p.met).toBe(true)
  })

  it('resolves week and month windows through the same engine', () => {
    const j = journalWith(
      ['2026-06-01', 'custom.km', 5],
      ['2026-06-03', 'custom.km', 5],
      ['2026-06-07', 'custom.km', 5],
      ['2026-06-08', 'custom.km', 99], // next ISO week — excluded
    )
    const weekly = new Goal({ metric: 'custom.km', target: 15, direction: 'atLeast', period: 'week' })
    expect(weekly.progressOn(j, day('2026-06-03')).current).toBe(15)
    expect(weekly.progressOn(j, day('2026-06-03')).met).toBe(true)
  })

  it('gauge goals use the aggregation kind ("weigh at most 80, last reading wins")', () => {
    const j = journalWith(['2026-06-03', 'body.weight_kg', 81], ['2026-06-03', 'body.weight_kg', 79.5])
    const goal = new Goal({ metric: 'body.weight_kg', target: 80, direction: 'atMost', period: 'day', aggregation: 'last' })
    const p = goal.progressOn(j, day('2026-06-03'))
    expect(p.current).toBe(79.5)
    expect(p.met).toBe(true)
  })

  it('no-data periods: skip (default) reports empty with met undefined', () => {
    const j = new Journal(NY)
    const goal = new Goal({ metric: 'custom.pages_read', target: 20, direction: 'atLeast', period: 'day' })
    const p = goal.progressOn(j, day('2026-06-03'))
    expect(p.empty).toBe(true)
    expect(p.met).toBeUndefined()
    expect(p.current).toBe(0)
  })

  it("no-data periods: 'met' opts into vacuous success", () => {
    const j = new Journal(NY)
    const goal = new Goal({
      metric: 'finance.spend.dining',
      target: 200,
      direction: 'atMost',
      period: 'month',
      emptyPeriods: 'met',
    })
    const p = goal.progressOn(j, day('2026-06-03'))
    expect(p.empty).toBe(true)
    expect(p.met).toBe(true)
  })
})
