# vanilla-oyl Planner Screen — Design

**Date:** 2026-06-13
**Status:** Approved
**Builds on:** `2026-06-13-vanilla-oyl-journal-screen-design.md` (the merged Journal screen + its aggregate-store pattern)

## Purpose

The second domain screen for `apps/vanilla-oyl`: a **Planner** for intentions and their fulfillment — **tasks and appointments** to start. It validates the aggregate-store pattern generalizes to a **stateful** aggregate: plans mutate (`complete`/`cancel`) and recurring tasks respawn, unlike the Journal's immutable entries. The `PlannerStore` write-path it establishes is the template for the remaining stateful screens.

## At a glance (decisions)

1. **Plan kinds:** Task (title, optional due, optional recurrence) and Appointment (title + start datetime, optional duration). PlannedMeal is out of scope (it references the food catalog — a later meal/nutrition screen).
2. **Primary view:** a single-day **agenda** (mirrors the Journal day view) with ‹/› + arrow-key day nav, plus an **Overdue** section (open plans past due) surfaced on the today view.
3. **Transitions:** complete, cancel, and delete. Completion routes through the domain `Planner.complete` so recurring tasks respawn.
4. **Recurrence:** basic cadence (`every N days/weeks/months`) on tasks; completing a recurring task respawns the successor (re-anchored on the completion date).
5. **Write-path (the new part):** **creates** (`add`/`remove`) are persist-first surgical like the JournalStore; **mutations** (`complete`/`cancel`) run the domain op, persist the affected plan(s), then **re-hydrate** to resync `meta`/revision and stay coherent (a failed save → re-hydrate rolls back to the repo state).
6. **Canceled plans stay visible** (struck-through), not hidden — so cancel is visibly distinct from delete. (Validated via browser mockup.)
7. **Design language:** reuses the Journal screen's calm single-column look, day nav, composer, and row patterns; new visuals are the overdue section, the complete checkbox, done/canceled styling, and appointment-time / recurrence badges.

## Scope and decomposition

**In scope:** the Planner "Today" screen (tasks + appointments), the `PlannerStore`, and the `data.js`/`oyl-nav`/`main.js` wiring. Reuses (does not rebuild) the day-nav, composer, and inline-confirm-delete machinery established by the Journal screen.

**Out of scope (future specs):** PlannedMeals + grocery list (need the food catalog); DayPlan time-boxing / `scheduleFor` (drag-to-schedule slots); Projects; `completionRate`/insights; linking a completion to a Journal entry (`fulfilledBy`).

## Architecture: the second aggregate-store

The domain `Planner` is a plain stateful in-memory aggregate (`add`/`remove`/`complete`/`agendaFor`/`overdue`/`dueOn`/`upcoming`). The app wraps it reactively, exactly as `JournalStore` wraps `Journal` — but the stateful transitions need a different write-path than the Journal's pure persist-first.

### `src/state/planner-store.js` — `createPlannerStore(plansRepo, tz)`

```
planner = new Planner();  let n = 0;  revision = signal(0)

// CREATE — persist-first surgical (like JournalStore)
async add(plan):
  const saved = await plansRepo.save(plan)   // throws before the aggregate is touched
  planner.add(saved)
  revision.set(++n)
  return saved

// MUTATE — domain op → persist affected → re-hydrate to resync
async complete(id, on):                       // on: DayKey (completion date)
  const successor = planner.complete(id, on)  // mutates status + respawns recurring successor
  await plansRepo.save(planner.get(id))       // persist the completed plan
  if (successor) await plansRepo.save(successor)
  await this.hydrate()                         // resync meta/revision; rollback-on-failure

async cancel(id):
  planner.get(id).cancel()                    // open → canceled
  await plansRepo.save(planner.get(id))
  await this.hydrate()

// REMOVE — persist-first surgical
async remove(id):
  await plansRepo.delete(id)
  planner.remove(id)
  revision.set(++n)

// READS — auto-track revision
agendaFor(day):  revision.get(); return planner.agendaFor(day)
overdue(day):    revision.get(); return planner.overdue(day)
canceledOn(day): revision.get(); return planner.all().filter(p => p.status==='canceled' && p.due?.equals(day))
get(id):         revision.get(); return planner.get(id)

async hydrate():
  fresh = new Planner(); for (const p of await plansRepo.list()) fresh.add(p)
  planner = fresh; revision.set(++n)
```

**Why mutations differ from the Journal:** plans mutate in place and `Planner.complete` is the single source of the transition + recurring-respawn logic, so the store calls it rather than reimplementing it. After an in-place mutation the in-memory plan's `meta` is stale relative to the repo's bumped revision; `hydrate()` resyncs cleanly (and, on a failed `save`, rolls the aggregate back to the persisted truth). Creates and removes don't have this problem, so they keep the surgical persist-first path. **Reactivity:** creates/removes bump `revision` directly; mutations bump via `hydrate`.

- `tz` is `defaultTimezone()` (single local profile). Appointments are constructed with the same tz so their `due` derives onto the agenda.

### `src/state/data.js` (modify)
Build `planner = createPlannerStore(repos.plans, defaultTimezone())`, expose `dataState.planner`, and `await planner.hydrate()` in `refresh()` (so seed/import/multi-tab flow through, as for the journal store).

## Components (mirror the Journal screen)

### `<oyl-planner>` (`src/components/oyl-planner.js`) — the screen container
- Props: `store` (PlannerStore), `tz`.
- Local `selectedDay` signal (default `DayKey.from(now(), tz)`); ‹ Today › nav + ←/→ arrow keys, focus-to-`<h2>`, live-region announce — reused from `<oyl-journal>`.
- Body (top to bottom):
  1. The **`<oyl-plan-composer>`** (kept at top, matching the Journal composer placement).
  2. **Overdue** section — only when the selected day is today: `store.overdue(today)`, each row completable/cancelable, with an amber "Due <day> · Nd ago" badge.
  3. **Agenda** for the selected day = `store.agendaFor(day)` (appointments by start time, then tasks; open + done) **followed by** `store.canceledOn(day)` (struck-through). Done rows struck-through/muted; canceled rows struck-through.
  4. Empty state when the day has no plans (and no overdue, on today).
- A `track()` effect rebuilds the sections on `selectedDay` or `store.revision` change.

### `<oyl-plan-composer>` (`src/components/oyl-plan-composer.js`)
Task/Appointment segmented toggle (mirrors `<oyl-log-form>`), plain shadow-DOM inputs:
- **Task**: title (required) + due `date` (optional) + optional recurrence (`repeat every [N] [days|weeks|months]`; off by default). Builds `new Task({ title, due?, cadence? })` with `Cadence.of(n, unit)` when recurrence is on.
- **Appointment**: title (required) + `datetime-local` start + optional duration minutes. Builds `new Appointment({ title, startsAt, durationMinutes?, tz })` (tz from the store, so `due` derives).
- Submit → `store.add(plan)`. On success clear + keep focus + `onAdded` (announce); on `DomainError` (empty title, bad cadence, non-positive duration) render inline with `aria-invalid` + `aria-describedby`, draft preserved. `Cmd/Ctrl+Enter` submits.

### `<oyl-plan-row>` (`src/components/oyl-plan-row.js`)
- Props: `plan` (a domain Task|Appointment), `today` (DayKey, for the completion date), `onComplete(id, on)`, `onCancel(id)`, `onDelete(id)`.
- Renders: a round **complete checkbox** (open only); the title (struck-through when done/canceled); a meta row — appointment start time (mono) + `Appointment · Nm` badge, or a `↻ every N weeks` recurrence badge for recurring tasks, or an amber overdue badge when shown in the overdue section; an optional `note` annotation.
- Checkbox → `onComplete(plan.id, today)`. **Cancel** and **Delete** each an inline two-step confirm (reusing the entry-row pattern); cancel hidden for done/canceled rows. Done/canceled rows show only Delete.
- `@container` query stacks meta under the title on narrow widths.

### `src/planner/format.js`
`cadenceLabel(cadence)` → "every week" / "every 2 weeks" / "every 3 days"; `appointmentTime(appt)` → start time (+ "· 60m" when duration set); `overdueBadge(due, today)` → "Due Jun 13 · 3d ago". Reuses `formatDayHeading`/`formatClockTime`/`relativeDayLabel` from `journal/format.js`.

### Navigation & routing
- `oyl-nav.js` (modify): add `['planner', 'Planner']` to the items (`Status · Journal · Planner`).
- `main.js` (modify): `definePlanner()`; `#/planner` route returns an `<oyl-planner>` with `store = dataState.planner` and `tz = defaultTimezone()`.

## Error handling

- **Composer validation**: `DomainError` from `new Task`/`new Appointment` (empty title, cadence n≤0, duration≤0) caught and rendered inline (`aria-invalid`/`aria-describedby`), draft preserved.
- **Transition errors**: `store.complete`/`cancel` surface a `DomainError` (e.g. completing a non-open plan — defensive, since the UI only offers complete on open plans) via the live region; the re-hydrate keeps state coherent.
- **Quota on save**: a failed `add` propagates (aggregate untouched, persist-first); a failed `complete`/`cancel` save → `hydrate()` rolls the aggregate back to the persisted state, and the error is announced.
- **Corrupt plan on hydrate**: `revivePlan` throws during `plansRepo.list()` — surfaced via the existing Status-screen corrupt-data path; the store reports a hydrate failure rather than rendering partial state.

## Testing strategy (TDD)

| Unit | How |
|---|---|
| `planner-store` | Vitest + `InMemoryRepository` + `Task`/`Appointment`/`Cadence`: add persist-first; complete mutates + persists + **respawns a recurring successor** + re-hydrates (revision bumps, meta resynced); a failing save on complete rolls back via hydrate (aggregate matches repo); cancel; remove; `agendaFor`/`overdue`/`canceledOn` reactive via revision. |
| `planner/format` | Pure: `cadenceLabel`, `appointmentTime`, `overdueBadge`. |
| `<oyl-plan-composer>` | happy-dom: Task build (with/without cadence) + Appointment build (startsAt + tz-derived due); inline validation; `store.add` called; draft preserved on error. |
| `<oyl-plan-row>` | happy-dom: task vs appointment rendering; recurrence/appointment badges; done/canceled struck styling; complete checkbox → onComplete(id, today); cancel/delete inline-confirm flows. |
| `<oyl-planner>` | happy-dom: renders overdue (today) + agenda + canceled; reactive add/complete (a completed recurring task’s successor appears on its due day after nav); day nav; empty state. |
| multi-tab | `data.js` `refresh()` re-hydrates the planner store. |
| Types | `tsc --noEmit` (strict + checkJs). |
| Browser truth | Manual via `pnpm vanilla dev` at `#/planner`: add a recurring task + an appointment; complete the recurring task and confirm the successor appears next period; overdue surfacing; cancel (struck) vs delete; theming; reload + multi-tab. |

happy-dom caveats from the foundation still apply (no real `{signal}`/`requestSubmit`/View-Transitions) — logic is unit-tested, visual/transition behavior browser-verified.

## Build sequence (for the implementation plan)

Bottom-up, each phase green before the next: `planner-store` (+ tests, incl. the stateful mutation/rollback/respawn cases) → `data.js` wiring (build + hydrate) → `planner/format.js` → `oyl-nav` Planner item → `<oyl-plan-row>` → `<oyl-plan-composer>` → `<oyl-planner>` container → `main.js` route → manual browser acceptance.
