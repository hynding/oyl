# `apps/stencil-oyl` Planner screen — Design

**Date:** 2026-10-08
**Status:** draft (branch `feat/stencil-oyl-planner`, stacked on `feat/stencil-oyl-journal`)
**Program:** Stencil front-end — sub-project 4 (second redesigned screen; see
`2026-10-06-extract-client-layer-design.md` §Program context). Depends on 3 (Journal: `ui-segment`,
`ui-textarea`, the day-navigation pattern, the inline-confirm row convention).

## Purpose

Replace the `/planner` placeholder with the day-scoped planner: tasks and appointments, completion
(recurring tasks respawn), overdue surfacing on today, cancel/delete with inline confirms, day
navigation. Same domain behavior as vanilla's `oyl-planner` (`createPlannerStore` is unchanged and
shared). Two reuse moves fall out of it: the Journal's day navigation becomes a shared app component,
and `@oyl/ui-oyl` gains `ui-checkbox`.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Layout | **Composer on top** (mockup A) — the Journal's shape: day nav + week strip, composer card, then an *Overdue* section (today only) and the day's section. |
| Day navigation | **Extract `oyl-day-nav`** from `oyl-journal` (heading + prev/next, week strip, arrow keys, live announcements). Journal is refactored onto it in the same sub-project; its specs and e2e stay green. Nutrition/Finance reuse it later. |
| Checkbox | **`ui-checkbox` for the composer's Repeat toggle** only. The row's round complete-check stays app-local (a styled control, as vanilla's). |
| Week dots | **Yes** — a dot under strip days that have something: open plans here, entries in the Journal. The host passes a `marked(day)` predicate; the strip knows nothing about domains. |

## Screen anatomy

```
<oyl-planner store tz>
  <oyl-day-nav day today marked onDayChange>        — heading/prev/next/week strip/arrow keys/live region
  <oyl-plan-composer store tz day onAdded>          — ui-card
  .section-label.overdue "Overdue"  (today only, hidden when empty)
  <ol> <li><oyl-plan-row plan overdueAsOf onComplete onCancelPlan onRemove></li> …
  .section-label {formatDayHeading(day)}  (hidden when empty)
  <ol> <li><oyl-plan-row plan …></li> …
  .empty  "Nothing planned for {heading}. Add a task or appointment above."
```

- Lists are vanilla's: `overdue = isToday ? store.overdue(today) : []`;
  `agenda = [...store.agendaFor(day), ...store.canceledOn(day)]` (appointments by start time, then
  tasks, then canceled plans). One `effect` tracks the day signal and the store's revision.
- Row callbacks: complete → `store.complete(id, today)` + announce "Completed"; cancel →
  `store.cancel(id)` + "Canceled"; delete → `store.remove(id)` + "Deleted"; composer `added` →
  "Added to plan". Announcements go through `oyl-day-nav`'s live region (`@Method() announce(msg)`).

### `oyl-day-nav` (shared app component, extracted from `oyl-journal`)

- Props: `day: DayKey` (controlled), `today: DayKey`, `marked?: (day: DayKey) => boolean`.
- Event: `dayChange: EventEmitter<DayKey>`. Method: `announce(msg: string)`.
- Renders exactly what the Journal renders today: `.daynav` with `ui-button[data-nav=prev|next]`,
  `h2[tabindex=-1]` + `.rel`, the 7-pill `[role=group][aria-label=Week]` strip
  (`button[data-day][aria-pressed]`, now with a `.dot` when `marked(day)`), and the `sr-only`
  `aria-live` region. Focuses the heading and announces "Showing …" after a change it initiated.
- Keyboard: the **screen** keeps the `keydown` listener on its own host (so ArrowLeft/Right work with
  focus anywhere on the screen, as today) and sets the day itself; the input/textarea/select/
  `[role=radio]` guard becomes one exported helper, `isEditableTarget(e)` in `src/lib/keys.ts`, used by
  both screens. `oyl-day-nav` has no keyboard handling of its own beyond its buttons.
- The screen owns the day signal; `oyl-day-nav` is a pure view of it. `oyl-journal` is refactored to
  this shape (`day`/`today`/`marked={(d) => store.entriesOn(d).some(visible)}`), its selectors and
  text unchanged — the Journal e2e and specs are the regression gate for the extraction.

### `oyl-plan-composer`

- `ui-segment name="type"` Task / Appointment (`data-value`).
- `ui-field name="title" label="Title"` (required by the domain — an empty title throws, rendered as
  vanilla does).
- Task: `.row2` of `ui-field name="due" type="date"` (prefilled with the shown day, re-synced on day
  change and after submit) and a `.repeat` cluster: `ui-checkbox name="repeat" label="Repeat"`,
  `ui-field name="repeatN" type="number" min=1` (aria-label "Repeat interval"), native
  `select[name=repeatUnit]` (days/weeks/months/years — the domain's `CadenceUnit`s; vanilla omits
  years, the domain allows it). Interval + unit are disabled until Repeat is checked.
- Appointment: `.row2` of `ui-field name="startsAt" type="datetime-local"` (prefilled `${day}T09:00`)
  and `ui-field name="duration" type="number" min=1 label="Minutes (optional)"`.
- Submit `ui-button type="submit" variant="primary"` "Add to plan"; ⌘/Ctrl+Enter anywhere in the form
  submits. Builds `new Task({ title, due?, cadence? })` or `new Appointment({ title, startsAt, durationMinutes?, tz })`,
  `await store.add(plan)`, resets, re-syncs defaults, emits `added`. Domain errors render in
  `[data-role=error]` (aria-live) and mark the title invalid, as vanilla.

### `oyl-plan-row`

- Grid `check | body | actions`, `--line-1` top border, container query under 26rem puts the actions
  under the body (same narrow treatment as `oyl-entry-row`).
- Check: a native `<button type="button" role="checkbox" class="check" aria-checked aria-label>`
  (round, accent when done; `disabled` when done/canceled). Click on an open plan emits `complete`.
  Using a button (not `input`) keeps it keyboard-operable with Space/Enter and avoids form semantics.
- Body: `.title` (line-through + muted when done/canceled); `.meta` badges — overdue
  (`overdueBadge(due, overdueAsOf)` → "Due Oct 5 · 3d ago", warn tone), appointment time
  (`appointmentTime(plan)`, mono) + "Appointment" badge (accent tone), recurring "↻ every week"
  (`cadenceLabel`), "Canceled". Discriminate on `plan.kind` (`'task'`/`'appointment'`), never
  `instanceof` (amendment 1 of the Journal spec).
- Actions: open plans show Cancel (`data-act=cancelplan`, prompt "Cancel plan?") and Delete
  (`data-act=delete`, "Delete?"); done/canceled plans show Delete only. Both are native-button inline
  confirms (`confirm-yes`/`confirm-no`, No focused on open) — the shared e2e `inlineConfirm` works
  unchanged. Events: `complete`, `cancelPlan`, `remove` (all `EventEmitter<Id>`).
- `overdueBadge` moves to the app (`src/planner/format.ts`) with its test, like `measurementUnit`.

## New `@oyl/ui-oyl` primitive

| Tag | Props | Events | Notes |
|---|---|---|---|
| `ui-checkbox` | `label`, `name` (reflected), `checked` (mutable, reflected), `disabled`, `value` (form value when checked, default `"on"`) | `uiChange` (`{ checked }`), composed | Form-associated (`setFormValue(checked ? value : null)`); native `<input type=checkbox>` inside, label bound by `for`/`id`; `--size-control` hit area, `--color-accent` when checked, `--focus-ring`. Token-only CSS, readme, spec, registered in stencil-oyl's global script. |

## Shared code

- Nothing new in `@oyl/all-of-oyl`: `createPlannerStore`, `Task`, `Appointment`, `Cadence`, `DayKey`,
  `cadenceLabel`, `appointmentTime`, `monthDayLabel`, `formatDayHeading`, `relativeDayLabel` exist.
- `boot/routes.ts`: `planner: () => { el.store = app.dataState.planner; el.tz = app.tz }`; `planner`
  leaves `NOT_YET`.
- Plans are **not backed** (`plans` is absent from `BACKED` in `client/storage/bootstrap.ts` — there is no
  Strapi `plan` content-type yet). In-session behavior only; no reload/persistence assertions (same note
  as vanilla's e2e). Backing plans is its own sub-project (content-type + `/bootstrap` + PHP import).

## Verification

- **Specs (ui-oyl):** `ui-checkbox` label binding, `checked` ↔ `uiChange`, reflected attrs, disabled,
  form value via the setup shim.
- **Specs (stencil-oyl):** `oyl-day-nav` (heading/rel, prev/next emit `dayChange`, 7 pills with the
  shown day pressed, dots where `marked`, pill click emits, `announce` writes the live region);
  `oyl-plan-composer` (default task fields with due prefilled; appointment fields; repeat enables
  interval/unit; task submit → `store.add` with a `Task` carrying `due` and `cadence`; appointment
  submit → `Appointment` with `startsAt`/`durationMinutes`/`tz`; empty title error in the live region;
  ⌘Enter submits; day change re-syncs `due`/`startsAt`); `oyl-plan-row` (open task: check + Cancel +
  Delete; done: checked, disabled, line-through, Delete only; appointment meta; recurring badge;
  overdue badge; canceled badge; confirm flows emit `cancelPlan`/`remove`; check emits `complete`);
  `oyl-planner` (fake store: overdue section only on today, agenda + canceled rows, empty text,
  callbacks call the store and announce; arrow keys move days unless in a field).
- **Unit:** `overdueBadge`; `isEditableTarget`; `app.unit.ts` registration (`ui-checkbox`).
- **Journal regression:** `oyl-journal` specs + `tests-stencil/journal.spec.ts` unchanged and green
  after the `oyl-day-nav` extraction.
- **e2e:** `tests-stencil/planner.spec.ts` = vanilla's seven planner tests with stencil selectors
  (`oyl-plan-composer ui-segment [data-value=task]`, `ui-field[name=title] input`,
  `ui-field[name=due] input`, `ui-checkbox[name=repeat] input`, `ui-field[name=repeatN] input`,
  `select[name=repeatUnit]`, `ui-field[name=startsAt] input`, `ui-field[name=duration] input`,
  `ui-button[type=submit] button`, `oyl-plan-row`, `button.check` with `aria-checked`,
  `inlineConfirm(row, 'cancelplan'|'delete')`, `oyl-planner .section-label.overdue`,
  `oyl-day-nav ui-button[data-nav=next] button`), plus one week-strip test (tomorrow's pill shows a
  dot after adding a task due tomorrow; clicking it shows the row). Routing spec's placeholder
  expectation for `/planner` (if any) moves to the real screen. Mobile project runs the same specs.
- Definition of Done per CLAUDE.md: `pnpm ui test|typecheck|build`, `pnpm stencil test|typecheck|build`,
  stencil e2e projects green; vanilla untouched.

## Out of scope

- Backing plans in Strapi/PHP (separate sub-project); editing plans; projects/possessions links;
  `PlannedMeal` rows; day-plan slots/scheduling; `/planner/:date` deep links (route seam exists).

## Risks

| Risk | Mitigation |
|---|---|
| Extracting `oyl-day-nav` changes Journal selectors | Markup inside the shadow root is moved verbatim; e2e selectors are host-scoped (`oyl-journal …`) — Playwright pierces nested shadow roots, so `oyl-journal ui-button[data-nav=prev] button` still resolves. Journal e2e is the gate. |
| `ui-checkbox` form value under happy-dom | The setup shim records `setFormValue`; the spec asserts `__formValue` (`"on"` / `null`). |
| Week dots cost 7 store reads per render | `agendaFor`/`entriesOn` are in-memory filters over small arrays; the predicate is called inside the screen's render, after the single effect. |
| `select[name=repeatUnit]` stays native | Same as the Journal's metric select; a `ui-select` primitive is deferred until a third consumer appears. |
