# `apps/stencil-oyl` Planner screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the `/planner` placeholder in `apps/stencil-oyl` with the redesigned Planner (day nav with week-strip dots, task/appointment composer, plan rows with complete/cancel/delete), extracting the Journal's day navigation into a shared `oyl-day-nav` and adding `ui-checkbox` to `@oyl/ui-oyl`. Same domain behavior as vanilla's planner; vanilla untouched.

**Architecture:** `oyl-planner` owns the day signal and one `effect` over `createPlannerStore`; `oyl-day-nav` is a controlled view (props in, `dayChange` out); `oyl-plan-composer` submits through a native `<form>` on form-associated primitives; `oyl-plan-row` emits `complete`/`cancelPlan`/`remove`. Signals mirror through `bindSignal`/`effect` as in the Journal.

**Tech Stack:** as sub-projects 2–3 (Stencil 4, `@stencil/vitest`, happy-dom, Playwright).

**Spec:** `docs/superpowers/specs/2026-10-08-stencil-oyl-planner-design.md`

## Global Constraints

- **Branch** `feat/stencil-oyl-planner` (stacked on `feat/stencil-oyl-journal`; spec commit `8bdbd0c`). One commit per task; session trailer; never commit on red; no push/PR unless asked.
- **Behavior parity with vanilla's planner** (lists, callbacks, announcements, defaults, error handling, confirm flows). New: the look, week-strip dots, `years` cadence unit.
- **Primitives first**; the row's check and its Cancel/Delete/Yes/No are native `<button>`s (a control cluster — the sanctioned exception).
- **Selectors for e2e** (keep stable): `oyl-planner`, `oyl-day-nav ui-button[data-nav="prev|next"]`, `oyl-day-nav [data-day]` (+ `.dot`), `oyl-plan-composer ui-segment [data-value="task|appointment"]`, `ui-field[name="title|due|repeatN|startsAt|duration"] input`, `ui-checkbox[name="repeat"] input`, `select[name="repeatUnit"]`, `ui-button[type="submit"]`, `oyl-plan-row`, `button.check[aria-checked]`, `[data-act="cancelplan"|"delete"|"confirm-yes"|"confirm-no"]`, `.section-label.overdue`, text "Nothing planned for".
- **Gates per task:** `pnpm ui test|typecheck|build` when ui-oyl changes; `pnpm stencil test|typecheck|build`; Task 6 runs the stencil e2e projects (`PW_CHROMIUM_PATH` where needed, `--workers=4`, ports 1341/1342/8043 freed first).
- Every new `ui-*` tag gets registered in `apps/stencil-oyl/src/global/app.ts` (unit test enforces it).

---

## Task 1: `ui-checkbox`

**Files:** `packages/ui-oyl/src/components/ui-checkbox/{ui-checkbox.tsx,ui-checkbox.css,ui-checkbox.spec.tsx}`, `packages/ui-oyl/src/dev/index.html` (showcase), `apps/stencil-oyl/src/global/app.ts` (register)

- [x] **Step 1: failing specs** — label bound via `for`/`id`; `name`/`checked` reflected; click toggles `checked`, emits composed `uiChange {checked}`; `disabled` passes through; form value `"on"` when checked, `null` when not (`__formValue` shim); setting `checked` prop updates the input.
- [x] **Step 2: component + CSS** — `formAssociated`, `@Watch('checked')` → `setFormValue`; `label` row with `--size-control` min height, native input sized `1.25rem`, `accent-color: var(--color-accent)`, focus ring via `--focus-ring`; token-only CSS.
- [x] **Step 3:** showcase section; register `defineCustomElementUiCheckbox` in stencil-oyl.
- [x] **Step 4: gate + commit** — `feat(ui-oyl): ui-checkbox`.

## Task 2: `oyl-day-nav` extraction (+ `isEditableTarget`)

**Files:** `apps/stencil-oyl/src/lib/keys.ts` + `keys.unit.ts`, `apps/stencil-oyl/src/components/oyl-day-nav/{oyl-day-nav.tsx,oyl-day-nav.css,oyl-day-nav.spec.tsx}`, `apps/stencil-oyl/src/components/oyl-journal/{oyl-journal.tsx,oyl-journal.css}`

- [x] **Step 1: failing tests** — `isEditableTarget` (input/textarea/select/`[role=radio]` → true; button/div → false). `oyl-day-nav` spec: heading `formatDayHeading(day)` + `.rel`; prev/next emit `dayChange` with ±1 day; 7 `[data-day]` pills, shown day `aria-pressed=true`, pill click emits `dayChange`; `.dot` present only where `marked(day)`; `announce('x')` writes the live region; after a prev/next click the heading is focused.
- [x] **Step 2: implement** — move the daynav/week/live markup + CSS out of `oyl-journal`; `@Prop() day`, `@Prop() today`, `@Prop() marked?`, `@Event() dayChange`, `@Method() announce()`; `focusHeading()` after self-initiated changes.
- [x] **Step 3: refactor `oyl-journal`** — renders `<oyl-day-nav day today marked onDayChange>`; keeps the day signal, keydown listener (via `isEditableTarget`) and `setDay`; announcements go through `navEl.announce()`. `marked = (d) => store.entriesOn(d).some(visible)`. Journal specs must pass unchanged (they query through nested shadow roots — adjust helpers only if a selector depended on the journal's own shadow root).
- [x] **Step 4: gate + commit** — `refactor(stencil-oyl): extract oyl-day-nav from the journal; week-strip dots`.

## Task 3: `oyl-plan-row` + `overdueBadge`

**Files:** `apps/stencil-oyl/src/planner/format.ts` + `format.unit.ts`, `apps/stencil-oyl/src/components/oyl-plan-row/{…}`

- [x] **Step 1: failing tests** — `overdueBadge` ("Due Jun 13 · 3d ago"); row: open task → `button.check[aria-checked=false]` + Cancel + Delete; check click emits `complete {id}`; done → `aria-checked=true`, disabled, `.done` title, Delete only; canceled → "Canceled" badge, Delete only; appointment → mono `appointmentTime` + "Appointment" badge; recurring task → "↻ every week"; `overdueAsOf` → overdue badge; Cancel → confirm group "Cancel plan?" → Yes emits `cancelPlan`; Delete → "Delete?" → Yes emits `remove`; No restores.
- [x] **Step 2: implement** — `@Prop() plan`, `@Prop() overdueAsOf?`, events; `@State() confirming: 'cancelplan' | 'delete' | null`; `kind` discrimination; CSS ported with tokens.
- [x] **Step 3: gate + commit** — `feat(stencil-oyl): oyl-plan-row with complete/cancel/delete`.

## Task 4: `oyl-plan-composer`

**Files:** `apps/stencil-oyl/src/components/oyl-plan-composer/{…}`

- [x] **Step 1: failing specs** — default task: segment value `task`, `ui-field[name=title]`, `ui-field[name=due][type=date]` prefilled with `day.value`, `ui-checkbox[name=repeat]`, `ui-field[name=repeatN]` + `select[name=repeatUnit]` disabled until repeat checked; appointment: `ui-field[name=startsAt][type=datetime-local]` prefilled `${day}T09:00`, `ui-field[name=duration]`; task submit → `store.add` with a `Task` (`title`, `due`, `cadence` of n/unit when repeat checked); appointment submit → `Appointment` with `startsAt`, `durationMinutes`, `tz`; emits `added`, resets, repeat controls disabled again; empty title → error in `[data-role=error]` + `aria-invalid` on the title field; ⌘Enter submits; `day` change re-syncs `due`/`startsAt`.
- [x] **Step 2: implement** — props `store`, `tz`, `day`; `@Event() added`; `@State() type`, `repeat`, `error`; `@Watch('day')` → `syncDefaults()`.
- [x] **Step 3: gate + commit** — `feat(stencil-oyl): oyl-plan-composer`.

## Task 5: `oyl-planner` + route

**Files:** `apps/stencil-oyl/src/components/oyl-planner/{…}`, `apps/stencil-oyl/src/boot/routes.ts` + `routes.unit.ts`

- [x] **Step 1: failing specs** — fake store (`overdue`, `agendaFor`, `canceledOn` scripted; `complete`/`cancel`/`remove` spies), `tz='UTC'`: today renders the Overdue label + rows when `overdue()` is non-empty, and never on another day; agenda rows then canceled rows under the day label; empty text; `complete` from a row → `store.complete(id, today)`; `cancelPlan` → `store.cancel`; `remove` → `store.remove`; `added` announces; ArrowRight moves a day (heading changes) unless target is editable; `oyl-day-nav` receives `marked` true for a day with an open plan.
- [x] **Step 2: implement** — mirror `oyl-journal`'s shape with `createPlannerStore`'s reads.
- [x] **Step 3: route** — `planner` creates `oyl-planner` with `app.dataState.planner` + `app.tz`; remove from `NOT_YET`; unit test updated.
- [x] **Step 4: gate + commit** — `feat(stencil-oyl): Planner screen replaces the placeholder`.

## Task 6: e2e

**Files:** `apps/e2e-oyl/tests-stencil/planner.spec.ts`, `apps/e2e-oyl/tests-stencil/lib.ts` (`addTask`), `routing.spec.ts` if it expected a planner placeholder

- [x] **Step 1:** port vanilla's seven planner tests + a week-strip dot test.
- [x] **Step 2:** run `--project stencil-desktop --project stencil-mobile --workers=4` green (journal spec included — the extraction gate).
- [x] **Step 3: commit** — `test(e2e): stencil planner spec`.

## Task 7: Docs + visual check

- [x] Headless-Chromium screenshots (desktop + Pixel 7) of `/planner`; fix anything visually off.
- [x] CLAUDE.md (stencil-oyl row: Planner + `oyl-day-nav`; ui-oyl row: nine primitives incl. `ui-checkbox`), spec statuses (planner implemented; program table row 4), tick this plan.
- [x] Final gates; commit `docs: stencil-oyl Planner; ui-oyl checkbox`.

## Deferred

- Backing plans in Strapi/PHP; editing; `/planner/:date`; `ui-select`.
