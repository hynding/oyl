/**
 * Parity test: asserts that Strapi content-type schema.json files match
 * the @oyl/all-of-oyl manifest's intent for each reference entity.
 *
 * Does NOT boot Strapi — just reads JSON files and checks structure.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { kindOf } from '@oyl/all-of-oyl'

const SRC_DIR = path.resolve(__dirname, '..', 'src')

function loadSchema(singularName: string): Record<string, unknown> {
  const p = path.join(SRC_DIR, 'api', singularName, 'content-types', singularName, 'schema.json')
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>
}

function attributes(schema: Record<string, unknown>): Record<string, unknown> {
  return schema['attributes'] as Record<string, unknown>
}

describe('parity: note schema ↔ manifest (personal kind)', () => {
  it('kindOf("entries") is personal', () => {
    expect(kindOf('entries')).toBe('personal')
  })

  const schema = loadSchema('note')
  const attrs = attributes(schema)

  it('note schema has recordId (required + unique string)', () => {
    const f = attrs['recordId'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('string')
    expect(f['required']).toBe(true)
    expect(f['unique']).toBe(true)
  })

  it('note schema has text attribute', () => {
    expect(attrs['text']).toBeDefined()
  })

  it('note schema has tags attribute', () => {
    expect(attrs['tags']).toBeDefined()
  })

  it('note schema has occurredAt attribute', () => {
    expect(attrs['occurredAt']).toBeDefined()
  })

  it('note schema has note attribute', () => {
    expect(attrs['note']).toBeDefined()
  })

  it('note schema has owner manyToOne relation to users-permissions user (personal shape)', () => {
    const owner = attrs['owner'] as Record<string, unknown>
    expect(owner).toBeDefined()
    expect(owner['type']).toBe('relation')
    expect(owner['relation']).toBe('manyToOne')
    expect(owner['target']).toBe('plugin::users-permissions.user')
  })

  it('note schema does NOT have catalog fields (creator, visibility)', () => {
    expect(attrs['creator']).toBeUndefined()
    expect(attrs['visibility']).toBeUndefined()
  })
})

describe('parity: activity schema ↔ manifest (catalog kind)', () => {
  it('kindOf("activities") is catalog', () => {
    expect(kindOf('activities')).toBe('catalog')
  })

  const schema = loadSchema('activity')
  const attrs = attributes(schema)

  it('activity schema has recordId (required + unique string)', () => {
    const f = attrs['recordId'] as Record<string, unknown>
    expect(f).toBeDefined()
    expect(f['type']).toBe('string')
    expect(f['required']).toBe(true)
    expect(f['unique']).toBe(true)
  })

  it('activity schema has name attribute', () => {
    expect(attrs['name']).toBeDefined()
  })

  it('activity schema has slug attribute', () => {
    expect(attrs['slug']).toBeDefined()
  })

  it('activity schema has defaultUnit attribute', () => {
    expect(attrs['defaultUnit']).toBeDefined()
  })

  it('activity schema has areaId attribute', () => {
    expect(attrs['areaId']).toBeDefined()
  })

  it('activity schema has creator relation (catalog shape)', () => {
    const creator = attrs['creator'] as Record<string, unknown>
    expect(creator).toBeDefined()
    expect(creator['type']).toBe('relation')
    expect(creator['relation']).toBe('manyToOne')
  })

  it('activity schema has visibility enum (catalog shape)', () => {
    const vis = attrs['visibility'] as Record<string, unknown>
    expect(vis).toBeDefined()
    expect(vis['type']).toBe('enumeration')
    expect(Array.isArray(vis['enum'])).toBe(true)
    expect((vis['enum'] as string[]).length).toBeGreaterThan(0)
  })

  it('activity schema does NOT have personal-only field (owner)', () => {
    // catalog shape uses creator+visibility, not owner
    expect(attrs['owner']).toBeUndefined()
  })
})
