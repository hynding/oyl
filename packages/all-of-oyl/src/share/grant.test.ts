// packages/all-of-oyl/src/share/grant.test.ts
import { describe, expect, it } from 'vitest'
import { Grant } from './grant'
import { DayKey } from '../core/day-key'
import { Id } from '../core/id'
import { DomainError } from '../core/domain-error'

const day = (s: string) => DayKey.of(s)
const connectionId = Id.of('00000000-0000-4000-8000-000000003000')
const grantorId = Id.of('00000000-0000-4000-8000-000000000001')
const goalId = Id.of('00000000-0000-4000-8000-000000000051')

describe('Grant', () => {
  it('constructs each scope kind', () => {
    const goal = new Grant({ connectionId, grantorId, scope: { kind: 'goal-progress', goalId } })
    expect(goal.scope).toEqual({ kind: 'goal-progress', goalId })
    const area = new Grant({ connectionId, grantorId, scope: { kind: 'area-summary', areaId: goalId } })
    expect(area.scope.kind).toBe('area-summary')
    const metric = new Grant({ connectionId, grantorId, scope: { kind: 'metric', prefix: 'activity.run' } })
    expect(metric.scope).toEqual({ kind: 'metric', prefix: 'activity.run' })
    const dayPlan = new Grant({ connectionId, grantorId, scope: { kind: 'day-plan' } })
    expect(dayPlan.scope).toEqual({ kind: 'day-plan' })
  })

  it('validates metric prefixes against the slug grammar', () => {
    for (const prefix of ['', 'two words', 'activity..run', 'Activity.run']) {
      let caught: unknown
      try {
        new Grant({ connectionId, grantorId, scope: { kind: 'metric', prefix } })
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('INVALID_METRIC_KEY')
    }
    // a single namespace segment is a legal prefix
    expect(new Grant({ connectionId, grantorId, scope: { kind: 'metric', prefix: 'activity' } }).scope.kind).toBe('metric')
  })

  it('is live by default; expiresOn is INCLUSIVE — live through the end of that day', () => {
    const open = new Grant({ connectionId, grantorId, scope: { kind: 'day-plan' } })
    expect(open.isLiveOn(day('2030-01-01'))).toBe(true)

    const expiring = new Grant({ connectionId, grantorId, scope: { kind: 'day-plan' }, expiresOn: day('2026-06-15') })
    expect(expiring.isLiveOn(day('2026-06-15'))).toBe(true) // the boundary day itself
    expect(expiring.isLiveOn(day('2026-06-16'))).toBe(false)
  })

  it('revocation is immediate and total — dead for every asOf, nothing grandfathered', () => {
    const grant = new Grant({ connectionId, grantorId, scope: { kind: 'day-plan' } })
    grant.revoke(day('2026-06-10'))
    expect(grant.revokedOn?.value).toBe('2026-06-10')
    expect(grant.isLiveOn(day('2026-06-11'))).toBe(false)
    expect(grant.isLiveOn(day('2026-06-01'))).toBe(false) // even before the revocation day

    let caught: unknown
    try {
      grant.revoke(day('2026-06-12')) // already dead
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('ILLEGAL_TRANSITION')
  })

  it('round-trips JSON for every scope kind with unknown fields', () => {
    const grant = new Grant({
      id: Id.of('00000000-0000-4000-8000-000000003010'),
      connectionId,
      grantorId,
      scope: { kind: 'goal-progress', goalId },
      expiresOn: day('2026-12-31'),
    })
    grant.revoke(day('2026-06-10'))
    const revived = Grant.fromJSON({ ...grant.toJSON(), futureField: 20 })
    expect(revived.scope).toEqual({ kind: 'goal-progress', goalId })
    expect(revived.revokedOn?.value).toBe('2026-06-10')
    expect(revived.isLiveOn(day('2026-06-01'))).toBe(false)
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(20)
    expect(Grant.fromJSON(revived.toJSON()).toJSON()).toEqual(revived.toJSON())

    const dayPlanGrant = new Grant({ connectionId, grantorId, scope: { kind: 'day-plan' } })
    expect(Grant.fromJSON(dayPlanGrant.toJSON()).scope).toEqual({ kind: 'day-plan' })
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    const good = {
      id: '00000000-0000-4000-8000-000000003010',
      connectionId: connectionId as string,
      grantorId: grantorId as string,
      scope: { kind: 'day-plan' },
    }
    for (const shape of [
      null,
      { ...good, scope: undefined },
      { ...good, scope: { kind: 'raw-entries' } }, // deliberately not a scope — raw-entry sharing does not exist
      { ...good, scope: { kind: 'goal-progress' } }, // missing goalId
      { ...good, scope: { kind: 'metric', prefix: 'two words' } },
      { ...good, grantorId: 'nope' },
    ]) {
      let caught: unknown
      try {
        Grant.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
