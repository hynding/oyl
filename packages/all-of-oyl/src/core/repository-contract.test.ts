import { InMemoryRepository } from './in-memory-repository.js'
import { LifeArea } from './life-area.js'
import { repositoryContract } from './repository-contract.js'

function deterministicClock(): () => Date {
  let tick = 0
  return () => new Date(Date.UTC(2026, 5, 1, 0, 0, tick++))
}

repositoryContract('InMemoryRepository', () => new InMemoryRepository<LifeArea>(deterministicClock()))
