# vanilla-oyl Planner Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Planner "Today" screen for `apps/vanilla-oyl` — tasks & appointments with day agenda, overdue surfacing, complete/cancel/delete, and recurring tasks — on a `PlannerStore` that handles a stateful aggregate (mutations + respawn).

**Architecture:** A `PlannerStore` wraps the entries `plans` `Repository` + the domain `Planner`. Creates/removes are persist-first surgical (like `JournalStore`); mutations (complete/cancel) run the domain op, persist the affected plan(s), then re-hydrate to resync `meta`/revision (rollback-on-failure). Web Components (`<oyl-planner>`, `<oyl-plan-composer>`, `<oyl-plan-row>`) on `OylElement` render the screen; a `#/planner` route + a Planner nav item wire it in.

**Tech Stack:** Vanilla JS + JSDoc (strict checkJs), Vitest + happy-dom, `@oyl/all-of-oyl` (`Planner`/`Task`/`Appointment`/`Cadence`/`DayKey`/`LocalStorageRepository`/`COLLECTIONS`), the foundation's signals core + Web Component base + Journal-screen patterns.

**Spec:** `docs/superpowers/specs/2026-06-13-vanilla-oyl-planner-screen-design.md`

---

## Conventions (carried from the Journal screen — apply throughout)

- Scoped tests: `pnpm --filter @oyl/vanilla-oyl exec vitest run <pattern>`. Full: `pnpm --filter @oyl/vanilla-oyl exec vitest run`. Typecheck: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit`.
- App code is `.js` + JSDoc under strict + checkJs. **No `innerHTML`** — `createElement`/`textContent`.
- Web Components extend `OylElement` (`this.track(fn)` auto-disposed reactive effect; `this.lifecycle` AbortSignal for listeners; `static styles = [sheet(css)]`). Idempotent `defineX()` guarded by `customElements.get`.
- **Externally-assigned fields** use the constructor double-cast: `this.prop = /** @type {T} */ (/** @type {unknown} */ (undefined))`.
- Test fakes need JSDoc `@param` annotations (strict `noImplicitAny`); cast-then-`.click()` lines need leading semicolons or named locals (ASI hazard) — prefer extracting `const el = root.querySelector(...)` then `el.click()`.
- `@oyl/all-of-oyl` resolves to TS source in tests/typecheck.

## File structure

**New (`apps/vanilla-oyl/src/`):**
- `state/planner-store.js` — `createPlannerStore(plansRepo)` (the stateful write-path).
- `planner/format.js` — `cadenceLabel`, `appointmentTime`, `overdueBadge` (reuses `journal/format.js`).
- `components/oyl-plan-row.js` — one plan: complete checkbox + badges + status styling + cancel/delete.
- `components/oyl-plan-composer.js` — Task/Appointment composer.
- `components/oyl-planner.js` — the screen container.
- Matching `*.test.js` for each (except `main.js`).

**Modified:**
- `state/data.js` — build the planner store, hydrate in `refresh()`.
- `components/oyl-nav.js` — add the `Planner` item.
- `main.js` — define `<oyl-planner>` (+ its sub-components), add the `#/planner` route.

---

# Phase 1 — PlannerStore (stateful write-path)

### Task 1: `createPlannerStore`

**Files:**
- Create: `apps/vanilla-oyl/src/state/planner-store.test.js`
- Create: `apps/vanilla-oyl/src/state/planner-store.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/state/planner-store.test.js`. NOTE: tests use the real **cloning** `LocalStorageRepository` (not `InMemoryRepository`, which aliases and would defeat the rollback test) over a fake `StorageLike`, with the canonical `COLLECTIONS.plans` codec.

```js
import { describe, expect, it } from 'vitest'
import { LocalStorageRepository, COLLECTIONS, Task, Cadence, DayKey } from '@oyl/all-of-oyl'
import { createPlannerStore } from './planner-store.js'
import { effect } from '../lib/reactive/effect.js'

/** A cloning plans repo over an in-memory map; `fail()` makes subsequent writes throw. */
function setup() {
  const map = new Map()
  let failWrites = false
  const storage = {
    /** @param {string} k */ getItem: (k) => map.get(k) ?? null,
    /** @param {string} k @param {string} v */ setItem: (k, v) => {
      if (failWrites) throw new Error('quota')
      map.set(k, v)
    },
  }
  const repo = new LocalStorageRepository(storage, 'oyl/data/plans', /** @type {any} */ (COLLECTIONS.plans))
  return { repo, fail: () => { failWrites = true } }
}

const DUE = DayKey.of('2026-06-16')
const task = (title = 'Water the plants', opts = {}) => new Task({ title, due: DUE, ...opts })

describe('createPlannerStore', () => {
  it('add persists, appears in agendaFor, bumps revision', async () => {
    const { repo } = setup()
    const store = createPlannerStore(repo)
    const before = store.revision.get()
    const saved = await store.add(task())
    expect(saved.meta?.revision).toBe(1)
    expect(store.agendaFor(DUE)).toHaveLength(1)
    expect(await repo.list()).toHaveLength(1)
    expect(store.revision.get()).toBeGreaterThan(before)
  })

  it('complete marks done, persists, and respawns a recurring successor', async () => {
    const { repo } = setup()
    const store = createPlannerStore(repo)
    const t = task('Water', { cadence: Cadence.of(1, 'weeks') })
    await store.add(t)
    const successor = await store.complete(t.id, DUE)
    expect(store.get(t.id)?.status).toBe('done')
    expect(successor?.status).toBe('open')
    expect(store.get(successor.id)).toBeDefined()        // successor hydrated into the planner
    expect(await repo.list()).toHaveLength(2)             // original (done) + successor (open)
  })

  it('persist-first rollback: a failing save on complete restores the open state', async () => {
    const { repo, fail } = setup()
    const store = createPlannerStore(repo)
    const t = task()
    await store.add(t)
    fail()
    await expect(store.complete(t.id, DUE)).rejects.toThrow('quota')
    expect(store.get(t.id)?.status).toBe('open')          // re-hydrated from the untouched repo
  })

  it('cancel sets canceled (excluded from agenda, present in canceledOn)', async () => {
    const { repo } = setup()
    const store = createPlannerStore(repo)
    const t = task()
    await store.add(t)
    await store.cancel(t.id)
    expect(store.get(t.id)?.status).toBe('canceled')
    expect(store.agendaFor(DUE)).toHaveLength(0)
    expect(store.canceledOn(DUE)).toHaveLength(1)
  })

  it('remove deletes from repo and aggregate', async () => {
    const { repo } = setup()
    const store = createPlannerStore(repo)
    const t = task()
    await store.add(t)
    await store.remove(t.id)
    expect(store.get(t.id)).toBeUndefined()
    expect(await repo.list()).toHaveLength(0)
  })

  it('overdue surfaces open plans whose due has passed', async () => {
    const { repo } = setup()
    const store = createPlannerStore(repo)
    await store.add(new Task({ title: 'late', due: DayKey.of('2026-06-13') }))
    expect(store.overdue(DayKey.of('2026-06-16'))).toHaveLength(1)
  })

  it('an effect reading agendaFor re-runs when a mutation bumps revision', async () => {
    const { repo } = setup()
    const store = createPlannerStore(repo)
    const seen = /** @type {number[]} */ ([])
    effect(() => seen.push(store.agendaFor(DUE).length))
    await store.add(task())
    await Promise.resolve()
    expect(seen).toEqual([0, 1])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run planner-store`
Expected: FAIL — cannot resolve `./planner-store.js`.

- [ ] **Step 3: Implement**

Create `apps/vanilla-oyl/src/state/planner-store.js`:

```js
import { Planner } from '@oyl/all-of-oyl'
import { signal } from '../lib/reactive/signal.js'

/** @typedef {import('@oyl/all-of-oyl').Plan} Plan */
/** @typedef {import('@oyl/all-of-oyl').Task} Task */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */
/** @typedef {import('@oyl/all-of-oyl').Repository<Plan>} PlansRepo */

/**
 * App-level reactive wrapper over the plans Repository + the domain Planner.
 * Creates/removes are persist-first surgical; mutations (complete/cancel) run the
 * domain op, persist the affected plan(s), then re-hydrate to resync meta/revision —
 * rolling back to the persisted state if a save fails. The domain Planner stays a
 * plain stateful aggregate.
 * @param {PlansRepo} plansRepo
 */
export function createPlannerStore(plansRepo) {
  let planner = new Planner()
  let n = 0
  const revision = signal(0)

  /** Rebuild the aggregate from the repository (boot/seed/import/multi-tab and post-mutation resync). */
  async function hydrate() {
    const fresh = new Planner()
    for (const p of await plansRepo.list()) fresh.add(p)
    planner = fresh
    revision.set((n += 1))
  }

  return {
    revision,
    hydrate,

    /** Persist a new plan, then reflect it in the aggregate. @param {Plan} plan @returns {Promise<Plan>} */
    async add(plan) {
      const saved = await plansRepo.save(plan)
      planner.add(saved)
      revision.set((n += 1))
      return saved
    },

    /**
     * Complete a plan (recurring tasks respawn via the domain). Persist the completed
     * plan + any successor, then re-hydrate. On save failure, re-hydrate to roll back
     * and rethrow. @param {Id} id @param {DayKey} on @returns {Promise<Task | undefined>}
     */
    async complete(id, on) {
      const successor = planner.complete(id, on)
      try {
        const completed = planner.get(id)
        if (completed) await plansRepo.save(completed)
        if (successor) await plansRepo.save(successor)
      } catch (err) {
        await hydrate()
        throw err
      }
      await hydrate()
      return successor
    },

    /** Cancel a plan (open → canceled). Persist, then re-hydrate (rollback on failure). @param {Id} id */
    async cancel(id) {
      const plan = planner.get(id)
      if (!plan) return
      plan.cancel()
      try {
        await plansRepo.save(plan)
      } catch (err) {
        await hydrate()
        throw err
      }
      await hydrate()
    },

    /** Soft-delete a plan and drop it from the aggregate (idempotent). @param {Id} id */
    async remove(id) {
      await plansRepo.delete(id)
      planner.remove(id)
      revision.set((n += 1))
    },

    /** Agenda for the day (open + done, ordered; canceled excluded). @param {DayKey} day @returns {readonly Plan[]} */
    agendaFor(day) {
      revision.get()
      return planner.agendaFor(day)
    },

    /** Open plans whose due has passed, as of `day`. @param {DayKey} day @returns {readonly Plan[]} */
    overdue(day) {
      revision.get()
      return planner.overdue(day)
    },

    /** Canceled plans due on the day (shown struck-through). @param {DayKey} day @returns {readonly Plan[]} */
    canceledOn(day) {
      revision.get()
      return planner.all().filter((p) => p.status === 'canceled' && p.due !== undefined && p.due.equals(day))
    },

    /** @param {Id} id @returns {Plan | undefined} */
    get(id) {
      revision.get()
      return planner.get(id)
    },
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run planner-store`
Expected: PASS — 7 cases. (The rollback case relies on `LocalStorageRepository` cloning — the planner holds a deserialized clone, so the in-place `complete` mutation isn't visible in storage until `save`; a failed save + `hydrate()` re-reads the untouched storage.)

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit`
Expected: exit 0. (If `Repository<Plan>` doesn't resolve as a type, fall back to `import('@oyl/all-of-oyl').LocalStorageRepository<any>` for the `PlansRepo` typedef. The `COLLECTIONS.plans` cast to `any` in the test sidesteps the codec's heterogeneous generic.)

- [ ] **Step 6: Full suite + commit**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run` (expect 68 prior + 7 = 75). Then:
```bash
git add apps/vanilla-oyl/src/state/planner-store.js apps/vanilla-oyl/src/state/planner-store.test.js
git commit -m "feat(vanilla-oyl): PlannerStore — stateful write-path (persist-first creates, mutate→persist→re-hydrate)"
```

---

# Phase 2 — data.js wiring

### Task 2: Build + hydrate the planner store

**Files:**
- Modify: `apps/vanilla-oyl/src/state/data.js`
- Modify: `apps/vanilla-oyl/src/state/data.test.js`

- [ ] **Step 1: Add the failing test**

In `apps/vanilla-oyl/src/state/data.test.js`, add imports at the top (alongside existing ones):
```js
import { Task, DayKey } from '@oyl/all-of-oyl'
```
And add this case inside the existing `describe('data state', () => { ... })` block:
```js
  it('exposes a planner store hydrated from the plans repo on refresh', async () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    const due = DayKey.of('2026-06-16')
    await ds.repos.plans.save(/** @type {any} */ (new Task({ title: 'plan it', due })))
    await ds.refresh()
    expect(ds.planner.agendaFor(due)).toHaveLength(1)
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run state/data`
Expected: FAIL — `ds.planner` is undefined.

- [ ] **Step 3: Implement**

In `apps/vanilla-oyl/src/state/data.js`:

Add the import near the top (next to the journal-store import):
```js
import { createPlannerStore } from './planner-store.js'
```

Inside `createDataState`, after the `const journal = createJournalStore(...)` line, add:
```js
  const planner = createPlannerStore(repos.plans)
```

In `refresh()`, after `await journal.hydrate()`, add:
```js
    await planner.hydrate()
```

Add `planner` to the returned object:
```js
  return { repos, counts, schema, refresh, readDiagnostics, journal, planner }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run state/data`
Expected: PASS (the new case + existing data-state cases).

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run && pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit`
Expected: all PASS; tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/state/data.js apps/vanilla-oyl/src/state/data.test.js
git commit -m "feat(vanilla-oyl): build + hydrate the planner store in data state"
```

---

# Phase 3 — display helpers

### Task 3: `planner/format.js`

**Files:**
- Create: `apps/vanilla-oyl/src/planner/format.test.js`
- Create: `apps/vanilla-oyl/src/planner/format.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/planner/format.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { Cadence, Appointment, DayKey } from '@oyl/all-of-oyl'
import { cadenceLabel, appointmentTime, overdueBadge } from './format.js'

describe('planner format helpers', () => {
  it('cadenceLabel: singular for n=1, plural otherwise', () => {
    expect(cadenceLabel(Cadence.of(1, 'weeks'))).toBe('every week')
    expect(cadenceLabel(Cadence.of(1, 'days'))).toBe('every day')
    expect(cadenceLabel(Cadence.of(2, 'weeks'))).toBe('every 2 weeks')
    expect(cadenceLabel(Cadence.of(3, 'months'))).toBe('every 3 months')
  })

  it('appointmentTime: clock time, with duration suffix when set', () => {
    const a = new Appointment({ title: 'Dentist', startsAt: new Date('2026-06-16T15:00:00'), durationMinutes: 60, tz: 'America/New_York' })
    expect(appointmentTime(a)).toMatch(/\d{1,2}:\d{2}.*·.*60m/)
    const b = new Appointment({ title: 'Quick', startsAt: new Date('2026-06-16T09:00:00'), tz: 'America/New_York' })
    expect(appointmentTime(b)).toMatch(/^\d{1,2}:\d{2}/)
    expect(appointmentTime(b)).not.toContain('·')
  })

  it('overdueBadge: "Due Mon D · Nd ago"', () => {
    expect(overdueBadge(DayKey.of('2026-06-13'), DayKey.of('2026-06-16'))).toBe('Due Jun 13 · 3d ago')
    expect(overdueBadge(DayKey.of('2026-06-15'), DayKey.of('2026-06-16'))).toBe('Due Jun 15 · 1d ago')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run planner/format`
Expected: FAIL — cannot resolve `./format.js`.

- [ ] **Step 3: Implement**

Create `apps/vanilla-oyl/src/planner/format.js`:

```js
import { formatClockTime } from '../journal/format.js'

/** @typedef {import('@oyl/all-of-oyl').Cadence} Cadence */
/** @typedef {import('@oyl/all-of-oyl').Appointment} Appointment */
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "every week" / "every 2 weeks". @param {Cadence} c @returns {string} */
export function cadenceLabel(c) {
  return c.n === 1 ? `every ${c.unit.slice(0, -1)}` : `every ${c.n} ${c.unit}`
}

/** Clock time, plus "· Nm" when a duration is set. @param {Appointment} appt @returns {string} */
export function appointmentTime(appt) {
  const base = formatClockTime(appt.startsAt)
  return appt.durationMinutes !== undefined ? `${base} · ${appt.durationMinutes}m` : base
}

/** "Due Jun 13 · 3d ago" for an overdue plan. @param {DayKey} due @param {DayKey} today @returns {string} */
export function overdueBadge(due, today) {
  const parts = due.value.split('-')
  const short = `${MONTHS[Number(parts[1]) - 1] ?? ''} ${Number(parts[2])}`
  const days = Math.round((Date.parse(today.value) - Date.parse(due.value)) / 86400000)
  return `Due ${short} · ${days}d ago`
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run planner/format`
Expected: PASS — 3 cases.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/planner/format.js apps/vanilla-oyl/src/planner/format.test.js
git commit -m "feat(vanilla-oyl): planner display helpers (cadence label, appointment time, overdue badge)"
```

---

# Phase 4 — nav

### Task 4: Add the Planner nav item

**Files:**
- Modify: `apps/vanilla-oyl/src/components/oyl-nav.js`
- Modify: `apps/vanilla-oyl/src/components/oyl-nav.test.js`

- [ ] **Step 1: Add the failing test**

In `apps/vanilla-oyl/src/components/oyl-nav.test.js`, add this case inside the existing `describe('<oyl-nav>', ...)` block:
```js
  it('includes a Planner link to #/planner and marks it active', async () => {
    const route = signal('planner')
    const el = /** @type {import('./oyl-nav.js').OylNav} */ (document.createElement('oyl-nav'))
    el.routeSignal = route
    document.body.append(el)
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)
    const link = /** @type {HTMLAnchorElement} */ (root.querySelector('a[data-route="planner"]'))
    expect(link.getAttribute('href')).toBe('#/planner')
    expect(link.getAttribute('aria-current')).toBe('page')
    el.remove()
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run oyl-nav`
Expected: FAIL — no `a[data-route="planner"]`.

- [ ] **Step 3: Implement**

In `apps/vanilla-oyl/src/components/oyl-nav.js`, add the Planner entry to the `ITEMS` array:
```js
const ITEMS = /** @type {ReadonlyArray<readonly [string, string]>} */ ([
  ['status', 'Status'],
  ['journal', 'Journal'],
  ['planner', 'Planner'],
])
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run oyl-nav`
Expected: PASS — existing cases + the new Planner case.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-nav.js apps/vanilla-oyl/src/components/oyl-nav.test.js
git commit -m "feat(vanilla-oyl): add Planner nav item"
```

---

# Phase 5 — plan row

### Task 5: `<oyl-plan-row>`

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-plan-row.test.js`
- Create: `apps/vanilla-oyl/src/components/oyl-plan-row.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/components/oyl-plan-row.test.js`:

```js
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { Task, Appointment, Cadence, DayKey } from '@oyl/all-of-oyl'
import { definePlanRow } from './oyl-plan-row.js'

beforeAll(() => definePlanRow())

function row(plan, handlers = {}) {
  const el = /** @type {import('./oyl-plan-row.js').OylPlanRow} */ (document.createElement('oyl-plan-row'))
  el.plan = plan
  el.onComplete = handlers.onComplete ?? (() => {})
  el.onCancel = handlers.onCancel ?? (() => {})
  el.onDelete = handlers.onDelete ?? (() => {})
  if (handlers.overdueAsOf) el.overdueAsOf = handlers.overdueAsOf
  document.body.append(el)
  return el
}
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)

describe('<oyl-plan-row>', () => {
  it('renders a task title with a recurrence badge', () => {
    const el = row(new Task({ title: 'Water', due: DayKey.of('2026-06-16'), cadence: Cadence.of(1, 'weeks') }))
    const text = root(el).textContent ?? ''
    expect(text).toContain('Water')
    expect(text.toLowerCase()).toContain('every week')
    el.remove()
  })

  it('renders an appointment with its time and an appointment badge', () => {
    const el = row(new Appointment({ title: 'Dentist', startsAt: new Date('2026-06-16T15:00:00'), durationMinutes: 60, tz: 'America/New_York' }))
    const text = root(el).textContent ?? ''
    expect(text).toContain('Dentist')
    expect(text.toLowerCase()).toContain('appointment')
    expect(text).toMatch(/\d{1,2}:\d{2}/)
    el.remove()
  })

  it('complete checkbox calls onComplete(id)', () => {
    const t = new Task({ title: 'x', due: DayKey.of('2026-06-16') })
    const onComplete = vi.fn()
    const el = row(t, { onComplete })
    /** @type {HTMLInputElement} */ (root(el).querySelector('input[type="checkbox"]')).click()
    expect(onComplete).toHaveBeenCalledWith(t.id)
    el.remove()
  })

  it('cancel and delete each use an inline two-step confirm', () => {
    const t = new Task({ title: 'x', due: DayKey.of('2026-06-16') })
    const onCancel = vi.fn(); const onDelete = vi.fn()
    const el = row(t, { onCancel, onDelete })
    const r = root(el)
    // delete → No reverts
    /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="delete"]')).click()
    /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="cancel-confirm"][data-for="delete"]')).click()
    expect(onDelete).not.toHaveBeenCalled()
    // cancel → Yes confirms
    /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="cancelplan"]')).click()
    /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="confirm"][data-for="cancelplan"]')).click()
    expect(onCancel).toHaveBeenCalledWith(t.id)
    el.remove()
  })

  it('done plan: struck-through, no checkbox interaction, only delete', () => {
    const t = new Task({ title: 'done one', due: DayKey.of('2026-06-16') })
    t.complete(DayKey.of('2026-06-16'))
    const el = row(t)
    const r = root(el)
    expect(r.querySelector('button[data-act="cancelplan"]')).toBeNull()
    expect(r.querySelector('button[data-act="delete"]')).toBeTruthy()
    el.remove()
  })

  it('overdueAsOf shows an overdue badge', () => {
    const el = row(new Task({ title: 'late', due: DayKey.of('2026-06-13') }), { overdueAsOf: DayKey.of('2026-06-16') })
    expect((root(el).textContent ?? '').toLowerCase()).toContain('ago')
    el.remove()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run oyl-plan-row`
Expected: FAIL — cannot resolve `./oyl-plan-row.js`.

- [ ] **Step 3: Implement**

Create `apps/vanilla-oyl/src/components/oyl-plan-row.js`:

```js
import { Task, Appointment } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { cadenceLabel, appointmentTime, overdueBadge } from '../planner/format.js'

/** @typedef {import('@oyl/all-of-oyl').Plan} Plan */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */

const styles = sheet(`
  :host { display: block; container-type: inline-size; border-top: 1px solid var(--color-border); }
  .row { display: grid; grid-template-columns: auto 1fr auto; gap: .25rem .8rem; align-items: start; padding: .8rem 0; }
  .check { appearance: none; inline-size: 1.25rem; block-size: 1.25rem; border: 1.5px solid var(--color-border); border-radius: 999px; cursor: pointer; margin-block-start: .15rem; display: grid; place-items: center; }
  .check:hover { border-color: var(--color-accent); }
  .check:checked, .check.done { background: var(--color-accent); border-color: var(--color-accent); }
  .check:checked::after, .check.done::after { content: "✓"; color: white; font-size: .8rem; }
  .body { grid-column: 2; }
  .title { color: var(--color-text); }
  .done .title, .canceled .title { text-decoration: line-through; color: var(--color-muted); }
  .meta { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin-block-start: .2rem; }
  .time { font-family: var(--font-mono); font-size: .85rem; color: var(--color-muted); font-variant-numeric: tabular-nums; }
  .badge { font-size: .68rem; font-weight: 650; padding: .1rem .45rem; border-radius: 999px; }
  .badge.appt { color: var(--color-accent); background: color-mix(in oklch, var(--color-accent) 14%, transparent); }
  .badge.recur { color: var(--color-muted); background: color-mix(in oklch, var(--color-text) 8%, transparent); }
  .badge.overdue { color: var(--color-warn, var(--color-danger)); background: color-mix(in oklch, var(--color-danger) 14%, transparent); }
  .badge.cancel { color: var(--color-muted); background: color-mix(in oklch, var(--color-text) 8%, transparent); }
  .annot { color: var(--color-muted); font-size: .85rem; font-style: italic; margin-block-start: .25rem; }
  .actions { grid-column: 3; align-self: center; display: inline-flex; gap: .2rem; }
  button { font: inherit; color: var(--color-muted); border: 0; background: none; cursor: pointer; border-radius: var(--radius-1); padding: .25rem .5rem; font-size: .85rem; }
  button:hover { background: color-mix(in oklch, var(--color-text) 8%, transparent); color: var(--color-text); }
  button.del:hover { color: var(--color-danger); background: color-mix(in oklch, var(--color-danger) 12%, transparent); }
  .confirm { display: inline-flex; gap: .3rem; align-items: center; font-size: .85rem; color: var(--color-danger); }
  .confirm .yes { color: white; background: var(--color-danger); font-weight: 600; }
  @container (max-width: 26rem) { .row { grid-template-columns: auto 1fr; } .actions { grid-column: 2; margin-block-start: .3rem; } }
`)

export class OylPlanRow extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {Plan} */
    this.plan = /** @type {Plan} */ (/** @type {unknown} */ (undefined))
    /** @type {(id: Id) => void} */
    this.onComplete = () => {}
    /** @type {(id: Id) => void} */
    this.onCancel = () => {}
    /** @type {(id: Id) => void} */
    this.onDelete = () => {}
    /** @type {DayKey | undefined} */
    this.overdueAsOf = undefined
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const status = this.plan.status
    const row = document.createElement('div')
    row.className = `row ${status}`

    // complete checkbox (open only; a static done marker otherwise)
    const check = document.createElement('input')
    check.type = 'checkbox'
    check.className = 'check'
    check.setAttribute('aria-label', status === 'done' ? 'Completed' : 'Complete')
    if (status === 'open') {
      check.addEventListener('click', () => this.onComplete(this.plan.id), { signal: this.lifecycle })
    } else {
      check.checked = status === 'done'
      check.disabled = true
      if (status === 'done') check.classList.add('done')
    }

    // body
    const body = document.createElement('div')
    body.className = 'body'
    const title = document.createElement('div')
    title.className = 'title'
    title.textContent = this.plan.title
    body.append(title)

    const meta = document.createElement('div')
    meta.className = 'meta'
    if (this.overdueAsOf !== undefined && this.plan.due !== undefined) {
      meta.append(this._badge('overdue', overdueBadge(this.plan.due, this.overdueAsOf)))
    }
    if (this.plan instanceof Appointment) {
      const t = document.createElement('span')
      t.className = 'time'
      t.textContent = appointmentTime(this.plan)
      meta.append(t, this._badge('appt', 'Appointment'))
    } else if (this.plan instanceof Task && this.plan.cadence !== undefined) {
      meta.append(this._badge('recur', `↻ ${cadenceLabel(this.plan.cadence)}`))
    }
    if (status === 'canceled') meta.append(this._badge('cancel', 'Canceled'))
    if (meta.childNodes.length) body.append(meta)

    // actions
    const actions = document.createElement('div')
    actions.className = 'actions'
    this._renderActions(actions)

    row.append(check, body, actions)
    root.append(row)
  }

  /** @param {string} cls @param {string} text @returns {HTMLElement} */
  _badge(cls, text) {
    const b = document.createElement('span')
    b.className = `badge ${cls}`
    b.textContent = text
    return b
  }

  /** @param {HTMLElement} mount */
  _renderActions(mount) {
    mount.replaceChildren()
    if (this.plan.status === 'open') {
      mount.append(this._actionButton('cancelplan', 'Cancel', false, () => this.onCancel(this.plan.id)))
    }
    mount.append(this._actionButton('delete', 'Delete', true, () => this.onDelete(this.plan.id)))
  }

  /** @param {string} act @param {string} label @param {boolean} danger @param {() => void} onYes @returns {HTMLButtonElement} */
  _actionButton(act, label, danger, onYes) {
    const b = document.createElement('button')
    b.dataset.act = act
    if (danger) b.className = 'del'
    b.textContent = label
    b.addEventListener('click', () => this._confirm(act, onYes), { signal: this.lifecycle })
    return b
  }

  /** @param {string} act @param {() => void} onYes */
  _confirm(act, onYes) {
    const mount = /** @type {HTMLElement} */ (this.shadowRoot.querySelector('.actions'))
    mount.replaceChildren()
    const group = document.createElement('span')
    group.className = 'confirm'
    group.setAttribute('role', 'group')
    group.setAttribute('aria-label', `Confirm ${act}`)
    const label = document.createElement('span')
    label.textContent = act === 'delete' ? 'Delete?' : 'Cancel plan?'
    const yes = document.createElement('button')
    yes.className = 'yes'
    yes.dataset.act = 'confirm'
    yes.dataset.for = act
    yes.textContent = 'Yes'
    yes.addEventListener('click', () => onYes(), { signal: this.lifecycle })
    const no = document.createElement('button')
    no.dataset.act = 'cancel-confirm'
    no.dataset.for = act
    no.textContent = 'No'
    no.addEventListener('click', () => this._renderActions(mount), { signal: this.lifecycle })
    group.append(label, yes, no)
    mount.append(group)
  }
}

/** Register the element (idempotent). */
export function definePlanRow() {
  if (!customElements.get('oyl-plan-row')) customElements.define('oyl-plan-row', OylPlanRow)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run oyl-plan-row`
Expected: PASS — 6 cases. (The cancel/delete test exercises both inline confirms; selectors `button[data-act="cancelplan"]`/`[data-act="delete"]` open the confirm, `[data-act="confirm"][data-for=...]` / `[data-act="cancel-confirm"][data-for=...]` resolve it.)

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (exit 0); `grep -n innerHTML apps/vanilla-oyl/src/components/oyl-plan-row.js` empty. Then:
```bash
git add apps/vanilla-oyl/src/components/oyl-plan-row.js apps/vanilla-oyl/src/components/oyl-plan-row.test.js
git commit -m "feat(vanilla-oyl): <oyl-plan-row> — complete/cancel/delete, badges, status styling"
```

---

# Phase 6 — composer

### Task 6: `<oyl-plan-composer>`

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-plan-composer.test.js`
- Create: `apps/vanilla-oyl/src/components/oyl-plan-composer.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/components/oyl-plan-composer.test.js`:

```js
import { describe, expect, it, beforeAll } from 'vitest'
import { DayKey, Task, Appointment } from '@oyl/all-of-oyl'
import { definePlanComposer } from './oyl-plan-composer.js'

beforeAll(() => definePlanComposer())

const TZ = 'America/New_York'
function composer(store, day = DayKey.of('2026-06-16')) {
  const el = /** @type {import('./oyl-plan-composer.js').OylPlanComposer} */ (document.createElement('oyl-plan-composer'))
  el.store = /** @type {any} */ (store)
  el.tz = TZ
  el.getDay = () => day
  document.body.append(el)
  return el
}
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)
const q = (el, sel) => /** @type {any} */ (root(el).querySelector(sel))

describe('<oyl-plan-composer>', () => {
  it('adds a one-off task with the typed title and due', async () => {
    const added = /** @type {any[]} */ ([])
    const store = { add: async (p) => { added.push(p); return p } }
    const el = composer(store)
    q(el, 'input[name="title"]').value = 'File taxes'
    q(el, 'input[name="due"]').value = '2026-06-16'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await Promise.resolve(); await Promise.resolve()
    expect(added[0]).toBeInstanceOf(Task)
    expect(added[0].title).toBe('File taxes')
    expect(added[0].due?.value).toBe('2026-06-16')
    expect(added[0].cadence).toBeUndefined()
    el.remove()
  })

  it('adds a recurring task when repeat is enabled', async () => {
    const added = /** @type {any[]} */ ([])
    const store = { add: async (p) => { added.push(p); return p } }
    const el = composer(store)
    q(el, 'input[name="title"]').value = 'Water'
    q(el, 'input[name="repeat"]').checked = true
    q(el, 'input[name="repeat"]').dispatchEvent(new Event('change', { bubbles: true }))
    q(el, 'input[name="repeatN"]').value = '2'
    q(el, 'select[name="repeatUnit"]').value = 'weeks'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await Promise.resolve(); await Promise.resolve()
    expect(added[0]).toBeInstanceOf(Task)
    expect(added[0].cadence?.n).toBe(2)
    expect(added[0].cadence?.unit).toBe('weeks')
    el.remove()
  })

  it('adds an appointment with a tz-derived due', async () => {
    const added = /** @type {any[]} */ ([])
    const store = { add: async (p) => { added.push(p); return p } }
    const el = composer(store)
    q(el, 'button[data-type="appointment"]').click()
    q(el, 'input[name="title"]').value = 'Dentist'
    q(el, 'input[name="startsAt"]').value = '2026-06-16T15:00'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await Promise.resolve(); await Promise.resolve()
    expect(added[0]).toBeInstanceOf(Appointment)
    expect(added[0].title).toBe('Dentist')
    expect(added[0].due).toBeDefined()
    el.remove()
  })

  it('renders a domain error inline on empty title and does not call store.add', async () => {
    let calls = 0
    const store = { add: async (p) => { calls++; return p } }
    const el = composer(store)
    q(el, 'input[name="title"]').value = ''
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await Promise.resolve(); await Promise.resolve()
    expect(calls).toBe(0)
    expect((root(el).querySelector('[data-role="error"]')?.textContent ?? '').length).toBeGreaterThan(0)
    el.remove()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run oyl-plan-composer`
Expected: FAIL — cannot resolve `./oyl-plan-composer.js`.

- [ ] **Step 3: Implement**

Create `apps/vanilla-oyl/src/components/oyl-plan-composer.js`:

```js
import { Task, Appointment, Cadence } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { signal } from '../lib/reactive/signal.js'
import { sheet } from './sheet.js'

/** @typedef {ReturnType<typeof import('../state/planner-store.js').createPlannerStore>} PlannerStore */
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */

const UNITS = ['days', 'weeks', 'months']

const styles = sheet(`
  form { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-2); padding: 1rem; }
  .seg { display: inline-flex; background: color-mix(in oklch, var(--color-text) 6%, transparent); border-radius: 999px; padding: .2rem; gap: .15rem; margin-block-end: .85rem; }
  .seg button { font: inherit; border: 0; background: none; cursor: pointer; padding: .3rem .9rem; border-radius: 999px; font-size: .85rem; font-weight: 550; color: var(--color-muted); }
  .seg button[aria-pressed="true"] { background: var(--color-surface); color: var(--color-text); }
  label { display: block; font-size: .85rem; color: var(--color-muted); margin-block-end: .25rem; }
  input, select { width: 100%; font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .6rem .7rem; }
  .field { margin-block-end: .7rem; }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: .7rem; }
  .repeat { display: flex; align-items: center; gap: .5rem; font-size: .85rem; color: var(--color-muted); flex-wrap: wrap; }
  .repeat input[type="checkbox"] { width: auto; }
  .repeat input[type="number"] { width: 4.5rem; }
  .repeat select { width: auto; }
  .actions { display: flex; justify-content: flex-end; margin-block-start: .9rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1.1rem; font: inherit; font-weight: 600; cursor: pointer; }
  [data-role="error"]:not(:empty) { color: var(--color-danger); font-size: .85rem; margin-block-start: .5rem; }
`)

export class OylPlanComposer extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {PlannerStore} */
    this.store = /** @type {PlannerStore} */ (/** @type {unknown} */ (undefined))
    /** @type {string} */
    this.tz = 'UTC'
    /** @type {() => DayKey} */
    this.getDay = () => /** @type {DayKey} */ (/** @type {unknown} */ (undefined))
    /** @type {() => void} */
    this.onAdded = () => {}
    this._type = signal('task')
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const formEl = document.createElement('form')

    const seg = document.createElement('div')
    seg.className = 'seg'
    seg.setAttribute('role', 'group')
    seg.setAttribute('aria-label', 'Plan type')
    const taskBtn = this._segButton('task', 'Task')
    const apptBtn = this._segButton('appointment', 'Appointment')
    seg.append(taskBtn, apptBtn)

    const title = this._input('title', 'text')

    // task fields
    const taskFields = document.createElement('div')
    const due = this._input('due', 'date')
    const repeat = this._input('repeat', 'checkbox')
    const repeatN = this._input('repeatN', 'number')
    repeatN.value = '1'
    repeatN.min = '1'
    repeatN.disabled = true
    const repeatUnit = document.createElement('select')
    repeatUnit.name = 'repeatUnit'
    repeatUnit.disabled = true
    for (const u of UNITS) {
      const o = document.createElement('option')
      o.value = u
      o.textContent = u
      repeatUnit.append(o)
    }
    repeat.addEventListener('change', () => { repeatN.disabled = !repeat.checked; repeatUnit.disabled = !repeat.checked }, { signal: this.lifecycle })
    const repeatRow = document.createElement('div')
    repeatRow.className = 'repeat'
    const repeatLabel = document.createElement('label')
    repeatLabel.style.margin = '0'
    repeatLabel.textContent = 'Repeat'
    repeatLabel.append(repeat)
    repeatRow.append(repeatLabel, repeatN, repeatUnit)
    taskFields.append(this._labeled('due', 'Due', due), repeatRow)

    // appointment fields
    const apptFields = document.createElement('div')
    apptFields.hidden = true
    const startsAt = this._input('startsAt', 'datetime-local')
    const duration = this._input('duration', 'number')
    duration.min = '1'
    const apptRow = document.createElement('div')
    apptRow.className = 'row2'
    apptRow.append(this._labeled('startsAt', 'Starts', startsAt), this._labeled('duration', 'Minutes (optional)', duration))
    apptFields.append(apptRow)

    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')

    const actions = document.createElement('div')
    actions.className = 'actions'
    const submit = document.createElement('button')
    submit.type = 'submit'
    submit.className = 'primary'
    submit.textContent = 'Add to plan'
    actions.append(submit)

    formEl.append(seg, this._labeled('title', 'Title', title), taskFields, apptFields, error, actions)
    root.append(formEl)

    this.track(() => {
      const isTask = this._type.get() === 'task'
      taskFields.hidden = !isTask
      apptFields.hidden = isTask
      taskBtn.setAttribute('aria-pressed', String(isTask))
      apptBtn.setAttribute('aria-pressed', String(!isTask))
    })
    this._syncDefaults(due, startsAt)

    formEl.addEventListener('submit', (e) => {
      e.preventDefault()
      void this._submit({ error, title, due, repeat, repeatN, repeatUnit, startsAt, duration, formEl })
    }, { signal: this.lifecycle })
    formEl.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (typeof formEl.requestSubmit === 'function') formEl.requestSubmit()
        else formEl.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
      }
    }, { signal: this.lifecycle })
  }

  /** @param {HTMLInputElement} due @param {HTMLInputElement} startsAt */
  _syncDefaults(due, startsAt) {
    const day = this.getDay().value
    due.value = day
    startsAt.value = `${day}T09:00`
  }

  /**
   * @param {{ error: HTMLElement, title: HTMLInputElement, due: HTMLInputElement, repeat: HTMLInputElement,
   *   repeatN: HTMLInputElement, repeatUnit: HTMLSelectElement, startsAt: HTMLInputElement, duration: HTMLInputElement,
   *   formEl: HTMLFormElement }} ctx
   */
  async _submit(ctx) {
    ctx.error.textContent = ''
    ctx.title.removeAttribute('aria-invalid')
    try {
      /** @type {import('@oyl/all-of-oyl').Plan} */
      let plan
      if (this._type.get() === 'task') {
        const { DayKey } = await import('@oyl/all-of-oyl')
        const props = /** @type {{ title: string, due?: import('@oyl/all-of-oyl').DayKey, cadence?: import('@oyl/all-of-oyl').Cadence }} */ ({ title: ctx.title.value })
        if (ctx.due.value) props.due = DayKey.of(ctx.due.value)
        if (ctx.repeat.checked) props.cadence = Cadence.of(Number(ctx.repeatN.value), /** @type {any} */ (ctx.repeatUnit.value))
        plan = new Task(props)
      } else {
        const props = /** @type {{ title: string, startsAt: Date, durationMinutes?: number, tz: string }} */ ({ title: ctx.title.value, startsAt: new Date(ctx.startsAt.value), tz: this.tz })
        if (ctx.duration.value) props.durationMinutes = Number(ctx.duration.value)
        plan = new Appointment(props)
      }
      await this.store.add(plan)
      ctx.formEl.reset()
      this._syncDefaults(ctx.due, ctx.startsAt)
      ctx.repeatN.disabled = true
      ctx.repeatUnit.disabled = true
      this.onAdded()
    } catch (err) {
      ctx.error.textContent = err instanceof Error ? err.message : String(err)
      ctx.title.setAttribute('aria-invalid', 'true')
      ctx.title.setAttribute('aria-describedby', 'plan-error')
      ctx.error.id = 'plan-error'
    }
  }

  /** @param {string} type @param {string} label @returns {HTMLButtonElement} */
  _segButton(type, label) {
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.type = type
    b.textContent = label
    b.addEventListener('click', () => this._type.set(type), { signal: this.lifecycle })
    return b
  }

  /** @param {string} name @param {string} type @returns {HTMLInputElement} */
  _input(name, type) {
    const i = document.createElement('input')
    i.name = name
    i.type = type
    return i
  }

  /** @param {string} forName @param {string} text @param {HTMLElement} control @returns {HTMLElement} */
  _labeled(forName, text, control) {
    const wrap = document.createElement('div')
    wrap.className = 'field'
    const label = document.createElement('label')
    label.textContent = text
    label.htmlFor = forName
    control.id = forName
    wrap.append(label, control)
    return wrap
  }
}

/** Register the element (idempotent). */
export function definePlanComposer() {
  if (!customElements.get('oyl-plan-composer')) customElements.define('oyl-plan-composer', OylPlanComposer)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run oyl-plan-composer`
Expected: PASS — 4 cases.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (exit 0); `grep -n innerHTML apps/vanilla-oyl/src/components/oyl-plan-composer.js` empty. Then:
```bash
git add apps/vanilla-oyl/src/components/oyl-plan-composer.js apps/vanilla-oyl/src/components/oyl-plan-composer.test.js
git commit -m "feat(vanilla-oyl): <oyl-plan-composer> (task/appointment, recurrence, inline validation)"
```

---

# Phase 7 — screen container

### Task 7: `<oyl-planner>`

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-planner.test.js`
- Create: `apps/vanilla-oyl/src/components/oyl-planner.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/components/oyl-planner.test.js`:

```js
import { describe, expect, it, beforeAll } from 'vitest'
import { LocalStorageRepository, COLLECTIONS, Task, DayKey } from '@oyl/all-of-oyl'
import { createPlannerStore } from '../state/planner-store.js'
import { definePlanner } from './oyl-planner.js'
import { now } from '../storage/clock.js'

const TZ = 'America/New_York'
beforeAll(() => definePlanner())

function plansRepo() {
  const map = new Map()
  const storage = { /** @param {string} k */ getItem: (k) => map.get(k) ?? null, /** @param {string} k @param {string} v */ setItem: (k, v) => map.set(k, v) }
  return new LocalStorageRepository(storage, 'oyl/data/plans', /** @type {any} */ (COLLECTIONS.plans))
}
function screen(store, tz = TZ) {
  const el = /** @type {import('./oyl-planner.js').OylPlanner} */ (document.createElement('oyl-planner'))
  el.store = store
  el.tz = tz
  document.body.append(el)
  return el
}
const rows = (el) => /** @type {ShadowRoot} */ (el.shadowRoot).querySelectorAll('oyl-plan-row')
const txt = (el) => /** @type {ShadowRoot} */ (el.shadowRoot).textContent ?? ''
const today = () => DayKey.from(now(), TZ)

describe('<oyl-planner>', () => {
  it('renders the day agenda and updates reactively on add', async () => {
    const store = createPlannerStore(plansRepo())
    const el = screen(store)
    expect(rows(el)).toHaveLength(0)
    expect(txt(el).toLowerCase()).toContain('nothing')
    await store.add(new Task({ title: 'today task', due: today() }))
    await Promise.resolve()
    expect(rows(el)).toHaveLength(1)
    el.remove()
  })

  it('surfaces an overdue section on the today view', async () => {
    const store = createPlannerStore(plansRepo())
    await store.add(new Task({ title: 'late', due: today().addDays(-2) }))
    const el = screen(store)
    await Promise.resolve()
    expect(txt(el).toLowerCase()).toContain('overdue')
    expect(rows(el).length).toBeGreaterThanOrEqual(1)
    el.remove()
  })

  it('completing a task via its row removes it from the open agenda', async () => {
    const store = createPlannerStore(plansRepo())
    await store.add(new Task({ title: 'do it', due: today() }))
    const el = screen(store)
    await Promise.resolve()
    const row = /** @type {any} */ (el.shadowRoot.querySelector('oyl-plan-row'))
    /** @type {HTMLInputElement} */ (row.shadowRoot.querySelector('input[type="checkbox"]')).click()
    await Promise.resolve(); await Promise.resolve()
    // still present but marked done (agendaFor includes done); the checkbox is now checked/disabled
    const doneRow = /** @type {any} */ (el.shadowRoot.querySelector('oyl-plan-row'))
    expect(/** @type {HTMLInputElement} */ (doneRow.shadowRoot.querySelector('input[type="checkbox"]')).checked).toBe(true)
    el.remove()
  })

  it('navigating to the previous day shows a different (empty) agenda', async () => {
    const store = createPlannerStore(plansRepo())
    await store.add(new Task({ title: 'today only', due: today() }))
    const el = screen(store)
    await Promise.resolve()
    expect(rows(el)).toHaveLength(1)
    /** @type {HTMLButtonElement} */ (el.shadowRoot.querySelector('button[data-nav="prev"]')).click()
    await Promise.resolve()
    expect(rows(el)).toHaveLength(0)
    el.remove()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run oyl-planner`
Expected: FAIL — cannot resolve `./oyl-planner.js`.

- [ ] **Step 3: Implement**

Create `apps/vanilla-oyl/src/components/oyl-planner.js`:

```js
import { DayKey } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { signal } from '../lib/reactive/signal.js'
import { sheet } from './sheet.js'
import { now } from '../storage/clock.js'
import { relativeDayLabel, formatDayHeading } from '../journal/format.js'
import { definePlanComposer } from './oyl-plan-composer.js'
import { definePlanRow } from './oyl-plan-row.js'

/** @typedef {ReturnType<typeof import('../state/planner-store.js').createPlannerStore>} PlannerStore */
/** @typedef {import('@oyl/all-of-oyl').Plan} Plan */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */

const styles = sheet(`
  :host { display: block; max-inline-size: 680px; margin-inline: auto; padding: clamp(1rem, 4vw, 2rem) 1rem 4rem; }
  .daynav { display: flex; align-items: center; justify-content: center; gap: .4rem; margin-block-end: 1.4rem; }
  .daynav button { font: inherit; color: var(--color-muted); border: 0; background: none; cursor: pointer; inline-size: 2.1rem; block-size: 2.1rem; border-radius: 999px; font-size: 1.1rem; }
  .daynav button:hover { background: color-mix(in oklch, var(--color-text) 6%, transparent); color: var(--color-text); }
  .day { text-align: center; min-inline-size: 13rem; }
  h2 { font-size: var(--step-2); font-weight: 640; letter-spacing: -.02em; line-height: 1.1; }
  .rel { color: var(--color-muted); font-size: .85rem; margin-block-start: .15rem; }
  oyl-plan-composer { display: block; margin-block-end: 1.6rem; }
  .section-label { font-size: .72rem; text-transform: uppercase; letter-spacing: .07em; font-weight: 700; color: var(--color-muted); margin: 1.4rem 0 .2rem; }
  .section-label.overdue { color: var(--color-danger); }
  ol { list-style: none; margin: 0; padding: 0; }
  .empty { text-align: center; color: var(--color-muted); padding: 2.5rem 1rem; }
  .sr-only { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip: rect(0 0 0 0); }
`)

export class OylPlanner extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {PlannerStore} */
    this.store = /** @type {PlannerStore} */ (/** @type {unknown} */ (undefined))
    /** @type {string} */
    this.tz = 'UTC'
    /** @type {import('../lib/reactive/signal.js').Signal<DayKey>} */
    this._day = /** @type {any} */ (undefined)
  }

  render() {
    definePlanComposer()
    definePlanRow()
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    this._day = signal(DayKey.from(now(), this.tz), (a, b) => a.equals(b))

    const daynav = document.createElement('div')
    daynav.className = 'daynav'
    const prev = this._navButton('prev', '‹', 'Previous day')
    const next = this._navButton('next', '›', 'Next day')
    const dayBox = document.createElement('div')
    dayBox.className = 'day'
    const h2 = document.createElement('h2')
    h2.tabIndex = -1
    const rel = document.createElement('div')
    rel.className = 'rel'
    dayBox.append(h2, rel)
    daynav.append(prev, dayBox, next)

    const live = document.createElement('div')
    live.className = 'sr-only'
    live.setAttribute('aria-live', 'polite')

    const composer = /** @type {import('./oyl-plan-composer.js').OylPlanComposer} */ (document.createElement('oyl-plan-composer'))
    composer.store = this.store
    composer.tz = this.tz
    composer.getDay = () => this._day.get()
    composer.onAdded = () => { live.textContent = 'Added to plan' }

    const overdueLabel = document.createElement('div')
    overdueLabel.className = 'section-label overdue'
    overdueLabel.textContent = 'Overdue'
    const overdueList = document.createElement('ol')
    const agendaLabel = document.createElement('div')
    agendaLabel.className = 'section-label'
    const agendaList = document.createElement('ol')
    const empty = document.createElement('div')
    empty.className = 'empty'

    root.append(daynav, live, composer, overdueLabel, overdueList, agendaLabel, agendaList, empty)

    this.addEventListener('keydown', (e) => {
      const t = /** @type {HTMLElement | null} */ (e.composedPath()[0] ?? null)
      const tag = t ? t.tagName : ''
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowLeft') this._go(-1, h2, live)
      else if (e.key === 'ArrowRight') this._go(1, h2, live)
    }, { signal: this.lifecycle })
    prev.addEventListener('click', () => this._go(-1, h2, live), { signal: this.lifecycle })
    next.addEventListener('click', () => this._go(1, h2, live), { signal: this.lifecycle })

    this.track(() => {
      const day = this._day.get()
      const today = DayKey.from(now(), this.tz)
      const isToday = day.equals(today)
      h2.textContent = formatDayHeading(day)
      rel.textContent = relativeDayLabel(day, today)

      // overdue (today only)
      const overdue = isToday ? this.store.overdue(today) : []
      overdueLabel.hidden = overdue.length === 0
      overdueList.replaceChildren()
      for (const plan of overdue) overdueList.append(this._rowEl(plan, today, today))

      // agenda (open + done) then canceled (struck)
      const agenda = [...this.store.agendaFor(day), ...this.store.canceledOn(day)]
      agendaLabel.hidden = agenda.length === 0
      agendaLabel.textContent = formatDayHeading(day)
      agendaList.replaceChildren()
      for (const plan of agenda) agendaList.append(this._rowEl(plan, today))

      empty.hidden = overdue.length > 0 || agenda.length > 0
      empty.textContent = empty.hidden ? '' : `Nothing planned for ${formatDayHeading(day)}. Add a task or appointment above.`
    })
  }

  /** @param {Plan} plan @param {DayKey} today @param {DayKey} [overdueAsOf] @returns {HTMLLIElement} */
  _rowEl(plan, today, overdueAsOf) {
    const row = /** @type {import('./oyl-plan-row.js').OylPlanRow} */ (document.createElement('oyl-plan-row'))
    row.plan = plan
    if (overdueAsOf !== undefined) row.overdueAsOf = overdueAsOf
    row.onComplete = (id) => { void this.store.complete(id, today); this._announce('Completed') }
    row.onCancel = (id) => { void this.store.cancel(id); this._announce('Canceled') }
    row.onDelete = (id) => { void this.store.remove(id); this._announce('Deleted') }
    const li = document.createElement('li')
    li.append(row)
    return li
  }

  /** @param {string} msg */
  _announce(msg) {
    const live = this.shadowRoot.querySelector('.sr-only')
    if (live) live.textContent = msg
  }

  /** @param {number} delta @param {HTMLElement} h2 @param {HTMLElement} live */
  _go(delta, h2, live) {
    this._day.set(this._day.get().addDays(delta))
    h2.focus()
    live.textContent = `Showing ${formatDayHeading(this._day.get())}`
  }

  /** @param {string} dir @param {string} glyph @param {string} label @returns {HTMLButtonElement} */
  _navButton(dir, glyph, label) {
    const b = document.createElement('button')
    b.dataset.nav = dir
    b.textContent = glyph
    b.setAttribute('aria-label', label)
    return b
  }
}

/** Register the element (idempotent). */
export function definePlanner() {
  if (!customElements.get('oyl-planner')) customElements.define('oyl-planner', OylPlanner)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run oyl-planner`
Expected: PASS — 4 cases.

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run && pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit`
Expected: all PASS; tsc exit 0. `grep -n innerHTML apps/vanilla-oyl/src/components/oyl-planner.js` empty.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-planner.js apps/vanilla-oyl/src/components/oyl-planner.test.js
git commit -m "feat(vanilla-oyl): <oyl-planner> screen — overdue + agenda, day nav, reactive, a11y"
```

---

# Phase 8 — wiring

### Task 8: Route + nav in `main.js`

**Files:**
- Modify: `apps/vanilla-oyl/src/main.js`

- [ ] **Step 1: Read** `apps/vanilla-oyl/src/main.js` to anchor edit sites (it already imports `defineNav`/`defineJournal`, builds `dataState`, has a `router.routes = { status, journal }` table, and mounts `<oyl-nav>`).

- [ ] **Step 2: Add the import** next to the other component registrars:
```js
import { definePlanner } from './components/oyl-planner.js'
```

- [ ] **Step 3: Register** in `boot()` next to the other `defineX()` calls:
```js
  definePlanner()
```

- [ ] **Step 4: Add the planner route** to the `router.routes` object (next to `journal`):
```js
    planner: () => {
      const view = /** @type {import('./components/oyl-planner.js').OylPlanner} */ (document.createElement('oyl-planner'))
      view.store = dataState.planner
      view.tz = defaultTimezone()
      return view
    },
```
(`defaultTimezone` is already imported from the Journal wiring; `<oyl-planner>` registers its own sub-components.)

- [ ] **Step 5: Verify**

Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (exit 0) and `pnpm --filter @oyl/vanilla-oyl exec vitest run` (all pass; main.js has no unit test). `grep -n innerHTML apps/vanilla-oyl/src/main.js` empty. `grep -nE "definePlanner|planner:" apps/vanilla-oyl/src/main.js` shows the additions.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/main.js
git commit -m "feat(vanilla-oyl): wire #/planner route into the app"
```

---

# Phase 9 — acceptance

### Task 9: Browser acceptance pass

**Files:** none (manual verification).

- [ ] **Step 1: Build + serve**

Run: `pnpm --filter @oyl/vanilla-oyl build:lib` then `pnpm --filter @oyl/vanilla-oyl dev` (serves on 8041).

- [ ] **Step 2: Walk the acceptance list at `http://localhost:8041/#/planner`**

Confirm each:
- Nav shows `Status · Journal · Planner`; Planner routes to the screen, marked active; today header.
- Add a **one-off task** (title + due today) → appears in the agenda with a complete checkbox.
- Add a **recurring task** (title + Repeat every 1 week) → appears with a `↻ every week` badge.
- Add an **appointment** (title + start datetime today) → appears under the agenda with its time + `Appointment` badge.
- **Complete** the recurring task (click its checkbox) → it shows done (struck), and navigating ‹/› to next week shows the respawned successor (open).
- Create a task **due yesterday** (or change the day) → on today it appears in the **Overdue** section with "Nd ago".
- **Cancel** a plan (inline confirm) → it shows struck-through "Canceled"; **Delete** another (inline confirm) → it disappears.
- Day nav ‹/› and **←/→ arrow keys** change the day; empty days show the empty state.
- Toggle Theme/Mode → re-themes with no flash.
- Reload → plans persist; open a second tab, add a plan there, watch this tab update (multi-tab).
- Invalid input (empty title) → inline error, not added.

- [ ] **Step 3: a11y spot-check**

Tab through: composer labels; `<h2>` focus on day change; live-region announces add/complete/cancel/delete/day-change; focus rings; checkbox reachable. (Optional: `chrome-devtools-mcp:a11y-debugging`.)

- [ ] **Step 4: Final verification**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run && pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit && pnpm --filter @oyl/all-of-oyl test`
Expected: all green. Then use `superpowers:finishing-a-development-branch`.

---

## Self-review notes (addressed in this plan)

- **Spec coverage:** PlannerStore stateful write-path incl. persist-first creates, mutate→persist→re-hydrate, rollback-on-failure, respawn (T1); data.js build+hydrate (T2); cadence/appointment/overdue helpers (T3); Planner nav item (T4); `<oyl-plan-row>` complete/cancel/delete + badges + status styling + overdue badge (T5); `<oyl-plan-composer>` task/appointment + recurrence + tz-derived appointment due + inline validation (T6); `<oyl-planner>` overdue (today) + agenda + canceled-struck + day nav + arrow keys + reactive + live region (T7); route wiring (T8); browser acceptance incl. respawn + overdue + multi-tab (T9). Out-of-scope (PlannedMeal/grocery, DayPlan time-boxing, projects, insights, fulfilledBy) not implemented.
- **Type consistency:** `store`/`tz`/`getDay`/`onAdded`/`onComplete`/`onCancel`/`onDelete`/`overdueAsOf`/`plan` props, the `data-act`/`data-nav`/`data-type`/`data-route`/`[data-role="error"]` hooks, and `createPlannerStore(plansRepo)` (no tz) / `PlannerStore = ReturnType<typeof createPlannerStore>` are used identically across implementations and tests.
- **Carried-forward limitations:** rollback-on-failure depends on the cloning `LocalStorageRepository` (the app's adapter) — tests use it, not the aliasing `InMemoryRepository`; happy-dom `{signal}`/`requestSubmit` shimmed; OylElement reconnect double-render (views created fresh per navigation).
