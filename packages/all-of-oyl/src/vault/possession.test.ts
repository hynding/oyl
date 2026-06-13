import { describe, expect, it } from 'vitest'
import { Possession } from './possession.js'
import { DayKey } from '../core/day-key.js'
import { Money } from '../core/money.js'
import { DomainError } from '../core/domain-error.js'

const day = (s: string) => DayKey.of(s)

describe('Possession', () => {
  it('constructs with optional location, warranty, and purchase info', () => {
    const machine = new Possession({
      name: 'Espresso machine',
      location: 'Kitchen',
      warrantyUntil: day('2026-07-01'),
      purchasePrice: Money.usd(64900),
      purchasedOn: day('2025-07-01'),
    })
    expect(machine.name).toBe('Espresso machine')
    expect(machine.purchasePrice?.equals(Money.usd(64900))).toBe(true)
  })

  it('warranty expiry is its fixed due; none without a warranty', () => {
    const machine = new Possession({ name: 'Espresso machine', warrantyUntil: day('2026-07-01') })
    expect(machine.nextDueOn(day('2026-06-01'))?.value).toBe('2026-07-01')
    expect(new Possession({ name: 'Couch' }).nextDueOn(day('2026-06-01'))).toBeUndefined()
  })

  it('rejects an empty name', () => {
    let caught: unknown
    try {
      new Possession({ name: '' })
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const shape = {
      id: '00000000-0000-4000-8000-000000002010',
      name: 'Espresso machine',
      location: 'Kitchen',
      warrantyUntil: '2026-07-01',
      purchasePrice: { minor: 64900, currency: 'USD', exponent: 2 },
      purchasedOn: '2025-07-01',
      futureField: 15,
    }
    expect(Possession.fromJSON(shape).toJSON()).toEqual(shape)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [null, { id: 'nope', name: 'x' }, { id: '00000000-0000-4000-8000-000000002010', name: 'x', purchasePrice: { minor: 'lots' } }]) {
      let caught: unknown
      try {
        Possession.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
