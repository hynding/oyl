# `apps/stencil-oyl` Journal screen — Design

**Date:** 2026-10-08
**Status:** implemented on branch feat/stencil-oyl-journal (plan: `docs/superpowers/plans/2026-10-08-stencil-oyl-journal.md`)
**Program:** Stencil front-end — sub-project 3 (first redesigned screen; see
`2026-10-06-extract-client-layer-design.md` §Program context). Depends on 2 (shell, PR #8).

## Purpose

Replace the `/journal` placeholder with the first redesigned screen: the day-scoped journal
of notes and measurements. Same domain behavior as vanilla's `oyl-journal` (the
`createJournalStore` API is unchanged and shared), new look per the ui-oyl "Instrument"
direction, and two reusable primitives added to `@oyl/ui-oyl` for every composer that follows.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Layout | **Composer on top + week strip** (mockup A). Day heading with prev/next and a 7-day pill strip for fast hopping; composer card; reverse-chronological rows. |
| Row actions | **Inline Delete → Yes/No**, as vanilla (mockup A's "…" menu dropped: more UI for no gain; the e2e `inlineConfirm` helper carries over). |
| Measurements | Fixed metric list + `custom`, as today. No new store logic. |
| Primitives | Add **`ui-textarea`** and **`ui-segment`** to `@oyl/ui-oyl` (spec + tests each). The composer, and later planner/finance/nutrition composers, use them. |

## Screen anatomy

```
<oyl-journal store tz>
  header   .daynav: ui-button[data-nav=prev] · <h2 tabindex=-1>{formatDayHeading}</h2> + .rel {relativeDayLabel} · ui-button[data-nav=next]
           .week:   7 × <button data-day="YYYY-MM-DD" aria-pressed> (3 before … 3 after the shown day)
  sr-only  aria-live="polite" (day changes, "Entry added", "Entry deleted")
  <oyl-log-form store getDay onLogged>     — ui-card
  <ol>  <li><oyl-entry-row entry onDelete></li> …
  .empty  "Nothing logged for {heading}. Add a note or a measurement above."
```

- Rows are filtered to notes + measurements (no `transaction`/`consumption`: those belong to
  Finance/Nutrition), sorted newest first, identical to vanilla.
- Keyboard: `ArrowLeft`/`ArrowRight` move a day when focus is not in an input/textarea/select;
  the heading is focused after a move (vanilla's behavior, exercised by the e2e).
- The week strip is new: clicking a pill sets the day; the pill for the shown day has
  `aria-pressed="true"`; pills are `button`s inside a `role="group" aria-label="Week"`.

### `oyl-log-form` (composer)

- `ui-segment name="type"` with options Note / Measurement (rendered buttons carry
  `data-value`, the stencil e2e selector).
- Note: `ui-textarea name="text" label="What happened?"` (placeholder "A line about your
  day…", auto-grow, ⌘/Ctrl+Enter submits), `ui-field name="tags" label="Tags"` with live
  chips under it (valid tag = `^[a-z0-9]+(?:-[a-z0-9]+)*$`; invalid chips use the danger tone).
- Measurement: native `<select name="metric">` (body.weight_kg, sleep.hours, mood.score,
  screen.minutes, custom — "custom.…" label) in a `.row2` with `ui-field name="value"
  type="number"` (`inputmode=decimal`, `step=any`); `ui-field name="custom"` shown only when
  `custom` is selected.
- `ui-field name="when" type="datetime-local"` (ui-oyl's `FieldType` gains
  `'datetime-local'`), prefilled with the shown day + current time, re-synced after submit and
  on day change.
- Submit `ui-button type="submit" variant="primary"` "Log it". Errors from the domain
  constructors render in `[data-role="error"]` (aria-live) and mark the offending field
  invalid, exactly as vanilla.
- Emits `logged` after `store.add(entry)` resolves; the screen announces "Entry added".

### `oyl-entry-row`

Grid `time | body | actions`: mono clock time; body = kind label (Note/Measurement), text or
`metric = value unit` (mono), optional italic annotation, tag chips; actions = inline
Delete → "Delete?" Yes/No (`data-act="delete"`, `confirm-yes`, `confirm-no`, group role, No
focused on open). The three are native `<button>`s (a confirm cluster, like the theme
picker's radios — the one sanctioned exception to primitives-first), so the shared e2e
`inlineConfirm` helper's `[data-act]` clicks work unchanged. Container query collapses to two columns under 26rem. `measurementUnit`
moves to the app (`src/journal/format.ts`) with its test.

## New `@oyl/ui-oyl` primitives

| Tag | Props | Events | Notes |
|---|---|---|---|
| `ui-textarea` | `label`, `name` (reflected), `value` (mutable), `placeholder`, `required`, `rows` (min, default 2), `hint?`, `error?`, `autogrow` (default true) | `uiInput`, `uiChange` (`{ value }`), composed | Same anatomy and aria wiring as `ui-field`; form-associated; `Enter` with ⌘/Ctrl emits `uiSubmit` (composed) so a host form can submit. |
| `ui-segment` | `name` (reflected), `options: { value, label }[]`, `value` (mutable, reflected), `label` (aria-label for the group) | `uiChange` (`{ value }`) | `role="radiogroup"`; one `<button type="button" role="radio" aria-checked data-value>` per option, roving tabindex, arrow keys move+select. Generic: options carry `data-value`, so the composer's e2e selector is `ui-segment [data-value="measurement"]` (vanilla's `tests/` are untouched). |

Both ship with specs, readme, token-only CSS, and registration in stencil-oyl's global script.

## Shared code

- Nothing new in `@oyl/all-of-oyl`: `createJournalStore`, `Note`, `Measurement`, `DayKey`,
  `formatDayHeading`, `relativeDayLabel`, `formatClockTime` are all there. `measurementUnit`
  is app display logic (as in vanilla) and stays app-side.
- The screen receives `store` (`app.dataState.journal`) and `tz` (`app.tz`) from
  `boot/routes.ts`, replacing the placeholder.

## Verification

- **Specs (stencil-oyl):** `oyl-journal` renders today's heading, prev/next/week change the
  day, arrow keys move days unless focus is in a field, rows filter and sort, empty state text;
  `oyl-log-form` note submit calls `store.add` with a `Note` (text + parsed tags), measurement
  submit with a `Measurement`, custom metric shows its field, constructor errors render in the
  live region, ⌘Enter submits; `oyl-entry-row` renders note/measurement/annotation/tags and
  the inline confirm flow (No restores, Yes calls `onDelete`).
- **Specs (ui-oyl):** `ui-textarea` (label binding, value/uiInput, hint/error aria, ⌘Enter
  → `uiSubmit`, form value), `ui-segment` (options, aria-checked, click + arrow selection,
  `uiChange`, reflected value).
- **Unit:** `measurementUnit`.
- **e2e:** `tests-stencil/journal.spec.ts` = vanilla's eight journal tests re-expressed with
  stencil selectors (`oyl-journal ui-button[data-nav=prev] button`, `oyl-log-form ui-segment
  [data-value=measurement]`, `ui-textarea[name=text] textarea`, `ui-field[name=value] input`,
  `select[name=metric]`, `oyl-entry-row`, `inlineConfirm` from `lib/actions.ts` works as-is on
  `data-act` buttons), plus one for the week strip. The sync spec's offline test switches
  from the seed to a single note (now that a composer exists), matching vanilla.
- Definition of Done per CLAUDE.md: `pnpm ui test|typecheck|build`, `pnpm stencil
  test|typecheck|build`, stencil e2e projects green; vanilla untouched.

## Out of scope

- Editing entries in place, entry search/filter, multi-day views, activity sessions
  (vanilla has none of these either).
- Nutrition/Finance rows (their screens come in later sub-projects).
- Deep-link `/journal/:date` (route seam exists; a later sub-project).

## Risks

| Risk | Mitigation |
|---|---|
| `datetime-local` through a form-associated `ui-field` under happy-dom | The spec asserts the prefilled `value` string, not native parsing; e2e covers the browser. |
| Arrow-key day navigation vs. `ui-segment`'s arrow keys | The screen's handler ignores events whose composed path includes a `[role=radio]`, the same way it ignores inputs. |
| `ui-textarea` autogrow in tests | Autogrow sets `style.height` from `scrollHeight`; specs do not assert height. |

## Amendments during implementation

1. **`oyl-entry-row` discriminates on `entry.kind`, not `instanceof`:** the bundle's `Note`/`Measurement` and a spec's are different copies of the class.
2. **`ui-field` reflects `type`** (attribute-shaped, like `name`), so `ui-field[type=datetime-local]` selectors work.
3. **Narrow rows:** under 26rem the time and the actions share the first line and the body takes the full width below (vanilla's two-column collapse pushed Delete to its own line).
4. **Time column** is 5rem: `formatClockTime` emits 12-hour strings ("11:48 PM").
