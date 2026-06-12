import { describe, expect, it } from 'vitest'
import { Task } from './task'
import { Cadence } from '../core/cadence'
import { DayKey } from '../core/day-key'
import { Id } from '../core/id'
import { DomainError } from '../core/domain-error'

const day = (s: string) => DayKey.of(s)

describe('Task', () => {
  it('constructs with optional project, cadence, and possession links', () => {
    const task = new Task({
      title: 'Water the plants',
      due: day('2026-06-05'),
      cadence: Cadence.of(7, 'days'),
      projectId: Id.of('00000000-0000-4000-8000-000000001000'),
      possessionId: Id.of('00000000-0000-4000-8000-000000002000'),
    })
    expect(task.kind).toBe('task')
    expect(task.status).toBe('open')
    expect(task.cadence?.equals(Cadence.of(7, 'days'))).toBe(true)
  })

  it('spawnNext re-anchors on actual completion — duty cadences follow you, not the calendar', () => {
    const task = new Task({ title: 'Water the plants', due: day('2026-06-05'), cadence: Cadence.of(7, 'days') })
    task.complete(day('2026-06-08')) // three days late
    const next = task.spawnNext()
    expect(next.id).not.toBe(task.id)
    expect(next.title).toBe('Water the plants')
    expect(next.due?.value).toBe('2026-06-15') // 7 days after actual completion, not after due
    expect(next.status).toBe('open')
    expect(next.cadence?.equals(Cadence.of(7, 'days'))).toBe(true)
  })

  it('spawnNext carries project and possession links forward', () => {
    const projectId = Id.of('00000000-0000-4000-8000-000000001000')
    const task = new Task({ title: 'Filter', due: day('2026-06-05'), cadence: Cadence.of(1, 'months'), projectId })
    task.complete(day('2026-06-05'))
    expect(task.spawnNext().projectId).toBe(projectId)
  })

  it('spawnNext refuses non-recurring or non-completed tasks', () => {
    const oneOff = new Task({ title: 'File taxes', due: day('2026-06-05') })
    oneOff.complete(day('2026-06-05'))
    const open = new Task({ title: 'Recurring', due: day('2026-06-05'), cadence: Cadence.of(7, 'days') })
    for (const t of [oneOff, open]) {
      let caught: unknown
      try {
        t.spawnNext()
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('ILLEGAL_TRANSITION')
    }
  })

  it('round-trips JSON with state, links, and unknown fields', () => {
    const task = new Task({
      id: Id.of('00000000-0000-4000-8000-000000001001'),
      title: 'Water the plants',
      due: day('2026-06-05'),
      cadence: Cadence.of(7, 'days'),
    })
    task.complete(day('2026-06-08'), Id.of('00000000-0000-4000-8000-000000000100'))
    const revived = Task.fromJSON({ ...task.toJSON(), futureField: 9 })
    expect(revived.status).toBe('done')
    expect(revived.completedOn?.value).toBe('2026-06-08')
    expect(revived.cadence?.equals(Cadence.of(7, 'days'))).toBe(true)
    expect(revived.fulfilledBy).toEqual(task.fulfilledBy)
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(9)
    expect(Task.fromJSON(revived.toJSON()).toJSON()).toEqual(revived.toJSON())
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [
      { kind: 'task', id: '00000000-0000-4000-8000-000000001001', title: 'x', status: 'open', projectId: 'nope' },
      { kind: 'appointment', id: '00000000-0000-4000-8000-000000001001', title: 'x', status: 'open' },
      { kind: 'task', id: '00000000-0000-4000-8000-000000001001', title: 'x', status: 'open', cadence: { n: 'two', unit: 'weeks' } },
    ]) {
      let caught: unknown
      try {
        Task.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
