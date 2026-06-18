# Nutrition Model (Sub-project B1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A full FDA Nutrition Facts model (nutrient registry → typed mandatory columns + extensible additional nutrients, computed %DV), a barcoded `ConsumableProduct` (UPC = global deduped shared row), the enriched `Consumption`, and the `entries`-split that gives consumptions a server home — so meal-logging is end-to-end.

**Architecture:** Four phases, each leaving its package green. **P1** builds the nutrition domain in `@oyl/all-of-oyl` (registry, `NutritionFacts`, %DV formatter, `Consumable`/`ConsumableProduct`, enriched `Consumption`). **P2** splits the heterogeneous `entries` collection into per-kind collections (manifest + codecs + the central journal-store + bootstrap routing). **P3** builds the relational Strapi content-types (`nutrition-facts` shared component; `consumable`/`consumable-product` catalogs with UPC-dedup; owner-scoped `consumption`) on A's established pattern. **P4** wires the app so a logged meal persists to `/api/consumptions` end-to-end.

**Tech Stack:** TypeScript (strict `src/`, NodeNext, explicit `.js` extensions), Vitest; Strapi 5 (TS); vanilla JS + JSDoc Web Components, Vitest (happy-dom).

## Global Constraints

- `@oyl/all-of-oyl` `src/`: `"type": "module"` + NodeNext (explicit `.js` extensions); DOM-free (`pnpm all-of build` gate); `noUnusedLocals`/`noUnusedParameters`.
- vanilla-oyl: zero-runtime-dep vanilla JS + JSDoc; component tests assert via own shadowRoot.
- Online-first/account-required (from A): reads from the server, writes via the outbox/flusher; **writes upsert by `recordId`**; tenant isolation is structural (personal = owner-only; catalog = creator + public-or-mine).
- **Clean break:** local + server data discarded (pre-adoption); no migration.
- Catalog amounts stored canonical; **%DV computed, never stored**. `additional` nutrient slugs MUST resolve in the registry.
- **UPC identity:** a `ConsumableProduct` with a `upc` is a global/public row deduped by UPC; without a UPC it's creator-scoped.
- **Snapshot principle:** `Consumption` stores the resolved `NutritionFacts`.
- Never weaken a type/lint rule. Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Do NOT create or switch git branches** — commit on the current branch (`feat/nutrition-model`).

**Commands:** lib `pnpm --filter @oyl/all-of-oyl test` · `pnpm all-of typecheck:src` · `pnpm all-of build`; app `pnpm vanilla test` · `pnpm vanilla typecheck` · `pnpm vanilla build:lib`; backend `pnpm --filter @oyl/strapi-oyl-app exec tsc --noEmit` · `pnpm --filter @oyl/strapi-oyl-app exec strapi build` · `pnpm --filter @oyl/strapi-oyl-app test`.

**Reference patterns (read, don't reinvent):** `packages/all-of-oyl/src/nutrition/nutrients.ts` (the `NUTRIENT_METRICS`-driven type/validation/JSON to expand), `nutrition/consumable.ts`, `nutrition/consumption.ts`, `format/body.ts` (formatter shape), `collections.ts` (manifest + `KINDS`), `apps/vanilla-oyl/src/storage/bootstrap.js` (`PATH_BY_COLLECTION`/`ROW_KIND_BY_COLLECTION`/repo loop/`emptyRepo`), `apps/vanilla-oyl/src/state/journal-store.js` (the central entries store), `apps/strapi-oyl/src/api/note/{content-types,controllers,routes}` (the personal owner-scoped + upsert-by-recordId template), `apps/strapi-oyl/src/api/activity/*` (the catalog creator+visibility template), `apps/strapi-oyl/test/note.owner-scoping.test.ts` + `activity.catalog.test.ts` (booted test patterns), `apps/strapi-oyl/test/parity.test.ts`.

---

## Phase 1 — Nutrition domain (`@oyl/all-of-oyl`)

### Task 1: Nutrient registry

**Files:** Create `packages/all-of-oyl/src/nutrition/nutrient-registry.ts` + `nutrient-registry.test.ts`.

**Interfaces — Produces:**
```ts
export type NutrientUnit = 'kcal' | 'g' | 'mg' | 'mcg' | 'ml'
export interface NutrientDef { slug: string; label: string; canonicalUnit: NutrientUnit; dailyValue?: number; mandatory: boolean }
export const NUTRIENTS: readonly NutrientDef[]
export function nutrientDef(slug: string): NutrientDef | undefined
export function mandatoryNutrients(): readonly NutrientDef[]   // mandatory === true, in label order
```

- [ ] **Step 1: Write the failing test** — `nutrient-registry.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { NUTRIENTS, nutrientDef, mandatoryNutrients } from './nutrient-registry.js'
describe('nutrient registry', () => {
  it('has unique slugs and valid units', () => {
    const slugs = NUTRIENTS.map((n) => n.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const n of NUTRIENTS) expect(['kcal','g','mg','mcg','ml']).toContain(n.canonicalUnit)
  })
  it('exposes the FDA mandatory set incl. calories/macros/key micros', () => {
    const m = mandatoryNutrients().map((n) => n.slug)
    for (const s of ['calories','total-fat','saturated-fat','trans-fat','cholesterol','sodium','total-carbohydrate','dietary-fiber','total-sugars','added-sugars','protein','vitamin-d','calcium','iron','potassium']) expect(m).toContain(s)
  })
  it('looks up by slug and carries daily values for %DV nutrients', () => {
    expect(nutrientDef('zzz-unknown')).toBeUndefined()
    expect(nutrientDef('sodium')?.dailyValue).toBe(2300) // mg
  })
})
```
- [ ] **Step 2: Run, verify fail** — `pnpm --filter @oyl/all-of-oyl test nutrient-registry` → FAIL (module missing).
- [ ] **Step 3: Implement** — `nutrient-registry.ts`: the `NUTRIENТ_DEF[]` array with the mandatory set (slugs above) — units: calories `kcal`; total-fat/saturated-fat/trans-fat/total-carbohydrate/dietary-fiber/total-sugars/added-sugars/protein `g`; cholesterol/sodium/calcium/iron/potassium `mg`; vitamin-d `mcg`; plus `water` `ml` (mandatory:false). Daily Values (adult, FDA 2016): total-fat 78g, saturated-fat 20g, cholesterol 300mg, sodium 2300mg, total-carbohydrate 275g, dietary-fiber 28g, added-sugars 50g, protein 50g, vitamin-d 20mcg, calcium 1300mg, iron 18mg, potassium 4700mg (calories/trans-fat/total-sugars have no DV → omit `dailyValue`). A few common voluntary entries (`mandatory:false`, with units/DV where defined): `monounsaturated-fat` g, `polyunsaturated-fat` g, `vitamin-a` mcg (900), `vitamin-c` mg (90). `nutrientDef` = `NUTRIENTS.find`; `mandatoryNutrients` = `NUTRIENTS.filter(n=>n.mandatory)`.
- [ ] **Step 4: Run, verify pass** — `pnpm --filter @oyl/all-of-oyl test nutrient-registry && pnpm all-of typecheck:src && pnpm all-of build`.
- [ ] **Step 5: Commit** — `feat(all-of-oyl): nutrient registry (FDA mandatory + voluntary, daily values)`.

### Task 2: `NutritionFacts` (expand `nutrients.ts`)

**Files:** Modify `packages/all-of-oyl/src/nutrition/nutrients.ts` + its test; modify `nutrition/totals.ts` (`sumNutrients`) + test; modify `format/nutrition.ts` (`formatNutrients`) + test.

**Interfaces — Produces:**
```ts
export interface ServingSize { amount: number; unit: NutrientUnit | string; household?: string }
export interface NutritionFacts {
  servingSize?: ServingSize
  // mandatory amounts (canonical units), all optional:
  calories?: number; totalFat?: number; saturatedFat?: number; transFat?: number
  cholesterol?: number; sodium?: number; totalCarbohydrate?: number; dietaryFiber?: number
  totalSugars?: number; addedSugars?: number; protein?: number
  vitaminD?: number; calcium?: number; iron?: number; potassium?: number; waterMl?: number
  additional?: Array<{ slug: string; amount: number }>
}
export function assertNutritionFacts(f: NutritionFacts): NutritionFacts
export function nutritionFactsToJSON(f: NutritionFacts): Record<string, unknown>
export function nutritionFactsFromJSON(shape: unknown): NutritionFacts
export const NUTRIENT_METRICS: ReadonlyArray<readonly [keyof NutritionFacts, string]> // mandatory fields → 'nutrition.<slug>'
export type Nutrients = NutritionFacts // alias for existing consumers during the expansion
```
- Consumes: `nutrient-registry.ts` (Task 1) — validates each `additional.slug` via `nutrientDef`.

- [ ] **Step 1: Write the failing test** — extend `nutrients.test.ts`: a full-facts round-trip (servingSize + several mandatory fields + `additional:[{slug:'vitamin-a',amount:300}]`); `assertNutritionFacts` rejects a negative amount, a non-positive `servingSize.amount`, and an `additional` slug not in the registry (`DomainError`); `NUTRIENT_METRICS` includes `['protein','nutrition.protein']` and `['sodium','nutrition.sodium']`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — expand the `Nutrients` type to `NutritionFacts` (keep `Nutrients` as an alias so `Consumable`/`Consumption` still compile mid-refactor). Drive the mandatory field list + `NUTRIENT_METRICS` from `mandatoryNutrients()` (field name ↔ slug map). `assertNutritionFacts`: every present mandatory amount non-negative finite; `servingSize.amount > 0` if present; every `additional` entry has a registry-resolvable slug + non-negative amount. JSON keeps present mandatory fields + serving size + the `additional` array. Update `sumNutrients` (sum mandatory fields + merge `additional` by slug) and `formatNutrients` (still surface calories+macros for the daily summary; ignore the long tail in the compact label).
- [ ] **Step 4: Run, verify pass** — `pnpm --filter @oyl/all-of-oyl test nutrients totals nutrition && pnpm all-of typecheck:src && pnpm all-of build`.
- [ ] **Step 5: Commit** — `feat(all-of-oyl): expand Nutrients to full FDA NutritionFacts (registry-driven + additional)`.

### Task 3: %DV formatter

**Files:** Create `packages/all-of-oyl/src/format/daily-value.ts` + test; export from `format/index.ts`.

**Interfaces — Produces:** `export function percentDailyValue(slug: string, amount: number): number | undefined` (rounded integer %; `undefined` when the nutrient has no `dailyValue`). Consumes: `nutrient-registry.ts`.

- [ ] **Step 1: Failing test** — `percentDailyValue('sodium', 1150)` → `50`; `percentDailyValue('calories', 200)` → `undefined` (no DV); `percentDailyValue('zzz', 1)` → `undefined`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — `const def = nutrientDef(slug); if (!def?.dailyValue) return undefined; return Math.round((amount / def.dailyValue) * 100)`. Export from `format/index.ts`.
- [ ] **Step 4: Run, verify pass** — `pnpm --filter @oyl/all-of-oyl test daily-value && pnpm all-of typecheck:src && pnpm all-of build`.
- [ ] **Step 5: Commit** — `feat(all-of-oyl): percentDailyValue formatter`.

### Task 4: `Consumable` enrich + `ConsumableProduct` (new)

**Files:** Modify `nutrition/consumable.ts` (+test); create `nutrition/consumable-product.ts` (+test); modify `collections.ts` (manifest + `KINDS`) + `index.ts` (exports) + `collections.test.ts`.

**Interfaces — Produces:**
- `Consumable` gains `slug: string`, `facts: NutritionFacts` (rename `nutrients`→`facts`), `ingredients?: readonly string[]`, `allergens?: readonly string[]`. (Keep a `nutrients` getter alias if consumers need it; else update them.)
- `ConsumableProduct` (class + `fromJSON`/`toJSON`): `id`, `consumableId: Id`, `upc?: string`, `brand?: string`, `name: string`, `netWeight?: { amount: number; unit: string }`, `servingsPerContainer?: number`, `facts?: NutritionFacts`, `ingredients?`, `allergens?`, `meta?`.
- `export function effectiveFacts(product: ConsumableProduct, consumable: Consumable | undefined): NutritionFacts` → `product.facts ?? consumable?.facts ?? {}`.
- `COLLECTIONS.consumableProducts = classCodec(ConsumableProduct.fromJSON)`; `KINDS.consumableProducts = 'catalog'`.

- [ ] **Step 1: Failing tests** — `consumable.test.ts`: Consumable round-trips facts + ingredients + allergens + slug. `consumable-product.test.ts`: round-trip incl. upc/brand/netWeight/servingsPerContainer/consumableId + optional facts override; `effectiveFacts` returns the product's facts when present else the consumable's. `collections.test.ts`: `kindOf('consumableProducts')==='catalog'`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — update `Consumable` (facts/slug/ingredients/allergens, validate slug via `assertSlug`, facts via `assertNutritionFacts`); create `ConsumableProduct` mirroring the `Consumable`/`Activity` class shape (tolerant `extra`, `meta`, `fromJSON` type-guards, `assertNutritionFacts` on the optional override); `effectiveFacts` helper; register in `collections.ts` + `index.ts`.
- [ ] **Step 4: Run, verify pass** — `pnpm --filter @oyl/all-of-oyl test consumable consumable-product collections && pnpm all-of typecheck:src && pnpm all-of build`.
- [ ] **Step 5: Commit** — `feat(all-of-oyl): enrich Consumable + add ConsumableProduct (UPC, override facts)`.

### Task 5: `Consumption` enrich

**Files:** Modify `nutrition/consumption.ts` + test.

**Interfaces — Produces:** `Consumption` gains optional `consumableProductId?: Id` (provenance), `loggedAmount?: { amount: number; unit: string }`; its `nutrients` snapshot is a full `NutritionFacts`; `servings` stays a positive (fractional-allowed) multiplier; `metrics()` unchanged (per-serving × servings over the expanded `NUTRIENT_METRICS`).
- Consumes: `NutritionFacts` (Task 2).

- [ ] **Step 1: Failing test** — construct a Consumption with a full-facts snapshot + `consumableProductId` + `loggedAmount`; round-trip preserves them; `metrics()` emits e.g. `nutrition.protein = protein × servings`; fractional `servings` (1.5) accepted.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — add the optional fields + their JSON; the `consumable`/`nutrients` resolution already snapshots — widen to `NutritionFacts`; add the `consumableProductId` provenance (mirror the existing `consumableId` handling, incl. the conflict check pattern only if a product object is also passed — keep it simple: accept `consumableProductId` directly).
- [ ] **Step 4: Run, verify pass** — `pnpm --filter @oyl/all-of-oyl test consumption && pnpm all-of typecheck:src && pnpm all-of build`.
- [ ] **Step 5: Commit** — `feat(all-of-oyl): Consumption gains product provenance + logged amount + full-facts snapshot`.

---

## Phase 2 — The `entries` split (manifest + codecs + journal-store + bootstrap)

### Task 6: Split `entries` into per-kind collections (manifest + codecs)

**Files:** Modify `collections.ts` (+test); modify `index.ts` (retire `reviveEntry` from the manifest path); update any `Seed`/fixtures referencing `entries`.

**Interfaces — Produces:** `COLLECTIONS` drops `entries`; adds `notes`, `consumptions`, `transactions`, `measurements`, `activitySessions` — each `classCodec(<Class>.fromJSON)` (`Note`/`Consumption`/`Transaction`/`Measurement`/`ActivitySession`). `KINDS`: all five `'personal'`. `reviveEntry` is no longer used by the manifest (the collection *is* the kind); keep the entry classes' own `fromJSON`. `revivePlan`/`plans` untouched.

- [ ] **Step 1: Failing test** — `collections.test.ts`: `COLLECTIONS.consumptions` + `COLLECTIONS.notes` exist and `kindOf` each is `'personal'`; `COLLECTIONS.entries` is gone; the `Seed`↔`COLLECTIONS` mirror test now expects the per-kind keys.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — replace the `entries` manifest entry with the five per-kind entries using each class's `fromJSON`; update `KINDS`; update `fixtures/seed.ts` `Seed` shape (replace `entries` field with the per-kind arrays) + the demo seed data accordingly; remove the now-unused `reviveEntry` import from `collections.ts` (and from `index.ts` if nothing else uses it — grep first; if other code uses `reviveEntry`, keep it exported).
- [ ] **Step 4: Run, verify pass** — `pnpm --filter @oyl/all-of-oyl test collections fixtures && pnpm all-of typecheck:src && pnpm all-of build`.
- [ ] **Step 5: Commit** — `refactor(all-of-oyl): split entries into per-kind collections (notes/consumptions/…)`.

### Task 7: Journal-store reads/writes per-kind repos

**Files:** Modify `apps/vanilla-oyl/src/state/journal-store.js` + test; modify `apps/vanilla-oyl/src/state/data.js` (wire the per-kind repo map).

**Interfaces — Produces:** `createJournalStore(reposByKind, tz)` where `reposByKind = { note, consumption, transaction, measurement, 'activity-session' }` (each a `Repository<Entry>`). The store's public API (`entriesOn`, `consumptionsOn`, `dailyNutrients`, `peek`, `add`, `remove`, `hydrate`) is UNCHANGED; only internals change: `hydrate()` reads all per-kind repos and merges into the in-memory `Journal`; `add(entry)` routes to `reposByKind[entry.kind].save`; `remove(id)` looks up the entry's kind in the aggregate, then routes to that repo's `delete`.
- Consumes: per-kind repos from bootstrap (Task 8).

- [ ] **Step 1: Failing test** — `journal-store.test.js`: build with a map of in-memory repos; adding a `Note` saves to `reposByKind.note` and a `Consumption` to `reposByKind.consumption` (assert the right repo got it, the others didn't); `hydrate()` merges records from multiple kind-repos into `entriesOn`/`consumptionsOn`; `remove(id)` of a consumption calls `reposByKind.consumption.delete`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — change the store to take `reposByKind`; `hydrate` = `Promise.all` over the map's repos → flatten → rebuild the `Journal`; `add`/`remove` route by `entry.kind`. In `data.js`, build `reposByKind` from `repos` (`{ note: repos.notes, consumption: repos.consumptions, transaction: repos.transactions, measurement: repos.measurements, 'activity-session': repos.activitySessions }`) and pass it to `createJournalStore`.
- [ ] **Step 4: Run, verify pass** — `pnpm vanilla test journal-store data && pnpm vanilla typecheck`.
- [ ] **Step 5: Commit** — `refactor(vanilla-oyl): journal-store reads/writes per-kind entry repos`.

### Task 8: Bootstrap per-kind paths + real-repos-for-notes/consumptions + stubs

**Files:** Modify `apps/vanilla-oyl/src/storage/bootstrap.js` + test.

**Interfaces — Produces:** `PATH_BY_COLLECTION` gains `notes:'notes'`, `consumptions:'consumptions'`, `transactions:'transactions'`, `measurements:'measurements'`, `activitySessions:'activity-sessions'` (drops `entries`) + `consumableProducts:'consumable-products'`. `ROW_KIND_BY_COLLECTION` = `{ notes:'note', consumptions:'consumption', transactions:'transaction', measurements:'measurement', activitySessions:'activity-session' }`. Bootstrap builds a real `createServerPersonalRepository` only for collections with a backend (a `BACKED` set = `{notes, consumptions}`); other personal collections get `emptyRepo()` (the existing stub) so their stores boot.

- [ ] **Step 1: Failing test** — `bootstrap.test.js`: `makeRepositories` exposes `repos.notes`/`repos.consumptions` as real server repos (a save enqueues to the outbox) and `repos.transactions`/`repos.measurements`/`repos.activitySessions` as stubs (`list()` resolves `[]`, `save` is a no-op or enqueue-less — match `emptyRepo`'s contract); `repos.consumableProducts` is a catalog client.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — update the maps; in the `entitiesByKind('personal')` loop, build a real repo when `name` ∈ `BACKED`, else `emptyRepo()`; add `consumableProducts` (catalog) — it's already covered by the `entitiesByKind('catalog')` loop once in the manifest. Confirm `ROW_KIND` injection: `consumptions→'consumption'` etc. (the `Consumption.fromJSON` per-kind codec doesn't actually need `kind` injected since the collection is the kind — but `strapiRowToShape` still maps `recordId→id`; pass `rowKind` only if the codec needs it. Since per-kind codecs are `Class.fromJSON` (no kind dispatch), `ROW_KIND` injection is optional — keep the map for documentation/forward-compat but the decode works without it. Verify the consumption round-trip decodes without a `kind` field.)
- [ ] **Step 4: Run, verify pass** — `pnpm vanilla build:lib && pnpm vanilla typecheck && pnpm vanilla test`.
- [ ] **Step 5: Commit** — `refactor(vanilla-oyl): per-kind entry repos in bootstrap (real notes+consumptions, stubs for the rest)`.

> **Note on `ROW_KIND` after the split:** with per-kind collections each using `Class.fromJSON` (not the heterogeneous `reviveEntry`), the decoded row no longer needs a `kind` discriminant injected. Confirm in Task 8 that `strapiRowToShape(row)` (recordId→id only) suffices for `Consumption.fromJSON`; if `Consumption.fromJSON` requires `kind`, inject it via `rowKind` as A did. Resolve this concretely in the task, don't leave it ambiguous.

---

## Phase 3 — Relational backend (`apps/strapi-oyl`)

### Task 9: `nutrition-facts` shared component

**Files:** Create `apps/strapi-oyl/src/components/nutrition/nutrition-facts.json` + `nutrition/additional-nutrient.json` (repeatable sub-component).

**Interfaces — Produces:** a reusable Strapi component `nutrition.nutrition-facts` with: the mandatory nutrient amounts as columns (decimal/float), `servingSizeAmount`/`servingSizeUnit`/`householdMeasure`, `ingredients` (json or repeatable), `allergens` (json), and a repeatable `nutrition.additional-nutrient` (`slug` string + `amount` decimal). Used by `consumable`, `consumable-product`, and `consumption`.

- [ ] **Step 1: Implement** the two component JSONs (mandatory fields mirror the `NutritionFacts` mandatory set; use `decimal` type for amounts; `ingredients`/`allergens` as `json` for the ordered string lists to keep it simple — note in a comment these could become repeatable components later).
- [ ] **Step 2: Build** — `pnpm --filter @oyl/strapi-oyl-app exec strapi build` → green (components compile; types regenerate).
- [ ] **Step 3: Commit** — `feat(strapi-oyl): nutrition-facts shared component (mandatory columns + additional nutrients)`. (No test alone; exercised by Tasks 10–11.)

### Task 10: `consumable` (updated) + `consumable-product` (new, UPC-dedup) content-types

**Files:** Modify `apps/strapi-oyl/src/api/consumable/**` (it exists from A as a catalog type — add the `nutrition-facts` component + ingredients/allergens); create `apps/strapi-oyl/src/api/consumable-product/**` (content-type + controller + routes); modify `src/index.ts` (grants); modify `test/parity.test.ts`; create `test/consumable-product.test.ts`.

**Interfaces — Produces:** `consumable` content-type uses the `nutrition-facts` component (facts) + slug. `consumable-product` content-type (catalog): `recordId` (unique), `upc` (string, **unique when present**), `brand`/`name`, `netWeight*`, `servingsPerContainer`, a `manyToOne` `consumable` relation, an optional `nutrition-facts` component, `creator` relation. Controller mirrors `activity`'s catalog pattern (creator-scoped mutation, public-or-mine reads) BUT with the **UPC-dedup rule**: a create/upsert carrying a `upc` resolves to the existing row by `upc` (returns it) and treats UPC-bearing products as `public` regardless of creator; non-UPC products use the activity-style creator/visibility gate.

- [ ] **Step 1: Failing test** — `consumable-product.test.ts` (booted, model on `activity.catalog.test.ts`): user A creates a product with a UPC → user B's list includes it (UPC products are public); user B "creating" the same UPC resolves to the SAME row (one row, not two — assert by listing); a product WITHOUT a UPC created by A is not visible to B; creator is server-stamped. Plus a parity assertion for the new content-types/component.
- [ ] **Step 2: Build + run, verify fail.**
- [ ] **Step 3: Implement** — `consumable` schema + the `nutrition-facts` component; `consumable-product` schema (UPC unique) + controller (generalize `activity`'s, add the by-UPC resolution on create/upsert) + routes; extend `grantRoleActions` in `index.ts` for `api::consumable-product.consumable-product.*`; extend `parity.test.ts`.
- [ ] **Step 4: Run, verify pass** — `pnpm --filter @oyl/strapi-oyl-app exec tsc --noEmit && pnpm --filter @oyl/strapi-oyl-app exec strapi build && pnpm --filter @oyl/strapi-oyl-app test`.
- [ ] **Step 5: Commit** — `feat(strapi-oyl): consumable facts component + consumable-product (UPC-deduped catalog)`.

### Task 11: `consumption` content-type (owner-scoped, upsert-by-recordId)

**Files:** Create `apps/strapi-oyl/src/api/consumption/**`; modify `src/index.ts` (grant); modify `test/parity.test.ts`; create `test/consumption.owner-scoping.test.ts`.

**Interfaces — Produces:** owner-scoped `consumption` content-type (personal pattern from `note`): `recordId` (unique), `occurredAt`, `note`, `servings` (decimal), optional `consumableId`/`consumableProductId` (string ids), optional `loggedAmountAmount`/`loggedAmountUnit`, the `nutrition-facts` component (the resolved snapshot), `owner` relation. Controller = the `note` owner-scoped + upsert-by-`recordId` pattern verbatim (generalized).

- [ ] **Step 1: Failing test** — `consumption.owner-scoping.test.ts` (model on `note.owner-scoping.test.ts`): A upserts a consumption by recordId → A sees it, B doesn't; B's PUT/DELETE by that recordId → 404; a second PUT by A upserts (one row); the facts snapshot persists. + parity assertion.
- [ ] **Step 2: Build + run, verify fail.**
- [ ] **Step 3: Implement** — schema (reuse the `nutrition-facts` component) + the owner-scoped upsert controller (copy `note`'s, swap fields) + routes + grant + parity.
- [ ] **Step 4: Run, verify pass** — backend tsc + build + test green.
- [ ] **Step 5: Commit** — `feat(strapi-oyl): owner-scoped consumption content-type (upsert by recordId, facts snapshot)`.

---

## Phase 4 — App wiring + end-to-end

### Task 12: Nutrition store/screen on the split + e2e meal-log

**Files:** Modify `apps/vanilla-oyl/src/state/data.js` (expose a consumption-logging path on the journal-store/nutrition surface using `repos.consumptions` + the `consumables`/`consumableProducts` catalogs); modify the nutrition screen/composer to log via the consumption path + (minimal) select a consumable/product; tests for the touched units.

**Interfaces — Consumes:** `repos.consumptions` (real server repo, Task 8), `catalogs.consumables`/`catalogs.consumableProducts`, the journal-store's `add`/`consumptionsOn`/`dailyNutrients`.

- [ ] **Step 1: Failing test** — a nutrition composer/store test (fakes): logging a consumption (from a selected consumable, snapshotting its facts) enqueues to `repos.consumptions`; `consumptionsOn(day)`/`dailyNutrients` reflect it; the daily summary stays macro-focused (calories+macros).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — wire the nutrition composer to select a `Consumable` (and optionally a `ConsumableProduct` via the catalog) and log a `Consumption` that snapshots the resolved `NutritionFacts`; the journal-store routes it to `repos.consumptions`. Keep the UI minimal (full product/barcode UX is Sub-project D).
- [ ] **Step 4: Run, verify pass** — `pnpm vanilla build:lib && pnpm vanilla typecheck && pnpm vanilla test`.
- [ ] **Step 5: Commit** — `feat(vanilla-oyl): log consumptions via the per-kind consumption repo + nutrition catalogs`.

---

## Manual acceptance (after Task 12)

Backend + app (fresh DB), signed in: add a `Consumable` with facts; (optionally) a `ConsumableProduct` with a UPC; log a meal referencing it → it flushes to `/api/consumptions`, persists server-side, and reads back on another session with the resolved facts + daily macro totals. Confirm a second user scanning the same UPC resolves to the one shared product. Confirm a consumption is owner-isolated.

## Self-review notes (coverage map)

- Spec B1.1 (registry) → T1. B1.2 (`NutritionFacts`) → T2. B1.3 (%DV) → T3. B1.4 (`Consumable`/`ConsumableProduct`) → T4. B1.5 (`Consumption`) → T5. B1.6 (linkage) → T5+T12. B1.7 (backend: facts component, consumable, consumable-product, UPC-dedup) → T9, T10. B1.8 (snapshot) → T5 + T11. B1.9 (entries split + consumption backend) → T6, T7, T8 (split) + T11 (consumption content-type) + T12 (e2e).
- Reuse: A's `note` controller = the `consumption` template; A's `activity` controller = the `consumable-product` template; A's `parity.test.ts`/booted-test patterns; the `NUTRIENT_METRICS`-driven `nutrients.ts`.
- Deferred (per spec): B2 (activity metrics), B3 (full catalog visibility/curation/dedup policy for non-UPC items), B4 (other entity-kind backends — transactions/measurements/activity-sessions read as stubs), the full barcode/product UI (Sub-project D), per-user Daily Values, structured sub-ingredients.
- Phase ordering: P1 (lib domain, repo green throughout) → P2 (entries split; the app may transiently expect backends that arrive in P3, but the app's tests use fakes so they stay green; the split's stubs keep non-backed kinds empty) → P3 (backend content-types) → P4 (wire + e2e). The consumption backend (T11) precedes the e2e wiring (T12).
