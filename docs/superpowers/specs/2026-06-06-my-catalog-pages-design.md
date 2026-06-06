# /my/activities and /my/goals catalog pages

**Date:** 2026-06-06
**Scope:** Two standalone catalog pages in `@oyl/react-oyl` that consume the inverted domain primitives without the daily orchestrator.

## Motivation

The activity, goal, and nutrition daily wrappers have been inverted into context-free primitives under `modules/user/<domain>/`. The point of that inversion was to let a standalone "manage your library" surface reuse the same components. This spec ships the first cut: catalog pages for activities and goals at `/my/activities` and `/my/goals`. Nutrition is deferred to a follow-up spec (it needs new `UserNutritionItem*` primitives that don't exist yet).

## Architecture

Two new page components, each colocated with its domain (mirrors `modules/user/profile/UserProfilePage.tsx`):

- `packages/react-oyl/modules/user/activity/UserActivitiesPage.tsx`
- `packages/react-oyl/modules/user/goal/UserGoalsPage.tsx`

Two new routes in `packages/react-oyl/src/main.tsx`, both behind `ProtectedRoute`, placed above the existing `my/:settings` for readability:

```tsx
<Route path="my/activities" element={<ProtectedRoute><UserActivitiesPage /></ProtectedRoute>} />
<Route path="my/goals" element={<ProtectedRoute><UserGoalsPage /></ProtectedRoute>} />
```

Each page wraps only its own providers — no `UserDailyProvider`:

- `UserActivitiesPage` → `UserActivityProvider` + `UserActivityLogProvider`
- `UserGoalsPage` → `UserGoalProvider` + `UserGoalMilestoneProvider`

This is the whole point of the inversion — the catalog pages are independent of the daily orchestrator. They mount on URL access without dragging daily state in.

A small shared `PageShell` (`packages/react-oyl/modules/app/PageShell.tsx`, ~15 lines) gives both pages the same outer chrome: title header, max-width wrapper, dark-mode background. Mirrors the chrome inside `UserDailyPage` but extracted so future pages share it. `UserDailyPage` is not folded onto `PageShell` in this spec (out of scope).

## Per-page composition

### `UserActivitiesPage`

```tsx
export default function UserActivitiesPage() {
  return (
    <UserActivityProvider>
      <UserActivityLogProvider>
        <UserActivitiesPageBody />
      </UserActivityLogProvider>
    </UserActivityProvider>
  )
}

function UserActivitiesPageBody() {
  const { activities, saveActivity, deleteActivity } = useUserActivityContext()
  const [settingsId, setSettingsId] = useState<TDataId | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const editingActivity = activities.find(a => a.id === settingsId) ?? null

  return (
    <PageShell title="My Activities">
      <UserActivitiesList
        items={activities}
        emptyMessage="No activities yet."
        renderItem={a => (
          <UserActivityRow
            key={a.id}
            activity={a}
            onOpenSettings={setSettingsId}
          />
        )}
      />
      <button onClick={() => setShowAdd(s => !s)}>
        {showAdd ? 'Cancel' : 'Add activity'}
      </button>
      {showAdd && (
        <UserActivityForm
          onSubmit={async v => { await saveActivity(v); setShowAdd(false) }}
          onCancel={() => setShowAdd(false)}
        />
      )}
      {editingActivity && (
        <UserActivitySettingsSheet
          activity={editingActivity}
          onSave={saveActivity}
          onDelete={deleteActivity}
          onClose={() => setSettingsId(null)}
        />
      )}
    </PageShell>
  )
}
```

### `UserGoalsPage`

Same shape, swap in:
- `UserGoalRow` with the full `onSetProgress` / `onMarkComplete` / `onToggleMilestone` / `onAppendNote` / `onOpenSettings` callbacks bound to context methods. The reasoning: these write to `goal.progress` and `goal.current_status` and milestone entities — all catalog state, not day-specific — so the row's controls are semantically correct on the catalog page.
- `UserGoalForm`
- `UserGoalSettingsSheet`

Provider tree: `UserGoalProvider` + `UserGoalMilestoneProvider`.

## Data flow

**Reading entities.** Each domain's existing context already exposes the full list and mutation methods:

- `useUserActivityContext()` → `{ activities, saveActivity, deleteActivity, ... }`
- `useUserGoalContext()` → `{ goals, saveGoal, deleteGoal, ... }`

The catalog pages render these directly with no date filter. The daily orchestrator's `filterActivitiesForDate` / `filterGoalsForDate` stay in `daily/` and are not called from `/my/*`. The exact field names on each context will be verified at implementation time; if a method is named differently than assumed here, the page binds to the real name. No new context surface area is introduced.

**Add flow.** "Add" button toggles inline form. Form `onSubmit` calls context save, awaits, then closes the form. The new entity appears in the list on the next render because the provider's state is the source of truth (no manual cache invalidation).

**Edit flow.** Click row → `onOpenSettings(id)` sets local `settingsId`. The page derives `editingActivity` from `activities.find(a => a.id === settingsId)` and renders the SettingsSheet. Close → unset id. Delete → SettingsSheet calls `deleteActivity(id)` then auto-closes.

**Empty / loading states.** Empty list uses `UserActivitiesList`'s `emptyMessage` prop. Loading state is deferred — the provider hydrates from the local mirror immediately and syncs in background, so cold-start usually shows existing entities within one frame. If a noticeable empty-flash shows up in practice, a follow-up adds a `loading` flag to the contexts.

## Testing

Two test files, colocated with each page:

- `modules/user/activity/UserActivitiesPage.test.tsx`
- `modules/user/goal/UserGoalsPage.test.tsx`

Each covers four observable behaviors:

1. **Renders list from context.** Partial-mock `@/modules/user/activity` (or `goal`), override the context hook to return a fixed array, assert entity names render.
2. **Add toggle reveals form, submit closes it.** Click "Add", fill form, submit, assert the context's save mock was called with the form values and the form unmounts.
3. **Row click opens SettingsSheet.** Click row, assert the sheet's title/inputs appear populated with the clicked entity's data.
4. **SettingsSheet save closes the sheet.** Change a field, save, assert save called and sheet unmounts.

Uses the partial-mock pattern already documented in the `oyl-react-oyl-inversion-pattern` memory (`importOriginal` + override the context hook). Provider wrapping is mocked away so each test mounts the page body directly.

No integration tests in this PR — the primitives already have unit coverage, the daily integration tests cover the orchestrator path, and the catalog wiring is thin enough that the four page tests above suffice.

## Out of scope

- `/my/nutrition` — deferred. Needs new `UserNutritionItemsList`, `UserNutritionItemRow`, `UserNutritionItemForm` primitives that don't exist yet. Will get its own spec.
- Navigation UI (nav menu, links between `/daily` and `/my/*`). Direct URL access only for now.
- Date filtering / history view on the catalog. It's a catalog, not a journal.
- Standalone delete UI separate from the SettingsSheet.
- Folding `UserDailyPage` onto `PageShell`. Can be a follow-up.

## Files this spec creates or touches

New:
- `packages/react-oyl/modules/user/activity/UserActivitiesPage.tsx`
- `packages/react-oyl/modules/user/activity/UserActivitiesPage.test.tsx`
- `packages/react-oyl/modules/user/goal/UserGoalsPage.tsx`
- `packages/react-oyl/modules/user/goal/UserGoalsPage.test.tsx`
- `packages/react-oyl/modules/app/PageShell.tsx`

Modified:
- `packages/react-oyl/modules/user/activity/index.ts` — export `UserActivitiesPage`
- `packages/react-oyl/modules/user/goal/index.ts` — export `UserGoalsPage`
- `packages/react-oyl/src/main.tsx` — two new routes
