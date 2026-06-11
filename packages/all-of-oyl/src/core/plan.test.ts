import { describe, expect, it } from 'vitest'
import { DayKey } from './day-key'
import { Id } from './id'
import { Plan } from './plan'
import { DomainError } from './domain-error'

class TestPlan extends Plan {
  constructor(props: { id?: Id; title: string; due?: DayKey }) {
    super('test-plan', props)
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
})
