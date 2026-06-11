import { describe, expect, it } from 'vitest'
import { KNOWN_NAMESPACES, MEASUREMENT_NAMESPACES, MetricKey } from './metric-key'
import { DomainError } from './domain-error'

describe('MetricKey', () => {
  it.each(['nutrition.calories', 'finance.spend.groceries', 'custom.guitar_practice_minutes'])(
    'accepts %s',
    (k) => {
      expect(MetricKey.of(k)).toBe(k)
    },
  )

  it.each(['calories', 'nutrition.', '.calories', 'a.B', 'a.two words', 'a..b', ''])(
    'rejects %s with INVALID_METRIC_KEY',
    (k) => {
      let caught: unknown
      try {
        MetricKey.of(k)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('INVALID_METRIC_KEY')
    },
  )

  it('exposes the namespace', () => {
    expect(MetricKey.namespaceOf(MetricKey.of('finance.spend.groceries'))).toBe('finance')
  })

  it('publishes the ownership registry from the spec', () => {
    expect(KNOWN_NAMESPACES).toEqual([
      'activity', 'nutrition', 'finance', 'body', 'sleep', 'mood', 'screen', 'home', 'note',
    ])
    expect(MEASUREMENT_NAMESPACES).toEqual(['body', 'sleep', 'mood', 'screen', 'home', 'custom'])
  })
})
