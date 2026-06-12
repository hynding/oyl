import { describe, expect, it } from 'vitest'
import { fixtureId } from './fixture-id'
import { FIXTURE_TODAY, FIXTURE_TZ } from './constants'
import { makeLifeArea, makeUser } from './builders'
import { seed } from './seed'
import { LifeArea } from '../core/life-area'
import { User } from '../user/user'
import { Id } from '../core/id'

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
})
