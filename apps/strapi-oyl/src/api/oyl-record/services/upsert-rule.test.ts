import { describe, expect, it } from 'vitest'
import { decideUpsert, toEnvelope } from './upsert-rule'

describe('decideUpsert', () => {
  it('creates when nothing is stored (ignoring any asserted revision)', () => {
    expect(decideUpsert(undefined, null)).toEqual({ action: 'create' })
    expect(decideUpsert(undefined, 99)).toEqual({ action: 'create' })
  })
  it('updates and bumps when the asserted revision matches', () => {
    expect(decideUpsert({ revision: 3 }, 3)).toEqual({ action: 'update', revision: 4 })
  })
  it('conflicts on a mismatched or meta-less assertion against an existing record', () => {
    expect(decideUpsert({ revision: 3 }, 2)).toEqual({ action: 'conflict' })
    expect(decideUpsert({ revision: 3 }, null)).toEqual({ action: 'conflict' })
  })
})

describe('toEnvelope', () => {
  it('maps a row to the protocol envelope, normalizing dates and null deletedAt', () => {
    const env = toEnvelope({ recordId: 'r1', data: { a: 1 }, revision: 2, createdAt: new Date('2026-06-01T00:00:00Z'), updatedAt: new Date('2026-06-02T00:00:00Z'), deletedAt: null })
    expect(env).toEqual({ id: 'r1', data: { a: 1 }, revision: 2, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-02T00:00:00.000Z', deletedAt: null })
  })
  it('serializes a present deletedAt', () => {
    const env = toEnvelope({ recordId: 'r1', data: {}, revision: 5, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-02T00:00:00.000Z', deletedAt: new Date('2026-06-03T00:00:00Z') })
    expect(env.deletedAt).toBe('2026-06-03T00:00:00.000Z')
  })
})
