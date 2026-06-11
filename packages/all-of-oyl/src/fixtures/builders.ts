import { LifeArea } from '../core/life-area'
import { User, type Units } from '../user/user'
import type { Id } from '../core/id'
import { FIXTURE_TZ } from './constants'
import { fixtureId } from './fixture-id'

type UserProps = { id?: Id; displayName?: string; timezone?: string; defaultCurrency?: string; units?: Units }

export function makeUser(overrides: UserProps = {}): User {
  return new User({
    id: overrides.id ?? fixtureId(1),
    displayName: overrides.displayName ?? 'Avery',
    timezone: overrides.timezone ?? FIXTURE_TZ,
    defaultCurrency: overrides.defaultCurrency ?? 'USD',
    ...(overrides.units !== undefined ? { units: overrides.units } : {}),
  })
}

type LifeAreaProps = { id?: Id; name?: string; slug?: string }

export function makeLifeArea(overrides: LifeAreaProps = {}): LifeArea {
  return new LifeArea({
    id: overrides.id ?? fixtureId(10),
    name: overrides.name ?? 'Health',
    slug: overrides.slug ?? 'health',
  })
}
