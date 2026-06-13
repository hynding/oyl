import { describe, expect, it } from 'vitest'
import { Measurement } from './measurement.js'
import { Id } from '../core/id.js'
import { MetricKey } from '../core/metric-key.js'
import { DomainError } from '../core/domain-error.js'

const when = new Date('2026-06-01T08:00:00Z')

describe('Measurement', () => {
  it('emits exactly its metric and value', () => {
    const weight = new Measurement({ occurredAt: when, metric: 'body.weight_kg', value: 80.5 })
    expect(weight.kind).toBe('measurement')
    expect(weight.metrics().get(MetricKey.of('body.weight_kg'))).toBe(80.5)
    expect(weight.metrics().size).toBe(1)
  })

  it.each(['body.weight_kg', 'sleep.hours', 'mood.score', 'screen.minutes', 'home.kwh', 'custom.guitar_practice_minutes'])(
    'accepts measurement-owned namespace %s',
    (metric) => {
      expect(new Measurement({ occurredAt: when, metric, value: 1 }).metric).toBe(metric)
    },
  )

  it.each(['activity.run.minutes', 'finance.spend.groceries', 'nutrition.calories', 'note.count'])(
    'rejects entry-owned namespace %s with RESERVED_NAMESPACE',
    (metric) => {
      let caught: unknown
      try {
        new Measurement({ occurredAt: when, metric, value: 1 })
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('RESERVED_NAMESPACE')
    },
  )

  it('rejects malformed keys and non-finite values', () => {
    let caught1: unknown
    try {
      new Measurement({ occurredAt: when, metric: 'weight', value: 1 })
    } catch (e) {
      caught1 = e
    }
    expect((caught1 as DomainError)?.code).toBe('INVALID_METRIC_KEY')

    let caught2: unknown
    try {
      new Measurement({ occurredAt: when, metric: 'body.weight_kg', value: NaN })
    } catch (e) {
      caught2 = e
    }
    expect((caught2 as DomainError)?.code).toBe('INVALID_QUANTITY')
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const weight = new Measurement({ id: Id.of('00000000-0000-4000-8000-000000000103'), occurredAt: when, metric: 'body.weight_kg', value: 80.5 })
    const revived = Measurement.fromJSON({ ...weight.toJSON(), futureField: 4 })
    expect(revived.metric).toBe('body.weight_kg')
    expect(revived.value).toBe(80.5)
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(4)
  })
})
