import { describe, expect, it } from 'vitest'
import { Project } from './project.js'
import { Id } from '../core/id.js'
import { DomainError } from '../core/domain-error.js'

describe('Project', () => {
  it('constructs with a name and optional area', () => {
    const project = new Project({ name: 'Spring reset', areaId: Id.of('00000000-0000-4000-8000-000000000010') })
    expect(project.name).toBe('Spring reset')
    expect(Id.of(project.id)).toBe(project.id)
  })

  it('rejects an empty name', () => {
    let caught: unknown
    try {
      new Project({ name: '' })
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const shape = { id: '00000000-0000-4000-8000-000000001000', name: 'Spring reset', areaId: '00000000-0000-4000-8000-000000000010', futureField: 12 }
    expect(Project.fromJSON(shape).toJSON()).toEqual(shape)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [null, { name: 'x' }, { id: 'nope', name: 'x' }]) {
      let caught: unknown
      try {
        Project.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
