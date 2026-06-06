# /my/nutrition catalog page

**Date:** 2026-06-06
**Scope:** A standalone read-only catalog page in `@oyl/react-oyl` at `/my/nutrition` that shows the user's "pantry" — every nutrition item they've ever logged — plus a "Log again" shortcut. The follow-up to `2026-06-06-my-catalog-pages-design.md` which deferred nutrition.

## Motivation

The `/my/activities` and `/my/goals` catalog pages ship the inverted activity and goal primitives. Nutrition was deferred because the nutrition module's existing primitives (`UserNutritionRow`, `UserNutritionList`, `UserNutritionLogForm`, `UserNutritionTotals`, etc.) all operate on **log entries** (`TUserNutritionData`) — there is no item-level primitive (`UserNutritionItemRow`, `UserNutritionItemsList`) that would let a catalog page list `TNutritionItemData`. This spec adds those primitives and the page that consumes them.

The catalog is framed as a **personal pantry**: the items the user has logged at least once, in most-recent-first order, regardless of `source` (`'user'` for manually-entered items or `'openfoodfacts'` for items pulled in through search/barcode on the daily page). This sidesteps the OFF-shared-data editing policy question and keeps v1 small.

## Architecture

**Route + page placement.** New route `/my/nutrition` in `src/main.tsx`, behind `ProtectedRoute`, placed above the existing `my/:settings` route for readability. New page component at `packages/react-oyl/modules/user/nutrition/UserNutritionsPage.tsx` (plural to match `UserActivitiesPage` and `UserGoalsPage`). The page wraps `UserNutritionProvider` around a named `UserNutritionsPageBody` so tests can mount the body with a mocked context — same Page/Body split as the activity and goal pages.

**Provider tree.** Just `UserNutritionProvider`. No need to mount goal, milestone, or activity providers — the catalog and the log-again form operate on nutrition data alone, and `UserNutritionLogForm` already takes its dependencies (item, selectedDate, callbacks) as props.

**Page chrome.** Uses `PageShell` from `@/modules/app` for the title header. Same as the activity and goal pages.

**Data source.** The pantry is derived from the user's nutrition log history — same `nutritions` array that `UserNutritionProvider` already hydrates from the local mirror. No new Strapi reads, no extra network calls. The derivation extends the existing `useRecentNutritionItems.ts` shape (which already groups logs by item to compute "recent items"), but without the `limit` and with `logCount` aggregation.

**Independence from the daily orchestrator.** The page mounts on URL access without dragging daily state in. The log-again flow uses **today's date in the user's timezone**, derived from `useUserProfile()`'s `timezone` field via a small inline helper — no `selectedDate` from context.

## Per-page composition

```tsx
export default function UserNutritionsPage() {
  return (
    <UserNutritionProvider>
      <UserNutritionsPageBody />
    </UserNutritionProvider>
  )
}

export function UserNutritionsPageBody() {
  const { addNutrition } = useUserNutritionContext()
  const { timezone } = useUserProfile()
  const tz = timezone || 'UTC'
  const pantry = useUserPantry()
  const [picked, setPicked] = useState<TNutritionItemData | null>(null)
  const today = todayInTimezone(tz)

  return (
    <PageShell title="My Nutrition">
      <UserNutritionItemsList
        items={pantry}
        emptyMessage="Nothing in your pantry yet — log a food on the Daily page and it'll show up here."
        renderItem={entry => (
          <UserNutritionItemRow
            key={entry.item.documentId}
            item={entry.item}
            lastLoggedAt={entry.lastLoggedAt}
            logCount={entry.logCount}
            timezone={tz}
            onLogAgain={setPicked}
          />
        )}
      />
      {picked && (
        <UserNutritionLogForm
          item={picked}
          selectedDate={today}
          onSubmit={async ({ servings, datetime }) => {
            await addNutrition({
              nutrition_item: picked,
              date: datetime,
              servings,
              name: picked.name,
            })
            setPicked(null)
          }}
          onCancel={() => setPicked(null)}
        />
      )}
    </PageShell>
  )
}
```

Note: `UserNutritionItemsList`'s `items` prop is the pantry-entry array directly (each entry carries `item` + `lastLoggedAt` + `logCount`), and `renderItem` receives an entry. This avoids the `pantry.find(...)` lookup-per-row pattern shown in the brainstorming sketch.

`todayInTimezone(tz)` is a small inline helper at the top of the page file:

```ts
function todayInTimezone(tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const y = parts.find(p => p.type === 'year')?.value ?? ''
  const m = parts.find(p => p.type === 'month')?.value ?? ''
  const d = parts.find(p => p.type === 'day')?.value ?? ''
  return `${y}-${m}-${d}`
}
```

Same formula as `orchestrator-utils.ts`'s `localDate`. Inline duplication (~7 lines) is acceptable for two call-sites; extract to a shared helper when a third appears.

## New domain primitives

**`UserNutritionItemRow`** — pure-prop row component. Props:

```ts
{
  item: TNutritionItemData
  lastLoggedAt?: string   // ISO datetime
  logCount?: number
  timezone: string
  onLogAgain: (item: TNutritionItemData) => void
}
```

Renders item name + brand, a Nutri-Score / NOVA badge cluster if those fields are present (lifted out of `UserNutritionSearchInput`'s badge logic — a small shared `NutritionItemBadges` sub-component co-located in the same file is acceptable; do NOT extract to a separate file yet), `lastLoggedAt` formatted as a short date in the page's timezone if provided, `logCount` if provided ("logged 5 times"), and a "Log again" button that calls `onLogAgain(item)`.

**`UserNutritionItemsList`** — generic list shell. Props match `UserActivitiesList` / `UserGoalsList`:

```ts
{
  items: T[]
  renderItem: (item: T) => ReactNode
  emptyMessage?: ReactNode
  className?: string
}
```

Default `className`: `'space-y-3'`. The empty-state element is a `<p>` with `'text-sm text-gray-500 dark:text-gray-400'` to match the other lists.

**`derivePantryItems(logs)`** — pure helper exported from `useRecentNutritionItems.ts` alongside the existing `dedupRecentItemsFrom`. Signature:

```ts
type PantryEntry = {
  item: TNutritionItemData
  lastLoggedAt: string
  logCount: number
}

export function derivePantryItems(logs: TUserNutritionData[]): PantryEntry[]
```

Behavior:
1. Filter out logs with `deleted_at` set.
2. Filter out logs whose `nutrition_item` is missing or not an object with a `documentId`.
3. Group by `nutrition_item.documentId`. For each group: track the max `log.date` as `lastLoggedAt`, count entries as `logCount`, carry the most-recent log's `nutrition_item` as `item` (the item snapshot from the freshest log).
4. Return sorted by `lastLoggedAt` descending.

The existing `dedupRecentItemsFrom` keeps its current shape — `derivePantryItems` is a sibling, not a refactor of the existing function. (If the team later wants `useRecentNutritionItems` to share the grouping logic, that's a follow-up.)

**`useUserPantry()`** — new hook. Pulls `nutritions` from `useUserNutritionContext()` and memoizes `derivePantryItems(nutritions)`. No timezone parameter — date formatting happens in the row, not in the derivation.

## Data flow

**Reading the pantry.** Single derivation, all in-memory:

1. `useUserPantry()` reads `nutritions` from `UserNutritionContext`.
2. Memoizes `derivePantryItems(nutritions)` on `nutritions` reference.
3. Returns `PantryEntry[]` sorted most-recent-first.

No network calls. The provider's local mirror is the source of truth. When the user adds a new log, `nutritions` changes, the memo recomputes, the row's `lastLoggedAt` / `logCount` update.

**Log-again flow.**

1. Click "Log again" → page calls `setPicked(item)`.
2. `UserNutritionLogForm` renders inline below the list, bound to `item`, `selectedDate={today}`.
3. Form submits with `{ servings, datetime }`. Page builds `{ nutrition_item: picked, date: datetime, servings, name: picked.name }` and calls `addNutrition(patch)`.
4. Provider's `data.save` runs, mirror updates, `nutritions` changes, `useUserPantry` re-derives.
5. Page closes the form via `setPicked(null)`.

**Empty state.** If the user has never logged anything, the derivation returns `[]` and the list renders `"Nothing in your pantry yet — log a food on the Daily page and it'll show up here."` — points the user at the existing entry path rather than expecting them to create items from `/my/nutrition`.

## Testing

Three new tests + one extension to an existing test file:

1. **`useRecentNutritionItems.test.ts`** (existing) — add a `describe('derivePantryItems', ...)` block covering:
   - Empty logs → empty array.
   - Aggregates `logCount` across multiple logs of the same item.
   - Sorts by `lastLoggedAt` descending across multiple items.
   - Filters out soft-deleted logs (`deleted_at` set).
   - Filters out logs with missing or malformed `nutrition_item`.
   - Carries the most-recent log's item snapshot.

2. **`UserNutritionItemRow.test.tsx`** (new) — primitive-level tests:
   - Renders item name and brand.
   - Renders Nutri-Score and NOVA badges when present, omits when absent.
   - Renders `lastLoggedAt` formatted in the given timezone when provided.
   - Renders `logCount` when provided ("logged N times").
   - Clicking "Log again" calls `onLogAgain(item)`.

3. **`UserNutritionItemsList.test.tsx`** (new) — minimal list-shell test:
   - Empty state renders the `emptyMessage`.

4. **`UserNutritionsPage.test.tsx`** (new) — page-level mock-context tests, mirroring the activity/goal page test shape:
   - Renders heading "My Nutrition" and a list of pantry items derived from a mocked `UserNutritionContext.nutritions`. The test exercises the real `useUserPantry` + `derivePantryItems` end-to-end; only the context (and the provider passthrough) is mocked.
   - Empty state shown when `nutritions: []`.
   - Clicking "Log again" on a row reveals `UserNutritionLogForm`.
   - Form submit calls `addNutrition` with the expected patch shape `{ nutrition_item, date, servings, name }` and closes the form.

All page tests follow the now-established patterns from `UserActivitiesPage.test.tsx` and `UserGoalsPage.test.tsx`:

- Partial-mock the nutrition module barrel (`vi.mock('@/modules/user/nutrition', ...)`) with passthrough provider + canned context.
- Use typed `vi.fn(async (_x: T) => {})` signatures so `.mock.calls[0][0]` typechecks under `tsc --noEmit`.
- Use `afterEach` to reset any mutated fixture fields (e.g. local `picked` state isn't fixture state, so the only thing that needs reset is the canned `nutritions` array if a test swaps it).
- Mock `useUserProfile` to return a fixed timezone so date assertions are deterministic.

No integration tests in this PR. The daily/nutrition integration tests already cover the add-log-and-derive-pantry path indirectly; the catalog wiring is thin enough that the four page tests above suffice.

## Out of scope (deferred to follow-up specs)

- **Edit and delete on catalog items.** Needs an OFF-shared-data policy decision (do edits override globally? per-user overrides via a new join table? per-user hide flag?). Not in v1.
- **Search / filter / sort controls.** v1 ships the default most-recent-first ordering. Filtering by source, sorting by name, and a text-search box are all plausible follow-ups.
- **Manual item creation from `/my/nutrition`.** v1 routes all new-item creation through the existing daily search/barcode flow. The empty-state copy makes this explicit.
- **Per-item history view.** "Show me every time I logged this peanut butter" is a journaling concern, not a catalog one.
- **Nav link from `AppHomePage`.** Trivial follow-up after this lands; mirrors the `a4171d2` activity/goals nav-link commit.
- **Folding nutrition-log running totals or daily summary** into the catalog. Keeps the catalog focused on items.
- **Refactoring `useRecentNutritionItems` to share grouping logic with `derivePantryItems`.** They're siblings for now; consolidate if a third consumer appears.
- **Extracting `localDate` / `todayInTimezone` to a shared helper module.** Two inline copies are acceptable; extract on third call-site.

## Files this spec creates or touches

New:

- `packages/react-oyl/modules/user/nutrition/UserNutritionItemRow.tsx`
- `packages/react-oyl/modules/user/nutrition/UserNutritionItemRow.test.tsx`
- `packages/react-oyl/modules/user/nutrition/UserNutritionItemsList.tsx`
- `packages/react-oyl/modules/user/nutrition/UserNutritionItemsList.test.tsx`
- `packages/react-oyl/modules/user/nutrition/useUserPantry.ts`
- `packages/react-oyl/modules/user/nutrition/UserNutritionsPage.tsx`
- `packages/react-oyl/modules/user/nutrition/UserNutritionsPage.test.tsx`

Modified:

- `packages/react-oyl/modules/user/nutrition/useRecentNutritionItems.ts` — export new `derivePantryItems` + `PantryEntry` type.
- `packages/react-oyl/modules/user/nutrition/useRecentNutritionItems.test.ts` — add tests for `derivePantryItems`.
- `packages/react-oyl/modules/user/nutrition/index.ts` — re-export the new primitives, page, and hook.
- `packages/react-oyl/src/main.tsx` — route `/my/nutrition` to `UserNutritionsPage`.

## Notes on naming

The plural `UserNutritionsPage` is awkward English ("nutritions" is grammatically odd) but consistent with `UserActivitiesPage` and `UserGoalsPage`. An alternative is `UserPantryPage` — clearer name, breaks the convention. The spec picks **`UserNutritionsPage`** for consistency; if the user prefers `UserPantryPage`, the implementer should mirror the rename across the page component, test, route element, and index export.
