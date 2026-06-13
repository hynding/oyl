import { describe, expect, it } from 'vitest'
import { COLLECTIONS, type Codec, type CollectionName } from './collections.js'
import { makeSeed } from './index.js'

// Tie fromJSON's output back to toJSON's input through one shared T, so the
// round-trip typechecks per-codec instead of intersecting the whole COLLECTIONS
// union (which reduces toJSON's parameter to `never`).
function roundTrip<T>(codec: Codec<T>, shape: unknown): unknown {
  return codec.toJSON(codec.fromJSON(shape))
}

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
