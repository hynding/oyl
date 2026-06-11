import { DomainError } from './domain-error'

/**
 * Storage bookkeeping for persisted records. A plain shape, not a class:
 * repositories build and replace it wholesale; domain logic never branches
 * on it. Optional on every persistable entity (absent until first save).
 */
export type PersistedMeta = {
  createdAt: Date
  updatedAt: Date
  revision: number
  deletedAt?: Date
}

export type PersistedMetaShape = {
  createdAt: string
  updatedAt: string
  revision: number
  deletedAt?: string
}

export function metaToJSON(meta: PersistedMeta): PersistedMetaShape {
  return {
    createdAt: meta.createdAt.toISOString(),
    updatedAt: meta.updatedAt.toISOString(),
    revision: meta.revision,
    ...(meta.deletedAt ? { deletedAt: meta.deletedAt.toISOString() } : {}),
  }
}

export function metaFromJSON(shape: unknown): PersistedMeta {
  const s = shape as Partial<PersistedMetaShape>
  if (typeof s?.createdAt !== 'string' || typeof s?.updatedAt !== 'string' || typeof s?.revision !== 'number') {
    throw new DomainError('MALFORMED_JSON', 'not a PersistedMeta shape')
  }
  return {
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.updatedAt),
    revision: s.revision,
    ...(typeof s.deletedAt === 'string' ? { deletedAt: new Date(s.deletedAt) } : {}),
  }
}
