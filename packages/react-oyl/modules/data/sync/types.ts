// packages/react-oyl/modules/data/sync/types.ts
import type { TDataId } from '@oyl/all-of-oyl/modules'

export type QueuedOp =
  | { id: string; op: 'create'; path: string; tempId: string; body: unknown; createdAt: number }
  | { id: string; op: 'update'; path: string; recordId: TDataId; body: unknown; createdAt: number }
  | { id: string; op: 'delete'; path: string; recordId: TDataId; createdAt: number }

export type SyncState = {
  pendingCount: number
  lastSyncedAt?: string
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
] as const

export type SyncedPath = typeof SYNCED_PATHS[number]
