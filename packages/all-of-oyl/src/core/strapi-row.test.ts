import { describe, it, expect } from 'vitest'
import { strapiRowToShape } from './strapi-row.js'

describe('strapiRowToShape', () => {
  it('maps a Strapi note row to a domain note shape (recordId->id, inject kind)', () => {
    const row = {
      id: 7,
      documentId: 'x',
      recordId: 'note-abc',
      text: 'hi',
      tags: [],
      occurredAt: '2026-06-18T00:00:00.000Z',
      createdAt: '2026-06-18T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z',
      publishedAt: '2026-06-18T00:00:00.000Z',
      owner: { id: 1 },
    }
    const shape = strapiRowToShape(row, { kind: 'note' }) as Record<string, unknown>
    expect(shape.id).toBe('note-abc')
    expect(shape.kind).toBe('note')
    expect(shape.text).toBe('hi')
    expect(shape.occurredAt).toBe('2026-06-18T00:00:00.000Z')
    expect(shape.tags).toEqual([])
    // no Strapi internals leak through
    expect(shape.documentId).toBeUndefined()
    expect(shape.recordId).toBeUndefined()
    expect(shape.createdAt).toBeUndefined()
    expect(shape.updatedAt).toBeUndefined()
    expect(shape.publishedAt).toBeUndefined()
    expect(shape.owner).toBeUndefined()
    expect('id' in shape && typeof shape.id === 'number').toBe(false)
  })

  it('maps a Strapi activity row to a domain shape with no kind injected', () => {
    const row = {
      id: 3,
      documentId: 'y',
      recordId: 'act-xyz',
      name: 'Run',
      slug: 'run',
      createdAt: '2026-06-18T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z',
      owner: { id: 1 },
      creator: { id: 1 },
    }
    const shape = strapiRowToShape(row) as Record<string, unknown>
    expect(shape.id).toBe('act-xyz')
    expect(shape.kind).toBeUndefined()
    expect(shape.name).toBe('Run')
    expect(shape.slug).toBe('run')
    expect(shape.owner).toBeUndefined()
    expect(shape.creator).toBeUndefined()
  })

  it('passes through non-object input unchanged', () => {
    expect(strapiRowToShape(undefined)).toBeUndefined()
    expect(strapiRowToShape(null)).toBeNull()
  })
})
