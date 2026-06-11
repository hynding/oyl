// packages/react-oyl/modules/data/sync/types.ts
import type { TDataId } from '@oyl/all-of-oyl/modules'

export type QueuedOp =
  | { id: string; op: 'create'; path: string; tempId: string; body: unknown; createdAt: number }
  | { id: string; op: 'update'; path: string; recordId: TDataId | string; body: unknown; createdAt: number }
  | { id: string; op: 'delete'; path: string; recordId: TDataId | string; createdAt: number }

export type SyncError = {
  op: 'create' | 'update' | 'delete'
  path: string
  message: string
  at: string
}

export type SyncState = {
  pendingCount: number
  lastSyncedAt?: string
  lastSyncedAtByPath: Record<string, string>
  lastError?: SyncError
  online: boolean
}

export type MirrorRecord<T = unknown> = T & {
  id: TDataId
  __pendingOp?: 'create' | 'update' | 'delete'
}

export type SyncListener = () => void

// The paths the SyncEngine mirrors.
export const SYNCED_PATHS = [
  'user-dailies',
  'user-activities',
  'user-activity-logs',
  'user-goals',
  'user-goal-milestones',
  'user-nutritions',
] as const

export type SyncedPath = typeof SYNCED_PATHS[number]

// Per-path populate field lists used by the remote client's list call. Anything
// not listed here falls back to `populate=*`. Keep these minimal — the
// orchestrator reads each row through the typed contexts, so populate only what
// the UI actually consumes. Encoded as `populate[0]=…&populate[1]=…` because
// Strapi 5 rejects comma-joined `populate=a,b,c` as a single invalid key.
export const POPULATE_BY_PATH: Record<string, readonly string[]> = {
  'user-dailies': ['activities', 'goals', 'nutrition'],
  'user-activities': ['activity', 'user_goal'],
  'user-activity-logs': ['user_activity', 'tags'],
  'user-goals': ['goal', 'parent_user_goal'],
  'user-goal-milestones': ['user_goal'],
  'user-nutritions': ['nutrition_item'],
}
