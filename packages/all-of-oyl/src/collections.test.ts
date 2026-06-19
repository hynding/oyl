import { describe, expect, it } from 'vitest'
import { COLLECTIONS, kindOf, entitiesByKind, type Codec, type CollectionName } from './collections.js'
import { makeSeed } from './index.js'

// Tie fromJSON's output back to toJSON's input through one shared T, so the
// round-trip typechecks per-codec instead of intersecting the whole COLLECTIONS
// union (which reduces toJSON's parameter to `never`).
function roundTrip<T>(codec: Codec<T>, shape: unknown): unknown {
  return codec.toJSON(codec.fromJSON(shape))
}

describe('entity kind', () => {
  it('classifies catalogs, personal records, and system links', () => {
    expect(kindOf('activities')).toBe('catalog')
    expect(kindOf('consumables')).toBe('catalog')
    expect(kindOf('consumableProducts')).toBe('catalog')
    expect(kindOf('notes')).toBe('personal')
    expect(kindOf('accounts')).toBe('personal')
    expect(kindOf('connections')).toBe('system')
    expect(kindOf('grants')).toBe('system')
  })
  it('per-kind entry collections exist and are personal', () => {
    expect(COLLECTIONS.notes).toBeDefined()
    expect(kindOf('notes')).toBe('personal')
    expect(COLLECTIONS.consumptions).toBeDefined()
    expect(kindOf('consumptions')).toBe('personal')
    expect(COLLECTIONS.transactions).toBeDefined()
    expect(kindOf('transactions')).toBe('personal')
    expect(COLLECTIONS.measurements).toBeDefined()
    expect(kindOf('measurements')).toBe('personal')
    expect(COLLECTIONS.activitySessions).toBeDefined()
    expect(kindOf('activitySessions')).toBe('personal')
  })
  it('entries alias is gone — per-kind collections cover all entry types', () => {
    // @ts-expect-error — 'entries' is no longer a CollectionName
    expect(COLLECTIONS['entries']).toBeUndefined()
  })
  it('every collection has a kind', () => {
    for (const name of Object.keys(COLLECTIONS)) expect(['catalog','personal','system']).toContain(kindOf(/** @type any */(name as CollectionName)))
  })
  it('entitiesByKind groups them', () => {
    expect(entitiesByKind('catalog')).toContain('activities')
    expect(entitiesByKind('personal')).not.toContain('activities')
  })
})

describe('collections manifest', () => {
  const seed = makeSeed()

  it('covers exactly the Seed collections', () => {
    expect(new Set(Object.keys(COLLECTIONS))).toEqual(new Set(Object.keys(seed)))
  })

  it('round-trips every seeded shape through its codec (toJSON(fromJSON(x)) === x)', () => {
    for (const name of Object.keys(COLLECTIONS) as CollectionName[]) {
      const codec = COLLECTIONS[name]
      for (const shape of seed[name]) {
        expect(roundTrip(codec, shape)).toEqual(shape)
      }
    }
  })
})
