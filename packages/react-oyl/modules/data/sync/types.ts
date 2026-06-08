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
