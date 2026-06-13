import { describe, expect, it } from 'vitest'
import { Activity } from './activity.js'
import { Id } from '../core/id.js'
import { DomainError } from '../core/domain-error.js'

describe('Activity', () => {
  it('constructs a definition with validated slug', () => {
    const run = new Activity({ name: 'Run', slug: 'run', defaultUnit: 'minutes', areaId: Id.of('00000000-0000-4000-8000-000000000010') })
    expect(run.name).toBe('Run')
    expect(run.slug).toBe('run')
    expect(run.defaultUnit).toBe('minutes')
    expect(Id.of(run.id)).toBe(run.id)
  })

  it('rejects bad slugs and bad default units', () => {
    for (const props of [
      { name: 'Run', slug: 'no spaces' },
      { name: 'Run', slug: 'run', defaultUnit: 'two words' },
      { name: '', slug: 'run' },
    ]) {
      let caught: unknown
      try {
        new Activity(props)
      } catch (e) {
        caught = e
      }
      expect(['INVALID_SLUG', 'INVALID_QUANTITY']).toContain((caught as DomainError)?.code)
    }
  })

  it('round-trips JSON and preserves unknown fields', () => {
    const shape = {
      id: '00000000-0000-4000-8000-000000000030',
      name: 'Run',
      slug: 'run',
      defaultUnit: 'minutes',
      areaId: '00000000-0000-4000-8000-000000000010',
      futureField: true,
    }
    const revived = Activity.fromJSON(shape)
    expect(revived.areaId).toBe('00000000-0000-4000-8000-000000000010')
    expect(revived.toJSON()).toEqual(shape)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [null, { name: 'Run' }, { id: 'nope', name: 'Run', slug: 'run' }]) {
      let caught: unknown
      try {
        Activity.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
