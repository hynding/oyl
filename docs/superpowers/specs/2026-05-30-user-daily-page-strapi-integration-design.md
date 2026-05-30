# User Daily Page — Strapi Integration & Offline-First Sync

**Date:** 2026-05-30
**Scope:** `packages/react-oyl/modules/user/daily-new/` + supporting work in `modules/data/`, `modules/user/activity/`, `modules/user/goal/`, plus new `modules/user/activity-log/` and `modules/user/goal-milestone/`. Shared types in `packages/all-of-oyl/modules/user/`.

## Goal

The daily page (`UserDailyPage`) currently renders only an activities section seeded from a `user-daily` fetch. Goals and nutrition sections exist as empty stubs. The remote data layer is read-only (`useDataRemote.save` is stubbed to a GET), and several Strapi schema changes are in flight that the frontend doesn't yet reflect.

This work brings the daily page up to date with the current Strapi data model:

- Activities section uses the *new* activity model — `user-activity` is the recurring template (schedule, target, type, status, optional linked goal); `user-activity-log` is the per-occurrence record (`logged_at`, value, unit, note, mood, tags). Completion-today is derived from log existence; metric activities additionally show progress toward `target_value`.
- A new Goals section uses the *new* goal model — `user-goal` with `progress`/`target`/`category`/`priority`/`target_date`/`completed_at`/`note`/`parent_user_goal`, and `user-goal-milestone` as discrete checkpoints.
- Writes are real Strapi POST/PUT/DELETE (not stubbed).
- Offline-first: a localStorage mirror + write queue lets the page work disconnected and reconcile on reconnect.

Nutrition section is out of scope for this pass.

## Non-goals

- Modifying the existing `packages/react-oyl/modules/user/daily/` page. It will not compile after the type cleanup below; it will be left alone and deleted in a follow-up.
- A real CRDT/conflict resolution story. Sync uses last-write-wins.
- Background polling. Refresh-on-focus + manual refresh only.
- Pagination on initial mirror seed. Assume collections fit in single fetches; revisit if it bites.
- Surfacing `user-daily.journal` (Strapi blocks field) — deferred.
- Surfacing nutrition data — deferred.
- Drag-to-reorder milestones, tags picker on logs, emoji mood selector, nested sub-goal UI — all deferred.

## Deprecated (do not use)

Per the user, the following are being removed from the Strapi model and must not be referenced in the new code:

- Collections: `user-activity-setting`, `user-goal-setting`.
- `user-activity` fields: `date`, `duration`, `data`.
- `user-goal` field: `date`.

The replacements are `user-activity-log` (per-occurrence) and `user-goal-milestone` (per-checkpoint).

## Architecture

**Approach 3 — per-collection providers + an orchestrator hook** (preferred over a unified provider, which would fork logic, and over flat nesting, which would clutter the page).

- Each collection (`user-dailies`, `user-activities`, `user-activity-logs`, `user-goals`, `user-goal-milestones`) has its own context provider in `modules/user/<collection>/`. Providers are self-sufficient and reusable outside the daily page.
- A new `useUserDailyOrchestrator()` hook composes the five contexts into one flat API for the page. Page sections consume only the orchestrator; they never reach into individual contexts.
- Reads and writes flow through a new `SyncEngine` in `modules/data/sync/`. The mirror is always read first; writes are optimistic and queue against Strapi.

### Data flow

```
Strapi REST  <──────  SyncEngine (drain queue, refresh)
                          │
                          ▼
                    localStorage mirror
                          │
                          ▼
              useData(path).find() / .get(id)
                          │
                          ▼
         Per-collection providers (UserActivityProvider, etc.)
                          │
                          ▼
              useUserDailyOrchestrator()
                          │
                          ▼
         Daily page sections (Activities, Goals)
```

## Section 1 — Data model & types

### Updates

**`packages/all-of-oyl/modules/user/activity/user-activity-types.ts`**

Drop: `duration`, `timestamp`, `time`, `completed`, `progress`, `target`, `description`. Drop `TUserActivitySettings`.

New shape:

```ts
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
  schedule_target?: unknown   // json passthrough; not surfaced in UI v1
}
export type TUserActivityData = TUserActivity & TDataItem
```

**`packages/all-of-oyl/modules/user/goal/user-goal-types.ts`**

Drop: `completed`, `description`. Drop `TUserGoalSettings`.

New shape:

```ts
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

**`packages/all-of-oyl/modules/user/daily/user-daily-types.ts`** — unchanged. (`journal` deferred.)

### New modules

**`packages/all-of-oyl/modules/user/activity/schedule-types.ts`**

```ts
export type TSchedule = { rrule: string }   // iCal RRULE string
```

**`packages/all-of-oyl/modules/user/activity/schedule.ts`**

```ts
import { rrulestr } from 'rrule'

export const matchesDate = (schedule: TSchedule | undefined, date: string): boolean => {
  if (!schedule?.rrule) return false
  const rule = rrulestr(schedule.rrule)
  const start = new Date(`${date}T00:00:00Z`)
  const end = new Date(`${date}T23:59:59Z`)
  return rule.between(start, end, true).length > 0
}

export const describeSchedule = (schedule: TSchedule | undefined): string => {
  if (!schedule?.rrule) return 'No schedule'
  return rrulestr(schedule.rrule).toText()
}
```

**`packages/all-of-oyl/modules/user/activity-log/user-activity-log-types.ts`**

```ts
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

**`packages/all-of-oyl/modules/user/goal-milestone/user-goal-milestone-types.ts`**

```ts
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

### Dependency

Add `rrule@^2.8.0` to `packages/all-of-oyl/package.json` (small, dependency-free).

### Completion semantics (codified, not stored)

- Activity "done today" = `getLogsForActivity(activityId, selectedDate).length > 0`.
- Goal "complete" = `goal.completed_at != null`.

## Section 2 — Sync layer (`packages/react-oyl/modules/data/sync/`)

### Engine

A module-level singleton in `modules/data/sync/SyncEngine.ts`. Not a hook; not a context. Owns:

- localStorage-backed mirror per collection per user (`{userId}:{path}` → `Record<id, T>`).
- localStorage-backed outbound queue (`{userId}:__sync_queue__` → `QueuedOp[]`).
- An event emitter so React subscribers re-render when a collection changes.

API:

```ts
type QueuedOp =
  | { op: 'create'; path: string; tempId: string; body: any }
  | { op: 'update'; path: string; id: TDataId; body: any }
  | { op: 'delete'; path: string; id: TDataId }

interface SyncEngine {
  readAll<T>(path: string): T[]
  readOne<T>(path: string, id: TDataId): T | undefined
  enqueue(op: QueuedOp): void
  drain(): Promise<void>
  subscribe(path: string, cb: () => void): () => void
  refresh(path: string): Promise<void>
  refreshAll(): Promise<void>
  state(): SyncState
  setUser(userId: string | null): void   // sets active namespace; null on logout
  wipe(userId: string): void              // erase a user's mirror + queue (on logout)
}

type SyncState = { pendingCount: number; lastSyncedAt?: string; online: boolean }
```

### `useData(path)` rewrite

```ts
{
  find(): T[]                              // local mirror, reactive via subscribe
  get(id): T | undefined                   // local mirror, reactive
  save(record): Promise<T>                 // optimistic; assigns tempId for creates
  remove(id): Promise<void>                // optimistic tombstone + enqueue delete
  refresh(): Promise<void>                 // explicit re-fetch of this path
  syncState: SyncState
}
```

Component code no longer branches on `offline`. Reads always hit the mirror; writes always optimistic.

### Optimistic write flow

1. `useData('user-activity-logs').save({ user_activity, logged_at })` is called.
2. SyncEngine assigns `tempId = local-<uuid>`, inserts into mirror with `pendingOp: 'create'`, fires change event.
3. Subscribers re-render — checkbox flips immediately.
4. SyncEngine enqueues `{ op: 'create', path, tempId, body }` and persists the queue.
5. If online, drain runs:
   - 2xx: mirror entry's id swaps `tempId` → server id; `pendingOp` cleared. Any local relations that reference `tempId` are rewritten in-place.
   - 4xx/5xx: mirror entry removed; change event fires; UI un-flips; toast shown.
6. If offline, the op stays queued; drain runs on `online` transition.

### `useDataRemote` rewrite

`saveRequestFn` becomes a method dispatcher driven by the queued op. Provides:

- `create(path, body)` → `POST /api/<path>` with bearer token
- `update(path, id, body)` → `PUT /api/<path>/<id>`
- `remove(path, id)` → `DELETE /api/<path>/<id>`
- `findAll(path)` → existing GET
- `findOne(path, id)` → existing GET

SyncEngine calls these directly; not invoked through React.

### Bootstrap & online/offline binding

A `<SyncBootstrap />` component mounted inside `AppProvider`:

- On mount and on `auth.user.id` change: `SyncEngine.setUser(userId)`. If `userId` is null (logout), `wipe(previousUserId)` runs.
- On first set-user when online: `refreshAll()` (full seed of the five mirrored paths). Renders a blocking loading state until the seed finishes (per Section 7 decision 3).
- On first set-user when offline with no existing mirror for the user: render an "Offline — connect to load your data" empty state on the daily page. The page becomes usable as soon as connectivity returns and the seed completes.
- Subscribes to `window.online` / `window.offline` events and forwards into `useApp().setOffline(...)`; on `online` transitions, triggers `drain()` and `refreshAll()`.
- Subscribes to `window.focus` events; on focus while online, triggers `refreshAll()`.

### Mirror scope

- Full mirror for `user-activities`, `user-goals`, `user-goal-milestones`, `user-dailies` (bounded sizes).
- **Rolling 90-day window** for `user-activity-logs` — `refreshAll` requests logs with `logged_at >= today - 90d`. Older logs are not mirrored. (If a user views a date older than 90 days, logs for that date will be empty client-side. Acceptable for v1.)

### Conflict policy

Last-write-wins. If `refresh` returns a server record newer than the local mirror's *and* the local has no pending op, server wins silently. If local has a pending op, the queued op runs and "wins" once flushed.

### Logout / user switch

`SyncEngine.wipe(userId)` deletes that user's mirror and queue from localStorage. This runs on logout so a different user logging in on the same device starts fresh.

## Section 3 — Schedule module

Per Section 1; nothing additional. Lives in `all-of-oyl` so server-side or other clients can use the same RRULE evaluator later.

Schedule input UI lives in `react-oyl/modules/user/activity/UserActivityScheduleInput.tsx` — presets (Daily / Weekdays / Custom weekly with day chips) and a raw RRULE escape hatch. Emits `{ rrule: string }`.

## Section 4 — Per-collection providers

Five providers, one per collection. Each:

- Owns its context (created in a sibling `*-context.ts`).
- Sources data from `useData('<path>').find()` (sync engine-backed).
- Exposes mutation methods that call `useData('<path>').save / .remove`.
- Holds collection-local UI state (form open/closed, draft record, modal open) via a sibling `useUser*State.ts` hook.
- **Does not own `selectedDate`** — that belongs to `UserDailyProvider`.

| Provider | Path | Notes |
|---|---|---|
| `UserDailyProvider` | `react-oyl/modules/user/daily-new/UserDailyProvider.tsx` | Refactor. Owns `selectedDate`. `userDailyData` comes from `useData('user-dailies').get(date)`. Adds `updateDaily(patch)` for future journal writes (not used in v1). |
| `UserActivityProvider` | `react-oyl/modules/user/activity/UserActivityProvider.tsx` | Refactor. Drops inline `useData` fetch and start/end-date state. Sources `activities` from `useData('user-activities').find()`. Keeps activity-form / settings-sheet UI state. `UserActivityViewProvider` is **deleted**. |
| `UserActivityLogProvider` | `react-oyl/modules/user/activity-log/UserActivityLogProvider.tsx` | New. Methods: `getLogsForActivity(activityId, date)`, `addLog`, `updateLog`, `removeLog`. UI state: log-edit sheet open + draft. |
| `UserGoalProvider` | `react-oyl/modules/user/goal/UserGoalProvider.tsx` | New. Methods: `getGoal`, `addGoal`, `updateGoal`, `removeGoal`, `markComplete`, `setProgress`, `appendNote`. UI state: goal-form + settings-sheet open + drafts. Existing standalone `useUserGoals.ts` folded in. |
| `UserGoalMilestoneProvider` | `react-oyl/modules/user/goal-milestone/UserGoalMilestoneProvider.tsx` | New. Methods: `getMilestonesForGoal`, `addMilestone`, `toggleMilestone`, `removeMilestone`, `reorderMilestones`. UI state: milestone-form sheet + draft. |

### Compose helper

```tsx
// react-oyl/modules/user/daily-new/UserDailyDataProviders.tsx
export default function UserDailyDataProviders({ children }: { children: ReactNode }) {
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

`UserDailyPage` mounts this and renders `<UserDailyHeader />`, `<UserDailyActivities />`, `<UserDailyGoals />` inside.

## Section 5 — Orchestrator hook

Lives at `react-oyl/modules/user/daily-new/useUserDailyOrchestrator.ts`. Pure composition — no state of its own.

### Row shapes

```ts
export type ActivityRow = {
  activity: TUserActivityData
  logs: TUserActivityLogData[]      // for selectedDate
  isDone: boolean                    // logs.length > 0
  // Present only when activity has target_value. `value` is the sum of `logs[*].value`.
  progress?: { value: number; target: number; direction: 'min' | 'max' | 'exact' }
}

export type GoalRow = {
  goal: TUserGoalData
  milestones: TUserGoalMilestoneData[]
  progressPct: number
  isComplete: boolean
}
```

### API

```ts
{
  selectedDate: string
  setSelectedDate: (d: string) => void
  syncState: SyncState

  activityRows: ActivityRow[]
  addActivity: (input: Partial<TUserActivity>) => Promise<void>
  addLog: (activityId: TDataId, input?: Partial<TUserActivityLog>) => Promise<void>
  toggleDone: (activityId: TDataId) => Promise<void>
  updateLog: (logId: TDataId, patch: Partial<TUserActivityLog>) => Promise<void>
  removeLog: (logId: TDataId) => Promise<void>
  openActivitySettings: (activityId: TDataId) => void

  goalRows: GoalRow[]
  addGoal: (input: Partial<TUserGoal>) => Promise<void>
  updateGoal: (goalId: TDataId, patch: Partial<TUserGoal>) => Promise<void>
  setProgress: (goalId: TDataId, value: number) => Promise<void>
  appendGoalNote: (goalId: TDataId, text: string) => Promise<void>
  markGoalComplete: (goalId: TDataId) => Promise<void>
  addMilestone: (goalId: TDataId, input: Partial<TUserGoalMilestone>) => Promise<void>
  toggleMilestone: (milestoneId: TDataId) => Promise<void>
  openGoalSettings: (goalId: TDataId) => void
}
```

### Filter & union — activities

```ts
const allActivities = useUserActivityContext().activities
const dailyPins = useUserDailyContext().userDailyData.activities

const todayActivities = useMemo(() => {
  const pinIds = new Set(dailyPins.map(a => typeof a === 'object' ? a.id : a))
  return allActivities.filter(a =>
    a.current_status === 'active' &&
    (matchesDate(a.schedule, selectedDate) || pinIds.has(a.id))
  )
}, [allActivities, dailyPins, selectedDate])
```

### Filter & union — goals

```ts
const todayGoals = useMemo(() => {
  const pinIds = new Set(dailyPins.map(g => typeof g === 'object' ? g.id : g))
  return allGoals.filter(g =>
    (g.current_status === 'active' && (!g.target_date || g.target_date >= selectedDate)) ||
    pinIds.has(g.id)
  )
}, [allGoals, dailyPins, selectedDate])
```

### Toggle-done implementation

```ts
toggleDone(activityId):
  const existing = getLogsForActivity(activityId, selectedDate)
  if (existing.length > 0) return removeLog(existing[0].id)
  return addLog(activityId, { logged_at: `${selectedDate}T12:00:00Z`, user_activity: activityId })
```

Single-click "done" creates a zero-data log at noon-UTC. Richer logging (value, note, mood) happens via the log edit sheet.

## Section 6 — UI components

### Activities (`react-oyl/modules/user/daily-new/activities/`)

| File | Status | Purpose |
|---|---|---|
| `UserDailyActivities.tsx` | rewrite | Section wrapper. Renders list + add affordances + log sheet + settings sheet. |
| `UserDailyActivitiesList.tsx` | rewrite | Maps `activityRows[]` → `<UserDailyActivityRow>`. |
| `UserDailyActivityRow.tsx` | **new** | Per-row: checkbox (isDone), name, schedule label, progress bar when metric, "log" button, "settings" button, expandable list of today's logs. |
| `UserDailyAddActivityForm.tsx` | **new** | Inline form: name, type, RRULE picker, target_value/unit/direction, optional linked goal. Calls `addActivity`. |
| `UserDailyLogActivityForm.tsx` | **new** | Inline form: activity picker (today's eligible activities), value, unit, note, mood. Calls `addLog`. |
| `UserDailyActivityLogSheet.tsx` | **new** | Sheet for editing a single log: value, unit, note, mood, tags. |
| `UserDailyActivitySettingsSheet.tsx` | **new** | Sheet for editing the activity template (full edit + delete). |
| `UserDailyActivitiesForm.tsx` | **delete** | Replaced by the two split forms. |
| `UserDailyActivitiesSettings.tsx` | **delete** | Replaced by sheet. |
| `index.ts` | rewrite | Re-exports. |

### Goals (`react-oyl/modules/user/daily-new/goals/` — all new)

| File | Purpose |
|---|---|
| `UserDailyGoals.tsx` | Section wrapper. |
| `UserDailyGoalsList.tsx` | Maps `goalRows[]` → `<UserDailyGoalRow>`. |
| `UserDailyGoalRow.tsx` | Row: name, status pill, priority pill, target_date, progress bar with +/- buttons (`setProgress`), "mark complete" button, expandable milestones list with toggles, note appender. |
| `UserDailyAddGoalForm.tsx` | Inline form: name, category, target, target_date, priority. |
| `UserDailyAddMilestoneForm.tsx` | Inline form: goal picker, title, target_date. |
| `UserDailyGoalSettingsSheet.tsx` | Full edit modal + delete. |
| `index.ts` | Re-exports. |

### Shared / cross-cutting

| File | Purpose |
|---|---|
| `react-oyl/modules/user/activity/UserActivityScheduleInput.tsx` | **new** — RRULE picker (presets + raw escape hatch). |
| `react-oyl/modules/user/daily-new/UserDailySyncIndicator.tsx` | **new** — small badge next to date picker: green dot + `lastSyncedAt` online, yellow with pending count when queue non-empty, gray "Offline" when disconnected. Daily-page-only for v1. |
| `react-oyl/modules/user/daily-new/UserDailyHeader.tsx` | Edit — mounts `UserDailySyncIndicator` alongside the date input. |
| `react-oyl/modules/user/daily-new/UserDailyPage.tsx` | Edit — wraps content in `<UserDailyDataProviders>`, switches grid to `lg:grid-cols-2`. |

### Cleanup

- Delete `react-oyl/modules/user/daily-new/sections/` (unused stubs).
- Delete `react-oyl/modules/user/daily-new/PROPOSAL.md` (superseded by this spec).
- Delete `react-oyl/modules/user/activity/UserActivityViewProvider.tsx`.
- Verify `react-oyl/modules/user/activity/settings/`; delete if tied only to the deprecated `user-activity-setting` collection.

### Known consequence

`react-oyl/modules/user/daily/` uses `UserActivityProvider` standalone and references deprecated fields (`duration`, `time`, `completed`). After the type cleanup it won't compile. **It will be left alone in this work and deleted in a follow-up.**

## Section 7 — Decisions on open questions

1. **Sync indicator placement** — daily-page-only (next to date picker). Not app-wide.
2. **Logout behavior** — wipe the mirror + queue.
3. **Initial seed UX** — block the daily page until the seed finishes (option a). Show a centered loading state.

## Section 8 — Full file inventory

### `packages/all-of-oyl/`

| Path | Action |
|---|---|
| `package.json` | add `rrule` dep |
| `modules/user/activity/user-activity-types.ts` | rewrite |
| `modules/user/activity/schedule-types.ts` | new |
| `modules/user/activity/schedule.ts` | new |
| `modules/user/activity/index.ts` | re-export new modules |
| `modules/user/activity-log/user-activity-log-types.ts` | new |
| `modules/user/activity-log/index.ts` | new |
| `modules/user/goal/user-goal-types.ts` | rewrite |
| `modules/user/goal-milestone/user-goal-milestone-types.ts` | new |
| `modules/user/goal-milestone/index.ts` | new |
| `modules/user/index.ts` | re-export `activity-log`, `goal-milestone` |

### `packages/react-oyl/modules/data/`

| Path | Action |
|---|---|
| `sync/SyncEngine.ts` | new |
| `sync/types.ts` | new |
| `sync/storage.ts` | new |
| `sync/SyncBootstrap.tsx` | new |
| `useData.ts` | rewrite |
| `useDataRemote.ts` | rewrite |
| `useDataLocal.ts` | delete — superseded by `SyncEngine` + `sync/storage.ts` |
| `index.ts` | export `syncState` hook + types |

### `packages/react-oyl/modules/app/`

| Path | Action |
|---|---|
| `AppProvider.tsx` | edit — mount `<SyncBootstrap/>`; bind `window.online/offline` |

### `packages/react-oyl/modules/user/activity/`

| Path | Action |
|---|---|
| `UserActivityProvider.tsx` | rewrite |
| `useUserActivityState.ts` | edit (adapt to new field set) |
| `UserActivityViewProvider.tsx` | delete |
| `useUserActivities.ts` | edit — thin re-export of context |
| `UserActivityScheduleInput.tsx` | new |
| `settings/` | verify; delete if tied to deprecated `user-activity-setting` |

### `packages/react-oyl/modules/user/activity-log/` (new)

`UserActivityLogProvider.tsx`, `user-activity-log-context.ts`, `useUserActivityLogState.ts`, `index.ts`.

### `packages/react-oyl/modules/user/goal/`

`UserGoalProvider.tsx` (new), `user-goal-context.ts` (new), `useUserGoalState.ts` (new), `index.ts` (new). Fold existing `useUserGoals.ts` into the provider.

### `packages/react-oyl/modules/user/goal-milestone/` (new)

`UserGoalMilestoneProvider.tsx`, `user-goal-milestone-context.ts`, `useUserGoalMilestoneState.ts`, `index.ts`.

### `packages/react-oyl/modules/user/daily-new/`

| Path | Action |
|---|---|
| `UserDailyPage.tsx` | edit |
| `UserDailyProvider.tsx` | edit |
| `UserDailyHeader.tsx` | edit |
| `UserDailyDataProviders.tsx` | new |
| `UserDailySyncIndicator.tsx` | new |
| `useUserDailyOrchestrator.ts` | new |
| `user-daily-context.ts` | unchanged shape |
| `activities/UserDailyActivities.tsx` | rewrite |
| `activities/UserDailyActivitiesList.tsx` | rewrite |
| `activities/UserDailyActivityRow.tsx` | new |
| `activities/UserDailyAddActivityForm.tsx` | new |
| `activities/UserDailyLogActivityForm.tsx` | new |
| `activities/UserDailyActivityLogSheet.tsx` | new |
| `activities/UserDailyActivitySettingsSheet.tsx` | new |
| `activities/UserDailyActivitiesForm.tsx` | delete |
| `activities/UserDailyActivitiesSettings.tsx` | delete |
| `activities/index.ts` | rewrite |
| `goals/UserDailyGoals.tsx` | new |
| `goals/UserDailyGoalsList.tsx` | new |
| `goals/UserDailyGoalRow.tsx` | new |
| `goals/UserDailyAddGoalForm.tsx` | new |
| `goals/UserDailyAddMilestoneForm.tsx` | new |
| `goals/UserDailyGoalSettingsSheet.tsx` | new |
| `goals/index.ts` | new |
| `sections/` | delete entire directory |
| `PROPOSAL.md` | delete |
| `user-daily.module.css` | edit as needed |

## Risks & open issues to revisit during implementation

- **`rrule` package size on initial bundle.** ~50KB minified. Acceptable; flagged.
- **localStorage size.** Mirror grows with usage. With the 90-day log window, expected to stay well under the 5MB limit per origin for realistic users. Monitor; consider IndexedDB if it becomes a problem.
- **Initial-seed blocking UX.** If a user has slow network and a large mirror, the blocking spinner may feel long. Consider adding a "stale data is OK, render now" escape after N seconds in a follow-up.
- **Old `user/daily/` page breaks.** Type-level only — runtime fine until someone navigates to it. Cleanup is a separate task.
- **`tags` relation on logs.** Surfaced in the type but no UI in v1; ensure SyncEngine handles relations passed by id correctly when posting.
- **Pin-list write path.** This spec covers reading from `user-daily.activities`/`goals` pins but does not add a UI to *create* pins. Pin management is out of scope for v1; pins seeded via the Strapi admin or by other flows still work.
