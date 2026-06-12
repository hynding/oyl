import { describe, expect, it } from 'vitest'
import { DayKey } from './day-key'
import { Id } from './id'
import { Plan, planBaseJSON, parsePlanBase } from './plan'
import { DomainError } from './domain-error'

class TestPlan extends Plan {
  constructor(props: { id?: Id; title: string; due?: DayKey }) {
    super('test-plan', props)
  }

  toJSON(): Record<string, unknown> {
    return planBaseJSON(this)
  }

  static fromJSON(shape: unknown): TestPlan {
    const base = parsePlanBase(shape, 'test-plan')
    const plan = new TestPlan({ id: base.id, title: base.title, ...(base.due !== undefined ? { due: base.due } : {}) })
    plan.adopt(base)
    return plan
  }

  /** Test-only bridge to the protected restore. */
  private adopt(base: ReturnType<typeof parsePlanBase>): void {
    this.restoreState(base.state)
    if (base.meta !== undefined) this.meta = base.meta
  }
}

const day = (s: string) => DayKey.of(s)

describe('Plan', () => {
  it('starts open with no completedOn', () => {
    const p = new TestPlan({ title: 'Write tests' })
    expect(p.status).toBe('open')
    expect(p.completedOn).toBeUndefined()
    expect(p.fulfilledBy).toEqual([])
  })

  it('complete(on, entryId?) records when and links the entry', () => {
    const p = new TestPlan({ title: 'Run', due: day('2026-06-02') })
    const entryId = Id.create()
    p.complete(day('2026-06-01'), entryId)
    expect(p.status).toBe('done')
    expect(p.completedOn?.value).toBe('2026-06-01')
    expect(p.fulfilledBy).toEqual([entryId])
  })

  it('cancel() moves open → canceled', () => {
    const p = new TestPlan({ title: 'Skip me' })
    p.cancel()
    expect(p.status).toBe('canceled')
  })

  it('completing or canceling a non-open plan throws ILLEGAL_TRANSITION', () => {
    const done = new TestPlan({ title: 'a' })
    done.complete(day('2026-06-01'))
    const canceled = new TestPlan({ title: 'b' })
    canceled.cancel()

    for (const op of [
      () => done.complete(day('2026-06-02')),
      () => done.cancel(),
      () => canceled.complete(day('2026-06-02')),
      () => canceled.cancel(),
    ]) {
      let caught: unknown
      try {
        op()
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('ILLEGAL_TRANSITION')
    }
  })

  it('fulfilledBy returns a defensive copy', () => {
    const p = new TestPlan({ title: 'Run' })
    p.complete(day('2026-06-01'), Id.create())
    const view = p.fulfilledBy
    ;(view as Id[]).length = 0
    expect(p.fulfilledBy.length).toBe(1)
  })

  it('rejects an empty title', () => {
    let caught: unknown
    try {
      new TestPlan({ title: '' })
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
  })

  it('planBaseJSON emits the shared base fields including the state machine', () => {
    const p = new TestPlan({ id: Id.of('00000000-0000-4000-8000-000000001000'), title: 'Write tests', due: day('2026-06-05') })
    p.complete(day('2026-06-04'), Id.of('00000000-0000-4000-8000-000000000100'))
    expect(planBaseJSON(p)).toEqual({
      id: '00000000-0000-4000-8000-000000001000',
      kind: 'test-plan',
      title: 'Write tests',
      due: '2026-06-05',
      status: 'done',
      completedOn: '2026-06-04',
      fulfilledBy: ['00000000-0000-4000-8000-000000000100'],
    })
  })

  it('round-trips the full state machine through parsePlanBase/restoreState', () => {
    const p = new TestPlan({ title: 'Run', due: day('2026-06-05') })
    p.complete(day('2026-06-04'), Id.create())
    const revived = TestPlan.fromJSON(p.toJSON())
    expect(revived.status).toBe('done')
    expect(revived.completedOn?.value).toBe('2026-06-04')
    expect(revived.fulfilledBy).toEqual(p.fulfilledBy)
    expect(revived.toJSON()).toEqual(p.toJSON())

    const canceled = new TestPlan({ title: 'Skip' })
    canceled.cancel()
    expect(TestPlan.fromJSON(canceled.toJSON()).status).toBe('canceled')
  })

  it('parsePlanBase rejects malformed and inconsistent shapes', () => {
    const good = {
      id: '00000000-0000-4000-8000-000000001000',
      kind: 'test-plan',
      title: 'x',
      status: 'open',
    }
    for (const shape of [
      null,
      { ...good, kind: 'other' },
      { ...good, id: 'nope' },
      { ...good, title: '' },
      { ...good, status: 'paused' },
      { ...good, status: 'done' }, // done without completedOn is inconsistent
      { ...good, status: 'open', completedOn: '2026-06-04' }, // open with completedOn is inconsistent
      { ...good, due: 'garbage' },
      { ...good, fulfilledBy: ['nope'] },
    ]) {
      let caught: unknown
      try {
        parsePlanBase(shape, 'test-plan')
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
