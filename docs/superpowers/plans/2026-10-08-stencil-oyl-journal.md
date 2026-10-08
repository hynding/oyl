# `apps/stencil-oyl` Journal screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/journal` placeholder in `apps/stencil-oyl` with the redesigned Journal screen (day navigation + week strip, note/measurement composer, entry rows with inline delete), adding `ui-textarea` and `ui-segment` to `@oyl/ui-oyl`. Same domain behavior as vanilla's journal; vanilla untouched.

**Architecture:** Three app components (`oyl-journal`, `oyl-log-form`, `oyl-entry-row`) over the shared `createJournalStore`; signals mirrored through `bindSignal`; the composer submits through a native `<form>` on form-associated primitives. New primitives follow `ui-field`'s anatomy and conventions.

**Tech Stack:** as sub-project 2 (Stencil 4, `@stencil/vitest`, happy-dom, Playwright).

**Spec:** `docs/superpowers/specs/2026-10-08-stencil-oyl-journal-design.md`

## Global Constraints

- **Branch** `feat/stencil-oyl-journal` (spec commit `0ed0798`). One commit per task; session trailer; never commit on red; no push/PR unless asked.
- **Behavior parity with vanilla's journal** (filtering, sorting, keyboard, error handling, confirm flow, `when` prefill). Only the look and the week strip are new.
- **Primitives first**, with the row's Delete / Yes / No as native `<button data-act>`s (a radiogroup/confirm cluster, not actions — the same exception the theme picker makes), so the shared e2e `inlineConfirm` helper works unchanged.
- **Selectors for e2e** (keep stable): `oyl-journal`, `oyl-journal ui-button[data-nav="prev|next"]`, `oyl-journal [data-day]`, `oyl-log-form`, `oyl-log-form ui-segment [data-value="note|measurement"]`, `ui-textarea[name="text"] textarea`, `ui-field[name="tags"] input`, `select[name="metric"]`, `ui-field[name="custom"] input`, `ui-field[name="value"] input`, `ui-button[type="submit"]`, `oyl-entry-row`, `[data-act="delete"|"confirm-yes"|"confirm-no"]`, text "Nothing logged for".
- **Gates per task:** `pnpm ui test|typecheck|build` when ui-oyl changes; `pnpm stencil test|typecheck|build`; Task 6 runs the stencil e2e projects (`PW_CHROMIUM_PATH` where needed, `--workers=4`, ports freed first) and the vanilla projects for the files touched (`playwright.config.ts` is not touched this time).
- ui-oyl changes get registered in `apps/stencil-oyl/src/global/app.ts` (the unit test enforces it).

---

## Task 1: `ui-textarea` (+ `datetime-local` on `ui-field`)

**Files:** `packages/ui-oyl/src/components/ui-textarea/{ui-textarea.tsx,ui-textarea.css,ui-textarea.spec.tsx}`, `packages/ui-oyl/src/components/ui-field/ui-field.tsx` (`FieldType` + `'datetime-local'`), `packages/ui-oyl/src/index.ts` (export `TextareaProps`? no — keep types internal), `packages/ui-oyl/src/dev/index.html` (showcase section)

- [ ] **Step 1: failing specs** — label bound via `for`/`id`; `name` reflected; `placeholder`, `required`, `rows` pass through; typing emits composed `uiInput {value}` and sets `value`; `hint` → `aria-describedby`; `error` → `aria-invalid` + replaces hint; ⌘/Ctrl+Enter keydown emits composed `uiSubmit`; form value recorded via the setup shim (`__formValue`).
- [ ] **Step 2: component** — mirror `ui-field` (ids, events `uiInput`/`uiChange`/`uiSubmit`, `formAssociated`, `@Watch('value')` → `setFormValue`). Autogrow: on input set `textarea.style.height = 'auto'` then `scrollHeight + 'px'` (guarded, no assertions in specs). CSS: same field styles, `resize: vertical; min-block-size: calc(var(--size-control) * 1.5)`.
- [ ] **Step 3:** `FieldType` gains `'datetime-local'`; a one-line spec asserts it passes through. Showcase: a textarea section.
- [ ] **Step 4: gate + commit** — `feat(ui-oyl): ui-textarea; datetime-local fields`.

## Task 2: `ui-segment`

**Files:** `packages/ui-oyl/src/components/ui-segment/{…}`, showcase section

- [ ] **Step 1: failing specs** — renders `role="radiogroup"` with `aria-label`; one `button[role=radio][data-value]` per option with `aria-checked` on the current `value`; click selects, reflects `value`, emits `uiChange {value}`; ArrowRight/Left move + select with wraparound; roving `tabindex` (0 on checked, -1 otherwise); `name` reflected.
- [ ] **Step 2: component + CSS** — pill track (`--radius-pill`, `--line-2` border, `--color-surface-2` track), checked option `--color-accent` / `--color-on-accent`, `min-block-size: calc(var(--size-control) - var(--space-2))`, equal-width options.
- [ ] **Step 3: gate + commit** — `feat(ui-oyl): ui-segment`.

## Task 3: `oyl-entry-row` + `measurementUnit`

**Files:** `apps/stencil-oyl/src/journal/format.ts` + `format.unit.ts`, `apps/stencil-oyl/src/components/oyl-entry-row/{…}`, `apps/stencil-oyl/src/global/app.ts` (register `ui-textarea`, `ui-segment`)

- [ ] **Step 1: failing tests** — `measurementUnit` (port vanilla's `format.test.js`); row renders mono clock time, "Note" kind + text + tag chips; "Measurement" + `metric = value unit` (mono); annotation when `entry.note`; `[data-act="delete"]` → confirm group (`role=group`, `aria-label="Delete?"`, Yes/No, No focused); No restores Delete; Yes emits `remove {id}`.
- [ ] **Step 2: implement** — `@Prop() entry!: Entry`, `@Event() remove: EventEmitter<Id>`, `@State() confirming`. Grid CSS ported with tokens (`--line-1` top border, container query under 26rem).
- [ ] **Step 3: gate + commit** — `feat(stencil-oyl): oyl-entry-row with inline delete confirm`.

## Task 4: `oyl-log-form`

**Files:** `apps/stencil-oyl/src/components/oyl-log-form/{…}`

- [ ] **Step 1: failing specs** — default type note: `ui-segment` value `note`, `ui-textarea[name=text]`, `ui-field[name=tags]`, `ui-field[name=when][type=datetime-local]` prefilled `${day}THH:MM`; switching to measurement shows `select[name=metric]` + `ui-field[name=value]`, hides note fields; `custom` option reveals `ui-field[name=custom]`; submit (native `submit` event) calls `store.add` with a `Note` whose `text`/`tags` (split on whitespace/commas) match, then emits `logged` and resets; measurement submit builds a `Measurement` (metric from select or custom, numeric value); a constructor error (empty note text → vanilla's `Note` throws) renders in `[data-role=error]` and marks the field invalid; tag chips render live with the danger class for invalid tags; `uiSubmit` from the textarea submits the form.
- [ ] **Step 2: implement** — props `store`, `getDay: () => DayKey`; `@Event() logged`; `@State() type`, `error`, `tags`; values read from the primitives' `value` props; `when` synced via a `syncWhen()` called on load, after submit, and from a public `@Method() resync()` the screen calls on day change (or simpler: a `day` prop with `@Watch` — choose the prop).
- [ ] **Step 3: gate + commit** — `feat(stencil-oyl): oyl-log-form composer on ui-textarea/ui-segment`.

## Task 5: `oyl-journal` + route

**Files:** `apps/stencil-oyl/src/components/oyl-journal/{…}`, `apps/stencil-oyl/src/boot/routes.ts` (+ `routes.unit.ts` tweak: journal is no longer a placeholder)

- [ ] **Step 1: failing specs** — with a fake store (`entriesOn(day)` returning a scripted list, `remove` spy) and `tz='UTC'`: heading = `formatDayHeading(today)`, `.rel` = "Today"; prev/next buttons change heading and move the week strip; week strip has 7 `[data-day]` buttons with the shown day `aria-pressed=true`; clicking a pill sets that day; ArrowLeft/Right on the host move days, but not when the event's composed path includes an `input`/`textarea`/`select`/`[role=radio]`; rows exclude transactions/consumptions and are sorted newest-first; empty state text; `remove` from a row calls `store.remove(id)` and announces "Entry deleted"; `logged` announces "Entry added".
- [ ] **Step 2: implement** — `@Prop() store`, `@Prop() tz`; a `day` signal created in `componentWillLoad` (equality via `DayKey.equals`) mirrored to `@State()`; the store's entries read through `bindSignal`-driven re-render: `createJournalStore` is itself reactive (its `entriesOn` touches a revision signal), so wrap the row list in an `effect` that writes `@State() entries`. Week strip = `[-3..3].map(d => day.addDays(d))`.
- [ ] **Step 3: route** — `routes.ts`: `journal: () => { const el = doc.createElement('oyl-journal'); el.store = app.dataState.journal; el.tz = app.tz; return el }`; remove `journal` from `NOT_YET`; unit test updated.
- [ ] **Step 4: gate + commit** — `feat(stencil-oyl): Journal screen (day nav, week strip, rows) replaces the placeholder`.

## Task 6: e2e + sync spec update

**Files:** `apps/e2e-oyl/tests-stencil/journal.spec.ts`, `apps/e2e-oyl/tests-stencil/lib.ts` (`addNote` for the stencil composer), `apps/e2e-oyl/tests-stencil/sync.spec.ts` (offline test uses one note), `apps/e2e-oyl/tests-stencil/routing.spec.ts` (deep-link test now expects the journal, not the placeholder), `apps/e2e-oyl/tests-stencil/mobile.spec.ts` (add "logging a note works with touch input")

- [ ] **Step 1:** port vanilla's eight journal tests + a week-strip test (click "yesterday" pill → empty state; click today → entries back).
- [ ] **Step 2:** run `--project stencil-desktop --project stencil-mobile --workers=4` green.
- [ ] **Step 3: commit** — `test(e2e): stencil journal spec; sync/routing specs use the real screen`.

## Task 7: Docs

- [ ] CLAUDE.md (stencil-oyl row: journal is real; ui-oyl row: eight primitives), spec statuses (journal spec implemented; program table row 3 → "Journal implemented"), tick this plan.
- [ ] Final gates; commit `docs: stencil-oyl Journal; ui-oyl textarea/segment`.

## Deferred

- `/journal/:date` deep links; editing entries; search. Planner is sub-project 4.
