export type StoredRev = { revision: number } | undefined
export type UpsertDecision = { action: 'create' } | { action: 'update'; revision: number } | { action: 'conflict' }

/** Mirror InMemoryRepository: no record → create (server stamps rev 1, asserted ignored); exists → require match else conflict; match → bump. */
export function decideUpsert(stored: StoredRev, asserted: number | null): UpsertDecision {
  if (!stored) return { action: 'create' }
  if (asserted !== stored.revision) return { action: 'conflict' }
  return { action: 'update', revision: stored.revision + 1 }
}

export interface RecordRow { recordId: string; data: unknown; revision: number; createdAt: string | Date; updatedAt: string | Date; deletedAt: string | Date | null }
export interface Envelope { id: string; data: unknown; revision: number; createdAt: string; updatedAt: string; deletedAt: string | null }

const iso = (d: string | Date): string => (d instanceof Date ? d.toISOString() : d)

/** Map a stored row to the protocol record envelope. */
export function toEnvelope(row: RecordRow): Envelope {
  return { id: row.recordId, data: row.data, revision: row.revision, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt), deletedAt: row.deletedAt ? iso(row.deletedAt) : null }
}
