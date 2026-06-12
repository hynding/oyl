import { describe, expect, it } from 'vitest'
import { fixtureId } from './fixture-id'
import { FIXTURE_TODAY, FIXTURE_TZ } from './constants'
import {
  makeAccount,
  makeActivity,
  makeActivitySession,
  makeConsumption,
  makeFood,
  makeLifeArea,
  makeMeasurement,
  makeNote,
  makeTransaction,
  makeUser,
} from './builders'
import { makeSeed } from './seed'
import { LifeArea } from '../core/life-area'
import { User } from '../user/user'
import { Id } from '../core/id'
import { reviveEntry } from '../index'
import { Journal } from '../core/journal'
import { DayKey } from '../core/day-key'
import { DayRange } from '../core/day-range'
import { MetricKey } from '../core/metric-key'
import { Transaction } from '../finance/transaction'
import { Consumption } from '../nutrition/consumption'

const seed = makeSeed()

describe('fixtures', () => {
  it('fixtureId yields valid, stable, distinct ids', () => {
    expect(fixtureId(1)).toBe(Id.of('00000000-0000-4000-8000-000000000001'))
    expect(fixtureId(42)).toBe(fixtureId(42))
    expect(fixtureId(1)).not.toBe(fixtureId(2))
  })

  it('anchors at FIXTURE_TODAY in a DST-rich timezone', () => {
    expect(FIXTURE_TODAY.value).toBe('2026-06-01')
    expect(FIXTURE_TZ).toBe('America/New_York')
  })

  it('builders produce valid objects with overridable fields', () => {
    const user = makeUser()
    expect(user.timezone).toBe(FIXTURE_TZ)
    expect(makeUser({ displayName: 'Blake' }).displayName).toBe('Blake')
    const area = makeLifeArea()
    expect(area.slug).toBe('health')
    expect(makeLifeArea({ slug: 'money', name: 'Money' }).slug).toBe('money')
  })

  it('seed shapes revive through the domain (standing round-trip test)', () => {
    expect(seed.users).toHaveLength(2)
    expect(seed.lifeAreas).toHaveLength(4)
    const users = seed.users.map((shape) => User.fromJSON(shape))
    expect(users.map((u) => u.displayName)).toEqual(['Avery', 'Blake'])
    const areas = seed.lifeAreas.map((shape) => LifeArea.fromJSON(shape))
    expect(new Set(areas.map((a) => a.slug)).size).toBe(4)
    // re-serializing equals the seed (no drift)
    expect(users.map((u) => u.toJSON())).toEqual(seed.users)
    expect(areas.map((a) => a.toJSON())).toEqual(seed.lifeAreas)
    // serialization is idempotent: revive(serialize(revive(x))) === serialize(revive(x))
    for (const u of users) {
      expect(User.fromJSON(u.toJSON()).toJSON()).toEqual(u.toJSON())
    }
    for (const a of areas) {
      expect(LifeArea.fromJSON(a.toJSON()).toJSON()).toEqual(a.toJSON())
    }
  })

  it('phase 2 builders produce valid objects with overridable fields', () => {
    expect(makeActivity().slug).toBe('run')
    expect(makeFood().nutrients.calories).toBe(150)
    expect(makeAccount().currency).toBe('USD')
    expect(makeActivitySession().slug).toBe('run')
    expect(makeConsumption().servings).toBe(1)
    expect(makeTransaction().direction).toBe('expense')
    expect(makeMeasurement().metric).toBe('body.weight_kg')
    expect(makeNote().text.length).toBeGreaterThan(0)
    expect(makeTransaction({ direction: 'income', category: 'salary' }).direction).toBe('income')
  })

  it('seed contains the phase 2 catalogs and a six-week entry slice', () => {
    expect(seed.activities.length).toBeGreaterThanOrEqual(2)
    expect(seed.foods.length).toBeGreaterThanOrEqual(2)
    expect(seed.accounts).toHaveLength(1)
    expect(seed.entries).toHaveLength(263) // deterministic: 42 days × pattern + showcase
  })

  it('every seed entry revives through reviveEntry and re-serializes identically', () => {
    const entries = seed.entries.map((shape) => reviveEntry(shape))
    expect(entries).toHaveLength(seed.entries.length)
    for (const entry of entries) {
      expect(reviveEntry(entry.toJSON()).toJSON()).toEqual(entry.toJSON())
    }
  })

  it('seed showcases the spec semantics: a refund and an ad-hoc meal', () => {
    const entries = seed.entries.map((shape) => reviveEntry(shape))
    const refund = entries.find((e) => e instanceof Transaction && e.amount.minor < 0)
    expect(refund).toBeDefined()
    const adHoc = entries.find((e) => e instanceof Consumption && e.foodId === undefined)
    expect(adHoc).toBeDefined()
  })

  it('seed straddles the DST transition', () => {
    const entries = seed.entries.map((shape) => reviveEntry(shape))
    const journal = new Journal(FIXTURE_TZ)
    for (const e of entries) journal.add(e)
    const dstWeekend = DayRange.of(DayKey.of('2026-03-07'), DayKey.of('2026-03-09'))
    expect(journal.aggregate(MetricKey.of('body.weight_kg'), dstWeekend, 'avg')).toBeGreaterThan(0)
  })

  it('a Journal hydrated from seed answers real questions', () => {
    const journal = new Journal(FIXTURE_TZ)
    for (const shape of seed.entries) journal.add(reviveEntry(shape))
    const lastWeek = DayRange.of(FIXTURE_TODAY.addDays(-6), FIXTURE_TODAY)
    expect(journal.totalOf(MetricKey.of('nutrition.calories'), lastWeek)).toBeGreaterThan(0)
    expect(journal.totalOf(MetricKey.of('activity.run.minutes'), lastWeek)).toBeGreaterThan(0)
    expect(journal.totalsByPrefix('finance.spend', lastWeek).size).toBeGreaterThan(0)
  })
})
