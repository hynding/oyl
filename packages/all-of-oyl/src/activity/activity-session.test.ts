import { describe, expect, it } from 'vitest'
import { Activity } from './activity.js'
import { ActivitySession } from './activity-session.js'
import { Id } from '../core/id.js'
import { MetricKey } from '../core/metric-key.js'
import { Quantity } from '../core/quantity.js'
import { DomainError } from '../core/domain-error.js'

const run = new Activity({ id: Id.of('00000000-0000-4000-8000-000000000030'), name: 'Run', slug: 'run' })
const when = new Date('2026-06-01T12:00:00Z')
const key = (s: string) => MetricKey.of(s)

describe('ActivitySession', () => {
  it('snapshots the activity slug and emits count + quantity metrics', () => {
    const session = new ActivitySession({
      occurredAt: when,
      activity: run,
      quantities: [Quantity.of(30, 'minutes'), Quantity.of(5, 'km')],
    })
    expect(session.kind).toBe('activity-session')
    expect(session.activityId).toBe(run.id)
    expect(session.slug).toBe('run')
    expect(session.metrics().get(key('activity.run.count'))).toBe(1)
    expect(session.metrics().get(key('activity.run.minutes'))).toBe(30)
    expect(session.metrics().get(key('activity.run.km'))).toBe(5)
  })

  it('merges same-unit quantities and works with none', () => {
    const session = new ActivitySession({
      occurredAt: when,
      activity: run,
      quantities: [Quantity.of(20, 'minutes'), Quantity.of(10, 'minutes')],
    })
    expect(session.metrics().get(key('activity.run.minutes'))).toBe(30)
    const bare = new ActivitySession({ occurredAt: when, activity: run })
    expect(bare.metrics().get(key('activity.run.count'))).toBe(1)
    expect(bare.metrics().size).toBe(1)
  })

  it('reserves the count unit — it would collide with the session counter', () => {
    let caught: unknown
    try {
      new ActivitySession({ occurredAt: when, activity: run, quantities: [Quantity.of(5, 'count')] })
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('RESERVED_NAMESPACE')
  })

  it('rejects quantity units that cannot embed into a metric key', () => {
    let caught: unknown
    try {
      new ActivitySession({ occurredAt: when, activity: run, quantities: [Quantity.of(1, 'two words')] })
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_SLUG')
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const session = new ActivitySession({
      id: Id.of('00000000-0000-4000-8000-000000000100'),
      occurredAt: when,
      note: 'felt great',
      activity: run,
      quantities: [Quantity.of(30, 'minutes')],
    })
    const out = session.toJSON()
    const revived = ActivitySession.fromJSON({ ...out, futureField: 1 })
    expect(revived.activityId).toBe(run.id)
    expect(revived.slug).toBe('run')
    expect(revived.note).toBe('felt great')
    expect(revived.metrics().get(key('activity.run.minutes'))).toBe(30)
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(1)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [
      { kind: 'activity-session', id: '00000000-0000-4000-8000-000000000100', occurredAt: when.toISOString() }, // no activityId/slug
      { kind: 'consumption', id: '00000000-0000-4000-8000-000000000100', occurredAt: when.toISOString(), activityId: run.id, slug: 'run' }, // wrong kind
    ]) {
      let caught: unknown
      try {
        ActivitySession.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
