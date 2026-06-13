import { describe, expect, it } from 'vitest'
import { InMemoryRepository } from './in-memory-repository.js'
import { LifeArea } from './life-area.js'

// Behavioral parity lives in repository-contract.test.ts. This file keeps only the
// reference-implementation-specific trait: it aliases and stamps the caller's object.
describe('InMemoryRepository (reference-specific)', () => {
  it('stamps meta onto the caller-supplied object (aliasing reference behavior)', async () => {
    const repo = new InMemoryRepository<LifeArea>()
    const area = new LifeArea({ name: 'Health', slug: 'health' })
    const saved = await repo.save(area)
    expect(saved).toBe(area)
    expect(area.meta?.revision).toBe(1)
  })
})
