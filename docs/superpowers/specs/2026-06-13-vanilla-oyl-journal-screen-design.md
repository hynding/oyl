# vanilla-oyl Journal Screen — Design

**Date:** 2026-06-13
**Status:** Approved
**Builds on:** `2026-06-12-vanilla-oyl-foundation-design.md` (the merged foundation)

## Purpose

The first domain screen for `apps/vanilla-oyl`: a **Journal** screen for logging and reviewing what happened, scoped to **notes and measurements** to start. It is the first feature to *write* domain records, so it establishes the **aggregate-store pattern** that resolves the write-path coherence the foundation deliberately deferred — the template every later screen (planner, vault) reuses.

## At a glance (decisions)

1. **Scope:** a single-day "Today" view — the day's entries (notes + measurements), a composer to log each, inline delete, and prev/today/next day navigation. Read + create + delete.
2. **No edit.** Entries are immutable in the domain; to change one you delete it and log a new one.
3. **Write-path:** an app-level `JournalStore` wraps the entries `Repository` + an in-memory `Journal`, with **persist-first** surgical writes and a `revision` signal for reactivity. Full re-hydrate happens only on the wholesale events (boot/seed/import/multi-tab). The domain `Journal` stays a plain aggregate.
4. **Forms:** plain native inputs inside the component shadow root (no form-associated custom elements — the screen owns its own submit).
5. **Navigation:** a shared `<oyl-nav>` in the shell header (Status · Journal), active item from the `route` signal.
6. **Delete:** an **inline two-step confirm** (`Delete? Yes No` in place) — not immediate, not a browser dialog. Repo delete is a soft delete with no restore in the port, so a true undo isn't honestly buildable yet; the inline confirm prevents accidents. Trash/undo is a future spec (needs a repo `restore` capability).
7. **Design language:** calm, content-first single reading column (~680px), generous whitespace, hairline separators (not heavy cards), one restrained accent, fluid type, `oklch` + `light-dark()` token parity, subtle reduced-motion-safe animation. (Validated via browser mockup.)

## Scope and decomposition

**In scope:** the Journal "Today" screen (notes + measurements), the `JournalStore`, the shared nav, and the `data.js`/`oyl-shell`/`main.js` wiring to host it.

**Out of scope (future specs):** other entry kinds (activity / consumption / transaction — each its own domain screen); editing; trash/undo UI (and the repo `restore` it requires); insights (streaks, reviews); range / multi-day views; a bottom-bar responsive nav (header nav wraps for now).

## Architecture: the aggregate-store pattern

The domain `Journal` is a plain in-memory aggregate (`add`/`remove`/`entriesOn`/`entriesIn`/`aggregate`), intentionally **not** reactive — reactivity is an app concern. The app supplies a thin reactive, repository-backed wrapper.

### `src/state/journal-store.js` — `createJournalStore(entriesRepo, tz)`

```
journal = new Journal(tz)
let n = 0
revision = signal(0)            // bumped on every mutation; reads auto-track it

async add(entry):              // entry: a domain Entry (Note | Measurement)
  const saved = await entriesRepo.save(entry)   // persist FIRST (meta-stamped clone)
  journal.add(saved)                            // then reflect in the aggregate
  revision.set(++n)
  return saved

async remove(id):
  await entriesRepo.delete(id)  // soft delete
  journal.remove(id)            // idempotent
  revision.set(++n)

entriesOn(day):                 // DayKey -> readonly Entry[]
  revision.get()                // <- the auto-track point; effects re-run on any mutation
  return journal.entriesOn(day)

async hydrate():                // boot / seed / import / multi-tab ONLY
  fresh = new Journal(tz)
  for (const e of await entriesRepo.list()) fresh.add(e)
  journal = fresh
  revision.set(++n)
```

- **Persist-first** guarantees the repository and the `Journal` never diverge: if `save` throws (e.g. quota), the `Journal` is untouched and the error propagates to the form. (`Journal.add` after a successful `save` can only fail on a duplicate id, which the repo's own id guarantees prevents.)
- **Reactivity via revision read-in-method**: because `entriesOn` calls `revision.get()` before returning, any `effect` that calls `entriesOn` subscribes to `revision` and re-runs on every `add`/`remove`/`hydrate`. No framework in the domain; no manual subscription in components.
- **Surgical, not wholesale**: a single log is O(1) on the repo write + an array push; the journal is only fully rebuilt on the four wholesale events. `entriesOn` filtering the journal is O(n) per read — fine for a personal journal; noted if it ever matters.
- `tz` comes from `defaultTimezone()` (single local profile; no user record yet).

### `src/state/data.js` (modify)

`createDataState(storage, themeState)` additionally constructs `journal = createJournalStore(repos.entries, defaultTimezone())` and exposes it. `refresh()` (already called on boot/seed/import/multi-tab) also calls `await journal.hydrate()`, so another tab's writes appear and seed/import/reset are reflected. The Status screen's counts are unchanged (still `repo.list()`-based).

## Components

All extend `OylElement` (shadow DOM, `track()`, lifecycle teardown), built with `createElement`/`textContent` (no `innerHTML`), registered via idempotent `defineX()`.

### `<oyl-nav>` (`src/components/oyl-nav.js`)
Hash links (`#/status`, `#/journal`). Takes the `route` signal; a `track()` effect marks the active item (`aria-current="page"` + visual weight + accent, never color alone). Touch-sized targets. Rendered in the shell header.

### `<oyl-shell>` (modify)
Add a `nav` slot in the header between the brand and the toolbar slot: `[ OYL ] [ nav ] … [ toolbar ]`. No other change.

### `<oyl-journal>` (`src/components/oyl-journal.js`) — the screen container
- Props: `store` (the JournalStore), `tz`.
- Local `selectedDay` signal (DayKey), default `DayKey.from(now(), tz)`.
- Renders: an `<h2 tabindex="-1">` day header (formatted date + relative label "Today"/"Yesterday"/weekday) with a segmented `‹ Today ›` control; the `<oyl-log-form>` composer; an `<ol>` of `<oyl-entry-row>` for `store.entriesOn(selectedDay)` (newest first by `occurredAt`); a friendly empty state when the day has none.
- A `track()` effect re-renders the list when `selectedDay` or `store.revision` changes (the latter via `entriesOn`'s internal `revision.get()`).
- Day nav: prev/next via `DayKey.addDays(±1)`; **Today** disabled when already today; **←/→ arrow keys** change the day when focus isn't in an input; on day change, focus moves to the `<h2>` and an `aria-live="polite"` region announces "Showing Tuesday, Jun 10". Day-change list swap uses a reduced-motion-safe crossfade (View Transitions when available).
- Owns the `aria-live` region; announces "Entry added" / "Entry deleted" after store mutations.

### `<oyl-log-form>` (`src/components/oyl-log-form.js`) — the composer
- Props: `store`, a `defaultDay` getter (the journal's `selectedDay`) for the datetime default, and an `onLogged` callback (for the announce + focus-retention).
- A single-line affordance that **expands on focus** to reveal a Note/Measurement segmented toggle and fields. Progressive disclosure; `Esc` collapses.
- **Note**: `<textarea>` (text, required) + tags `<input>` (space/comma-separated; live **chip preview**; non-slug tags flagged) + a `datetime-local` (occurredAt, prefilled to the selected day at the current time).
- **Measurement**: a metric `<select>` of common keys (`body.weight_kg`, `sleep.hours`, `mood.score`, `screen.minutes`) plus a `custom.<slug>` free field, a value `<input type="number" inputmode="decimal">`, and the same `datetime-local`.
- **Submit** (`Cmd/Ctrl+Enter` or the Log button): build the domain object (`new Note(...)` / `new Measurement(...)`), call `store.add(...)`. On success: clear the composer, keep focus for rapid logging, the new row animates in (`@starting-style`). On failure: catch the `DomainError` and render its message **next to the offending field** (`aria-invalid` + `aria-describedby`) — empty text, bad tag slug, reserved namespace, non-finite value, or a quota error all surface inline, never swallowed, never a global alert.
- `datetime-local` value → `new Date(value)` (a local-wall-clock instant), bucketed by the journal's tz so the entry lands on the intended day.

### `<oyl-entry-row>` (`src/components/oyl-entry-row.js`) — one entry
- Props: `entry` (a domain Entry), `onDelete(id)`.
- Renders: mono tabular `occurredAt` time; a kind label (Note / Measurement); content (Note: text + tag chips; Measurement: `metric = value` in mono, with a unit hint where known); the optional `note` annotation (muted, italic).
- Delete affordance revealed on row hover/focus; clicking morphs it **in place** into `Delete? [Yes] [No]`. Yes → `onDelete(entry.id)`; No → reverts. After a confirmed delete, the container moves focus to the next row (or the composer) and announces via the live region.
- `@container` query: time/metadata stack under the content on narrow widths.

## Routing & wiring (`main.js`)

- `defineNav()`, `defineJournal()`, `defineLogForm()`, `defineEntryRow()` alongside the existing registrars.
- Mount `<oyl-nav slot="nav">` (fed `routeState.route`) in the shell.
- Add a `journal` route to the router's `routes` table: `journal: () => { const v = document.createElement('oyl-journal'); v.store = dataState.journal; v.tz = defaultTimezone(); return v }`. The router already focuses the view heading and announces route changes; `<oyl-journal>` adds in-view announcements.
- `#/status` remains the default route; `<oyl-nav>` switches between them.

## Error handling

- **Validation / domain errors** on log: caught in `<oyl-log-form>`, rendered inline by field, with `aria-invalid`/`aria-describedby`. The composer keeps the user's draft on error.
- **Quota on save**: propagates from `store.add` (persist-first means the Journal isn't mutated) and renders as a composer-level error.
- **Delete**: soft delete; the two-step confirm guards accidents. A failed `repo.delete` (rare) surfaces via the live region as an error and leaves the row.
- **Corrupt entry on hydrate**: the revivers throw during `entriesRepo.list()` — handled by the existing Status-screen corrupt-data path (the foundation's reset affordance); the journal store surfaces a hydrate failure rather than rendering partial state.

## Testing strategy (TDD)

| Unit | How |
|---|---|
| `journal-store` | Vitest with `InMemoryRepository` (or a fake): `add` persists + appears in `entriesOn` + bumps `revision`; **persist-first** (a throwing repo leaves the Journal unchanged, error propagates); `remove`; `hydrate` rebuilds from the repo; reads after a mutation reflect it. |
| day-nav logic | Pure helpers (prev/next/today, relative label) unit-tested. |
| `<oyl-nav>` | happy-dom: active item reflects the route signal; updates on route change. |
| `<oyl-log-form>` | happy-dom: expand-on-focus; type toggle swaps fields; chip preview + non-slug flagging; submit builds the right entry and calls `store.add`; a domain error renders inline by field; draft preserved on error; `Cmd/Ctrl+Enter` submits. |
| `<oyl-entry-row>` | happy-dom: renders note (text+tags) and measurement (metric=value) shapes; inline-confirm flow (Delete → Yes calls onDelete; No reverts). |
| `<oyl-journal>` | happy-dom: renders the day's entries; logging a note/measurement adds a row **reactively** (proves `revision` tracking); delete removes a row; day nav changes the shown set; empty state; day-change announce. |
| multi-tab | `data.js` `refresh()` re-hydrates the store (extends the existing storage-listener surface) so a second tab's entry appears. |
| Types | `tsc --noEmit` (strict + checkJs) over the new JS. |
| Browser truth | Manual via `pnpm vanilla dev` against `#/journal`: log a note + measurement, backdate via the datetime field, delete with confirm, day-nav with arrows, theme/mode parity. |

happy-dom caveats from the foundation still apply (no real `{signal}` honoring, View Transitions/`startViewTransition` shimmed) — component logic is unit-tested, visual/transition behavior is browser-verified.

## Build sequence (for the implementation plan)

Bottom-up, each phase green before the next: `journal-store` (+ contract-style tests) → `data.js` wiring (build store, hydrate in refresh) → `<oyl-nav>` + shell `nav` slot → `<oyl-entry-row>` → `<oyl-log-form>` → `<oyl-journal>` container → `main.js` route + nav mount → manual browser acceptance.
