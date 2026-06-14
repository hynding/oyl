# vanilla-oyl Goals Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `#/goals` screen — list goals with current-period progress (derived live from the Journal), add/delete, pause/resume.

**Architecture:** `journalStore` gains a `progressOf(goal, day)` passthrough (keeps the `Journal` encapsulated, reactive to entries). A new journal-agnostic `GoalsStore` owns goals CRUD + stateful pause/resume. The screen composes both — tracking `goalsStore.revision` (list/pause) and `journalStore.progressOf` (entries) — so progress recomputes on either change. A preset-metric composer, a progress-bar row, the screen, nav item + `#/goals` route.

**Tech Stack:** Vanilla JS + JSDoc (strict checkJs), Vitest + happy-dom, `@oyl/all-of-oyl` (`Goal`/`GoalProgress`/`Measurement`/`DayKey`), the foundation's signals + Web Component base + vault/planner patterns + shared `inlineConfirm`.

**Spec:** `docs/superpowers/specs/2026-06-14-vanilla-oyl-goals-screen-design.md` (decisions R1–R10).

---

## Conventions (carried from prior screens)

- `.js` + JSDoc strict + checkJs. **No `innerHTML`** — `createElement`/`textContent`.
- `OylElement` (`this.track`, `this.lifecycle`, `static styles=[sheet(css)]`); idempotent `defineX()`.
- Double-cast default for externally-assigned fields; callback fields default to no-ops.
- STATIC domain imports. `@oyl/all-of-oyl` resolves to TS source — no build for tests/typecheck.
- ASI/null hazard: named locals with casts (or a leading `;`) for `.click()`; never bare `(…).click()`. Indexed access (`list[0]`) is `T | undefined` under strict — cast in tests.
- **Assert child content via the child's own `shadowRoot`/props, never the parent's `textContent`** (it won't pierce nested shadow DOM — the recurring lesson). Use **real** stores in screen tests so `revision` reactivity drives `track()`. A `settle = () => new Promise(r => setTimeout(r, 0))` flushes async mutate→re-hydrate→repaint chains.
- Shared `inlineConfirm({ mount, prompt, lifecycle, onYes, restore })` → `data-act="confirm-yes"`/`"confirm-no"`.
- Scoped tests: `pnpm --filter @oyl/vanilla-oyl exec vitest run <pattern>`. Typecheck: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit`.
- TDD per task: failing test → run (fail) → implement → run (pass) → typecheck → commit.

## File structure

**New:** `goal/format.js`, `state/goals-store.js`, `components/oyl-goal-composer.js`, `components/oyl-goal-row.js`, `components/oyl-goals.js` (+ tests).
**Modified:** `state/journal-store.js` (+ test), `state/data.js` (+ test), `components/oyl-nav.js`, `main.js`.

---

## Task 1: `goal/format.js` — `metricUnit` + `goalProgressLabel`

**Files:** Create `apps/vanilla-oyl/src/goal/format.js`; test `apps/vanilla-oyl/src/goal/format.test.js`.

- [ ] **Step 1: Create the test** `apps/vanilla-oyl/src/goal/format.test.js`:
```js
import { describe, expect, it } from 'vitest'
import { metricUnit, goalProgressLabel } from './format.js'

describe('metricUnit', () => {
  it('maps known metrics and falls back to empty', () => {
    expect(metricUnit('sleep.hours')).toBe('h')
    expect(metricUnit('body.weight_kg')).toBe('kg')
    expect(metricUnit('nutrition.calories')).toBe('kcal')
    expect(metricUnit('whatever.unknown')).toBe('')
  })
})

describe('goalProgressLabel', () => {
  /** @param {Partial<import('@oyl/all-of-oyl').GoalProgress>} [o] @returns {any} */
  const prog = (o = {}) => ({ current: 0, target: 10, ratio: 0, paused: false, empty: false, ...o })
  it('atLeast shows current / target', () => {
    expect(goalProgressLabel(prog({ current: 12, target: 20 }), 'atLeast', 'h')).toBe('12 / 20 h')
  })
  it('atMost shows used phrasing', () => {
    expect(goalProgressLabel(prog({ current: 1800, target: 2200 }), 'atMost', 'kcal')).toBe('1800 of 2200 kcal used')
  })
  it('formats decimals compactly', () => {
    expect(goalProgressLabel(prog({ current: 6.5, target: 7 }), 'atLeast', 'h')).toBe('6.5 / 7 h')
  })
  it('paused and empty take precedence', () => {
    expect(goalProgressLabel(prog({ paused: true }), 'atLeast', 'h')).toBe('Paused')
    expect(goalProgressLabel(prog({ empty: true }), 'atMost', 'kcal')).toBe('No data this period')
  })
})
```

- [ ] **Step 2: Run → FAIL** (`Cannot find module './format.js'`): `pnpm --filter @oyl/vanilla-oyl exec vitest run src/goal/format.test.js`

- [ ] **Step 3: Create** `apps/vanilla-oyl/src/goal/format.js`:
```js
/** @typedef {import('@oyl/all-of-oyl').GoalProgress} GoalProgress */
/** @typedef {import('@oyl/all-of-oyl').GoalDirection} GoalDirection */

const UNITS = /** @type {Record<string, string>} */ ({ 'sleep.hours': 'h', 'body.weight_kg': 'kg', 'nutrition.calories': 'kcal', 'activity.run.minutes': 'min', 'screen.minutes': 'min' })

/** Display unit for a goal metric ("" when unknown). @param {string} metric @returns {string} */
export function metricUnit(metric) {
  return UNITS[metric] ?? ''
}

/** Compact number: integer as-is, else 1 decimal. @param {number} n @returns {string} */
function compact(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/**
 * Progress text honoring direction + state (paused/empty take precedence).
 * atLeast → "12 / 20 h"; atMost → "1800 of 2200 kcal used".
 * @param {GoalProgress} p @param {GoalDirection} direction @param {string} unit @returns {string}
 */
export function goalProgressLabel(p, direction, unit) {
  if (p.paused) return 'Paused'
  if (p.empty) return 'No data this period'
  const u = unit ? ` ${unit}` : ''
  return direction === 'atMost' ? `${compact(p.current)} of ${compact(p.target)}${u} used` : `${compact(p.current)} / ${compact(p.target)}${u}`
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Typecheck → clean.**
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/goal/format.js apps/vanilla-oyl/src/goal/format.test.js
git commit -m "feat(vanilla-oyl): goal format helpers (metricUnit, goalProgressLabel)"
```

---

## Task 2: `state/journal-store.js` — `progressOf`

**Files:** Modify `apps/vanilla-oyl/src/state/journal-store.js`; test `apps/vanilla-oyl/src/state/journal-store.test.js`.

- [ ] **Step 1: Add the failing test.** In `journal-store.test.js`, change the import to add `Measurement, Goal`:
```js
import { InMemoryRepository, Note, Measurement, Goal, DayKey } from '@oyl/all-of-oyl'
```
Append inside `describe('createJournalStore', …)`:
```js
  it('progressOf computes a goal\'s current-period progress from entries', async () => {
    const repo = /** @type {InMemoryRepository<Entry>} */ (new InMemoryRepository())
    const store = createJournalStore(repo, TZ)
    const goal = new Goal({ metric: 'sleep.hours', target: 7, direction: 'atLeast', period: 'day' })
    expect(store.progressOf(goal, dayOf()).empty).toBe(true)
    await store.add(new Measurement({ occurredAt: new Date(ISO), metric: 'sleep.hours', value: 7 }))
    const p = store.progressOf(goal, dayOf())
    expect(p.current).toBe(7)
    expect(p.met).toBe(true)
    expect(p.empty).toBe(false)
  })
```

- [ ] **Step 2: Run → FAIL** (`store.progressOf is not a function`).

- [ ] **Step 3: Implement.** In `apps/vanilla-oyl/src/state/journal-store.js`:
Add typedefs after `/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */`:
```js
/** @typedef {import('@oyl/all-of-oyl').Goal} Goal */
/** @typedef {import('@oyl/all-of-oyl').GoalProgress} GoalProgress */
```
Add this method to the returned object, right after the `entriesOn` method's closing `},`:
```js
    /** Current-period progress of a goal at `day`, judged against journal entries (auto-tracks revision). @param {Goal} goal @param {DayKey} day @returns {GoalProgress} */
    progressOf(goal, day) {
      revision.get()
      return goal.progressOn(journal, day)
    },
```

- [ ] **Step 4: Run → PASS** (existing + 1 new).
- [ ] **Step 5: Typecheck → clean.**
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/state/journal-store.js apps/vanilla-oyl/src/state/journal-store.test.js
git commit -m "feat(vanilla-oyl): journalStore.progressOf (goal progress from entries)"
```

---

## Task 3: `state/goals-store.js` — `createGoalsStore`

**Files:** Create `apps/vanilla-oyl/src/state/goals-store.js`; test `apps/vanilla-oyl/src/state/goals-store.test.js`.

- [ ] **Step 1: Create the test** `apps/vanilla-oyl/src/state/goals-store.test.js`:
```js
import { describe, expect, it } from 'vitest'
import { InMemoryRepository, Goal, DayKey } from '@oyl/all-of-oyl'
import { createGoalsStore } from './goals-store.js'

/** @typedef {import('@oyl/all-of-oyl').Goal} GoalT */
const today = DayKey.of('2026-06-13')
/** @param {string} [name] @param {Record<string, unknown>} [opts] */
const goal = (name = 'G', opts = {}) => new Goal({ name, metric: 'sleep.hours', target: 7, direction: 'atLeast', period: 'day', ...opts })

describe('createGoalsStore', () => {
  it('add persists and reflects in all(); remove deletes', async () => {
    const repo = /** @type {any} */ (new InMemoryRepository())
    const store = createGoalsStore(repo)
    const saved = await store.add(goal())
    expect(store.all()).toHaveLength(1)
    expect(await repo.list()).toHaveLength(1)
    await store.remove(saved.id)
    expect(store.all()).toHaveLength(0)
  })

  it('pause leaves an open pause; resume closes it', async () => {
    const repo = /** @type {any} */ (new InMemoryRepository())
    const store = createGoalsStore(repo)
    const saved = await store.add(goal())
    await store.pause(saved.id, today)
    const paused = /** @type {GoalT} */ (store.all()[0])
    expect(paused.pauses).toHaveLength(1)
    expect(paused.pauses[0]?.to).toBeUndefined()
    await store.resume(saved.id, today)
    const resumed = /** @type {GoalT} */ (store.all()[0])
    expect(resumed.pauses[0]?.to?.value).toBe(today.value)
  })

  it('hydrate rebuilds from the repo', async () => {
    const repo = /** @type {any} */ (new InMemoryRepository())
    await repo.save(goal('seeded'))
    const store = createGoalsStore(repo)
    expect(store.all()).toHaveLength(0)
    await store.hydrate()
    expect(store.all()).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run → FAIL** (`Cannot find module './goals-store.js'`).

- [ ] **Step 3: Create** `apps/vanilla-oyl/src/state/goals-store.js`:
```js
import { signal } from '../lib/reactive/signal.js'

/** @typedef {import('@oyl/all-of-oyl').Goal} Goal */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */
/** @typedef {import('@oyl/all-of-oyl').Repository<Goal>} GoalsRepo */

/**
 * App-level reactive wrapper over the goals Repository. The "aggregate" here is just the
 * list of domain Goals. add/remove are persist-first; pause/resume mutate a Goal in place,
 * persist, then re-hydrate (rollback-on-failure) — the planner-cancel pattern. Goal progress
 * is NOT computed here (it needs the Journal) — the screen reads it via journalStore.progressOf,
 * so goals stays journal-agnostic.
 * @param {GoalsRepo} goalsRepo
 */
export function createGoalsStore(goalsRepo) {
  /** @type {Goal[]} */
  let goals = []
  let n = 0
  const revision = signal(0)

  async function hydrate() {
    goals = [...(await goalsRepo.list())]
    revision.set((n += 1))
  }

  return {
    revision,
    hydrate,

    /** @param {Goal} g @returns {Promise<Goal>} */
    async add(g) {
      const saved = await goalsRepo.save(g)
      goals = [...goals, saved]
      revision.set((n += 1))
      return saved
    },
    /** @param {Id} id */
    async remove(id) {
      await goalsRepo.delete(id)
      goals = goals.filter((x) => x.id !== id)
      revision.set((n += 1))
    },
    /** @param {Id} id @param {DayKey} on */
    async pause(id, on) {
      const g = goals.find((x) => x.id === id)
      if (!g) return
      g.pause(on)
      try {
        await goalsRepo.save(g)
      } catch (err) {
        await hydrate()
        throw err
      }
      await hydrate()
    },
    /** @param {Id} id @param {DayKey} on */
    async resume(id, on) {
      const g = goals.find((x) => x.id === id)
      if (!g) return
      g.resume(on)
      try {
        await goalsRepo.save(g)
      } catch (err) {
        await hydrate()
        throw err
      }
      await hydrate()
    },
    /** @returns {readonly Goal[]} */
    all() {
      revision.get()
      return [...goals]
    },
  }
}
```

- [ ] **Step 4: Run → PASS** (3 tests).
- [ ] **Step 5: Typecheck → clean.**
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/state/goals-store.js apps/vanilla-oyl/src/state/goals-store.test.js
git commit -m "feat(vanilla-oyl): GoalsStore (add/remove/pause/resume, journal-agnostic)"
```

---

## Task 4: `components/oyl-goal-composer.js` — preset-metric composer

**Files:** Create `apps/vanilla-oyl/src/components/oyl-goal-composer.js`; test `apps/vanilla-oyl/src/components/oyl-goal-composer.test.js`.

- [ ] **Step 1: Create the test** `apps/vanilla-oyl/src/components/oyl-goal-composer.test.js`:
```js
import { describe, expect, it, beforeAll } from 'vitest'
import { Goal } from '@oyl/all-of-oyl'
import { defineGoalComposer } from './oyl-goal-composer.js'

beforeAll(() => defineGoalComposer())
/** @param {{ add?: (g: any) => Promise<any> }} store */
function composer(store) {
  const el = /** @type {import('./oyl-goal-composer.js').OylGoalComposer} */ (document.createElement('oyl-goal-composer'))
  el.store = /** @type {any} */ (store)
  document.body.append(el)
  return el
}
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (el.shadowRoot.querySelector(sel))
const change = (/** @type {any} */ node) => node.dispatchEvent(new Event('change', { bubbles: true }))
const submit = (/** @type {any} */ el) => q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))

describe('<oyl-goal-composer>', () => {
  it('builds a Goal from the selected preset + target + period', async () => {
    const added = /** @type {any[]} */ ([])
    const el = composer({ add: async (g) => { added.push(g); return g } })
    q(el, 'select[name="preset"]').value = '2' // Calories → nutrition.calories, atMost, sum
    change(q(el, 'select[name="preset"]'))
    q(el, 'input[name="name"]').value = 'Eat lighter'
    q(el, 'input[name="target"]').value = '2200'
    q(el, 'select[name="period"]').value = 'day'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added[0]).toBeInstanceOf(Goal)
    expect(added[0].metric).toBe('nutrition.calories')
    expect(added[0].direction).toBe('atMost')
    expect(added[0].aggregation).toBe('sum')
    expect(added[0].target).toBe(2200)
    expect(added[0].name).toBe('Eat lighter')
    el.remove()
  })

  it('shows the unit hint for the selected preset', async () => {
    const el = composer({})
    q(el, 'select[name="preset"]').value = '0' // Sleep (hours) → h
    change(q(el, 'select[name="preset"]'))
    expect(q(el, '.unit').textContent).toBe('h')
    el.remove()
  })

  it('a non-positive target surfaces an inline error and does not add', async () => {
    const added = /** @type {any[]} */ ([])
    const el = composer({ add: async (g) => { added.push(g); return g } })
    q(el, 'input[name="target"]').value = '0'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added).toHaveLength(0)
    expect((q(el, '[data-role="error"]').textContent ?? '').length).toBeGreaterThan(0)
    el.remove()
  })
})
```

- [ ] **Step 2: Run → FAIL** (Cannot find module).

- [ ] **Step 3: Create** `apps/vanilla-oyl/src/components/oyl-goal-composer.js`:
```js
import { Goal } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { metricUnit } from '../goal/format.js'

/** @typedef {ReturnType<typeof import('../state/goals-store.js').createGoalsStore>} GoalsStore */

const PRESETS = [
  { label: 'Sleep (hours)', metric: 'sleep.hours', direction: 'atLeast', aggregation: 'sum', period: 'day' },
  { label: 'Weight (kg)', metric: 'body.weight_kg', direction: 'atMost', aggregation: 'last', period: 'day' },
  { label: 'Calories', metric: 'nutrition.calories', direction: 'atMost', aggregation: 'sum', period: 'day' },
  { label: 'Run minutes', metric: 'activity.run.minutes', direction: 'atLeast', aggregation: 'sum', period: 'week' },
  { label: 'Screen time (min)', metric: 'screen.minutes', direction: 'atMost', aggregation: 'sum', period: 'day' },
]
const PERIODS = ['day', 'week', 'month']

const styles = sheet(`
  form { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-2); padding: 1rem; }
  label { display: block; font-size: .85rem; color: var(--color-muted); margin-block-end: .25rem; }
  input, select { width: 100%; font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .6rem .7rem; }
  .field { margin-block-end: .7rem; }
  .target { display: grid; grid-template-columns: 1fr auto; gap: .5rem; align-items: center; }
  .unit { color: var(--color-muted); font-size: .9rem; }
  .actions { display: flex; justify-content: flex-end; margin-block-start: .9rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1.1rem; font: inherit; font-weight: 600; cursor: pointer; }
  [data-role="error"]:not(:empty) { color: var(--color-danger); font-size: .85rem; margin-block-start: .5rem; }
`)

export class OylGoalComposer extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {GoalsStore} */
    this.store = /** @type {GoalsStore} */ (/** @type {unknown} */ (undefined))
    /** @type {() => void} */
    this.onAdded = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const formEl = document.createElement('form')

    const preset = document.createElement('select')
    preset.name = 'preset'
    PRESETS.forEach((p, i) => {
      const o = document.createElement('option')
      o.value = String(i)
      o.textContent = p.label
      preset.append(o)
    })

    const name = this._input('name', 'text')
    const target = this._input('target', 'number')
    target.min = '0'
    target.step = 'any'
    const unit = document.createElement('span')
    unit.className = 'unit'
    const targetWrap = document.createElement('div')
    targetWrap.className = 'target'
    targetWrap.append(target, unit)

    const period = document.createElement('select')
    period.name = 'period'
    for (const pr of PERIODS) {
      const o = document.createElement('option')
      o.value = pr
      o.textContent = pr
      period.append(o)
    }

    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')

    const actions = document.createElement('div')
    actions.className = 'actions'
    const submit = document.createElement('button')
    submit.type = 'submit'
    submit.className = 'primary'
    submit.textContent = 'Add goal'
    actions.append(submit)

    formEl.append(
      this._labeled('preset', 'Metric', preset),
      this._labeled('name', 'Name (optional)', name),
      this._labeled('target', 'Target', targetWrap),
      this._labeled('period', 'Period', period),
      error, actions,
    )
    root.append(formEl)

    const applyPreset = () => {
      const p = PRESETS[Number(preset.value)]
      if (!p) return
      unit.textContent = metricUnit(p.metric)
      period.value = p.period
    }
    applyPreset()
    preset.addEventListener('change', applyPreset, { signal: this.lifecycle })

    formEl.addEventListener('submit', (e) => {
      e.preventDefault()
      void this._submit({ error, preset, name, target, period })
    }, { signal: this.lifecycle })
  }

  /** @param {{ error: HTMLElement, preset: HTMLSelectElement, name: HTMLInputElement, target: HTMLInputElement, period: HTMLSelectElement }} ctx */
  async _submit(ctx) {
    ctx.error.textContent = ''
    try {
      const p = PRESETS[Number(ctx.preset.value)]
      if (!p) return
      const props = /** @type {{ metric: string, target: number, direction: any, aggregation: any, period: any, name?: string }} */ ({
        metric: p.metric,
        target: Number(ctx.target.value),
        direction: p.direction,
        aggregation: p.aggregation,
        period: ctx.period.value,
      })
      if (ctx.name.value) props.name = ctx.name.value
      await this.store.add(new Goal(props))
      ctx.name.value = ''
      ctx.target.value = ''
      this.onAdded()
    } catch (err) {
      ctx.error.textContent = err instanceof Error ? err.message : String(err)
    }
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
    if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) control.id = forName
    wrap.append(label, control)
    return wrap
  }
}

/** Register the element (idempotent). */
export function defineGoalComposer() {
  if (!customElements.get('oyl-goal-composer')) customElements.define('oyl-goal-composer', OylGoalComposer)
}
```
(No `formEl.reset()` — after add we clear only name + target, leaving the preset/unit/period intact, so the unit hint never goes stale.)

- [ ] **Step 4: Run → PASS** (3 tests). The non-positive-target test relies on `new Goal({target: 0})` throwing `INVALID_QUANTITY`, caught + shown inline.
- [ ] **Step 5: Typecheck → clean.**
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/components/oyl-goal-composer.js apps/vanilla-oyl/src/components/oyl-goal-composer.test.js
git commit -m "feat(vanilla-oyl): oyl-goal-composer (preset metric + target + period)"
```

---

## Task 5: `components/oyl-goal-row.js` — progress-bar row

**Files:** Create `apps/vanilla-oyl/src/components/oyl-goal-row.js`; test `apps/vanilla-oyl/src/components/oyl-goal-row.test.js`. Mirrors `oyl-subscription-row` (two actions; Delete via `inlineConfirm`). The bar fill width is set via `style.setProperty('inline-size', …)` so it round-trips in happy-dom.

- [ ] **Step 1: Create the test** `apps/vanilla-oyl/src/components/oyl-goal-row.test.js`:
```js
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { Goal } from '@oyl/all-of-oyl'
import { defineGoalRow } from './oyl-goal-row.js'

beforeAll(() => defineGoalRow())
/** @param {Record<string, unknown>} [opts] */
const mkGoal = (opts = {}) => new Goal({ name: 'Sleep enough', metric: 'sleep.hours', target: 7, direction: 'atLeast', period: 'day', ...opts })
/** @param {Partial<import('@oyl/all-of-oyl').GoalProgress>} [o] @returns {any} */
const prog = (o = {}) => ({ current: 0, target: 7, ratio: 0, paused: false, empty: false, ...o })

/** @param {any} goal @param {any} progress @param {{ onPause?: any, onResume?: any, onDelete?: any }} [h] */
function row(goal, progress, h = {}) {
  const el = /** @type {import('./oyl-goal-row.js').OylGoalRow} */ (document.createElement('oyl-goal-row'))
  el.goal = goal
  el.progress = progress
  el.onPause = h.onPause ?? (() => {})
  el.onResume = h.onResume ?? (() => {})
  el.onDelete = h.onDelete ?? (() => {})
  document.body.append(el)
  return el
}
/** @param {any} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)

describe('<oyl-goal-row>', () => {
  it('renders title, a bar sized to ratio, and the label', () => {
    const el = row(mkGoal(), prog({ current: 5, ratio: 5 / 7 }))
    const r = root(el)
    expect(r.textContent).toContain('Sleep enough')
    expect(r.textContent).toContain('5 / 7 h')
    const fill = /** @type {HTMLElement} */ (r.querySelector('.fill'))
    expect(fill.style.getPropertyValue('inline-size')).toBe('71%')
    el.remove()
  })

  it('met goal marks the bar and shows a check', () => {
    const el = row(mkGoal(), prog({ current: 7, ratio: 1, met: true }))
    expect(root(el).querySelector('.bar.met')).toBeTruthy()
    expect(root(el).textContent).toContain('✓')
    el.remove()
  })

  it('paused goal shows "Paused" and a Resume action', () => {
    const onResume = vi.fn()
    const g = mkGoal()
    const el = row(g, prog({ paused: true }), { onResume })
    expect(root(el).textContent).toContain('Paused')
    const b = /** @type {HTMLButtonElement} */ (root(el).querySelector('button[data-act="resume"]'))
    b.click()
    expect(onResume).toHaveBeenCalledWith(g.id)
    el.remove()
  })

  it('non-paused goal shows Pause', () => {
    const onPause = vi.fn()
    const g = mkGoal()
    const el = row(g, prog(), { onPause })
    const b = /** @type {HTMLButtonElement} */ (root(el).querySelector('button[data-act="pause"]'))
    b.click()
    expect(onPause).toHaveBeenCalledWith(g.id)
    el.remove()
  })

  it('Delete uses inline confirm: Yes calls onDelete(id), No reverts', () => {
    const onDelete = vi.fn()
    const g = mkGoal()
    const el = row(g, prog(), { onDelete })
    const r = root(el)
    const del1 = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="delete"]'))
    del1.click()
    const no = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="confirm-no"]'))
    no.click()
    expect(onDelete).not.toHaveBeenCalled()
    const del2 = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="delete"]'))
    del2.click()
    const yes = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="confirm-yes"]'))
    yes.click()
    expect(onDelete).toHaveBeenCalledWith(g.id)
    el.remove()
  })
})
```

- [ ] **Step 2: Run → FAIL** (Cannot find module).

- [ ] **Step 3: Create** `apps/vanilla-oyl/src/components/oyl-goal-row.js`:
```js
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { inlineConfirm } from './confirm.js'
import { metricUnit, goalProgressLabel } from '../goal/format.js'

/** @typedef {import('@oyl/all-of-oyl').Goal} Goal */
/** @typedef {import('@oyl/all-of-oyl').GoalProgress} GoalProgress */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */

const styles = sheet(`
  :host { display: block; border-top: 1px solid var(--color-border); }
  .row { display: grid; grid-template-columns: 1fr auto; gap: .3rem 1rem; align-items: center; padding: .85rem 0; }
  .title { grid-column: 1; grid-row: 1; color: var(--color-text); }
  .title .ok { color: var(--color-accent); font-weight: 700; }
  .actions { grid-column: 2; grid-row: 1; align-self: center; display: inline-flex; gap: .2rem; }
  .bar { grid-column: 1 / -1; grid-row: 2; block-size: .5rem; background: color-mix(in oklch, var(--color-text) 10%, transparent); border-radius: 999px; overflow: hidden; }
  .fill { block-size: 100%; inline-size: 0; background: var(--color-muted); }
  .bar.met .fill { background: var(--color-accent); }
  .bar.muted .fill { background: color-mix(in oklch, var(--color-text) 22%, transparent); }
  .label { grid-column: 1 / -1; grid-row: 3; color: var(--color-muted); font-size: var(--step--1); }
  button { font: inherit; color: var(--color-muted); border: 0; background: none; cursor: pointer; border-radius: var(--radius-1); padding: .25rem .5rem; font-size: .85rem; }
  button:hover { background: color-mix(in oklch, var(--color-text) 8%, transparent); color: var(--color-text); }
  .del:hover { color: var(--color-danger); background: color-mix(in oklch, var(--color-danger) 12%, transparent); }
  .confirm { display: inline-flex; gap: .3rem; align-items: center; font-size: .85rem; color: var(--color-danger); }
  .confirm .yes { color: white; background: var(--color-danger); font-weight: 600; }
  .confirm .no { color: var(--color-muted); background: color-mix(in oklch, var(--color-text) 8%, transparent); }
`)

export class OylGoalRow extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {Goal} */
    this.goal = /** @type {Goal} */ (/** @type {unknown} */ (undefined))
    /** @type {GoalProgress} */
    this.progress = /** @type {GoalProgress} */ (/** @type {unknown} */ (undefined))
    /** @type {(id: Id) => void} */
    this.onPause = () => {}
    /** @type {(id: Id) => void} */
    this.onResume = () => {}
    /** @type {(id: Id) => void} */
    this.onDelete = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const p = this.progress
    const row = document.createElement('div')
    row.className = 'row'

    const title = document.createElement('div')
    title.className = 'title'
    title.textContent = this.goal.name ?? this.goal.metric
    if (p.met === true) {
      const ok = document.createElement('span')
      ok.className = 'ok'
      ok.textContent = ' ✓'
      title.append(ok)
    }

    const actions = document.createElement('div')
    actions.className = 'actions'
    this._renderActions(actions)

    const bar = document.createElement('div')
    bar.className = 'bar'
    if (p.met === true) bar.classList.add('met')
    if (p.paused || p.empty) bar.classList.add('muted')
    const fill = document.createElement('div')
    fill.className = 'fill'
    fill.style.setProperty('inline-size', `${Math.round(p.ratio * 100)}%`)
    bar.append(fill)

    const label = document.createElement('div')
    label.className = 'label'
    label.textContent = goalProgressLabel(p, this.goal.direction, metricUnit(this.goal.metric))

    row.append(title, actions, bar, label)
    root.append(row)
  }

  /** @param {HTMLElement} mount */
  _renderActions(mount) {
    mount.replaceChildren()
    const toggle = document.createElement('button')
    if (this.progress.paused) {
      toggle.dataset.act = 'resume'
      toggle.textContent = 'Resume'
      toggle.addEventListener('click', () => this.onResume(this.goal.id), { signal: this.lifecycle })
    } else {
      toggle.dataset.act = 'pause'
      toggle.textContent = 'Pause'
      toggle.addEventListener('click', () => this.onPause(this.goal.id), { signal: this.lifecycle })
    }
    const del = document.createElement('button')
    del.className = 'del'
    del.dataset.act = 'delete'
    del.textContent = 'Delete'
    del.addEventListener('click', () => {
      inlineConfirm({
        mount,
        prompt: 'Delete?',
        lifecycle: this.lifecycle,
        onYes: () => this.onDelete(this.goal.id),
        restore: () => this._renderActions(mount),
      })
    }, { signal: this.lifecycle })
    mount.append(toggle, del)
  }
}

/** Register the element (idempotent). */
export function defineGoalRow() {
  if (!customElements.get('oyl-goal-row')) customElements.define('oyl-goal-row', OylGoalRow)
}
```

- [ ] **Step 4: Run → PASS** (5 tests).
- [ ] **Step 5: Typecheck → clean.**
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/components/oyl-goal-row.js apps/vanilla-oyl/src/components/oyl-goal-row.test.js
git commit -m "feat(vanilla-oyl): oyl-goal-row (progress bar + pause/resume + inline-confirm delete)"
```

---

## Task 6: `components/oyl-goals.js` — the screen

**Files:** Create `apps/vanilla-oyl/src/components/oyl-goals.js`; test `apps/vanilla-oyl/src/components/oyl-goals.test.js`.

- [ ] **Step 1: Create the test** `apps/vanilla-oyl/src/components/oyl-goals.test.js` (real stores so `progressOf` reactivity works; assert via the row's shadow root):
```js
import { describe, expect, it, beforeAll } from 'vitest'
import { InMemoryRepository, Goal } from '@oyl/all-of-oyl'
import { createGoalsStore } from '../state/goals-store.js'
import { createJournalStore } from '../state/journal-store.js'
import { defineGoals } from './oyl-goals.js'

beforeAll(() => defineGoals())
const TZ = 'UTC'
const settle = () => new Promise((r) => setTimeout(r, 0))

async function stores() {
  const goalsRepo = /** @type {any} */ (new InMemoryRepository())
  const entriesRepo = /** @type {any} */ (new InMemoryRepository())
  await goalsRepo.save(new Goal({ name: 'Sleep enough', metric: 'sleep.hours', target: 7, direction: 'atLeast', period: 'day' }))
  const goals = createGoalsStore(goalsRepo)
  const journal = createJournalStore(entriesRepo, TZ)
  await goals.hydrate()
  await journal.hydrate()
  return { goals, journal }
}
/** @param {any} goals @param {any} journal */
function screen(goals, journal) {
  const el = /** @type {import('./oyl-goals.js').OylGoals} */ (document.createElement('oyl-goals'))
  el.store = goals
  el.journal = journal
  el.tz = TZ
  document.body.append(el)
  return el
}
/** @param {any} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)

describe('<oyl-goals>', () => {
  it('renders a row per goal with its progress', async () => {
    const { goals, journal } = await stores()
    const el = screen(goals, journal)
    await Promise.resolve()
    expect(root(el).querySelectorAll('oyl-goal-row')).toHaveLength(1)
    const grow = /** @type {any} */ (root(el).querySelector('oyl-goal-row'))
    expect(grow.shadowRoot.textContent).toContain('Sleep enough')
    expect(grow.shadowRoot.textContent).toContain('No data this period') // no entries → empty
    el.remove()
  })

  it('pausing a goal flips the row to Resume', async () => {
    const { goals, journal } = await stores()
    const el = screen(goals, journal)
    await Promise.resolve()
    const grow = /** @type {any} */ (root(el).querySelector('oyl-goal-row'))
    const pauseBtn = /** @type {HTMLButtonElement} */ (grow.shadowRoot.querySelector('button[data-act="pause"]'))
    pauseBtn.click()
    await settle()
    const grow2 = /** @type {any} */ (root(el).querySelector('oyl-goal-row'))
    expect(grow2.shadowRoot.querySelector('button[data-act="resume"]')).toBeTruthy()
    expect(grow2.shadowRoot.textContent).toContain('Paused')
    el.remove()
  })

  it('deleting a goal removes its row', async () => {
    const { goals, journal } = await stores()
    const el = screen(goals, journal)
    await Promise.resolve()
    const grow = /** @type {any} */ (root(el).querySelector('oyl-goal-row'))
    const delBtn = /** @type {HTMLButtonElement} */ (grow.shadowRoot.querySelector('button[data-act="delete"]'))
    delBtn.click()
    const yes = /** @type {HTMLButtonElement} */ (grow.shadowRoot.querySelector('button[data-act="confirm-yes"]'))
    yes.click()
    await settle()
    expect(root(el).querySelectorAll('oyl-goal-row')).toHaveLength(0)
    expect(root(el).textContent).toContain('No goals yet.')
    el.remove()
  })
})
```

- [ ] **Step 2: Run → FAIL** (Cannot find module).

- [ ] **Step 3: Create** `apps/vanilla-oyl/src/components/oyl-goals.js`:
```js
import { DayKey } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { now } from '../storage/clock.js'
import { defineGoalComposer } from './oyl-goal-composer.js'
import { defineGoalRow } from './oyl-goal-row.js'

/** @typedef {ReturnType<typeof import('../state/goals-store.js').createGoalsStore>} GoalsStore */
/** @typedef {ReturnType<typeof import('../state/journal-store.js').createJournalStore>} JournalStore */

const styles = sheet(`
  :host { display: block; }
  h2 { font-size: var(--step-2); margin-block-end: var(--space-4); }
  oyl-goal-composer { display: block; margin-block-end: 1.6rem; }
  ol { list-style: none; margin: 0; padding: 0; }
  .empty { color: var(--color-muted); padding: 1rem 0; }
  .sr-only { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip: rect(0 0 0 0); }
`)

export class OylGoals extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {GoalsStore} */
    this.store = /** @type {GoalsStore} */ (/** @type {unknown} */ (undefined))
    /** @type {JournalStore} */
    this.journal = /** @type {JournalStore} */ (/** @type {unknown} */ (undefined))
    /** @type {string} */
    this.tz = 'UTC'
  }

  render() {
    defineGoalComposer()
    defineGoalRow()
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)

    const h2 = document.createElement('h2')
    h2.textContent = 'Goals'
    h2.tabIndex = -1
    const live = document.createElement('div')
    live.className = 'sr-only'
    live.setAttribute('aria-live', 'polite')
    const composer = /** @type {import('./oyl-goal-composer.js').OylGoalComposer} */ (document.createElement('oyl-goal-composer'))
    composer.store = this.store
    composer.onAdded = () => { live.textContent = 'Goal added' }
    const list = document.createElement('ol')
    const empty = document.createElement('div')
    empty.className = 'empty'

    root.append(h2, live, composer, list, empty)

    this.track(() => {
      const today = DayKey.from(now(), this.tz)
      const goals = this.store.all()
      list.replaceChildren()
      for (const g of goals) {
        const rowEl = /** @type {import('./oyl-goal-row.js').OylGoalRow} */ (document.createElement('oyl-goal-row'))
        rowEl.goal = g
        rowEl.progress = this.journal.progressOf(g, today)
        rowEl.onPause = (id) => { void this.store.pause(id, today); live.textContent = 'Paused' }
        rowEl.onResume = (id) => { void this.store.resume(id, today); live.textContent = 'Resumed' }
        rowEl.onDelete = (id) => { void this.store.remove(id); live.textContent = 'Deleted' }
        const li = document.createElement('li')
        li.append(rowEl)
        list.append(li)
      }
      empty.hidden = goals.length > 0
      empty.textContent = empty.hidden ? '' : 'No goals yet.'
    })
  }
}

/** Register the element (idempotent). */
export function defineGoals() {
  if (!customElements.get('oyl-goals')) customElements.define('oyl-goals', OylGoals)
}
```

- [ ] **Step 4: Run → PASS** (3 tests).
- [ ] **Step 5: Typecheck → clean.**
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/components/oyl-goals.js apps/vanilla-oyl/src/components/oyl-goals.test.js
git commit -m "feat(vanilla-oyl): oyl-goals screen (composes goals + journal stores)"
```

---

## Task 7: Wire-up — data state, nav, route

**Files:** Modify `apps/vanilla-oyl/src/state/data.js`, `apps/vanilla-oyl/src/components/oyl-nav.js`, `apps/vanilla-oyl/src/main.js`; test `apps/vanilla-oyl/src/state/data.test.js`.

- [ ] **Step 1: Wire `data.js`.**
1. Add import after the vault-store import:
```js
import { createGoalsStore } from './goals-store.js'
```
2. After `const vault = createVaultStore(repos)`:
```js
  const goals = createGoalsStore(repos.goals)
```
3. Inside `refresh()`, after `await vault.hydrate()`:
```js
    await goals.hydrate()
```
4. Add `goals` to the returned object:
```js
  return { repos, counts, schema, refresh, readDiagnostics, journal, planner, vault, goals }
```

- [ ] **Step 2: `data.test.js` assertion.** Inside `describe('data state', …)`:
```js
  it('exposes a goals store', () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    expect(typeof ds.goals.all).toBe('function')
  })
```

- [ ] **Step 3: Nav.** In `apps/vanilla-oyl/src/components/oyl-nav.js`, add the item to `ITEMS`:
```js
  ['vault', 'Vault'],
  ['goals', 'Goals'],
```
and add `flex-wrap: wrap;` to the `nav { … }` style rule (R10):
```js
  nav { display: flex; flex-wrap: wrap; gap: .25rem; }
```

- [ ] **Step 4: `main.js`.**
1. Import after `import { defineVault } from './components/oyl-vault.js'`:
```js
import { defineGoals } from './components/oyl-goals.js'
```
2. In the `defineX()` block after `defineVault()`:
```js
  defineGoals()
```
3. In `router.routes`, after the `vault:` entry:
```js
    goals: () => {
      const view = /** @type {import('./components/oyl-goals.js').OylGoals} */ (document.createElement('oyl-goals'))
      view.store = dataState.goals
      view.journal = dataState.journal
      view.tz = defaultTimezone()
      return view
    },
```

- [ ] **Step 5: Full suite + typecheck.**
Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run` — expect all green (154 prior + ~21 new ≈ 175).
Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` — clean.

- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/state/data.js apps/vanilla-oyl/src/state/data.test.js apps/vanilla-oyl/src/components/oyl-nav.js apps/vanilla-oyl/src/main.js
git commit -m "feat(vanilla-oyl): wire Goals — store in data state, nav item, #/goals route"
```

---

## Final acceptance (after all tasks)

- [ ] **Full gates:** `pnpm --filter @oyl/vanilla-oyl exec vitest run` (all green) + `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (clean).
- [ ] **Browser (real Chrome):** `pnpm vanilla dev` (builds + vendors + serves on 8041; **hard-reload** the tab), open `#/goals`, Load demo data:
  - The four seeded goals render with progress bars; the weight goal (seed-paused) shows "Paused" + a **Resume** action; goals with no current-period data show "No data this period"; any met goal shows ✓.
  - Add a goal (preset + target + period) → appears with computed progress.
  - Pause a live goal → flips to "Paused" + Resume; Resume → back to live progress.
  - Delete a goal via the inline confirm.
  - Log a matching measurement in `#/journal`, return to `#/goals` → the bar reflects it.
- [ ] **Final code review** of the branch, then **finishing-a-development-branch**.

---

## Self-review notes (author)

- **Spec coverage:** format helpers (T1); `progressOf` (T2); GoalsStore add/remove/pause/resume (T3); preset composer (T4, R1/R6/R7); progress-bar row with met/paused/empty states + pause/resume + delete (T5, R3/R5/R8); screen composing both stores (T6, R2); wiring + nav wrap (T7, R10). R4 (add/delete only) and R9 (`all()` copy) are inherent in the store.
- **Type consistency:** `journalStore.progressOf(goal, day)`, `goalsStore.all()/add/remove/pause/resume`, row props `goal`/`progress`/`onPause`/`onResume`/`onDelete`, composer `PRESETS` entries → `Goal` fields. `metricUnit`/`goalProgressLabel` signatures match across format/row.
- **R8 honored:** the row highlights only `met === true` (accent + ✓); `met === false` renders neutral (no failure styling). Paused/empty → muted bar.
- **Test robustness:** bar width via `style.setProperty('inline-size', …)` + `getPropertyValue` (round-trips in happy-dom regardless of logical-property IDL support); row tests capture the `Goal` in a local so `onX` assertions use the same id; screen tests use **real** stores (reactivity) + `settle()` and assert via the row's shadow root (not the screen's `textContent`).
- **Placeholder scan:** clean — every code step is complete and copy-pasteable.
