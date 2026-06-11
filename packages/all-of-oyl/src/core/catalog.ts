import { DomainError } from './domain-error'
import type { Id } from './id'

/**
 * A small keyed collection of definitions, held by the app — the synchronous,
 * hydrated in-memory view of a Repository (what Journal is to entries).
 */
export class Catalog<T extends { id: Id; slug?: string }> {
  private readonly items = new Map<Id, T>()

  add(item: T): void {
    if (this.items.has(item.id)) {
      throw new DomainError('DUPLICATE_ID', `item already in catalog: ${item.id}`)
    }
    this.items.set(item.id, item)
  }

  get(id: Id): T | undefined {
    return this.items.get(id)
  }

  all(): readonly T[] {
    return [...this.items.values()]
  }

  bySlug(slug: string): T | undefined {
    for (const item of this.items.values()) {
      if (item.slug === slug) return item
    }
    return undefined
  }
}
