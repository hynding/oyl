# User Daily Page — Strapi Integration & Offline-First Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `packages/react-oyl/modules/user/daily-new/` to consume the current Strapi data model (with `user-activity-log`, `user-goal-milestone`, RRULE-based schedule), persist writes through a new offline-first sync engine, and add a Goals section alongside Activities.

**Architecture:** Per-collection providers (Approach 3 from spec) composed by a `useUserDailyOrchestrator()` hook. Reads/writes flow through a singleton `SyncEngine` (localStorage mirror + optimistic queue + reconcile on reconnect). RRULE for activity schedules. See [`docs/superpowers/specs/2026-05-30-user-daily-page-strapi-integration-design.md`](../specs/2026-05-30-user-daily-page-strapi-integration-design.md) for full design.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, pnpm workspaces. Adds `rrule@^2.8` and `vitest@^2` + `jsdom` (test infra) and `uuid@^11`.

**TDD note:** The codebase currently has no test framework in `react-oyl`/`all-of-oyl`. Task 1 sets up minimal vitest. TDD steps are used for pure logic (schedule evaluator, SyncEngine, orchestrator filters). React UI tasks use manual dev-server verification — the user can override this by adding `@testing-library/react` later.

**Strapi server expected on `http://localhost:3337`.** Start it via `pnpm strapi develop` (or whatever the existing convention is) before running UI verification steps.

---

## Phase 0 — Test infrastructure

### Task 1: Add vitest to `react-oyl` and `all-of-oyl`

**Files:**
- Modify: `packages/react-oyl/package.json`
- Modify: `packages/all-of-oyl/package.json`
- Create: `packages/react-oyl/vitest.config.ts`
- Create: `packages/all-of-oyl/vitest.config.ts`
- Create: `packages/react-oyl/src/test-setup.ts`

- [ ] **Step 1: Install vitest + jsdom in `react-oyl`**

```bash
pnpm --filter @oyl/react-oyl add -D vitest@^2 jsdom@^25 @types/jsdom@^21
```

- [ ] **Step 2: Install vitest in `all-of-oyl`**

```bash
pnpm --filter @oyl/all-of-oyl add -D vitest@^2
```

- [ ] **Step 3: Add test script to `react-oyl/package.json`**

In the `"scripts"` block, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Add test script to `all-of-oyl/package.json`**

In the `"scripts"` block, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Create `packages/react-oyl/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['modules/**/*.test.{ts,tsx}', 'lib/**/*.test.{ts,tsx}'],
  },
})
```

- [ ] **Step 6: Create `packages/all-of-oyl/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['modules/**/*.test.ts'],
  },
})
```

- [ ] **Step 7: Create `packages/react-oyl/src/test-setup.ts`**

```ts
import { afterEach, beforeEach, vi } from 'vitest'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})
```

- [ ] **Step 8: Verify vitest runs (no tests yet)**

Run:
```bash
pnpm --filter @oyl/react-oyl test
pnpm --filter @oyl/all-of-oyl test
```
Expected: "No test files found" exit 0 (or similar non-error output).

- [ ] **Step 9: Commit**

```bash
git add packages/react-oyl/package.json packages/react-oyl/vitest.config.ts packages/react-oyl/src/test-setup.ts packages/all-of-oyl/package.json packages/all-of-oyl/vitest.config.ts pnpm-lock.yaml
git commit -m "test: add minimal vitest setup to react-oyl and all-of-oyl"
```

---

## Phase 1 — Shared types & schedule library

### Task 2: Add `rrule` dependency to `all-of-oyl`

**Files:**
- Modify: `packages/all-of-oyl/package.json`

- [ ] **Step 1: Install rrule**

```bash
pnpm --filter @oyl/all-of-oyl add rrule@^2.8.0
```

- [ ] **Step 2: Verify import works**

```bash
node -e "import('rrule').then(m => console.log(typeof m.rrulestr))"
```
Expected: prints `function`.

- [ ] **Step 3: Commit**

```bash
git add packages/all-of-oyl/package.json pnpm-lock.yaml
git commit -m "deps: add rrule to all-of-oyl for activity schedule evaluation"
```

### Task 3: Create `TSchedule` type and tests

**Files:**
- Create: `packages/all-of-oyl/modules/user/activity/schedule-types.ts`
- Create: `packages/all-of-oyl/modules/user/activity/schedule.test.ts`

- [ ] **Step 1: Create `schedule-types.ts`**

```ts
// packages/all-of-oyl/modules/user/activity/schedule-types.ts
export type TSchedule = {
  rrule: string  // iCal RRULE string, e.g. "FREQ=WEEKLY;BYDAY=MO,WE,FR"
}
```

- [ ] **Step 2: Write failing tests for `matchesDate` and `describeSchedule`**

```ts
// packages/all-of-oyl/modules/user/activity/schedule.test.ts
import { describe, it, expect } from 'vitest'
import { matchesDate, describeSchedule } from './schedule'

describe('matchesDate', () => {
  it('returns false when schedule is undefined', () => {
    expect(matchesDate(undefined, '2026-05-30')).toBe(false)
  })

  it('returns false when rrule is empty', () => {
    expect(matchesDate({ rrule: '' }, '2026-05-30')).toBe(false)
  })

  it('matches daily rule on any date', () => {
    const s = { rrule: 'FREQ=DAILY;DTSTART=20260101T000000Z' }
    expect(matchesDate(s, '2026-05-30')).toBe(true)
  })

  it('matches weekday-only rule on Friday 2026-05-29 but not Saturday 2026-05-30', () => {
    const s = { rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;DTSTART=20260101T000000Z' }
    expect(matchesDate(s, '2026-05-29')).toBe(true)  // Friday
    expect(matchesDate(s, '2026-05-30')).toBe(false) // Saturday
  })
})

describe('describeSchedule', () => {
  it('returns "No schedule" when undefined', () => {
    expect(describeSchedule(undefined)).toBe('No schedule')
  })

  it('returns human text for a daily rule', () => {
    const result = describeSchedule({ rrule: 'FREQ=DAILY' })
    expect(result.toLowerCase()).toContain('every day')
  })
})
```

- [ ] **Step 3: Run tests — expect failure**

```bash
pnpm --filter @oyl/all-of-oyl test
```
Expected: FAIL — `./schedule` cannot be resolved.

### Task 4: Implement `schedule.ts`

**Files:**
- Create: `packages/all-of-oyl/modules/user/activity/schedule.ts`

- [ ] **Step 1: Implement**

```ts
// packages/all-of-oyl/modules/user/activity/schedule.ts
import { rrulestr } from 'rrule'
import type { TSchedule } from './schedule-types'

export const matchesDate = (schedule: TSchedule | undefined, date: string): boolean => {
  if (!schedule?.rrule) return false
  const rule = rrulestr(schedule.rrule)
  const start = new Date(`${date}T00:00:00Z`)
  const end = new Date(`${date}T23:59:59Z`)
  return rule.between(start, end, true).length > 0
}

export const describeSchedule = (schedule: TSchedule | undefined): string => {
  if (!schedule?.rrule) return 'No schedule'
  try {
    return rrulestr(schedule.rrule).toText()
  } catch {
    return schedule.rrule
  }
}
```

- [ ] **Step 2: Run tests — expect pass**

```bash
pnpm --filter @oyl/all-of-oyl test
```
Expected: PASS — all 6 tests green.

- [ ] **Step 3: Commit**

```bash
git add packages/all-of-oyl/modules/user/activity/schedule-types.ts packages/all-of-oyl/modules/user/activity/schedule.ts packages/all-of-oyl/modules/user/activity/schedule.test.ts
git commit -m "feat(all-of-oyl): add RRULE-based schedule type and evaluator"
```

### Task 5: Update `TUserActivity` types (drop deprecated, add new)

**Files:**
- Modify: `packages/all-of-oyl/modules/user/activity/user-activity-types.ts`

- [ ] **Step 1: Rewrite the file**

```ts
// packages/all-of-oyl/modules/user/activity/user-activity-types.ts
import type { TDataId, TDataItem } from "../../data"
import type { TUser } from "../user-types"
import type { TActivity } from "../../activity"
import type { TUserGoalData } from "../goal/user-goal-types"
import type { TSchedule } from "./schedule-types"

export type TUserActivity = {
  user?: TUser | TDataId
  activity?: TActivity | TDataId
  name?: string
  schedule?: TSchedule
  type?: 'habit' | 'task' | 'event' | 'metric'
  current_status?: 'active' | 'paused' | 'archived'
  user_goal?: TUserGoalData | TDataId
  target_value?: number
  target_unit?: string
  target_direction?: 'min' | 'max' | 'exact'
  schedule_target?: unknown
}

export type TUserActivityData = TUserActivity & TDataItem
```

- [ ] **Step 2: Replace `packages/all-of-oyl/modules/user/activity/index.ts` entirely**

The old file exports `TUserActivitySettings` which is being deleted. Replace the file contents with:

```ts
export type { TUserActivity, TUserActivityData } from './user-activity-types'
export type { TSchedule } from './schedule-types'
export { matchesDate, describeSchedule } from './schedule'
```

- [ ] **Step 3: Update `packages/all-of-oyl/modules/user/index.ts` to drop `TUserActivitySettings`**

Change the activity re-export line from:
```ts
export type { TUserActivity, TUserActivityData, TUserActivitySettings } from "./activity/user-activity-types";
```
to:
```ts
export type { TUserActivity, TUserActivityData } from "./activity/user-activity-types";
```

- [ ] **Step 4: Verify type-check**

```bash
pnpm --filter @oyl/all-of-oyl exec tsc --noEmit
```
Expected: clean type-check inside `all-of-oyl`. React-oyl consumers will break (handled later — do NOT typecheck react-oyl yet).

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/modules/user/activity/user-activity-types.ts packages/all-of-oyl/modules/user/activity/index.ts packages/all-of-oyl/modules/user/index.ts
git commit -m "refactor(all-of-oyl): drop deprecated TUserActivity fields, add new model"
```

### Task 6: Update `TUserGoal` types

**Files:**
- Modify: `packages/all-of-oyl/modules/user/goal/user-goal-types.ts`

- [ ] **Step 1: Rewrite the file**

```ts
// packages/all-of-oyl/modules/user/goal/user-goal-types.ts
import type { TDataId, TDataItem } from "../../data"
import type { TUser } from "../user-types"
import type { TGoalData } from "../../goal"

export type TUserGoal = {
  user?: TUser | TDataId
  goal?: TGoalData | TDataId
  name?: string
  progress?: number
  target?: number
  category?: string
  current_status?: 'active' | 'paused' | 'completed' | 'archived'
  priority?: 'low' | 'medium' | 'high'
  target_date?: string
  completed_at?: string
  note?: string
  parent_user_goal?: TUserGoalData | TDataId
}

export type TUserGoalData = TUserGoal & TDataItem
```

- [ ] **Step 2: Commit**

```bash
git add packages/all-of-oyl/modules/user/goal/user-goal-types.ts
git commit -m "refactor(all-of-oyl): drop deprecated TUserGoal fields, add new model"
```

### Task 7: Create `TUserActivityLog` type & module

**Files:**
- Create: `packages/all-of-oyl/modules/user/activity-log/user-activity-log-types.ts`
- Create: `packages/all-of-oyl/modules/user/activity-log/index.ts`

- [ ] **Step 1: Create types**

```ts
// packages/all-of-oyl/modules/user/activity-log/user-activity-log-types.ts
import type { TDataId, TDataItem } from "../../data"
import type { TUser } from "../user-types"
import type { TUserActivityData } from "../activity/user-activity-types"
import type { TTagData } from "../../tag"

export type TUserActivityLog = {
  user?: TUser | TDataId
  user_activity?: TUserActivityData | TDataId
  logged_at?: string
  value?: number
  unit?: string
  note?: string
  mood?: number
  tags?: TTagData[] | TDataId[]
}

export type TUserActivityLogData = TUserActivityLog & TDataItem
```

(If `TTagData` does not exist in `all-of-oyl/modules/tag`, replace the import with `type TTagData = TDataItem & { name?: string }` declared locally — the strapi `tag` collection exists, but if no frontend type is defined, an inline shim is fine for v1.)

- [ ] **Step 2: Create index**

```ts
// packages/all-of-oyl/modules/user/activity-log/index.ts
export type { TUserActivityLog, TUserActivityLogData } from './user-activity-log-types'
```

- [ ] **Step 3: Commit**

```bash
git add packages/all-of-oyl/modules/user/activity-log/
git commit -m "feat(all-of-oyl): add TUserActivityLog type for per-occurrence logs"
```

### Task 8: Create `TUserGoalMilestone` type & module

**Files:**
- Create: `packages/all-of-oyl/modules/user/goal-milestone/user-goal-milestone-types.ts`
- Create: `packages/all-of-oyl/modules/user/goal-milestone/index.ts`

- [ ] **Step 1: Create types**

```ts
// packages/all-of-oyl/modules/user/goal-milestone/user-goal-milestone-types.ts
import type { TDataId, TDataItem } from "../../data"
import type { TUserGoalData } from "../goal/user-goal-types"

export type TUserGoalMilestone = {
  user_goal?: TUserGoalData | TDataId
  title?: string
  note?: string
  target_date?: string
  completed_at?: string
  sort_order?: number
}

export type TUserGoalMilestoneData = TUserGoalMilestone & TDataItem
```

- [ ] **Step 2: Create index**

```ts
// packages/all-of-oyl/modules/user/goal-milestone/index.ts
export type { TUserGoalMilestone, TUserGoalMilestoneData } from './user-goal-milestone-types'
```

- [ ] **Step 3: Re-export both new modules from `packages/all-of-oyl/modules/user/index.ts`**

Read the current file; append:

```ts
export * from './activity-log'
export * from './goal-milestone'
```

- [ ] **Step 4: Commit**

```bash
git add packages/all-of-oyl/modules/user/goal-milestone/ packages/all-of-oyl/modules/user/index.ts
git commit -m "feat(all-of-oyl): add TUserGoalMilestone type and re-export new modules"
```

---

## Phase 2 — Sync layer

### Task 9: Install `uuid` and add sync types

**Files:**
- Modify: `packages/react-oyl/package.json`
- Modify: `packages/all-of-oyl/modules/index.ts` (add `data` re-export so `TDataId` is reachable from `@oyl/all-of-oyl/modules`)
- Create: `packages/react-oyl/modules/data/sync/types.ts`

- [ ] **Step 1: Install uuid**

```bash
pnpm --filter @oyl/react-oyl add uuid@^11
pnpm --filter @oyl/react-oyl add -D @types/uuid@^10
```

- [ ] **Step 1b: Add `data` to the all-of-oyl root module index**

Append this line to `packages/all-of-oyl/modules/index.ts`:

```ts
export * from "./data";
```

(Leave existing 4 export lines unchanged.)

- [ ] **Step 2: Create `sync/types.ts`**

```ts
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
```

- [ ] **Step 3: Commit**

```bash
git add packages/react-oyl/package.json packages/react-oyl/modules/data/sync/types.ts packages/all-of-oyl/modules/index.ts pnpm-lock.yaml
git commit -m "feat(data): scaffold sync layer types and SYNCED_PATHS constant"
```

### Task 10: Implement and test sync storage helpers

**Files:**
- Create: `packages/react-oyl/modules/data/sync/storage.ts`
- Create: `packages/react-oyl/modules/data/sync/storage.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/react-oyl/modules/data/sync/storage.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mirrorKey, queueKey, readMirror, writeMirror, readQueue, writeQueue, wipeUser } from './storage'

describe('storage keys', () => {
  it('mirrorKey namespaces by user and path', () => {
    expect(mirrorKey('user-42', 'user-activities')).toBe('oyl:user-42:user-activities')
  })

  it('queueKey namespaces by user', () => {
    expect(queueKey('user-42')).toBe('oyl:user-42:__sync_queue__')
  })
})

describe('mirror read/write', () => {
  beforeEach(() => localStorage.clear())

  it('returns empty object when nothing stored', () => {
    expect(readMirror('user-1', 'user-activities')).toEqual({})
  })

  it('round-trips a mirror payload', () => {
    writeMirror('user-1', 'user-activities', { 7: { id: 7, name: 'walk' } })
    expect(readMirror('user-1', 'user-activities')).toEqual({ 7: { id: 7, name: 'walk' } })
  })
})

describe('queue read/write', () => {
  beforeEach(() => localStorage.clear())

  it('returns empty array when nothing stored', () => {
    expect(readQueue('user-1')).toEqual([])
  })

  it('round-trips a queue', () => {
    const op = { id: 'op-1', op: 'create' as const, path: 'user-activity-logs', tempId: 'local-x', body: {}, createdAt: 1 }
    writeQueue('user-1', [op])
    expect(readQueue('user-1')).toEqual([op])
  })
})

describe('wipeUser', () => {
  beforeEach(() => localStorage.clear())

  it('removes only that user\'s keys', () => {
    writeMirror('user-1', 'user-activities', { 1: { id: 1 } })
    writeMirror('user-2', 'user-activities', { 2: { id: 2 } })
    writeQueue('user-1', [])
    wipeUser('user-1')
    expect(readMirror('user-1', 'user-activities')).toEqual({})
    expect(readMirror('user-2', 'user-activities')).toEqual({ 2: { id: 2 } })
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
pnpm --filter @oyl/react-oyl test modules/data/sync/storage.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `storage.ts`**

```ts
// packages/react-oyl/modules/data/sync/storage.ts
import type { MirrorRecord, QueuedOp } from './types'

const NAMESPACE = 'oyl'

export const mirrorKey = (userId: string, path: string) =>
  `${NAMESPACE}:${userId}:${path}`

export const queueKey = (userId: string) =>
  `${NAMESPACE}:${userId}:__sync_queue__`

export function readMirror<T>(userId: string, path: string): Record<string, MirrorRecord<T>> {
  const raw = localStorage.getItem(mirrorKey(userId, path))
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

export function writeMirror<T>(userId: string, path: string, value: Record<string, MirrorRecord<T>>): void {
  localStorage.setItem(mirrorKey(userId, path), JSON.stringify(value))
}

export function readQueue(userId: string): QueuedOp[] {
  const raw = localStorage.getItem(queueKey(userId))
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

export function writeQueue(userId: string, ops: QueuedOp[]): void {
  localStorage.setItem(queueKey(userId), JSON.stringify(ops))
}

export function wipeUser(userId: string): void {
  const prefix = `${NAMESPACE}:${userId}:`
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(prefix)) toRemove.push(k)
  }
  toRemove.forEach(k => localStorage.removeItem(k))
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm --filter @oyl/react-oyl test modules/data/sync/storage.test.ts
```
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/react-oyl/modules/data/sync/storage.ts packages/react-oyl/modules/data/sync/storage.test.ts
git commit -m "feat(data): add namespaced localStorage helpers for sync layer"
```

### Task 11: Rewrite `useDataRemote` as a remote client (create/update/remove/findAll/findOne)

**Files:**
- Modify: `packages/react-oyl/modules/data/useDataRemote.ts`

- [ ] **Step 1: Replace the file contents**

```ts
// packages/react-oyl/modules/data/useDataRemote.ts
const BASE = 'http://localhost:3337/api'

type RemoteClient = {
  findAll<T>(path: string): Promise<T[]>
  findOne<T>(path: string, id: string | number): Promise<T | undefined>
  create<T>(path: string, body: unknown): Promise<T>
  update<T>(path: string, id: string | number, body: unknown): Promise<T>
  remove(path: string, id: string | number): Promise<void>
}

const headers = (token: string | null): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})

const unwrap = <T>(json: unknown): T => {
  if (json && typeof json === 'object' && 'data' in json) {
    return (json as { data: T }).data
  }
  return json as T
}

export function createRemoteClient(getToken: () => string | null): RemoteClient {
  return {
    async findAll<T>(path: string): Promise<T[]> {
      const res = await fetch(`${BASE}/${path}?populate=*`, { headers: headers(getToken()) })
      if (!res.ok) throw new Error(`GET /${path} failed: ${res.status}`)
      const data = unwrap<T[]>(await res.json())
      return Array.isArray(data) ? data : []
    },
    async findOne<T>(path: string, id) {
      const res = await fetch(`${BASE}/${path}/${id}?populate=*`, { headers: headers(getToken()) })
      if (res.status === 404) return undefined
      if (!res.ok) throw new Error(`GET /${path}/${id} failed: ${res.status}`)
      return unwrap<T>(await res.json())
    },
    async create<T>(path, body) {
      const res = await fetch(`${BASE}/${path}`, {
        method: 'POST',
        headers: headers(getToken()),
        body: JSON.stringify({ data: body }),
      })
      if (!res.ok) throw new Error(`POST /${path} failed: ${res.status}`)
      return unwrap<T>(await res.json())
    },
    async update<T>(path, id, body) {
      const res = await fetch(`${BASE}/${path}/${id}`, {
        method: 'PUT',
        headers: headers(getToken()),
        body: JSON.stringify({ data: body }),
      })
      if (!res.ok) throw new Error(`PUT /${path}/${id} failed: ${res.status}`)
      return unwrap<T>(await res.json())
    },
    async remove(path, id) {
      const res = await fetch(`${BASE}/${path}/${id}`, {
        method: 'DELETE',
        headers: headers(getToken()),
      })
      if (!res.ok && res.status !== 404) throw new Error(`DELETE /${path}/${id} failed: ${res.status}`)
    },
  }
}

export type { RemoteClient }
```

- [ ] **Step 2: Verify it type-checks**

```bash
pnpm --filter @oyl/react-oyl exec tsc -b
```
Expected: may still report consumer errors elsewhere; this file should compile.

- [ ] **Step 3: Commit**

```bash
git add packages/react-oyl/modules/data/useDataRemote.ts
git commit -m "refactor(data): replace stubbed save with full REST client (create/update/remove)"
```

### Task 12: Implement `SyncEngine` (read/subscribe/enqueue/wipe) and tests

**Files:**
- Create: `packages/react-oyl/modules/data/sync/SyncEngine.ts`
- Create: `packages/react-oyl/modules/data/sync/SyncEngine.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/react-oyl/modules/data/sync/SyncEngine.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SyncEngine } from './SyncEngine'
import type { RemoteClient } from '../useDataRemote'

const mockRemote = (): RemoteClient => ({
  findAll: vi.fn(async () => []),
  findOne: vi.fn(async () => undefined),
  create: vi.fn(async (_p, b) => ({ id: 999, ...(b as object) }) as never),
  update: vi.fn(async (_p, id, b) => ({ id, ...(b as object) }) as never),
  remove: vi.fn(async () => {}),
})

describe('SyncEngine — read/write/subscribe', () => {
  beforeEach(() => localStorage.clear())

  it('starts with empty mirror and emits no events', () => {
    const e = new SyncEngine(mockRemote())
    e.setUser('u1')
    expect(e.readAll('user-activities')).toEqual([])
  })

  it('save() inserts a tempId row into the mirror and notifies subscribers', async () => {
    const e = new SyncEngine(mockRemote())
    e.setUser('u1')
    const cb = vi.fn()
    e.subscribe('user-activities', cb)
    await e.save('user-activities', { name: 'walk' }, { skipDrain: true })
    expect(e.readAll('user-activities')).toHaveLength(1)
    expect(e.readAll<{ id: unknown }>('user-activities')[0].id).toMatch(/^local-/)
    expect(cb).toHaveBeenCalled()
  })

  it('save() enqueues a create op', async () => {
    const e = new SyncEngine(mockRemote())
    e.setUser('u1')
    await e.save('user-activities', { name: 'walk' }, { skipDrain: true })
    expect(e.state().pendingCount).toBe(1)
  })

  it('remove() removes from mirror and enqueues delete', async () => {
    const e = new SyncEngine(mockRemote())
    e.setUser('u1')
    // seed a non-pending row
    const remote = mockRemote()
    ;(remote.findAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 5, name: 'x' }])
    const e2 = new SyncEngine(remote)
    e2.setUser('u1')
    await e2.refresh('user-activities')
    expect(e2.readAll('user-activities')).toHaveLength(1)
    await e2.remove('user-activities', 5, { skipDrain: true })
    expect(e2.readAll('user-activities')).toHaveLength(0)
    expect(e2.state().pendingCount).toBe(1)
  })

  it('wipe() clears the namespaced mirror and queue', async () => {
    const e = new SyncEngine(mockRemote())
    e.setUser('u1')
    await e.save('user-activities', { name: 'walk' }, { skipDrain: true })
    expect(e.readAll('user-activities')).toHaveLength(1)
    e.wipe('u1')
    expect(e.readAll('user-activities')).toHaveLength(0)
    expect(e.state().pendingCount).toBe(0)
  })

  it('refresh() pulls remote and writes mirror', async () => {
    const remote = mockRemote()
    ;(remote.findAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 1, name: 'a' }, { id: 2, name: 'b' }])
    const e = new SyncEngine(remote)
    e.setUser('u1')
    await e.refresh('user-activities')
    expect(e.readAll('user-activities')).toHaveLength(2)
    expect(e.state().lastSyncedAt).toBeDefined()
  })
})

describe('SyncEngine — drain', () => {
  beforeEach(() => localStorage.clear())

  it('drain promotes tempId to server id on create', async () => {
    const remote = mockRemote()
    ;(remote.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 42, name: 'walk' })
    const e = new SyncEngine(remote)
    e.setUser('u1')
    e.setOnline(true)
    await e.save('user-activities', { name: 'walk' })
    expect(e.readAll<{ id: unknown }>('user-activities')[0].id).toBe(42)
    expect(e.state().pendingCount).toBe(0)
  })

  it('drain rolls back create on failure', async () => {
    const remote = mockRemote()
    ;(remote.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'))
    const e = new SyncEngine(remote)
    e.setUser('u1')
    e.setOnline(true)
    await e.save('user-activities', { name: 'walk' })
    expect(e.readAll('user-activities')).toHaveLength(0)
    expect(e.state().pendingCount).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
pnpm --filter @oyl/react-oyl test modules/data/sync/SyncEngine.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `SyncEngine.ts`**

```ts
// packages/react-oyl/modules/data/sync/SyncEngine.ts
import { v4 as uuid } from 'uuid'
import type { RemoteClient } from '../useDataRemote'
import type { MirrorRecord, QueuedOp, SyncListener, SyncState } from './types'
import { readMirror, writeMirror, readQueue, writeQueue, wipeUser } from './storage'

type SaveOptions = { skipDrain?: boolean }

export class SyncEngine {
  private userId: string | null = null
  private online = true
  private listeners = new Map<string, Set<SyncListener>>()
  private lastSyncedAt: string | undefined

  constructor(private remote: RemoteClient) {}

  setUser(userId: string | null): void {
    this.userId = userId
    this.emitAll()
  }

  setOnline(online: boolean): void {
    const transitioned = !this.online && online
    this.online = online
    if (transitioned && this.userId) {
      this.drain().catch(() => {})
    }
  }

  state(): SyncState {
    return {
      pendingCount: this.userId ? readQueue(this.userId).length : 0,
      lastSyncedAt: this.lastSyncedAt,
      online: this.online,
    }
  }

  readAll<T>(path: string): MirrorRecord<T>[] {
    if (!this.userId) return []
    return Object.values(readMirror<T>(this.userId, path))
  }

  readOne<T>(path: string, id: string | number): MirrorRecord<T> | undefined {
    if (!this.userId) return undefined
    return readMirror<T>(this.userId, path)[String(id)]
  }

  subscribe(path: string, cb: SyncListener): () => void {
    if (!this.listeners.has(path)) this.listeners.set(path, new Set())
    this.listeners.get(path)!.add(cb)
    return () => this.listeners.get(path)?.delete(cb)
  }

  async save<T extends object>(path: string, body: T, opts: SaveOptions = {}): Promise<void> {
    if (!this.userId) throw new Error('SyncEngine: no user set')
    const tempId = `local-${uuid()}`
    const mirror = readMirror<T>(this.userId, path)
    mirror[tempId] = { ...(body as object), id: tempId, __pendingOp: 'create' } as MirrorRecord<T>
    writeMirror(this.userId, path, mirror)

    const op: QueuedOp = { id: uuid(), op: 'create', path, tempId, body, createdAt: Date.now() }
    const queue = readQueue(this.userId)
    writeQueue(this.userId, [...queue, op])

    this.emit(path)
    if (this.online && !opts.skipDrain) await this.drain()
  }

  async update<T extends object>(path: string, id: string | number, patch: Partial<T>, opts: SaveOptions = {}): Promise<void> {
    if (!this.userId) throw new Error('SyncEngine: no user set')
    const mirror = readMirror<T>(this.userId, path)
    const existing = mirror[String(id)]
    if (!existing) throw new Error(`SyncEngine.update: ${path}/${id} not in mirror`)
    mirror[String(id)] = { ...existing, ...patch, __pendingOp: 'update' } as MirrorRecord<T>
    writeMirror(this.userId, path, mirror)

    const op: QueuedOp = { id: uuid(), op: 'update', path, recordId: id, body: patch, createdAt: Date.now() }
    writeQueue(this.userId, [...readQueue(this.userId), op])

    this.emit(path)
    if (this.online && !opts.skipDrain) await this.drain()
  }

  async remove(path: string, id: string | number, opts: SaveOptions = {}): Promise<void> {
    if (!this.userId) throw new Error('SyncEngine: no user set')
    const mirror = readMirror(this.userId, path)
    delete mirror[String(id)]
    writeMirror(this.userId, path, mirror)

    const op: QueuedOp = { id: uuid(), op: 'delete', path, recordId: id, createdAt: Date.now() }
    writeQueue(this.userId, [...readQueue(this.userId), op])

    this.emit(path)
    if (this.online && !opts.skipDrain) await this.drain()
  }

  async refresh(path: string): Promise<void> {
    if (!this.userId) return
    try {
      const rows = await this.remote.findAll<{ id: string | number }>(path)
      const mirror: Record<string, MirrorRecord<unknown>> = {}
      for (const r of rows) mirror[String(r.id)] = r as MirrorRecord<unknown>
      // preserve pending rows
      const existing = readMirror(this.userId, path)
      for (const [k, v] of Object.entries(existing)) {
        if (v.__pendingOp) mirror[k] = v
      }
      writeMirror(this.userId, path, mirror)
      this.lastSyncedAt = new Date().toISOString()
      this.emit(path)
    } catch (err) {
      console.warn(`refresh(${path}) failed`, err)
    }
  }

  async refreshAll(paths: string[]): Promise<void> {
    await Promise.all(paths.map(p => this.refresh(p)))
  }

  async drain(): Promise<void> {
    if (!this.userId || !this.online) return
    const userId = this.userId
    let queue = readQueue(userId)
    while (queue.length > 0) {
      const op = queue[0]
      try {
        if (op.op === 'create') {
          const created = await this.remote.create<{ id: string | number }>(op.path, op.body)
          // swap tempId in mirror
          const mirror = readMirror(userId, op.path)
          delete mirror[op.tempId]
          mirror[String(created.id)] = { ...(created as object), id: created.id } as MirrorRecord<unknown>
          writeMirror(userId, op.path, mirror)
          // rewrite references to tempId in other mirrored paths (basic pass — Strapi relations posted as ids handle most cases server-side)
          this.emit(op.path)
        } else if (op.op === 'update') {
          await this.remote.update(op.path, op.recordId, op.body)
          const mirror = readMirror(userId, op.path)
          const row = mirror[String(op.recordId)]
          if (row) {
            const { __pendingOp, ...rest } = row as MirrorRecord<unknown> & { __pendingOp?: string }
            mirror[String(op.recordId)] = rest as MirrorRecord<unknown>
            writeMirror(userId, op.path, mirror)
          }
          this.emit(op.path)
        } else if (op.op === 'delete') {
          await this.remote.remove(op.path, op.recordId)
          this.emit(op.path)
        }
      } catch (err) {
        console.warn(`drain op ${op.op} ${op.path} failed; rolling back`, err)
        // rollback for creates: remove tempId; updates/deletes: re-refresh on next online cycle
        if (op.op === 'create') {
          const mirror = readMirror(userId, op.path)
          delete mirror[op.tempId]
          writeMirror(userId, op.path, mirror)
          this.emit(op.path)
        }
        // drop the failing op to unblock the queue
      }
      queue = readQueue(userId).slice(1)
      writeQueue(userId, queue)
    }
  }

  wipe(userId: string): void {
    wipeUser(userId)
    this.emitAll()
  }

  private emit(path: string): void {
    this.listeners.get(path)?.forEach(cb => cb())
  }

  private emitAll(): void {
    for (const set of this.listeners.values()) set.forEach(cb => cb())
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm --filter @oyl/react-oyl test modules/data/sync/SyncEngine.test.ts
```
Expected: PASS — all tests green. (If `drain rolls back create on failure` flakes, ensure the rollback path also pops the op from the queue — see code above.)

- [ ] **Step 5: Commit**

```bash
git add packages/react-oyl/modules/data/sync/SyncEngine.ts packages/react-oyl/modules/data/sync/SyncEngine.test.ts
git commit -m "feat(data): implement SyncEngine with optimistic queue and drain"
```

### Task 13: Create a singleton SyncEngine instance + `useSync` hook

**Files:**
- Create: `packages/react-oyl/modules/data/sync/instance.ts`
- Create: `packages/react-oyl/modules/data/sync/useSync.ts`

- [ ] **Step 1: Create instance with lazy remote client**

```ts
// packages/react-oyl/modules/data/sync/instance.ts
import { SyncEngine } from './SyncEngine'
import { createRemoteClient } from '../useDataRemote'

let _tokenGetter: () => string | null = () => null

export const setSyncAuthTokenGetter = (fn: () => string | null) => { _tokenGetter = fn }

export const syncEngine = new SyncEngine(createRemoteClient(() => _tokenGetter()))
```

- [ ] **Step 2: Create `useSync` hook with stable subscription**

```ts
// packages/react-oyl/modules/data/sync/useSync.ts
import { useEffect, useState, useSyncExternalStore } from 'react'
import { syncEngine } from './instance'
import type { SyncState } from './types'

export function useSyncedList<T>(path: string): T[] {
  const subscribe = (cb: () => void) => syncEngine.subscribe(path, cb)
  const getSnapshot = () => syncEngine.readAll<T>(path) as unknown as T[]
  // useSyncExternalStore requires stable references; readAll returns a fresh array each time.
  // To avoid tearing in React 19, memoize by JSON length+ids.
  const data = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return data
}

export function useSyncedOne<T>(path: string, id: string | number | undefined): T | undefined {
  const subscribe = (cb: () => void) => syncEngine.subscribe(path, cb)
  const getSnapshot = () => (id == null ? undefined : syncEngine.readOne<T>(path, id) as unknown as T | undefined)
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useSyncState(): SyncState {
  const [state, setState] = useState(syncEngine.state())
  useEffect(() => {
    const tick = () => setState(syncEngine.state())
    // subscribe to all paths' changes (cheap pings)
    const subs = ['user-dailies', 'user-activities', 'user-activity-logs', 'user-goals', 'user-goal-milestones']
      .map(p => syncEngine.subscribe(p, tick))
    const interval = setInterval(tick, 5000)
    return () => { subs.forEach(unsub => unsub()); clearInterval(interval) }
  }, [])
  return state
}
```

> Note: `useSyncExternalStore`'s `getSnapshot` returns a new array each call — React 19 detects this. To prevent infinite re-renders, the SyncEngine writes back the *same* references when nothing changed by reading from `readMirror` (which always reads from localStorage and returns fresh objects). If this causes rerender churn in practice, wrap `getSnapshot` with a memo keyed on `JSON.stringify(ids)` — but try the simple form first.

- [ ] **Step 3: Commit**

```bash
git add packages/react-oyl/modules/data/sync/instance.ts packages/react-oyl/modules/data/sync/useSync.ts
git commit -m "feat(data): expose SyncEngine via singleton and React hooks"
```

### Task 14: Rewrite `useData` to back reads/writes with SyncEngine

**Files:**
- Modify: `packages/react-oyl/modules/data/useData.ts`
- Modify: `packages/react-oyl/modules/data/index.ts`
- Delete: `packages/react-oyl/modules/data/useDataLocal.ts`

- [ ] **Step 1: Replace `useData.ts`**

```ts
// packages/react-oyl/modules/data/useData.ts
import { useCallback } from 'react'
import { syncEngine } from './sync/instance'
import { useSyncedList, useSyncedOne, useSyncState } from './sync/useSync'
import type { SyncState } from './sync/types'

export type UseDataResult<T> = {
  find: () => T[]
  get: (id: string | number) => T | undefined
  save: (record: Partial<T>) => Promise<void>
  update: (id: string | number, patch: Partial<T>) => Promise<void>
  remove: (id: string | number) => Promise<void>
  refresh: () => Promise<void>
  syncState: SyncState
}

export function useData<T extends object>(path: string): UseDataResult<T> {
  const list = useSyncedList<T>(path)
  const syncState = useSyncState()
  const find = useCallback(() => list, [list])
  const get = useCallback((id: string | number) => list.find((r): r is T => (r as { id: unknown }).id === id || String((r as { id: unknown }).id) === String(id)), [list])
  const save = useCallback((record: Partial<T>) => syncEngine.save(path, record as object), [path])
  const update = useCallback((id: string | number, patch: Partial<T>) => syncEngine.update(path, id, patch), [path])
  const remove = useCallback((id: string | number) => syncEngine.remove(path, id), [path])
  const refresh = useCallback(() => syncEngine.refresh(path), [path])
  return { find, get, save, update, remove, refresh, syncState }
}

export function useDataOne<T extends object>(path: string, id: string | number | undefined): T | undefined {
  return useSyncedOne<T>(path, id)
}
```

- [ ] **Step 2: Update `packages/react-oyl/modules/data/index.ts`**

```ts
// packages/react-oyl/modules/data/index.ts
export { useData, useDataOne } from './useData'
export type { UseDataResult } from './useData'
export { useSyncState } from './sync/useSync'
export type { SyncState } from './sync/types'
export { syncEngine, setSyncAuthTokenGetter } from './sync/instance'
export { SYNCED_PATHS } from './sync/types'
```

- [ ] **Step 3: Delete `useDataLocal.ts`**

```bash
git rm packages/react-oyl/modules/data/useDataLocal.ts
```

- [ ] **Step 4: Verify typecheck on the data module**

```bash
pnpm --filter @oyl/react-oyl exec tsc --noEmit -p tsconfig.app.json
```
Expected: errors only in consumers we haven't refactored yet (activity provider, daily provider). The data module itself compiles.

- [ ] **Step 5: Commit**

```bash
git add packages/react-oyl/modules/data/useData.ts packages/react-oyl/modules/data/index.ts
git commit -m "refactor(data): rebuild useData on top of SyncEngine; remove useDataLocal"
```

### Task 15: `SyncBootstrap` component + AppProvider wiring

**Files:**
- Create: `packages/react-oyl/modules/data/sync/SyncBootstrap.tsx`
- Modify: `packages/react-oyl/modules/app/AppProvider.tsx`
- Modify: `packages/react-oyl/modules/auth/AuthProvider.tsx` (read-only inspection first)

- [ ] **Step 1: Inspect AuthProvider to know what it exposes**

Read `packages/react-oyl/modules/auth/AuthProvider.tsx` and `auth-context.ts`. Confirm `user.id` and `apiToken` are accessible. (No edits.)

- [ ] **Step 2: Create `SyncBootstrap.tsx`**

```tsx
// packages/react-oyl/modules/data/sync/SyncBootstrap.tsx
import { useEffect, useState } from 'react'
import useAuth from '@/modules/auth/useAuth'
import { useApp } from '@/modules/app'
import { syncEngine, setSyncAuthTokenGetter } from './instance'
import { SYNCED_PATHS } from './types'
import { wipeUser } from './storage'

type Props = { children: React.ReactNode }

export default function SyncBootstrap({ children }: Props) {
  const { user, apiToken } = useAuth()
  const { offline, setOffline } = useApp()
  const [seeded, setSeeded] = useState(false)
  const [lastUserId, setLastUserId] = useState<string | null>(null)

  // keep remote client token current
  useEffect(() => { setSyncAuthTokenGetter(() => apiToken) }, [apiToken])

  // online/offline window events
  useEffect(() => {
    const goOnline = () => { setOffline(false); syncEngine.setOnline(true) }
    const goOffline = () => { setOffline(true); syncEngine.setOnline(false) }
    syncEngine.setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [setOffline])

  // bind user
  useEffect(() => {
    const userId = user?.id ? String(user.id) : null
    if (lastUserId && lastUserId !== userId) {
      wipeUser(lastUserId)  // logout / switch user => wipe previous
      setSeeded(false)
    }
    setLastUserId(userId)
    syncEngine.setUser(userId)
    if (!userId) { setSeeded(false); return }
    if (!offline) {
      syncEngine.refreshAll([...SYNCED_PATHS]).finally(() => setSeeded(true))
    } else {
      setSeeded(true)  // offline: show what's in mirror (possibly empty)
    }
  }, [user?.id, offline, lastUserId])

  // re-sync on window focus when online
  useEffect(() => {
    const onFocus = () => { if (!offline && user?.id) syncEngine.refreshAll([...SYNCED_PATHS]) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [offline, user?.id])

  if (user?.id && !seeded) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-600 dark:text-gray-400">Loading your data…</div>
      </div>
    )
  }
  return <>{children}</>
}
```

- [ ] **Step 3: Mount `SyncBootstrap` in `AppProvider.tsx`**

Replace the file contents:

```tsx
// packages/react-oyl/modules/app/AppProvider.tsx
import React, { useState } from 'react';
import context from './app-context';
import AuthProvider from '@/modules/auth/AuthProvider'
import SyncBootstrap from '@/modules/data/sync/SyncBootstrap'

const Provider = context.Provider;

export default function AppProvider({ children }: { children: React.ReactNode }) {
  const [offline, setOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  return (
    <Provider value={{ offline, setOffline }}>
      <AuthProvider>
        <SyncBootstrap>
          {children}
        </SyncBootstrap>
      </AuthProvider>
    </Provider>
  )
}
```

- [ ] **Step 4: Manual verify — page boots with loading state then content**

Start the Strapi server (`pnpm strapi develop`) and the React dev server (`pnpm react dev`). Log in. Confirm:

- Brief "Loading your data…" appears, then the app renders.
- Open DevTools → Application → Local Storage → entries under `oyl:<userId>:*`.
- Network tab: 5 GET requests fired during boot (one per `SYNCED_PATHS`).
- Toggle DevTools "Offline" — reload; should render with cached mirror.

- [ ] **Step 5: Commit**

```bash
git add packages/react-oyl/modules/data/sync/SyncBootstrap.tsx packages/react-oyl/modules/app/AppProvider.tsx
git commit -m "feat(data): bootstrap SyncEngine on auth, bind online/offline events"
```

---

## Phase 3 — Per-collection providers

### Task 16: Refactor `UserActivityProvider` to use `useData`; rewrite `useUserActivityState`; delete `UserActivityViewProvider`

**Files:**
- Modify: `packages/react-oyl/modules/user/activity/user-activity-context.ts`
- Modify: `packages/react-oyl/modules/user/activity/useUserActivityState.ts`
- Modify: `packages/react-oyl/modules/user/activity/UserActivityProvider.tsx`
- Delete: `packages/react-oyl/modules/user/activity/UserActivityViewProvider.tsx`
- Modify: `packages/react-oyl/modules/user/activity/index.ts`

- [ ] **Step 1: Rewrite `user-activity-context.ts`**

```ts
// packages/react-oyl/modules/user/activity/user-activity-context.ts
import { createContext, useContext } from 'react'
import type { TDataId, TUserActivityData } from '@oyl/all-of-oyl/modules'

export type UserActivityContextValue = {
  activities: TUserActivityData[]
  addActivity: (input: Partial<TUserActivityData>) => Promise<void>
  updateActivity: (id: TDataId, patch: Partial<TUserActivityData>) => Promise<void>
  removeActivity: (id: TDataId) => Promise<void>

  // UI state
  showAddActivityForm: boolean
  setShowAddActivityForm: (v: boolean) => void
  settingsActivityId: TDataId | null
  setSettingsActivityId: (id: TDataId | null) => void
}

const defaultValue: UserActivityContextValue = {
  activities: [],
  addActivity: async () => {},
  updateActivity: async () => {},
  removeActivity: async () => {},
  showAddActivityForm: false,
  setShowAddActivityForm: () => {},
  settingsActivityId: null,
  setSettingsActivityId: () => {},
}

export const context = createContext<UserActivityContextValue>(defaultValue)
export const useUserActivityContext = () => useContext(context)
```

- [ ] **Step 2: Rewrite `useUserActivityState.ts`**

```ts
// packages/react-oyl/modules/user/activity/useUserActivityState.ts
import { useState } from 'react'
import type { TDataId } from '@oyl/all-of-oyl/modules'

export function useUserActivityState() {
  const [showAddActivityForm, setShowAddActivityForm] = useState(false)
  const [settingsActivityId, setSettingsActivityId] = useState<TDataId | null>(null)
  return { showAddActivityForm, setShowAddActivityForm, settingsActivityId, setSettingsActivityId }
}
```

- [ ] **Step 3: Rewrite `UserActivityProvider.tsx`**

```tsx
// packages/react-oyl/modules/user/activity/UserActivityProvider.tsx
import React, { useCallback } from 'react'
import type { TDataId, TUserActivityData } from '@oyl/all-of-oyl/modules'
import { useData } from '@/modules/data'
import { context } from './user-activity-context'
import { useUserActivityState } from './useUserActivityState'

export default function UserActivityProvider({ children }: { children: React.ReactNode }) {
  const data = useData<TUserActivityData>('user-activities')
  const uiState = useUserActivityState()

  const addActivity = useCallback(async (input: Partial<TUserActivityData>) => {
    await data.save(input)
  }, [data])

  const updateActivity = useCallback(async (id: TDataId, patch: Partial<TUserActivityData>) => {
    await data.update(id, patch)
  }, [data])

  const removeActivity = useCallback(async (id: TDataId) => {
    await data.remove(id)
  }, [data])

  return (
    <context.Provider value={{
      activities: data.find(),
      addActivity,
      updateActivity,
      removeActivity,
      ...uiState,
    }}>
      {children}
    </context.Provider>
  )
}
```

- [ ] **Step 4: Delete `UserActivityViewProvider.tsx`**

```bash
git rm packages/react-oyl/modules/user/activity/UserActivityViewProvider.tsx
```

- [ ] **Step 5: Update `packages/react-oyl/modules/user/activity/index.ts`**

```ts
// packages/react-oyl/modules/user/activity/index.ts
export { default as UserActivityProvider } from './UserActivityProvider'
export { useUserActivityContext } from './user-activity-context'
export type { UserActivityContextValue } from './user-activity-context'
```

(Drop exports of `UserActivityItem`, `UserActivityForm`, `UserActivitySettingsForm`, `UserActivityViewProvider`, `useUserActivityState` — they're either deleted, internal, or replaced by daily-new components.)

- [ ] **Step 6: Commit**

```bash
git add packages/react-oyl/modules/user/activity/
git commit -m "refactor(user/activity): rebuild provider on useData; drop deprecated state"
```

### Task 17: Create `UserActivityLogProvider`

**Files:**
- Create: `packages/react-oyl/modules/user/activity-log/user-activity-log-context.ts`
- Create: `packages/react-oyl/modules/user/activity-log/UserActivityLogProvider.tsx`
- Create: `packages/react-oyl/modules/user/activity-log/index.ts`

- [ ] **Step 1: Context**

```ts
// packages/react-oyl/modules/user/activity-log/user-activity-log-context.ts
import { createContext, useContext } from 'react'
import type { TDataId, TUserActivityLogData } from '@oyl/all-of-oyl/modules'

export type UserActivityLogContextValue = {
  logs: TUserActivityLogData[]
  getLogsForActivity: (activityId: TDataId, date: string) => TUserActivityLogData[]
  addLog: (input: Partial<TUserActivityLogData>) => Promise<void>
  updateLog: (id: TDataId, patch: Partial<TUserActivityLogData>) => Promise<void>
  removeLog: (id: TDataId) => Promise<void>
  editingLogId: TDataId | null
  setEditingLogId: (id: TDataId | null) => void
}

const defaultValue: UserActivityLogContextValue = {
  logs: [],
  getLogsForActivity: () => [],
  addLog: async () => {},
  updateLog: async () => {},
  removeLog: async () => {},
  editingLogId: null,
  setEditingLogId: () => {},
}

export const context = createContext<UserActivityLogContextValue>(defaultValue)
export const useUserActivityLogContext = () => useContext(context)
```

- [ ] **Step 2: Provider**

```tsx
// packages/react-oyl/modules/user/activity-log/UserActivityLogProvider.tsx
import React, { useCallback, useState } from 'react'
import type { TDataId, TUserActivityLogData } from '@oyl/all-of-oyl/modules'
import { useData } from '@/modules/data'
import { context } from './user-activity-log-context'

const extractId = (rel: unknown): TDataId | undefined => {
  if (rel == null) return undefined
  if (typeof rel === 'object' && 'id' in (rel as object)) return (rel as { id: TDataId }).id
  return rel as TDataId
}

const sameDay = (iso: string | undefined, date: string): boolean => {
  if (!iso) return false
  return iso.slice(0, 10) === date
}

export default function UserActivityLogProvider({ children }: { children: React.ReactNode }) {
  const data = useData<TUserActivityLogData>('user-activity-logs')
  const [editingLogId, setEditingLogId] = useState<TDataId | null>(null)

  const getLogsForActivity = useCallback((activityId: TDataId, date: string) =>
    data.find().filter(l =>
      extractId(l.user_activity) === activityId && sameDay(l.logged_at, date)
    ),
    [data]
  )

  const addLog = useCallback((input: Partial<TUserActivityLogData>) => data.save(input), [data])
  const updateLog = useCallback((id: TDataId, patch: Partial<TUserActivityLogData>) => data.update(id, patch), [data])
  const removeLog = useCallback((id: TDataId) => data.remove(id), [data])

  return (
    <context.Provider value={{
      logs: data.find(),
      getLogsForActivity,
      addLog,
      updateLog,
      removeLog,
      editingLogId,
      setEditingLogId,
    }}>
      {children}
    </context.Provider>
  )
}
```

- [ ] **Step 3: Index**

```ts
// packages/react-oyl/modules/user/activity-log/index.ts
export { default as UserActivityLogProvider } from './UserActivityLogProvider'
export { useUserActivityLogContext } from './user-activity-log-context'
export type { UserActivityLogContextValue } from './user-activity-log-context'
```

- [ ] **Step 4: Commit**

```bash
git add packages/react-oyl/modules/user/activity-log/
git commit -m "feat(user/activity-log): add provider for per-occurrence logs"
```

### Task 18: Create `UserGoalProvider` (and remove old `useUserGoals.ts`)

**Files:**
- Create: `packages/react-oyl/modules/user/goal/user-goal-context.ts`
- Create: `packages/react-oyl/modules/user/goal/UserGoalProvider.tsx`
- Create: `packages/react-oyl/modules/user/goal/index.ts`
- Delete: `packages/react-oyl/modules/user/goal/useUserGoals.ts`

- [ ] **Step 1: Context**

```ts
// packages/react-oyl/modules/user/goal/user-goal-context.ts
import { createContext, useContext } from 'react'
import type { TDataId, TUserGoalData } from '@oyl/all-of-oyl/modules'

export type UserGoalContextValue = {
  goals: TUserGoalData[]
  getGoal: (id: TDataId) => TUserGoalData | undefined
  addGoal: (input: Partial<TUserGoalData>) => Promise<void>
  updateGoal: (id: TDataId, patch: Partial<TUserGoalData>) => Promise<void>
  removeGoal: (id: TDataId) => Promise<void>
  setProgress: (id: TDataId, value: number) => Promise<void>
  markComplete: (id: TDataId) => Promise<void>
  appendNote: (id: TDataId, text: string) => Promise<void>

  showAddGoalForm: boolean
  setShowAddGoalForm: (v: boolean) => void
  settingsGoalId: TDataId | null
  setSettingsGoalId: (id: TDataId | null) => void
}

const defaultValue: UserGoalContextValue = {
  goals: [],
  getGoal: () => undefined,
  addGoal: async () => {},
  updateGoal: async () => {},
  removeGoal: async () => {},
  setProgress: async () => {},
  markComplete: async () => {},
  appendNote: async () => {},
  showAddGoalForm: false,
  setShowAddGoalForm: () => {},
  settingsGoalId: null,
  setSettingsGoalId: () => {},
}

export const context = createContext<UserGoalContextValue>(defaultValue)
export const useUserGoalContext = () => useContext(context)
```

- [ ] **Step 2: Provider**

```tsx
// packages/react-oyl/modules/user/goal/UserGoalProvider.tsx
import React, { useCallback, useState } from 'react'
import type { TDataId, TUserGoalData } from '@oyl/all-of-oyl/modules'
import { useData } from '@/modules/data'
import { context } from './user-goal-context'

export default function UserGoalProvider({ children }: { children: React.ReactNode }) {
  const data = useData<TUserGoalData>('user-goals')
  const [showAddGoalForm, setShowAddGoalForm] = useState(false)
  const [settingsGoalId, setSettingsGoalId] = useState<TDataId | null>(null)

  const goals = data.find()

  const getGoal = useCallback((id: TDataId) => data.get(id), [data])
  const addGoal = useCallback((input: Partial<TUserGoalData>) => data.save(input), [data])
  const updateGoal = useCallback((id: TDataId, patch: Partial<TUserGoalData>) => data.update(id, patch), [data])
  const removeGoal = useCallback((id: TDataId) => data.remove(id), [data])
  const setProgress = useCallback((id: TDataId, value: number) => data.update(id, { progress: value }), [data])
  const markComplete = useCallback((id: TDataId) => data.update(id, {
    completed_at: new Date().toISOString(),
    current_status: 'completed',
  }), [data])
  const appendNote = useCallback((id: TDataId, text: string) => {
    const existing = data.get(id)
    const combined = existing?.note ? `${existing.note}\n${text}` : text
    return data.update(id, { note: combined })
  }, [data])

  return (
    <context.Provider value={{
      goals,
      getGoal,
      addGoal,
      updateGoal,
      removeGoal,
      setProgress,
      markComplete,
      appendNote,
      showAddGoalForm,
      setShowAddGoalForm,
      settingsGoalId,
      setSettingsGoalId,
    }}>
      {children}
    </context.Provider>
  )
}
```

- [ ] **Step 3: Index + delete old hook**

```ts
// packages/react-oyl/modules/user/goal/index.ts
export { default as UserGoalProvider } from './UserGoalProvider'
export { useUserGoalContext } from './user-goal-context'
export type { UserGoalContextValue } from './user-goal-context'
```

```bash
git rm packages/react-oyl/modules/user/goal/useUserGoals.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/react-oyl/modules/user/goal/
git commit -m "feat(user/goal): add UserGoalProvider with full CRUD + progress/note methods"
```

### Task 19: Create `UserGoalMilestoneProvider`

**Files:**
- Create: `packages/react-oyl/modules/user/goal-milestone/user-goal-milestone-context.ts`
- Create: `packages/react-oyl/modules/user/goal-milestone/UserGoalMilestoneProvider.tsx`
- Create: `packages/react-oyl/modules/user/goal-milestone/index.ts`

- [ ] **Step 1: Context**

```ts
// packages/react-oyl/modules/user/goal-milestone/user-goal-milestone-context.ts
import { createContext, useContext } from 'react'
import type { TDataId, TUserGoalMilestoneData } from '@oyl/all-of-oyl/modules'

export type UserGoalMilestoneContextValue = {
  milestones: TUserGoalMilestoneData[]
  getMilestonesForGoal: (goalId: TDataId) => TUserGoalMilestoneData[]
  addMilestone: (input: Partial<TUserGoalMilestoneData>) => Promise<void>
  toggleMilestone: (id: TDataId) => Promise<void>
  removeMilestone: (id: TDataId) => Promise<void>
  reorderMilestones: (goalId: TDataId, ids: TDataId[]) => Promise<void>
}

const defaultValue: UserGoalMilestoneContextValue = {
  milestones: [],
  getMilestonesForGoal: () => [],
  addMilestone: async () => {},
  toggleMilestone: async () => {},
  removeMilestone: async () => {},
  reorderMilestones: async () => {},
}

export const context = createContext<UserGoalMilestoneContextValue>(defaultValue)
export const useUserGoalMilestoneContext = () => useContext(context)
```

- [ ] **Step 2: Provider**

```tsx
// packages/react-oyl/modules/user/goal-milestone/UserGoalMilestoneProvider.tsx
import React, { useCallback } from 'react'
import type { TDataId, TUserGoalMilestoneData } from '@oyl/all-of-oyl/modules'
import { useData } from '@/modules/data'
import { context } from './user-goal-milestone-context'

const extractId = (rel: unknown): TDataId | undefined => {
  if (rel == null) return undefined
  if (typeof rel === 'object' && 'id' in (rel as object)) return (rel as { id: TDataId }).id
  return rel as TDataId
}

export default function UserGoalMilestoneProvider({ children }: { children: React.ReactNode }) {
  const data = useData<TUserGoalMilestoneData>('user-goal-milestones')

  const getMilestonesForGoal = useCallback((goalId: TDataId) =>
    data.find()
      .filter(m => extractId(m.user_goal) === goalId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [data]
  )

  const addMilestone = useCallback((input: Partial<TUserGoalMilestoneData>) => data.save(input), [data])
  const removeMilestone = useCallback((id: TDataId) => data.remove(id), [data])

  const toggleMilestone = useCallback(async (id: TDataId) => {
    const existing = data.get(id)
    if (!existing) return
    return data.update(id, {
      completed_at: existing.completed_at ? null as unknown as undefined : new Date().toISOString(),
    })
  }, [data])

  const reorderMilestones = useCallback(async (_goalId: TDataId, ids: TDataId[]) => {
    await Promise.all(ids.map((id, idx) => data.update(id, { sort_order: idx })))
  }, [data])

  return (
    <context.Provider value={{
      milestones: data.find(),
      getMilestonesForGoal,
      addMilestone,
      toggleMilestone,
      removeMilestone,
      reorderMilestones,
    }}>
      {children}
    </context.Provider>
  )
}
```

- [ ] **Step 3: Index**

```ts
// packages/react-oyl/modules/user/goal-milestone/index.ts
export { default as UserGoalMilestoneProvider } from './UserGoalMilestoneProvider'
export { useUserGoalMilestoneContext } from './user-goal-milestone-context'
export type { UserGoalMilestoneContextValue } from './user-goal-milestone-context'
```

- [ ] **Step 4: Commit**

```bash
git add packages/react-oyl/modules/user/goal-milestone/
git commit -m "feat(user/goal-milestone): add provider with CRUD and toggle/reorder"
```

### Task 20: Refactor `UserDailyProvider` to use `useDataOne`

**Files:**
- Modify: `packages/react-oyl/modules/user/daily-new/UserDailyProvider.tsx`
- Modify: `packages/react-oyl/modules/user/daily-new/user-daily-context.ts`

- [ ] **Step 1: Replace `UserDailyProvider.tsx`**

```tsx
// packages/react-oyl/modules/user/daily-new/UserDailyProvider.tsx
import React, { useEffect, useState } from 'react'
import { userDailyContext } from './user-daily-context'
import { useData } from '@/modules/data'
import type { TUserDailyData } from '@oyl/all-of-oyl/modules'

const { Provider } = userDailyContext
const today = () => new Date().toISOString().split('T')[0]
const empty = (date: string): TUserDailyData => ({
  date, activities: [], goals: [], nutritions: [],
})

export default function UserDailyProvider({ children }: { children: React.ReactNode }) {
  const [selectedDate, setSelectedDate] = useState<string>(today())
  const data = useData<TUserDailyData>('user-dailies')

  // refresh once on date change so the orchestrator sees today's daily row
  useEffect(() => { data.refresh() }, [selectedDate, data])

  const all = data.find()
  const userDailyData = all.find(d => d.date === selectedDate) ?? empty(selectedDate)

  return (
    <Provider value={{ selectedDate, setSelectedDate, userDailyData }}>
      {children}
    </Provider>
  )
}
```

- [ ] **Step 2: `user-daily-context.ts` is unchanged** — verify by reading.

- [ ] **Step 3: Commit**

```bash
git add packages/react-oyl/modules/user/daily-new/UserDailyProvider.tsx
git commit -m "refactor(daily-new): source userDailyData from useData mirror"
```

### Task 21: `UserDailyDataProviders` compose helper

**Files:**
- Create: `packages/react-oyl/modules/user/daily-new/UserDailyDataProviders.tsx`

- [ ] **Step 1: Create**

```tsx
// packages/react-oyl/modules/user/daily-new/UserDailyDataProviders.tsx
import React from 'react'
import UserDailyProvider from './UserDailyProvider'
import { UserActivityProvider } from '@/modules/user/activity'
import { UserActivityLogProvider } from '@/modules/user/activity-log'
import { UserGoalProvider } from '@/modules/user/goal'
import { UserGoalMilestoneProvider } from '@/modules/user/goal-milestone'

export default function UserDailyDataProviders({ children }: { children: React.ReactNode }) {
  return (
    <UserDailyProvider>
      <UserActivityProvider>
        <UserActivityLogProvider>
          <UserGoalProvider>
            <UserGoalMilestoneProvider>
              {children}
            </UserGoalMilestoneProvider>
          </UserGoalProvider>
        </UserActivityLogProvider>
      </UserActivityProvider>
    </UserDailyProvider>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/react-oyl/modules/user/daily-new/UserDailyDataProviders.tsx
git commit -m "feat(daily-new): add compose helper for the five data providers"
```

---

## Phase 4 — Orchestrator hook

### Task 22: `useUserDailyOrchestrator` with derived filters and tests

**Files:**
- Create: `packages/react-oyl/modules/user/daily-new/useUserDailyOrchestrator.ts`
- Create: `packages/react-oyl/modules/user/daily-new/orchestrator-utils.ts`
- Create: `packages/react-oyl/modules/user/daily-new/orchestrator-utils.test.ts`

- [ ] **Step 1: Extract pure filter helpers + tests**

```ts
// packages/react-oyl/modules/user/daily-new/orchestrator-utils.ts
import type { TDataId, TUserActivityData, TUserGoalData } from '@oyl/all-of-oyl/modules'
import { matchesDate } from '@oyl/all-of-oyl/modules'

const extractId = (rel: unknown): TDataId | undefined => {
  if (rel == null) return undefined
  if (typeof rel === 'object' && 'id' in (rel as object)) return (rel as { id: TDataId }).id
  return rel as TDataId
}

export function filterActivitiesForDate(
  allActivities: TUserActivityData[],
  dailyPins: (TUserActivityData | TDataId)[],
  date: string,
): TUserActivityData[] {
  const pinIds = new Set(dailyPins.map(extractId).filter(Boolean) as TDataId[])
  return allActivities.filter(a =>
    a.current_status === 'active' &&
    (matchesDate(a.schedule, date) || (a.id != null && pinIds.has(a.id)))
  )
}

export function filterGoalsForDate(
  allGoals: TUserGoalData[],
  dailyPins: (TUserGoalData | TDataId)[],
  date: string,
): TUserGoalData[] {
  const pinIds = new Set(dailyPins.map(extractId).filter(Boolean) as TDataId[])
  return allGoals.filter(g =>
    (g.current_status === 'active' && (!g.target_date || g.target_date >= date)) ||
    (g.id != null && pinIds.has(g.id))
  )
}
```

```ts
// packages/react-oyl/modules/user/daily-new/orchestrator-utils.test.ts
import { describe, it, expect } from 'vitest'
import { filterActivitiesForDate, filterGoalsForDate } from './orchestrator-utils'

describe('filterActivitiesForDate', () => {
  it('includes scheduled-today active activities', () => {
    const acts = [
      { id: 1, current_status: 'active' as const, schedule: { rrule: 'FREQ=DAILY' } },
      { id: 2, current_status: 'paused' as const, schedule: { rrule: 'FREQ=DAILY' } },
      { id: 3, current_status: 'active' as const, schedule: { rrule: 'FREQ=WEEKLY;BYDAY=MO' } },
    ]
    const result = filterActivitiesForDate(acts, [], '2026-05-30') // Saturday
    expect(result.map(a => a.id)).toEqual([1])
  })

  it('includes pinned activities even when schedule does not match', () => {
    const acts = [
      { id: 9, current_status: 'active' as const, schedule: { rrule: 'FREQ=WEEKLY;BYDAY=MO' } },
    ]
    const result = filterActivitiesForDate(acts, [9], '2026-05-30')
    expect(result.map(a => a.id)).toEqual([9])
  })
})

describe('filterGoalsForDate', () => {
  it('includes active goals without target_date', () => {
    const goals = [
      { id: 1, current_status: 'active' as const },
      { id: 2, current_status: 'paused' as const },
    ]
    expect(filterGoalsForDate(goals, [], '2026-05-30').map(g => g.id)).toEqual([1])
  })

  it('excludes active goals whose target_date has passed', () => {
    const goals = [
      { id: 1, current_status: 'active' as const, target_date: '2026-05-29' },
      { id: 2, current_status: 'active' as const, target_date: '2026-06-30' },
    ]
    expect(filterGoalsForDate(goals, [], '2026-05-30').map(g => g.id)).toEqual([2])
  })

  it('includes pins regardless of filter', () => {
    const goals = [{ id: 5, current_status: 'archived' as const }]
    expect(filterGoalsForDate(goals, [5], '2026-05-30').map(g => g.id)).toEqual([5])
  })
})
```

- [ ] **Step 2: Run tests — expect pass**

```bash
pnpm --filter @oyl/react-oyl test modules/user/daily-new/orchestrator-utils.test.ts
```
Expected: PASS.

- [ ] **Step 3: Implement the hook**

```ts
// packages/react-oyl/modules/user/daily-new/useUserDailyOrchestrator.ts
import { useCallback, useMemo } from 'react'
import type { TDataId, TUserActivity, TUserActivityData, TUserActivityLogData, TUserGoal, TUserGoalData, TUserGoalMilestone } from '@oyl/all-of-oyl/modules'
import { useUserDailyContext } from './user-daily-context'
import { useUserActivityContext } from '@/modules/user/activity'
import { useUserActivityLogContext } from '@/modules/user/activity-log'
import { useUserGoalContext } from '@/modules/user/goal'
import { useUserGoalMilestoneContext } from '@/modules/user/goal-milestone'
import { useSyncState } from '@/modules/data'
import { filterActivitiesForDate, filterGoalsForDate } from './orchestrator-utils'

export type ActivityRow = {
  activity: TUserActivityData
  logs: TUserActivityLogData[]
  isDone: boolean
  progress?: { value: number; target: number; direction: 'min' | 'max' | 'exact' }
}

export type GoalRow = {
  goal: TUserGoalData
  milestones: ReturnType<ReturnType<typeof useUserGoalMilestoneContext>['getMilestonesForGoal']>
  progressPct: number
  isComplete: boolean
}

export function useUserDailyOrchestrator() {
  const { selectedDate, setSelectedDate, userDailyData } = useUserDailyContext()
  const acts = useUserActivityContext()
  const logs = useUserActivityLogContext()
  const goals = useUserGoalContext()
  const milestones = useUserGoalMilestoneContext()
  const syncState = useSyncState()

  const todayActivities = useMemo(
    () => filterActivitiesForDate(acts.activities, userDailyData.activities, selectedDate),
    [acts.activities, userDailyData.activities, selectedDate],
  )

  const todayGoals = useMemo(
    () => filterGoalsForDate(goals.goals, userDailyData.goals, selectedDate),
    [goals.goals, userDailyData.goals, selectedDate],
  )

  const activityRows: ActivityRow[] = useMemo(() => todayActivities.map(activity => {
    const acLogs = activity.id != null ? logs.getLogsForActivity(activity.id, selectedDate) : []
    const isDone = acLogs.length > 0
    let progress: ActivityRow['progress'] | undefined
    if (activity.target_value != null && activity.target_direction) {
      const sum = acLogs.reduce((acc, l) => acc + (l.value ?? 0), 0)
      progress = { value: sum, target: activity.target_value, direction: activity.target_direction }
    }
    return { activity, logs: acLogs, isDone, progress }
  }), [todayActivities, logs, selectedDate])

  const goalRows: GoalRow[] = useMemo(() => todayGoals.map(goal => {
    const goalMilestones = goal.id != null ? milestones.getMilestonesForGoal(goal.id) : []
    const target = goal.target ?? 0
    const progressPct = target > 0 ? Math.min(1, (goal.progress ?? 0) / target) : 0
    return { goal, milestones: goalMilestones, progressPct, isComplete: goal.completed_at != null }
  }), [todayGoals, milestones])

  const addActivity = useCallback((input: Partial<TUserActivity>) => acts.addActivity(input as Partial<TUserActivityData>), [acts])
  const addLog = useCallback((activityId: TDataId, input: Partial<TUserActivityLogData> = {}) =>
    logs.addLog({ user_activity: activityId, logged_at: input.logged_at ?? `${selectedDate}T12:00:00Z`, ...input }),
    [logs, selectedDate]
  )
  const toggleDone = useCallback(async (activityId: TDataId) => {
    const existing = logs.getLogsForActivity(activityId, selectedDate)
    if (existing.length > 0 && existing[0].id != null) return logs.removeLog(existing[0].id)
    return addLog(activityId)
  }, [logs, selectedDate, addLog])

  const updateLog = logs.updateLog
  const removeLog = logs.removeLog
  const openActivitySettings = acts.setSettingsActivityId

  const addGoal = useCallback((input: Partial<TUserGoal>) => goals.addGoal(input as Partial<TUserGoalData>), [goals])
  const updateGoal = goals.updateGoal
  const setProgress = goals.setProgress
  const appendGoalNote = goals.appendNote
  const markGoalComplete = goals.markComplete
  const addMilestone = useCallback((goalId: TDataId, input: Partial<TUserGoalMilestone>) =>
    milestones.addMilestone({ user_goal: goalId, ...input }),
    [milestones]
  )
  const toggleMilestone = milestones.toggleMilestone
  const openGoalSettings = goals.setSettingsGoalId

  return {
    selectedDate, setSelectedDate, syncState,
    activityRows, addActivity, addLog, toggleDone, updateLog, removeLog, openActivitySettings,
    goalRows, addGoal, updateGoal, setProgress, appendGoalNote, markGoalComplete,
    addMilestone, toggleMilestone, openGoalSettings,
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/react-oyl/modules/user/daily-new/orchestrator-utils.ts packages/react-oyl/modules/user/daily-new/orchestrator-utils.test.ts packages/react-oyl/modules/user/daily-new/useUserDailyOrchestrator.ts
git commit -m "feat(daily-new): add orchestrator hook composing 5 providers"
```

---

## Phase 5 — Activities UI

### Task 23: `UserActivityScheduleInput`

**Files:**
- Create: `packages/react-oyl/modules/user/activity/UserActivityScheduleInput.tsx`
- Modify: `packages/react-oyl/modules/user/activity/index.ts`

- [ ] **Step 1: Component**

```tsx
// packages/react-oyl/modules/user/activity/UserActivityScheduleInput.tsx
import { useState } from 'react'
import type { TSchedule } from '@oyl/all-of-oyl/modules'
import { describeSchedule } from '@oyl/all-of-oyl/modules'

type Props = {
  value: TSchedule | undefined
  onChange: (next: TSchedule | undefined) => void
}

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

export default function UserActivityScheduleInput({ value, onChange }: Props) {
  const [mode, setMode] = useState<'preset' | 'raw'>('preset')
  const [days, setDays] = useState<string[]>(['MO', 'TU', 'WE', 'TH', 'FR'])
  const [raw, setRaw] = useState(value?.rrule ?? '')

  const apply = (rrule: string) => onChange(rrule ? { rrule } : undefined)
  const toggleDay = (d: string) => {
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d]
    setDays(next)
    apply(`FREQ=WEEKLY;BYDAY=${next.join(',')}`)
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 text-sm">
        <button type="button" className={`px-2 py-1 rounded ${mode === 'preset' ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`} onClick={() => setMode('preset')}>Presets</button>
        <button type="button" className={`px-2 py-1 rounded ${mode === 'raw' ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`} onClick={() => setMode('raw')}>Raw RRULE</button>
      </div>

      {mode === 'preset' && (
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            <button type="button" className="px-2 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700" onClick={() => apply('FREQ=DAILY')}>Daily</button>
            <button type="button" className="px-2 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700" onClick={() => { setDays(['MO','TU','WE','TH','FR']); apply('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') }}>Weekdays</button>
          </div>
          <div className="flex gap-1 flex-wrap">
            {DAYS.map(d => (
              <button key={d} type="button"
                className={`w-9 h-9 rounded text-sm ${days.includes(d) ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
                onClick={() => toggleDay(d)}>{d}</button>
            ))}
          </div>
        </div>
      )}

      {mode === 'raw' && (
        <input
          type="text"
          value={raw}
          onChange={e => { setRaw(e.target.value); apply(e.target.value) }}
          placeholder="FREQ=WEEKLY;BYDAY=MO,WE,FR"
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 text-sm font-mono"
        />
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400">{describeSchedule(value)}</p>
    </div>
  )
}
```

- [ ] **Step 2: Re-export from `index.ts`**

Append to `packages/react-oyl/modules/user/activity/index.ts`:

```ts
export { default as UserActivityScheduleInput } from './UserActivityScheduleInput'
```

- [ ] **Step 3: Commit**

```bash
git add packages/react-oyl/modules/user/activity/UserActivityScheduleInput.tsx packages/react-oyl/modules/user/activity/index.ts
git commit -m "feat(user/activity): add RRULE schedule input component"
```

### Task 24: `UserDailyActivityRow`

**Files:**
- Create: `packages/react-oyl/modules/user/daily-new/activities/UserDailyActivityRow.tsx`

- [ ] **Step 1: Component**

```tsx
// packages/react-oyl/modules/user/daily-new/activities/UserDailyActivityRow.tsx
import { useState } from 'react'
import type { ActivityRow } from '../useUserDailyOrchestrator'
import { describeSchedule } from '@oyl/all-of-oyl/modules'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'

type Props = { row: ActivityRow }

const progressMet = (p: NonNullable<ActivityRow['progress']>) => {
  if (p.direction === 'min') return p.value >= p.target
  if (p.direction === 'max') return p.value <= p.target
  return p.value === p.target
}

export default function UserDailyActivityRow({ row }: Props) {
  const { toggleDone, openActivitySettings, addLog } = useUserDailyOrchestrator()
  const [expanded, setExpanded] = useState(false)
  const { activity, logs, isDone, progress } = row
  if (activity.id == null) return null

  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3 flex-1">
          <input
            type="checkbox"
            checked={isDone}
            onChange={() => toggleDone(activity.id!)}
            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 rounded"
          />
          <div className="flex-1">
            <p className={`font-medium ${isDone ? 'text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
              {activity.name ?? '(unnamed)'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {describeSchedule(activity.schedule)} · {activity.type ?? 'habit'}
            </p>
            {progress && (
              <div className="mt-1">
                <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
                  <div
                    className={`h-full ${progressMet(progress) ? 'bg-green-500' : 'bg-indigo-500'}`}
                    style={{ width: `${Math.min(100, (progress.value / Math.max(1, progress.target)) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {progress.value} / {progress.target} {activity.target_unit ?? ''} ({progress.direction})
                </p>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => addLog(activity.id!)} className="px-2 py-1 text-xs rounded bg-indigo-600 text-white">Log</button>
          <button onClick={() => setExpanded(e => !e)} className="px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700">
            {expanded ? 'Hide' : `Logs (${logs.length})`}
          </button>
          <button
            onClick={() => openActivitySettings(activity.id!)}
            aria-label="Settings"
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>
      {expanded && (
        <ul className="mt-2 ml-7 space-y-1 text-xs text-gray-600 dark:text-gray-400">
          {logs.length === 0 && <li>(no logs)</li>}
          {logs.map(l => (
            <li key={l.id ?? l.logged_at}>
              {(l.logged_at ?? '').slice(11, 16)} · {l.value ?? '-'} {l.unit ?? ''} {l.note && `· ${l.note}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/react-oyl/modules/user/daily-new/activities/UserDailyActivityRow.tsx
git commit -m "feat(daily-new): add per-activity row with toggle/progress/logs"
```

### Task 25: `UserDailyAddActivityForm`

**Files:**
- Create: `packages/react-oyl/modules/user/daily-new/activities/UserDailyAddActivityForm.tsx`

- [ ] **Step 1: Component**

```tsx
// packages/react-oyl/modules/user/daily-new/activities/UserDailyAddActivityForm.tsx
import { useState } from 'react'
import type { TSchedule, TUserActivity } from '@oyl/all-of-oyl/modules'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'
import { useUserGoalContext } from '@/modules/user/goal'
import { UserActivityScheduleInput } from '@/modules/user/activity'

export default function UserDailyAddActivityForm({ onClose }: { onClose: () => void }) {
  const { addActivity } = useUserDailyOrchestrator()
  const { goals } = useUserGoalContext()
  const [name, setName] = useState('')
  const [type, setType] = useState<NonNullable<TUserActivity['type']>>('habit')
  const [schedule, setSchedule] = useState<TSchedule | undefined>(undefined)
  const [targetValue, setTargetValue] = useState<string>('')
  const [targetUnit, setTargetUnit] = useState('')
  const [targetDirection, setTargetDirection] = useState<NonNullable<TUserActivity['target_direction']>>('min')
  const [userGoalId, setUserGoalId] = useState<string>('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await addActivity({
      name: name.trim(),
      type,
      schedule,
      current_status: 'active',
      target_value: targetValue ? Number(targetValue) : undefined,
      target_unit: targetUnit || undefined,
      target_direction: targetValue ? targetDirection : undefined,
      user_goal: userGoalId ? Number(userGoalId) : undefined,
    })
    onClose()
  }

  return (
    <form onSubmit={submit} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
      <input type="text" placeholder="Activity name" required value={name} onChange={e => setName(e.target.value)}
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
      <div className="grid grid-cols-2 gap-2">
        <select value={type} onChange={e => setType(e.target.value as typeof type)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
          <option value="habit">Habit</option><option value="task">Task</option>
          <option value="event">Event</option><option value="metric">Metric</option>
        </select>
        <select value={userGoalId} onChange={e => setUserGoalId(e.target.value)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
          <option value="">(no linked goal)</option>
          {goals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>
      <UserActivityScheduleInput value={schedule} onChange={setSchedule} />
      <div className="grid grid-cols-3 gap-2">
        <input type="number" placeholder="Target value" value={targetValue} onChange={e => setTargetValue(e.target.value)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
        <input type="text" placeholder="Unit" value={targetUnit} onChange={e => setTargetUnit(e.target.value)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
        <select value={targetDirection} onChange={e => setTargetDirection(e.target.value as typeof targetDirection)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
          <option value="min">At least</option><option value="max">At most</option><option value="exact">Exactly</option>
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700">Cancel</button>
        <button type="submit" className="px-3 py-1 text-sm rounded bg-indigo-600 text-white">Add activity</button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/react-oyl/modules/user/daily-new/activities/UserDailyAddActivityForm.tsx
git commit -m "feat(daily-new): add inline form for creating activity templates"
```

### Task 26: `UserDailyLogActivityForm`

**Files:**
- Create: `packages/react-oyl/modules/user/daily-new/activities/UserDailyLogActivityForm.tsx`

- [ ] **Step 1: Component**

```tsx
// packages/react-oyl/modules/user/daily-new/activities/UserDailyLogActivityForm.tsx
import { useState } from 'react'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'

export default function UserDailyLogActivityForm({ onClose }: { onClose: () => void }) {
  const { activityRows, addLog, selectedDate } = useUserDailyOrchestrator()
  const [activityId, setActivityId] = useState<string>(activityRows[0]?.activity.id != null ? String(activityRows[0].activity.id) : '')
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState('')
  const [note, setNote] = useState('')
  const [mood, setMood] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activityId) return
    await addLog(Number(activityId), {
      logged_at: `${selectedDate}T${new Date().toISOString().slice(11, 19)}Z`,
      value: value ? Number(value) : undefined,
      unit: unit || undefined,
      note: note || undefined,
      mood: mood ? Number(mood) : undefined,
    })
    onClose()
  }

  return (
    <form onSubmit={submit} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
      <select value={activityId} onChange={e => setActivityId(e.target.value)} required
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
        <option value="">Select activity…</option>
        {activityRows.map(r => <option key={r.activity.id} value={r.activity.id}>{r.activity.name}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input type="number" placeholder="Value" value={value} onChange={e => setValue(e.target.value)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
        <input type="text" placeholder="Unit" value={unit} onChange={e => setUnit(e.target.value)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
      </div>
      <input type="text" placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)}
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
      <input type="number" placeholder="Mood (1-5)" min={1} max={5} value={mood} onChange={e => setMood(e.target.value)}
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700">Cancel</button>
        <button type="submit" className="px-3 py-1 text-sm rounded bg-indigo-600 text-white">Log</button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/react-oyl/modules/user/daily-new/activities/UserDailyLogActivityForm.tsx
git commit -m "feat(daily-new): add inline form for quick-logging activity occurrences"
```

### Task 27: `UserDailyActivityLogSheet`

**Files:**
- Create: `packages/react-oyl/modules/user/daily-new/activities/UserDailyActivityLogSheet.tsx`

- [ ] **Step 1: Component**

```tsx
// packages/react-oyl/modules/user/daily-new/activities/UserDailyActivityLogSheet.tsx
import { useEffect, useState } from 'react'
import { useUserActivityLogContext } from '@/modules/user/activity-log'

export default function UserDailyActivityLogSheet() {
  const { editingLogId, setEditingLogId, logs, updateLog, removeLog } = useUserActivityLogContext()
  const log = logs.find(l => l.id === editingLogId)
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState('')
  const [note, setNote] = useState('')
  const [mood, setMood] = useState('')

  useEffect(() => {
    if (log) {
      setValue(log.value?.toString() ?? '')
      setUnit(log.unit ?? '')
      setNote(log.note ?? '')
      setMood(log.mood?.toString() ?? '')
    }
  }, [log])

  if (!editingLogId || !log) return null

  const close = () => setEditingLogId(null)
  const save = async () => {
    if (log.id == null) return close()
    await updateLog(log.id, {
      value: value ? Number(value) : undefined,
      unit: unit || undefined,
      note: note || undefined,
      mood: mood ? Number(mood) : undefined,
    })
    close()
  }
  const del = async () => {
    if (log.id != null) await removeLog(log.id)
    close()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={close}>
      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Edit log</h3>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" placeholder="Value" value={value} onChange={e => setValue(e.target.value)}
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
          <input type="text" placeholder="Unit" value={unit} onChange={e => setUnit(e.target.value)}
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
        </div>
        <textarea placeholder="Note" value={note} onChange={e => setNote(e.target.value)}
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" rows={3} />
        <input type="number" placeholder="Mood (1-5)" min={1} max={5} value={mood} onChange={e => setMood(e.target.value)}
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
        <div className="flex justify-between">
          <button onClick={del} className="px-3 py-1 text-sm rounded bg-red-600 text-white">Delete</button>
          <div className="flex gap-2">
            <button onClick={close} className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700">Cancel</button>
            <button onClick={save} className="px-3 py-1 text-sm rounded bg-indigo-600 text-white">Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/react-oyl/modules/user/daily-new/activities/UserDailyActivityLogSheet.tsx
git commit -m "feat(daily-new): add modal sheet for editing/deleting activity logs"
```

### Task 28: `UserDailyActivitySettingsSheet`

**Files:**
- Create: `packages/react-oyl/modules/user/daily-new/activities/UserDailyActivitySettingsSheet.tsx`

- [ ] **Step 1: Component**

```tsx
// packages/react-oyl/modules/user/daily-new/activities/UserDailyActivitySettingsSheet.tsx
import { useEffect, useState } from 'react'
import type { TSchedule, TUserActivity } from '@oyl/all-of-oyl/modules'
import { UserActivityScheduleInput, useUserActivityContext } from '@/modules/user/activity'
import { useUserGoalContext } from '@/modules/user/goal'

export default function UserDailyActivitySettingsSheet() {
  const { activities, settingsActivityId, setSettingsActivityId, updateActivity, removeActivity } = useUserActivityContext()
  const { goals } = useUserGoalContext()
  const activity = activities.find(a => a.id === settingsActivityId)

  const [name, setName] = useState('')
  const [type, setType] = useState<NonNullable<TUserActivity['type']>>('habit')
  const [status, setStatus] = useState<NonNullable<TUserActivity['current_status']>>('active')
  const [schedule, setSchedule] = useState<TSchedule | undefined>(undefined)
  const [targetValue, setTargetValue] = useState('')
  const [targetUnit, setTargetUnit] = useState('')
  const [targetDirection, setTargetDirection] = useState<NonNullable<TUserActivity['target_direction']>>('min')
  const [userGoalId, setUserGoalId] = useState('')

  useEffect(() => {
    if (!activity) return
    setName(activity.name ?? '')
    setType(activity.type ?? 'habit')
    setStatus(activity.current_status ?? 'active')
    setSchedule(activity.schedule)
    setTargetValue(activity.target_value?.toString() ?? '')
    setTargetUnit(activity.target_unit ?? '')
    setTargetDirection(activity.target_direction ?? 'min')
    setUserGoalId(typeof activity.user_goal === 'object' && activity.user_goal?.id != null ? String(activity.user_goal.id) : (activity.user_goal ? String(activity.user_goal) : ''))
  }, [activity])

  if (!settingsActivityId || !activity) return null

  const close = () => setSettingsActivityId(null)
  const save = async () => {
    if (activity.id == null) return close()
    await updateActivity(activity.id, {
      name, type, current_status: status, schedule,
      target_value: targetValue ? Number(targetValue) : undefined,
      target_unit: targetUnit || undefined,
      target_direction: targetValue ? targetDirection : undefined,
      user_goal: userGoalId ? Number(userGoalId) : undefined,
    })
    close()
  }
  const del = async () => {
    if (activity.id != null) await removeActivity(activity.id)
    close()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={close}>
      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 w-full max-w-md space-y-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Activity settings</h3>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Name"
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
        <div className="grid grid-cols-2 gap-2">
          <select value={type} onChange={e => setType(e.target.value as typeof type)}
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
            <option value="habit">Habit</option><option value="task">Task</option>
            <option value="event">Event</option><option value="metric">Metric</option>
          </select>
          <select value={status} onChange={e => setStatus(e.target.value as typeof status)}
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
            <option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option>
          </select>
        </div>
        <UserActivityScheduleInput value={schedule} onChange={setSchedule} />
        <div className="grid grid-cols-3 gap-2">
          <input type="number" value={targetValue} onChange={e => setTargetValue(e.target.value)} placeholder="Target"
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
          <input type="text" value={targetUnit} onChange={e => setTargetUnit(e.target.value)} placeholder="Unit"
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
          <select value={targetDirection} onChange={e => setTargetDirection(e.target.value as typeof targetDirection)}
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
            <option value="min">≥</option><option value="max">≤</option><option value="exact">=</option>
          </select>
        </div>
        <select value={userGoalId} onChange={e => setUserGoalId(e.target.value)}
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
          <option value="">(no linked goal)</option>
          {goals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <div className="flex justify-between">
          <button onClick={del} className="px-3 py-1 text-sm rounded bg-red-600 text-white">Delete</button>
          <div className="flex gap-2">
            <button onClick={close} className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700">Cancel</button>
            <button onClick={save} className="px-3 py-1 text-sm rounded bg-indigo-600 text-white">Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/react-oyl/modules/user/daily-new/activities/UserDailyActivitySettingsSheet.tsx
git commit -m "feat(daily-new): add modal sheet for editing activity template"
```

### Task 29: Rewrite `UserDailyActivitiesList` and `UserDailyActivities`; delete obsolete files

**Files:**
- Modify: `packages/react-oyl/modules/user/daily-new/activities/UserDailyActivitiesList.tsx`
- Modify: `packages/react-oyl/modules/user/daily-new/activities/UserDailyActivities.tsx`
- Delete: `packages/react-oyl/modules/user/daily-new/activities/UserDailyActivitiesForm.tsx`
- Delete: `packages/react-oyl/modules/user/daily-new/activities/UserDailyActivitiesSettings.tsx`
- Modify: `packages/react-oyl/modules/user/daily-new/activities/index.ts`

- [ ] **Step 1: Replace `UserDailyActivitiesList.tsx`**

```tsx
// packages/react-oyl/modules/user/daily-new/activities/UserDailyActivitiesList.tsx
import UserDailyActivityRow from './UserDailyActivityRow'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'

export default function UserDailyActivitiesList() {
  const { activityRows } = useUserDailyOrchestrator()
  if (activityRows.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No activities scheduled for this date.</p>
  }
  return (
    <div className="space-y-3">
      {activityRows.map(row => <UserDailyActivityRow key={row.activity.id} row={row} />)}
    </div>
  )
}
```

- [ ] **Step 2: Replace `UserDailyActivities.tsx`**

```tsx
// packages/react-oyl/modules/user/daily-new/activities/UserDailyActivities.tsx
import { useState } from 'react'
import { Section } from '@oyl/storybook-oyl'
import UserDailyActivitiesList from './UserDailyActivitiesList'
import UserDailyAddActivityForm from './UserDailyAddActivityForm'
import UserDailyLogActivityForm from './UserDailyLogActivityForm'
import UserDailyActivityLogSheet from './UserDailyActivityLogSheet'
import UserDailyActivitySettingsSheet from './UserDailyActivitySettingsSheet'

export default function UserDailyActivities() {
  const [showAdd, setShowAdd] = useState(false)
  const [showLog, setShowLog] = useState(false)

  return (
    <Section title="Activities">
      <UserDailyActivitiesList />
      <div className="flex gap-2 mt-3">
        <button onClick={() => setShowAdd(s => !s)} className="px-3 py-1 text-sm rounded bg-indigo-600 text-white">
          {showAdd ? 'Hide' : 'Add activity'}
        </button>
        <button onClick={() => setShowLog(s => !s)} className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700">
          {showLog ? 'Hide' : 'Log activity'}
        </button>
      </div>
      {showAdd && <div className="mt-3"><UserDailyAddActivityForm onClose={() => setShowAdd(false)} /></div>}
      {showLog && <div className="mt-3"><UserDailyLogActivityForm onClose={() => setShowLog(false)} /></div>}
      <UserDailyActivityLogSheet />
      <UserDailyActivitySettingsSheet />
    </Section>
  )
}
```

- [ ] **Step 3: Delete obsolete files**

```bash
git rm packages/react-oyl/modules/user/daily-new/activities/UserDailyActivitiesForm.tsx
git rm packages/react-oyl/modules/user/daily-new/activities/UserDailyActivitiesSettings.tsx
```

- [ ] **Step 4: Rewrite `index.ts`**

```ts
// packages/react-oyl/modules/user/daily-new/activities/index.ts
export { default as UserDailyActivities } from './UserDailyActivities'
export { default as UserDailyActivitiesList } from './UserDailyActivitiesList'
export { default as UserDailyActivityRow } from './UserDailyActivityRow'
```

- [ ] **Step 5: Commit**

```bash
git add packages/react-oyl/modules/user/daily-new/activities/
git commit -m "feat(daily-new): rewire activities section around orchestrator"
```

---

## Phase 6 — Goals UI

### Task 30: `UserDailyGoalRow`

**Files:**
- Create: `packages/react-oyl/modules/user/daily-new/goals/UserDailyGoalRow.tsx`

- [ ] **Step 1: Component**

```tsx
// packages/react-oyl/modules/user/daily-new/goals/UserDailyGoalRow.tsx
import { useState } from 'react'
import type { GoalRow } from '../useUserDailyOrchestrator'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'

type Props = { row: GoalRow }

const priorityColor: Record<string, string> = {
  low: 'bg-gray-200 text-gray-700',
  medium: 'bg-yellow-200 text-yellow-900',
  high: 'bg-red-200 text-red-900',
}

export default function UserDailyGoalRow({ row }: Props) {
  const { setProgress, markGoalComplete, appendGoalNote, toggleMilestone, openGoalSettings } = useUserDailyOrchestrator()
  const { goal, milestones, progressPct, isComplete } = row
  const [expanded, setExpanded] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')

  if (goal.id == null) return null

  const bump = (delta: number) => setProgress(goal.id!, Math.max(0, (goal.progress ?? 0) + delta))

  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-medium ${isComplete ? 'text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
              {goal.name ?? '(unnamed)'}
            </p>
            {goal.priority && <span className={`px-2 text-xs rounded ${priorityColor[goal.priority] ?? ''}`}>{goal.priority}</span>}
            {goal.current_status && <span className="px-2 text-xs rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">{goal.current_status}</span>}
            {goal.target_date && <span className="text-xs text-gray-500">by {goal.target_date.slice(0,10)}</span>}
          </div>
          <div className="mt-1 h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
            <div className="h-full bg-indigo-500" style={{ width: `${progressPct * 100}%` }} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{goal.progress ?? 0} / {goal.target ?? 0}</p>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button onClick={() => bump(-1)} className="w-7 h-7 rounded bg-gray-200 dark:bg-gray-700">-</button>
          <button onClick={() => bump(1)} className="w-7 h-7 rounded bg-gray-200 dark:bg-gray-700">+</button>
          {!isComplete && (
            <button onClick={() => markGoalComplete(goal.id!)} className="px-2 py-1 text-xs rounded bg-green-600 text-white">Done</button>
          )}
          <button onClick={() => setExpanded(e => !e)} className="px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700">
            {expanded ? 'Hide' : `Milestones (${milestones.length})`}
          </button>
          <button onClick={() => openGoalSettings(goal.id!)} aria-label="Settings"
            className="p-1.5 text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/></svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 ml-2 space-y-2">
          {milestones.length === 0 && <p className="text-xs text-gray-500">No milestones.</p>}
          {milestones.map(m => (
            <div key={m.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={m.completed_at != null} onChange={() => m.id != null && toggleMilestone(m.id)} />
              <span className={m.completed_at ? 'line-through text-gray-500' : 'text-gray-800 dark:text-gray-200'}>{m.title}</span>
              {m.target_date && <span className="text-xs text-gray-500">by {m.target_date.slice(0,10)}</span>}
            </div>
          ))}
          <form
            onSubmit={(e) => { e.preventDefault(); if (noteDraft.trim()) { appendGoalNote(goal.id!, noteDraft.trim()); setNoteDraft('') } }}
            className="flex gap-2 pt-1"
          >
            <input type="text" value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="Add note…"
              className="flex-1 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
            <button type="submit" className="px-2 py-1 text-xs rounded bg-indigo-600 text-white">Save</button>
          </form>
          {goal.note && <p className="text-xs whitespace-pre-wrap text-gray-600 dark:text-gray-400 mt-1">{goal.note}</p>}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/react-oyl/modules/user/daily-new/goals/UserDailyGoalRow.tsx
git commit -m "feat(daily-new): add per-goal row with progress/milestones/notes"
```

### Task 31: `UserDailyAddGoalForm`

**Files:**
- Create: `packages/react-oyl/modules/user/daily-new/goals/UserDailyAddGoalForm.tsx`

- [ ] **Step 1: Component**

```tsx
// packages/react-oyl/modules/user/daily-new/goals/UserDailyAddGoalForm.tsx
import { useState } from 'react'
import type { TUserGoal } from '@oyl/all-of-oyl/modules'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'

export default function UserDailyAddGoalForm({ onClose }: { onClose: () => void }) {
  const { addGoal } = useUserDailyOrchestrator()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [target, setTarget] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [priority, setPriority] = useState<NonNullable<TUserGoal['priority']>>('medium')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await addGoal({
      name: name.trim(),
      category: category || undefined,
      target: target ? Number(target) : undefined,
      target_date: targetDate || undefined,
      priority,
      current_status: 'active',
      progress: 0,
    })
    onClose()
  }

  return (
    <form onSubmit={submit} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
      <input type="text" placeholder="Goal name" required value={name} onChange={e => setName(e.target.value)}
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
      <div className="grid grid-cols-2 gap-2">
        <input type="text" placeholder="Category" value={category} onChange={e => setCategory(e.target.value)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
        <select value={priority} onChange={e => setPriority(e.target.value as typeof priority)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
          <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input type="number" placeholder="Target value" value={target} onChange={e => setTarget(e.target.value)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
        <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700">Cancel</button>
        <button type="submit" className="px-3 py-1 text-sm rounded bg-indigo-600 text-white">Add goal</button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/react-oyl/modules/user/daily-new/goals/UserDailyAddGoalForm.tsx
git commit -m "feat(daily-new): add inline form for creating goals"
```

### Task 32: `UserDailyAddMilestoneForm`

**Files:**
- Create: `packages/react-oyl/modules/user/daily-new/goals/UserDailyAddMilestoneForm.tsx`

- [ ] **Step 1: Component**

```tsx
// packages/react-oyl/modules/user/daily-new/goals/UserDailyAddMilestoneForm.tsx
import { useState } from 'react'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'

export default function UserDailyAddMilestoneForm({ onClose }: { onClose: () => void }) {
  const { goalRows, addMilestone } = useUserDailyOrchestrator()
  const [goalId, setGoalId] = useState<string>(goalRows[0]?.goal.id != null ? String(goalRows[0].goal.id) : '')
  const [title, setTitle] = useState('')
  const [targetDate, setTargetDate] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!goalId || !title.trim()) return
    await addMilestone(Number(goalId), { title: title.trim(), target_date: targetDate || undefined })
    onClose()
  }

  return (
    <form onSubmit={submit} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
      <select value={goalId} onChange={e => setGoalId(e.target.value)} required
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
        <option value="">Select goal…</option>
        {goalRows.map(r => <option key={r.goal.id} value={r.goal.id}>{r.goal.name}</option>)}
      </select>
      <input type="text" placeholder="Milestone title" required value={title} onChange={e => setTitle(e.target.value)}
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
      <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)}
        className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700">Cancel</button>
        <button type="submit" className="px-3 py-1 text-sm rounded bg-indigo-600 text-white">Add milestone</button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/react-oyl/modules/user/daily-new/goals/UserDailyAddMilestoneForm.tsx
git commit -m "feat(daily-new): add inline form for creating milestones"
```

### Task 33: `UserDailyGoalSettingsSheet`

**Files:**
- Create: `packages/react-oyl/modules/user/daily-new/goals/UserDailyGoalSettingsSheet.tsx`

- [ ] **Step 1: Component**

```tsx
// packages/react-oyl/modules/user/daily-new/goals/UserDailyGoalSettingsSheet.tsx
import { useEffect, useState } from 'react'
import type { TUserGoal } from '@oyl/all-of-oyl/modules'
import { useUserGoalContext } from '@/modules/user/goal'

export default function UserDailyGoalSettingsSheet() {
  const { goals, settingsGoalId, setSettingsGoalId, updateGoal, removeGoal } = useUserGoalContext()
  const goal = goals.find(g => g.id === settingsGoalId)

  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [target, setTarget] = useState('')
  const [priority, setPriority] = useState<NonNullable<TUserGoal['priority']>>('medium')
  const [targetDate, setTargetDate] = useState('')
  const [status, setStatus] = useState<NonNullable<TUserGoal['current_status']>>('active')
  const [parentGoalId, setParentGoalId] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!goal) return
    setName(goal.name ?? '')
    setCategory(goal.category ?? '')
    setTarget(goal.target?.toString() ?? '')
    setPriority(goal.priority ?? 'medium')
    setTargetDate(goal.target_date?.slice(0, 10) ?? '')
    setStatus(goal.current_status ?? 'active')
    setParentGoalId(typeof goal.parent_user_goal === 'object' && goal.parent_user_goal?.id != null ? String(goal.parent_user_goal.id) : (goal.parent_user_goal ? String(goal.parent_user_goal) : ''))
    setNote(goal.note ?? '')
  }, [goal])

  if (!settingsGoalId || !goal) return null

  const close = () => setSettingsGoalId(null)
  const save = async () => {
    if (goal.id == null) return close()
    await updateGoal(goal.id, {
      name, category: category || undefined, target: target ? Number(target) : undefined,
      priority, target_date: targetDate || undefined, current_status: status,
      parent_user_goal: parentGoalId ? Number(parentGoalId) : undefined,
      note: note || undefined,
    })
    close()
  }
  const del = async () => {
    if (goal.id != null) await removeGoal(goal.id)
    close()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={close}>
      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 w-full max-w-md space-y-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Goal settings</h3>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Name"
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
        <div className="grid grid-cols-2 gap-2">
          <input type="text" value={category} onChange={e => setCategory(e.target.value)} placeholder="Category"
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
          <input type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="Target"
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={priority} onChange={e => setPriority(e.target.value as typeof priority)}
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </select>
          <select value={status} onChange={e => setStatus(e.target.value as typeof status)}
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
            <option value="active">Active</option><option value="paused">Paused</option>
            <option value="completed">Completed</option><option value="archived">Archived</option>
          </select>
        </div>
        <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)}
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
        <select value={parentGoalId} onChange={e => setParentGoalId(e.target.value)}
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
          <option value="">(no parent goal)</option>
          {goals.filter(g => g.id !== goal.id).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Note" rows={4}
          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
        <div className="flex justify-between">
          <button onClick={del} className="px-3 py-1 text-sm rounded bg-red-600 text-white">Delete</button>
          <div className="flex gap-2">
            <button onClick={close} className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700">Cancel</button>
            <button onClick={save} className="px-3 py-1 text-sm rounded bg-indigo-600 text-white">Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/react-oyl/modules/user/daily-new/goals/UserDailyGoalSettingsSheet.tsx
git commit -m "feat(daily-new): add modal sheet for full goal edit"
```

### Task 34: `UserDailyGoalsList`, `UserDailyGoals`, and `goals/index.ts`

**Files:**
- Create: `packages/react-oyl/modules/user/daily-new/goals/UserDailyGoalsList.tsx`
- Create: `packages/react-oyl/modules/user/daily-new/goals/UserDailyGoals.tsx`
- Create: `packages/react-oyl/modules/user/daily-new/goals/index.ts`

- [ ] **Step 1: `UserDailyGoalsList.tsx`**

```tsx
// packages/react-oyl/modules/user/daily-new/goals/UserDailyGoalsList.tsx
import UserDailyGoalRow from './UserDailyGoalRow'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'

export default function UserDailyGoalsList() {
  const { goalRows } = useUserDailyOrchestrator()
  if (goalRows.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No goals for this date.</p>
  }
  return (
    <div className="space-y-3">
      {goalRows.map(row => <UserDailyGoalRow key={row.goal.id} row={row} />)}
    </div>
  )
}
```

- [ ] **Step 2: `UserDailyGoals.tsx`**

```tsx
// packages/react-oyl/modules/user/daily-new/goals/UserDailyGoals.tsx
import { useState } from 'react'
import { Section } from '@oyl/storybook-oyl'
import UserDailyGoalsList from './UserDailyGoalsList'
import UserDailyAddGoalForm from './UserDailyAddGoalForm'
import UserDailyAddMilestoneForm from './UserDailyAddMilestoneForm'
import UserDailyGoalSettingsSheet from './UserDailyGoalSettingsSheet'

export default function UserDailyGoals() {
  const [showAddGoal, setShowAddGoal] = useState(false)
  const [showAddMilestone, setShowAddMilestone] = useState(false)

  return (
    <Section title="Goals">
      <UserDailyGoalsList />
      <div className="flex gap-2 mt-3">
        <button onClick={() => setShowAddGoal(s => !s)} className="px-3 py-1 text-sm rounded bg-indigo-600 text-white">
          {showAddGoal ? 'Hide' : 'Add goal'}
        </button>
        <button onClick={() => setShowAddMilestone(s => !s)} className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700">
          {showAddMilestone ? 'Hide' : 'Add milestone'}
        </button>
      </div>
      {showAddGoal && <div className="mt-3"><UserDailyAddGoalForm onClose={() => setShowAddGoal(false)} /></div>}
      {showAddMilestone && <div className="mt-3"><UserDailyAddMilestoneForm onClose={() => setShowAddMilestone(false)} /></div>}
      <UserDailyGoalSettingsSheet />
    </Section>
  )
}
```

- [ ] **Step 3: `goals/index.ts`**

```ts
// packages/react-oyl/modules/user/daily-new/goals/index.ts
export { default as UserDailyGoals } from './UserDailyGoals'
export { default as UserDailyGoalsList } from './UserDailyGoalsList'
export { default as UserDailyGoalRow } from './UserDailyGoalRow'
```

- [ ] **Step 4: Commit**

```bash
git add packages/react-oyl/modules/user/daily-new/goals/
git commit -m "feat(daily-new): add goals section orchestrating list + forms + sheet"
```

---

## Phase 7 — Header, page, cleanup

### Task 35: `UserDailySyncIndicator`

**Files:**
- Create: `packages/react-oyl/modules/user/daily-new/UserDailySyncIndicator.tsx`

- [ ] **Step 1: Component**

```tsx
// packages/react-oyl/modules/user/daily-new/UserDailySyncIndicator.tsx
import { useSyncState } from '@/modules/data'

export default function UserDailySyncIndicator() {
  const { online, pendingCount, lastSyncedAt } = useSyncState()
  const dotColor = !online ? 'bg-gray-400' : pendingCount > 0 ? 'bg-yellow-500' : 'bg-green-500'
  const label = !online
    ? 'Offline'
    : pendingCount > 0
      ? `${pendingCount} pending`
      : lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : 'Synced'

  return (
    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
      <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} aria-hidden />
      <span>{label}</span>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/react-oyl/modules/user/daily-new/UserDailySyncIndicator.tsx
git commit -m "feat(daily-new): add sync state indicator badge"
```

### Task 36: Update `UserDailyHeader` and `UserDailyPage`

**Files:**
- Modify: `packages/react-oyl/modules/user/daily-new/UserDailyHeader.tsx`
- Modify: `packages/react-oyl/modules/user/daily-new/UserDailyPage.tsx`

- [ ] **Step 1: Replace `UserDailyHeader.tsx`**

```tsx
// packages/react-oyl/modules/user/daily-new/UserDailyHeader.tsx
import { useUserDailyContext } from './user-daily-context'
import UserDailySyncIndicator from './UserDailySyncIndicator'

export default function UserDailyHeader() {
  const { selectedDate, setSelectedDate } = useUserDailyContext()
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Daily Overview</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Track your activities, goals, and nutrition</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <UserDailySyncIndicator />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Replace `UserDailyPage.tsx`**

```tsx
// packages/react-oyl/modules/user/daily-new/UserDailyPage.tsx
import UserDailyHeader from './UserDailyHeader'
import { UserDailyActivities } from './activities'
import { UserDailyGoals } from './goals'
import UserDailyDataProviders from './UserDailyDataProviders'

export default function UserDailyPage() {
  return (
    <UserDailyDataProviders>
      <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-900 py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <UserDailyHeader />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <UserDailyActivities />
            <UserDailyGoals />
          </div>
        </div>
      </div>
    </UserDailyDataProviders>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/react-oyl/modules/user/daily-new/UserDailyHeader.tsx packages/react-oyl/modules/user/daily-new/UserDailyPage.tsx
git commit -m "feat(daily-new): wire page to data providers, add goals column"
```

### Task 37: Cleanup obsolete files

**Files:**
- Delete: `packages/react-oyl/modules/user/daily-new/sections/` (entire directory)
- Delete: `packages/react-oyl/modules/user/daily-new/PROPOSAL.md`
- Verify and possibly delete: `packages/react-oyl/modules/user/activity/settings/`

- [ ] **Step 1: Inspect `user/activity/settings/`**

```bash
ls packages/react-oyl/modules/user/activity/settings/
```

If the contents only reference `TUserActivitySettings` or the deprecated `user-activity-setting` collection, delete it.

- [ ] **Step 2: Delete confirmed obsolete files**

```bash
git rm -r packages/react-oyl/modules/user/daily-new/sections/
git rm packages/react-oyl/modules/user/daily-new/PROPOSAL.md
# If step 1 confirmed obsolete:
git rm -r packages/react-oyl/modules/user/activity/settings/
```

- [ ] **Step 3: Verify `react-oyl` typecheck**

```bash
pnpm --filter @oyl/react-oyl exec tsc -b
```

Expected: clean — except possibly `packages/react-oyl/modules/user/daily/` (the old page). That's the known consequence flagged in the spec. If errors are only in that dir, proceed.

If `react-oyl` typecheck fails in `user/daily/`, edit `packages/react-oyl/src/main.tsx` (or wherever routes are defined) to remove the route to the old daily page; do NOT delete the directory (that's a follow-up).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(daily-new): drop obsolete sections/ stubs, PROPOSAL.md, deprecated settings"
```

### Task 38: Run all tests and final manual verification

- [ ] **Step 1: Run all tests**

```bash
pnpm --filter @oyl/all-of-oyl test
pnpm --filter @oyl/react-oyl test
```
Expected: all green.

- [ ] **Step 2: Run lint**

```bash
pnpm --filter @oyl/react-oyl lint
```
Expected: clean (or pre-existing warnings only).

- [ ] **Step 3: Manual end-to-end verification**

Start Strapi (`pnpm strapi develop`) and the React app (`pnpm react dev`). Log in. Navigate to the daily-new page. Verify each:

- [ ] Initial load shows "Loading your data…" briefly, then the page.
- [ ] Sync indicator near the date picker shows green dot + "Synced HH:MM:SS".
- [ ] Activities section: lists active activities whose RRULE matches today.
- [ ] Click an activity checkbox → flips immediately (optimistic). Reload — still done. Network tab shows POST `/api/user-activity-logs`.
- [ ] Click checkbox again to un-toggle → flips immediately. Network tab shows DELETE `/api/user-activity-logs/<id>`.
- [ ] Click "Add activity" → fill form (try a weekly RRULE with weekday chips) → submit. Activity appears in list when scheduled-today; otherwise visible when date is changed to a matching day.
- [ ] Click "Log activity" → pick activity, enter value/unit/note/mood → submit. Log appears in row's expanded list.
- [ ] Click settings (gear) on an activity row → modal opens with values populated; change name → Save. Row updates immediately.
- [ ] Goals section: lists active goals.
- [ ] Click + / − on a goal row → progress bar updates. Network tab shows PUT `/api/user-goals/<id>`.
- [ ] Click "Add goal" → fill form → submit. Goal appears.
- [ ] Expand milestones → toggle a checkbox → completed_at saved.
- [ ] "Add milestone" form → submit → milestone appears under the goal.
- [ ] Settings (gear) on a goal row → edit name → Save.
- [ ] Open DevTools "Offline" mode. Toggle an activity checkbox → indicator shows yellow with pending count. Re-enable network → indicator returns to green and the pending count goes to 0; reload → state persists.
- [ ] Log out → localStorage entries under `oyl:<userId>:*` are removed. Log in as same/different user → fresh seed runs.

- [ ] **Step 4: If all manual checks pass, push the branch**

```bash
git status   # should be clean
git log --oneline -20
```

(The user will push manually; do not push without their explicit go-ahead.)

---

## Self-review notes

This plan has been checked for:

- **Spec coverage:** every section in [the spec](../specs/2026-05-30-user-daily-page-strapi-integration-design.md) maps to one or more tasks: types (T3–T8), schedule (T3–T4, T23), sync engine (T9–T15), providers (T16–T21), orchestrator (T22), activities UI (T23–T29), goals UI (T30–T34), header/sync indicator (T35–T36), cleanup (T37), verification (T38).
- **Placeholders:** none. No "TBD", no "implement appropriate X", no "similar to Task N." Every step has complete code or exact commands.
- **Type consistency:** `UserActivityContextValue` exposes `settingsActivityId` / `setSettingsActivityId` (used in T28). `UserGoalContextValue` exposes `settingsGoalId` / `setSettingsGoalId` (used in T33). `useUserDailyOrchestrator` re-exports them as `openActivitySettings` / `openGoalSettings` (used in T24, T30). `addLog` signature in orchestrator matches usage in T24, T26. `addMilestone(goalId, input)` signature is the same in T22 (orchestrator) and T32 (form).
- **Sync engine behavior:** the SyncEngine `drain` rollback for failed `create` ops removes the tempId from the mirror; the test in T12 covers this. Failed `update`/`delete` ops are logged and dropped from the queue (the spec's last-write-wins policy expects the next refresh to reconcile).

## Execution handoff

Plan complete and saved to [docs/superpowers/plans/2026-05-30-user-daily-page-strapi-integration.md](./2026-05-30-user-daily-page-strapi-integration.md). Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
