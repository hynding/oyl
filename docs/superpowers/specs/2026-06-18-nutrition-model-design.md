# Nutrition Model — design (Sub-project B1)

**Date:** 2026-06-18
**Status:** Approved (brainstorming)
**Scope:** Deepen the nutrition domain on the relational/online-first foundation from Sub-project A: a full FDA Nutrition Facts model (driven by a nutrient registry), a new `ConsumableProduct` (barcoded purchasable layer), and the `Consumption` linkage. One spec → plan → build cycle. Part of the larger Sub-project B (B2 Activity metrics, B3 catalog visibility/curation policy, B4 remaining relational entities are separate cycles).

## Background

Sub-project A established the online-first stack: a relational Strapi backend with the catalog pattern (`activity` = creator + `public`/`private` visibility) and the personal pattern (`note` = owner-scoped), an entity-`kind` manifest, write-outbox + read-cache + flusher, and the `strapiRowToShape` read adapter. `Consumable` today is a thin catalog type carrying a small `Nutrients` value object (`calories`/`protein`/`carbs`/`fat`/`waterMl`), and `Consumption` (a personal `entries` record) references a `consumableId` and snapshots its per-serving nutrients. B1 deepens this to a real nutrition model.

The project is pre-adoption: local + server data is discarded on this change (no migration), consistent with prior refactors.

## Decisions (from brainstorming)

| # | Decision |
|---|---|
| Facts location | **Hybrid:** `Consumable` carries representative `NutritionFacts`; `ConsumableProduct` may carry an **override** label. Effective facts = `product.facts ?? consumable.facts`. |
| Nutrient breadth | Typed **mandatory** FDA columns + an **extensible** additional-nutrients set for the voluntary long tail. |
| Amounts/%DV | Store **canonical amounts** only; **%DV computed** from a Daily-Value table (a shared formatter), not stored. |
| Nutrient keys | A **controlled nutrient registry** (slug → canonical unit + optional Daily Value + `mandatory` flag); both mandatory + additional nutrients reference it. |
| `ConsumableProduct` | The barcoded purchasable layer: UPC, brand, name, net weight, servings-per-container, → `Consumable`, optional override label. (Name chosen over "Consumable Instance".) |
| UPC identity | A product **with a UPC is global/public and deduped by UPC** — a scan resolves to the one shared row; created public if missing. Products **without** a UPC follow normal creator-scoped catalog rules. |
| Consumption linkage | Gains optional `consumableProductId` (provenance) alongside `consumableId`; snapshots the **full resolved** `NutritionFacts`; `servings` stays a fractional multiplier (enables amount-based logging); optional logged `amount`+unit for display. |
| Ingredients | Ordered list of ingredient strings + optional `allergens` list. Structured sub-ingredients deferred (YAGNI). |

## Architecture

### B1.1 — Nutrient registry (`@oyl/all-of-oyl`)

A new `nutrition/nutrient-registry.ts`: the canonical list of known nutrients, each `{ slug, label, canonicalUnit, dailyValue?, mandatory }`.
- `slug` (e.g. `'saturated-fat'`, `'vitamin-d'`) is the controlled key; `canonicalUnit` ∈ {`'kcal'`, `'g'`, `'mg'`, `'mcg'`, `'ml'`}.
- `mandatory: true` for the 2016 FDA label set; `false` for the voluntary tail.
- `dailyValue` is the adult FDA Daily Value (for %DV); absent where none is defined.
- The registry is the single source for: validation (a nutrient slug must exist), %DV computation, display label + unit, and label ordering. It is the seam toward a future first-class nutrient catalog; the mandatory fields can later fold into it without a consumer rewrite.

**Mandatory set** (canonical units): calories (kcal); total fat, saturated fat, trans fat, total carbohydrate, dietary fiber, total sugars, added sugars, protein (g); cholesterol, sodium, calcium, iron, potassium (mg); vitamin D (mcg). Plus `waterMl` (ml) — not an FDA label item but the app's hydration metric, retained.

### B1.2 — `NutritionFacts` value object (expands `Nutrients`)

In `nutrition/nutrients.ts` (rename/expand the current `Nutrients` to `NutritionFacts`; keep a `Nutrients` alias if churn warrants, else update consumers):
- `servingSize?: { amount: number, unit: string }` + optional `householdMeasure?: string` ("1 cup").
- Typed **mandatory** amounts: one optional numeric field per mandatory registry slug, in its canonical unit. All optional (label data is often incomplete).
- `additional?: Array<{ slug: string, amount: number }>` — voluntary nutrients; each `slug` must resolve in the registry; amount in the registry's canonical unit.
- Validation (`assertNutritionFacts`): every present amount is a non-negative finite number; every `additional.slug` exists in the registry; `servingSize.amount > 0` when present.
- `NUTRIENT_METRICS` expands so each mandatory nutrient emits a metric key (`nutrition.<slug>`), preserving streaks/insights; `Consumption.metrics()` continues to emit `amount × servings`.
- `sumNutrients` (`nutrition/totals.ts`) and `formatNutrients` (`format/`) handle the wider shape (mandatory + additional). Daily totals stay macro-focused in the UI; the full label renders on a consumable's detail.
- JSON round-trip preserves mandatory fields + the `additional` array + serving size; tolerant reader unchanged.

### B1.3 — %DV formatter (`@oyl/all-of-oyl/format`)

A new `format/daily-value.ts`: `percentDailyValue(slug, amount): number | undefined` using the registry's `dailyValue` (adult DV); `undefined` when the nutrient has no DV. Computed at display only; never persisted. Per-user Daily Values (from the User profile's calorie/macro targets) are a noted future enhancement, out of B1.

### B1.4 — `Consumable` (catalog)

`nutrition/consumable.ts`: `name`, `slug`, a representative `NutritionFacts`, `ingredients?: string[]` (ordered), `allergens?: string[]`. Stays a catalog entity (creator + visibility per A). Existing `Consumable` fields not in scope are preserved.

### B1.5 — `ConsumableProduct` (catalog) — new

New `nutrition/consumable-product.ts` (class + codec; manifest key `consumableProducts`, kind `catalog`):
- `upc?: string` (the barcode; optional — some products lack one), `brand?`, `name`, `netWeight?: { amount, unit }`, `servingsPerContainer?: number`, `consumableId: Id` (→ `Consumable`).
- Optional override: `facts?: NutritionFacts`, `ingredients?: string[]`, `allergens?: string[]`. Effective facts = `facts ?? consumable.facts` (resolution helper in the domain).
- **UPC identity rule:** a product carrying a `upc` is treated as a global shared catalog row, deduped by UPC (see B1.7). Without a `upc`, it follows normal creator-scoped catalog rules.

### B1.6 — `Consumption` linkage (personal)

`nutrition/consumption.ts`: add optional `consumableProductId?: Id` (provenance alongside `consumableId`). Keep snapshotting the **full resolved** per-serving `NutritionFacts` at log time (survives catalog edits/deletion + works offline/private mode). `servings` remains a positive (fractional-allowed) multiplier; add an optional `loggedAmount?: { amount, unit }` for display ("150 g") — the client derives `servings = loggedAmount.amount / servingSize.amount` when logging by amount. `metrics()` unchanged in spirit (per-serving × servings over the expanded set).

### B1.7 — Backend (relational Strapi, A's pattern)

- A shared Strapi **component** `nutrition-facts`: the mandatory nutrients as **columns** (queryable), a repeatable child component `additional-nutrient` `{ slug, amount }`, `servingSize`/`householdMeasure`, `ingredients`, `allergens`. Reused by both content-types below.
- `consumable` content-type (catalog: `creator` + `visibility`, default `public`; owner/creator-scoped controller per A) using the `nutrition-facts` component.
- `consumable-product` content-type (catalog): `upc` (**unique when present**), `brand`/`name`/`netWeight`/`servingsPerContainer`, a `manyToOne` relation to `consumable`, an optional `nutrition-facts` component (override). Controller enforces the **UPC-dedup rule**: an upsert/create with a `upc` resolves to the existing shared row (returns it) rather than duplicating; a UPC-bearing product is visible to all (public), independent of creator; non-UPC products use the creator/visibility gate. Creator is still stamped server-side (provenance) and never client-settable.
- Manifest: add `consumableProducts` (kind `catalog`); reuse A's parity test (extend it to the new content-types/components: mandatory columns present, `consumable` relation on product, `creator`+`visibility`). `ROW_KIND_BY_COLLECTION` wiring as needed (catalog reads need no `kind` injection; verify the `entries`/`consumption` path still injects `'consumption'`-vs-`'note'` correctly — note that `consumption` is an Entry kind, so when a backend for it exists it injects `'consumption'`; B1 does not add a consumption backend, consumptions ride `entries`).

### B1.8 — Snapshot principle

`Consumption` stores the resolved `NutritionFacts` so logged meals are correct across catalog edits/deletion and renderable offline / in private mode (E). Unchanged from A; reinforced for the wider facts.

### B1.9 — Known limitation: consumption persistence (the `entries` split)

B1 makes the **Consumable catalog** fully server-backed (search/select, FDA facts, products by UPC) and the **domain** `Consumption` model complete (provenance + resolved-facts snapshot). It does **not** give consumptions a server home. A built only a `note` content-type, and the heterogeneous `entries` collection (note / consumption / transaction / measurement / activity-session, revived by `kind`) routes entirely to `/api/notes` via `PATH_BY_COLLECTION` — so a consumption record cannot persist server-side yet.

Making consumptions (and the other non-note entry kinds) persist requires **splitting the single `entries` collection into per-kind relational content-types** (`note`, `consumption`, …) and teaching the client data layer to route an entry *record* to the backend path for its `kind`. That is a cross-cutting backend/data-layer change affecting journal, finance, nutrition, and activity entries alike — **out of B1's scope, and the natural next piece** (a dedicated cycle, likely sequenced with B4 or as its own "B-entries-split"). Until then, B1's value is the catalog half: a real, searchable, FDA-grade consumable/product catalog plus a complete domain Consumption model ready to persist once the split lands.

## Error handling

- Unknown `additional` nutrient slug → `DomainError` at construction/`fromJSON` (validated against the registry).
- Negative/non-finite amount, non-positive `servingSize.amount`/`servings` → `DomainError('INVALID_QUANTITY')`.
- A `ConsumableProduct` whose `consumableId` doesn't resolve → the read returns the product with no inheritable facts; the effective-facts helper falls back to the product's own override or yields empty facts (the Consumption snapshot is the durable record regardless).
- UPC-dedup: a create with an existing UPC returns the shared row (idempotent); concurrent same-UPC creates are reconciled by the unique constraint (the loser reads the winner).

## Testing

- **Registry:** every mandatory slug has a canonical unit; slugs are unique; `dailyValue` units are consistent.
- **`NutritionFacts`:** round-trip incl. `additional` + serving size; rejects an unknown additional slug and negative amounts; `NUTRIENT_METRICS` emits the expanded set.
- **%DV formatter:** known values for representative nutrients; `undefined` for a no-DV nutrient.
- **`Consumable`/`ConsumableProduct`:** construct/round-trip; effective-facts resolution (`product.facts ?? consumable.facts`).
- **`Consumption`:** snapshots resolved facts; `consumableProductId` provenance; amount-based `servings` derivation.
- **Backend (booted Strapi):** consumable + consumable-product CRUD; the `nutrition-facts` component persists mandatory columns + additional rows + ingredients/allergens; **UPC-dedup** — two users creating the same UPC resolve to ONE shared public row, both can read it; a non-UPC product stays creator-scoped; creator is server-stamped. Parity test green for the new content-types/components.
- **End-to-end (the A-style seam check):** a fetched `consumable`/`consumable-product` row decodes through the REAL codec (recordId→id via `strapiRowToShape`).

## Definition of Done

- `@oyl/all-of-oyl`: tests + `typecheck:src` + `build` green (registry, `NutritionFacts`, `ConsumableProduct`, expanded `Consumption`/`sumNutrients`/`formatNutrients`, %DV formatter).
- `apps/vanilla-oyl`: tests + `typecheck` + `build:lib` green (stores/components consuming the wider facts still pass; daily totals macro-focused).
- `apps/strapi-oyl`: `tsc` + test suite green; `consumable`/`consumable-product` content-types + `nutrition-facts` component; UPC-dedup proven; parity test extended.
- A booted end-to-end decode check confirms a real Strapi consumable/product row decodes via the real codec.

## Scope boundaries (what B1 is NOT)

- **Not** Activity catalog-defined metrics (B2).
- **Not** the full catalog visibility/curation/dedup **policy** for non-UPC, user-authored catalog items (B3) — B1 implements UPC-dedup + the A-default `public`/creator behavior; the broader policy (moderation, merge, private-by-default, etc.) is B3.
- **Not** the other relational entities — finance, goals, planner, vault (B4).
- **Not** consumption server-persistence — see B1.9. The heterogeneous `entries` collection still routes to `/api/notes`; splitting `entries` into per-kind content-types (so consumptions/transactions/etc. persist) is a cross-cutting next piece, not B1.
- **Not** per-user Daily Values, structured sub-ingredients, or volume↔weight density conversion (noted future enhancements).
- Data is discarded, not migrated (pre-adoption).
