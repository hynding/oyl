import { makeLifeArea, makeUser } from './builders'
import { fixtureId } from './fixture-id'

/**
 * The canonical dataset as wire shapes (toJSON). Sourceable: apps seed any
 * backend by walking these through repository adapters or an API; tests
 * revive them through fromJSON — a standing round-trip test.
 * Personas: Avery (rich account), Blake (sparse). Phase 1 ships users +
 * Avery's life areas; later phases extend.
 */
const avery = makeUser({ id: fixtureId(1), displayName: 'Avery', units: 'metric' })
const blake = makeUser({ id: fixtureId(2), displayName: 'Blake', timezone: 'America/Chicago' })

const areas = [
  makeLifeArea({ id: fixtureId(10), name: 'Health', slug: 'health' }),
  makeLifeArea({ id: fixtureId(11), name: 'Family', slug: 'family' }),
  makeLifeArea({ id: fixtureId(12), name: 'Career', slug: 'career' }),
  makeLifeArea({ id: fixtureId(13), name: 'Money', slug: 'money' }),
]

export const seed = {
  users: [avery.toJSON(), blake.toJSON()],
  lifeAreas: areas.map((a) => a.toJSON()),
}
