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

  it('a window overlapping a paused range reports paused with met undefined', () => {
    const j = journalWith(['2026-06-03', 'custom.pages_read', 25])
    const goal = new Goal({ metric: 'custom.pages_read', target: 20, direction: 'atLeast', period: 'day' })
    goal.pause(day('2026-06-02'), day('2026-06-04'))
    const p = goal.progressOn(j, day('2026-06-03'))
    expect(p.paused).toBe(true)
    expect(p.met).toBeUndefined()
    expect(p.current).toBe(25) // numbers still reported

    // boundary overlap: any window touching the pause is paused
    const weekly = new Goal({ metric: 'custom.pages_read', target: 20, direction: 'atLeast', period: 'week' })
    weekly.pause(day('2026-06-07'), day('2026-06-09'))
    expect(weekly.progressOn(j, day('2026-06-03')).paused).toBe(true) // week 06-01..06-07 touches pause start
    expect(weekly.progressOn(j, day('2026-06-10')).paused).toBe(true) // week 06-08..06-14 overlaps pause end 06-09
    expect(weekly.progressOn(j, day('2026-06-17')).paused).toBe(false) // week 06-15..06-21 is clear
  })

  it('pause ranges merge when overlapping or adjacent', () => {
    const goal = new Goal({ metric: 'custom.x', target: 1, direction: 'atLeast', period: 'day' })
    goal.pause(day('2026-06-01'), day('2026-06-03'))
    goal.pause(day('2026-06-02'), day('2026-06-05')) // overlap
    goal.pause(day('2026-06-06'), day('2026-06-08')) // adjacent (06-05 + 1 = 06-06)
    goal.pause(day('2026-06-20'), day('2026-06-21')) // separate
    expect(goal.pauses.map((r) => [r.from.value, r.to?.value])).toEqual([
      ['2026-06-01', '2026-06-08'],
      ['2026-06-20', '2026-06-21'],
    ])
  })

  it('open-ended pause is vacation mode and swallows later ranges; resume closes it', () => {
    const goal = new Goal({ metric: 'custom.x', target: 1, direction: 'atLeast', period: 'day' })
    goal.pause(day('2026-06-10')) // open
    goal.pause(day('2026-06-15'), day('2026-06-16')) // swallowed
    expect(goal.pauses.map((r) => [r.from.value, r.to?.value])).toEqual([['2026-06-10', undefined]])
    expect(goal.progressOn(new Journal(NY), day('2026-12-25')).paused).toBe(true)

    goal.resume(day('2026-06-20'))
    expect(goal.pauses.map((r) => [r.from.value, r.to?.value])).toEqual([['2026-06-10', '2026-06-20']])
    expect(goal.progressOn(new Journal(NY), day('2026-12-25')).paused).toBe(false)
  })

  it('rejects inverted ranges, resume-before-from, and resume without an open pause', () => {
    const goal = new Goal({ metric: 'custom.x', target: 1, direction: 'atLeast', period: 'day' })
    let caught1: unknown
    try {
      goal.pause(day('2026-06-10'), day('2026-06-05'))
    } catch (e) {
      caught1 = e
    }
    expect((caught1 as DomainError)?.code).toBe('INVALID_RANGE')

    let caught2: unknown
    try {
      goal.resume(day('2026-06-20'))
    } catch (e) {
      caught2 = e
    }
    expect((caught2 as DomainError)?.code).toBe('ILLEGAL_TRANSITION')

    goal.pause(day('2026-06-10'))
    let caught3: unknown
    try {
      goal.resume(day('2026-06-05'))
    } catch (e) {
      caught3 = e
    }
    expect((caught3 as DomainError)?.code).toBe('INVALID_RANGE')
  })

  it('round-trips JSON with pauses, unknown fields, and meta', () => {
    const goal = new Goal({
      id: Id.of('00000000-0000-4000-8000-000000000050'),
      name: 'Eat lighter',
      metric: 'nutrition.calories',
      target: 2200,
      direction: 'atMost',
      period: 'day',
      areaId: Id.of('00000000-0000-4000-8000-000000000010'),
    })
    goal.pause(day('2026-06-02'), day('2026-06-04'))
    goal.pause(day('2026-06-10')) // open
    goal.meta = { createdAt: new Date('2026-06-01T00:00:00Z'), updatedAt: new Date('2026-06-01T00:00:00Z'), revision: 2 }

    const revived = Goal.fromJSON({ ...goal.toJSON(), futureField: 7 })
    expect(revived.name).toBe('Eat lighter')
    expect(revived.metric).toBe('nutrition.calories')
    expect(revived.aggregation).toBe('sum')
    expect(revived.emptyPeriods).toBe('skip')
    expect(revived.pauses.map((r) => [r.from.value, r.to?.value])).toEqual([
      ['2026-06-02', '2026-06-04'],
      ['2026-06-10', undefined],
    ])
    expect(revived.meta?.revision).toBe(2)
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(7)
    // idempotence
    expect(Goal.fromJSON(revived.toJSON()).toJSON()).toEqual(revived.toJSON())
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    const base = {
      id: '00000000-0000-4000-8000-000000000050',
      metric: 'custom.x',
      target: 1,
      direction: 'atLeast',
      period: 'day',
      aggregation: 'sum',
      emptyPeriods: 'skip',
    }
    for (const shape of [
      null,
      { ...base, direction: 'sideways' },
      { ...base, period: 'fortnight' },
      { ...base, aggregation: 'median' },
      { ...base, emptyPeriods: 'maybe' },
      { ...base, target: 'lots' },
      { ...base, id: 'nope' },
      { ...base, pauses: [{ from: 'garbage' }] },
      { ...base, pauses: [{ from: '2026-06-10', to: '2026-06-05' }] }, // inverted on the wire
    ]) {
      let caught: unknown
      try {
        Goal.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
