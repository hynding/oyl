# Proposal: Reusing `user/activity` context inside `user/daily-new`

## Goal

`user/daily-new` should render the activities section using the existing components and context from `user/activity` (`UserActivityProvider`, `useUserActivityContext`, `UserActivityItem`, `UserActivityForm`, `UserActivitySettingsForm`) **without modifying `user/daily`**. The daily provider should remain the single source of truth for "the day": which date is selected and what data has been fetched for that date. The activity provider should be the source of truth for "what you can do with one activity" (toggle, edit, settings modal, in-progress form).

## What's in the way today

[UserActivityProvider.tsx](modules/user/activity/UserActivityProvider.tsx) is **self-sufficient**: it owns `startDate`/`endDate`, calls `useData('user-activities')` to fetch its own list, and on every fetch overwrites `activities` state ([UserActivityProvider.tsx:120-124](modules/user/activity/UserActivityProvider.tsx#L120-L124)). Passing `items` ([UserActivityProvider.tsx:13](modules/user/activity/UserActivityProvider.tsx#L13)) only seeds initial state — the fetch immediately races and wins.

In daily-new, [UserDailyProvider.tsx](modules/user/daily-new/UserDailyProvider.tsx) already fetches `user-dailies` for the selected date and that payload already contains `activities`. So if we nest `UserActivityProvider` underneath, we have two fetchers, two date states, and a race.

The downstream pieces (`UserActivityItem`, `UserActivityForm`, `UserActivitySettingsForm`) are fine — they just consume context. The reuse question is really: **how does `UserActivityProvider` get its data and date from the daily provider instead of fetching its own?**

## Options

### Option A — Controlled-mode props on `UserActivityProvider` (recommended)

Teach `UserActivityProvider` two modes:

- **Uncontrolled** (today's behavior): no parent data — it owns the date and fetches `user-activities` itself. Used anywhere outside daily-new.
- **Controlled**: parent passes `activities`, `date`, and an `onChange(activities)` callback. The provider skips `useData` and skips the date state, and emits changes up instead of mutating local state. Used inside daily-new.

Wiring in daily-new looks like:

```tsx
// modules/user/daily-new/activities/UserDailyActivities.tsx
const { userDailyData, selectedDate, updateActivities } = useUserDailyContext()
return (
  <UserActivityProvider
    activities={userDailyData.activities}
    date={selectedDate}
    onChange={updateActivities}
  >
    <Section title="Activities">...</Section>
  </UserActivityProvider>
)
```

Internally `UserActivityProvider` becomes roughly:

```tsx
const isControlled = props.activities !== undefined
const [internal, setInternal] = useState(props.items ?? [])
const activities = isControlled ? props.activities : internal
const setActivities = isControlled ? props.onChange : setInternal
// gate the useData fetch + date useEffect on !isControlled
```

`UserDailyProvider` grows a `updateActivities(next)` that writes back to `userDailyData.activities` (and, when ready, persists via `useData('user-dailies').save`).

**Pros**
- One provider, one context, one set of consumer components — exactly the reuse the user asked for.
- `user/daily` is untouched.
- Standalone use of `UserActivityProvider` elsewhere keeps working unchanged.

**Cons**
- `UserActivityProvider` has to grow a small controlled/uncontrolled branch. Manageable, but it is a real change to a module outside `daily-new`.
- The provider's existing `startDate`/`endDate` API stays for standalone callers; in controlled mode it just mirrors `props.date`. Slight surface-area duplication.

### Option B — Adapter provider local to `daily-new`

Leave `user/activity` alone. Build a `UserDailyActivityAdapter` inside `daily-new` that:

1. Reads activities + date from `useUserDailyContext`.
2. Re-exports the **same `user-activity-context`** via `<context.Provider value={...}>`, filling it with handlers that mutate daily state.

```tsx
// modules/user/daily-new/activities/UserDailyActivityAdapter.tsx
import { context as activityContext } from '@/modules/user/activity/user-activity-context'
const { Provider } = activityContext
// build the same shape, but backed by useUserDailyContext
```

Consumers (`UserActivityItem`, `UserActivityForm`, …) still call `useUserActivityContext()` and don't know the difference.

**Pros**
- Zero changes to `user/activity`.
- Keeps the daily-specific behavior physically inside `daily-new`.

**Cons**
- Duplicates the handler logic (`toggleActivity`, `addActivity`, settings modal state, etc.) that `UserActivityProvider` already implements. Drift risk: bugs fixed in one don't fix the other.
- We have to import the raw `context` (not just `useUserActivityContext`) from `user/activity`, so `index.ts` needs to export it. Minor.

### Option C — Split `UserActivityProvider` into data + view layers

Extract a `useUserActivityState(initialItems, persist)` hook that owns *only* the local UI state (form open/closed, settings modal, draft activity). The current `UserActivityProvider` becomes a thin wrapper that combines `useUserActivityState` with `useData`. A new `UserActivityViewProvider` (also in `user/activity`) wraps `useUserActivityState` but takes `activities`/`onChange` from props — that's what daily-new uses.

**Pros**
- Cleanest separation; both standalone and embedded callers go through the same state hook.
- No "is this controlled?" branching inside one component.

**Cons**
- Biggest refactor of the three; touches `user/activity` the most.
- Probably overkill until there's a second embedder besides daily-new.

## Recommendation

Start with **Option A**. It gives daily-new the reuse it needs with the smallest change to `user/activity`, doesn't fork logic the way B does, and doesn't pre-commit to the larger refactor in C. If a third embedder shows up later, promote to Option C.

## Concrete file changes for Option A

1. `modules/user/activity/UserActivityProvider.tsx` — accept optional `activities`, `date`, `onChange` props; treat their presence as "controlled"; gate `useData` fetch and the date state on uncontrolled mode.
2. `modules/user/activity/user-activity-context.ts` — no change to the context shape; consumers stay the same.
3. `modules/user/daily-new/UserDailyProvider.tsx` — expose `updateActivities(next)` (in-memory for now; wire to `useData('user-dailies').save` when ready).
4. `modules/user/daily-new/user-daily-context.ts` — add `updateActivities` to the context type and default.
5. `modules/user/daily-new/activities/UserDailyActivities.tsx` — pass `activities`, `date`, `onChange` into `UserActivityProvider` instead of just `items`.
6. `modules/user/daily-new/activities/UserDailyActivitiesList.tsx` — drop the parallel read from `useUserDailyContext`; read from `useUserActivityContext` so the list, form, and settings all see the same list.

## Resolving the open questions

### 1. Persistence boundary — **activities own writes; daily reads**

The Strapi schema settles this. [user-daily/schema.json](../../../../strapi-oyl/src/api/user-daily/content-types/user-daily/schema.json) declares `activities` as `relation: oneToMany -> api::user-activity.user-activity`, and `user-activity` is its own top-level collection with its own `date`, `name`, `duration`, `data`. The day is a grouping, not the owner of activity rows.

So:

- `UserActivityProvider` keeps `useData('user-activities')` and is the writer for toggle/add/update/settings.
- `UserDailyProvider` is read-only for activities — it fetches the day (with the relation populated) and uses the response purely to **seed** the activity provider.
- This means controlled mode in Option A doesn't actually need a writeback `onChange` callback. Daily-new just passes the initial `activities` and `date`; the activity provider takes over and persists on its own.
- A consequence: after a write, `userDailyData.activities` on the daily provider goes stale until the next day refetch. That's fine — consumers should read from `useUserActivityContext()` (proposal change #6), not from daily. Daily's job ends after the seed.

This **simplifies** Option A: drop the `onChange` prop and the `updateActivities` addition to daily context (proposal changes #3 and #4 collapse to nothing). Controlled mode = "I'm seeding you, skip your fetch."

One caveat: today [useDataRemote.ts:36-38](../../../data/useDataRemote.ts#L36-L38) stubs `save` as a GET. Wiring real writes is a separate task, but the boundary above is what it should look like when it lands. Until then, mutations are local-only and that's OK for daily-new.

### 2. Settings modal — **stays in `UserActivityProvider`**

There's a dedicated [user-activity-setting](../../../../../strapi-oyl/src/api/user-activity-setting/) API alongside `user-activity`, so settings are a per-activity persisted concern — not a per-day one. The modal's open/closed UI state and the in-progress draft naturally live with the activity provider. Daily-new has no reason to know whether the settings sheet is open.

Action: leave the modal state where it is in [UserActivityProvider.tsx:46-85](../../user/activity/UserActivityProvider.tsx#L46-L85). When saves are wired, route `saveActivitySettings` through `useData('user-activity-settings')` (or whatever the established convention turns out to be), not through `user-dailies`.

### 3. Multiple days at once — **defer, but the controlled API already accommodates it**

Daily-new is single-date and likely to stay that way (it's "the day" page). The controlled-mode shape (`activities`, `date`) is per-render, so a future range view could mount multiple `UserActivityProvider`s — one per day — without any further change. The provider's own `startDate`/`endDate` fields stay for standalone callers (e.g., a future report page that wants its own range fetch) and are simply unused in controlled mode.

No work to do here; flagged just so the controlled-mode design doesn't accidentally close the door.

## Net effect on the file-change list

With the persistence boundary resolved, the Option A change list shrinks to:

1. `modules/user/activity/UserActivityProvider.tsx` — accept optional `activities` and `date`; when present, skip `useData.find` and skip date state. Internal writers (`toggleActivity`, `addActivity`, `saveActivitySettings`) keep using `useData('user-activities').save` regardless of mode.
2. `modules/user/daily-new/activities/UserDailyActivities.tsx` — pass `activities={userDailyData.activities}` and `date={selectedDate}` to `UserActivityProvider`.
3. `modules/user/daily-new/activities/UserDailyActivitiesList.tsx` — read from `useUserActivityContext`, not `useUserDailyContext`, so the list re-renders on activity-level mutations.

Items #3 and #4 from the original list (adding `updateActivities` to daily) drop out.
