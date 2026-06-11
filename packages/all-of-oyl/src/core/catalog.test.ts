import { describe, expect, it } from 'vitest'
import { Catalog } from './catalog'
import { Id } from './id'
import { LifeArea } from './life-area'
import { DomainError } from './domain-error'

describe('Catalog', () => {
  it('adds and gets by id', () => {
    const catalog = new Catalog<LifeArea>()
    const health = new LifeArea({ name: 'Health', slug: 'health' })
    catalog.add(health)
    expect(catalog.get(health.id)).toBe(health)
    expect(catalog.get(Id.create())).toBeUndefined()
  })

  it('strict adds: DUPLICATE_ID', () => {
    const catalog = new Catalog<LifeArea>()
    const health = new LifeArea({ name: 'Health', slug: 'health' })
    catalog.add(health)
    let caught: unknown
    try {
      catalog.add(health)
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('DUPLICATE_ID')
  })

  it('lists all in insertion order', () => {
    const catalog = new Catalog<LifeArea>()
    const a = new LifeArea({ name: 'A', slug: 'a' })
    const b = new LifeArea({ name: 'B', slug: 'b' })
    catalog.add(a)
    catalog.add(b)
    expect(catalog.all()).toEqual([a, b])
  })

  it('finds by slug for slugged items', () => {
    const catalog = new Catalog<LifeArea>()
    const health = new LifeArea({ name: 'Health', slug: 'health' })
    catalog.add(health)
    expect(catalog.bySlug('health')).toBe(health)
    expect(catalog.bySlug('nope')).toBeUndefined()
  })
})
