// packages/all-of-oyl/src/vault/contact.test.ts
import { describe, expect, it } from 'vitest'
import { Contact } from './contact.js'
import { Cadence } from '../core/cadence.js'
import { DayKey } from '../core/day-key.js'
import { Id } from '../core/id.js'
import { DomainError } from '../core/domain-error.js'

const day = (s: string) => DayKey.of(s)

describe('Contact', () => {
  it('constructs with occasions and tracks last contact', () => {
    const sam = new Contact({
      name: 'Sam',
      lastContactedOn: day('2026-02-26'),
      occasions: [{ name: 'birthday', anchor: day('1990-06-20'), cadence: Cadence.of(1, 'years') }],
    })
    expect(sam.name).toBe('Sam')
    expect(sam.occasions).toHaveLength(1)
    expect(Id.of(sam.id)).toBe(sam.id)
  })

  it("an occasion's next due is its next anchored occurrence on or after asOf", () => {
    const sam = new Contact({ name: 'Sam', occasions: [{ name: 'birthday', anchor: day('1990-06-20'), cadence: Cadence.of(1, 'years') }] })
    expect(sam.nextDueOn(day('2026-06-01'))?.value).toBe('2026-06-20')
    expect(sam.nextDueOn(day('2026-06-21'))?.value).toBe('2027-06-20') // already passed this year
  })

  it('with several occasions the earliest upcoming wins; none → undefined', () => {
    const sam = new Contact({
      name: 'Sam',
      occasions: [
        { name: 'birthday', anchor: day('1990-06-20'), cadence: Cadence.of(1, 'years') },
        { name: 'anniversary', anchor: day('2015-06-10'), cadence: Cadence.of(1, 'years') },
      ],
    })
    expect(sam.nextDueOn(day('2026-06-01'))?.value).toBe('2026-06-10')
    expect(new Contact({ name: 'Pat' }).nextDueOn(day('2026-06-01'))).toBeUndefined()
  })

  it('leap-day birthdays clamp in common years', () => {
    const leapling = new Contact({ name: 'Leap', occasions: [{ name: 'birthday', anchor: day('1992-02-29'), cadence: Cadence.of(1, 'years') }] })
    expect(leapling.nextDueOn(day('2026-01-01'))?.value).toBe('2026-02-28')
    expect(leapling.nextDueOn(day('2028-01-01'))?.value).toBe('2028-02-29')
  })

  it('staleness counts days since last contact; undefined when never contacted', () => {
    const sam = new Contact({ name: 'Sam', lastContactedOn: day('2026-02-26') })
    expect(sam.staleness(day('2026-06-01'))).toBe(95)
    expect(new Contact({ name: 'Pat' }).staleness(day('2026-06-01'))).toBeUndefined()
    sam.recordContact(day('2026-05-30'))
    expect(sam.staleness(day('2026-06-01'))).toBe(2)
  })

  it('validates occasion names and rejects empty contact names', () => {
    let caught1: unknown
    try {
      new Contact({ name: '' })
    } catch (e) {
      caught1 = e
    }
    expect((caught1 as DomainError)?.code).toBe('INVALID_QUANTITY')

    let caught2: unknown
    try {
      new Contact({ name: 'Sam', occasions: [{ name: '', anchor: day('1990-06-20'), cadence: Cadence.of(1, 'years') }] })
    } catch (e) {
      caught2 = e
    }
    expect((caught2 as DomainError)?.code).toBe('INVALID_QUANTITY')
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const sam = new Contact({
      id: Id.of('00000000-0000-4000-8000-000000002030'),
      name: 'Sam',
      lastContactedOn: day('2026-02-26'),
      occasions: [{ name: 'birthday', anchor: day('1990-06-20'), cadence: Cadence.of(1, 'years') }],
    })
    const revived = Contact.fromJSON({ ...sam.toJSON(), futureField: 18 })
    expect(revived.nextDueOn(day('2026-06-01'))?.value).toBe('2026-06-20')
    expect(revived.staleness(day('2026-06-01'))).toBe(95)
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(18)
    expect(Contact.fromJSON(revived.toJSON()).toJSON()).toEqual(revived.toJSON())
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [null, { name: 'Sam' }, { id: '00000000-0000-4000-8000-000000002030', name: 'Sam', occasions: [{ name: 'b', anchor: 'garbage', cadence: { n: 1, unit: 'years' } }] }]) {
      let caught: unknown
      try {
        Contact.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
