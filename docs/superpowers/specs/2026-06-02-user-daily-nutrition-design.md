# User Daily Nutrition Section — Design

**Date:** 2026-06-02
**Status:** Spec — pending review
**Author:** Steve Hynding (w/ Claude)

## Goal

Add a nutrition section to the `UserDailyPage` so users can track what they consumed for a given date. The section supports:

- Tiered search: own recently-logged items first, then global Strapi items, then OpenFoodFacts on explicit opt-in
- Barcode scanning for adding items by scanning packaging
- Daily macro totals with optional target progress
- Quick-add chips from recently-consumed items
- Per-entry edit (servings, time) and soft-delete

OpenFoodFacts (OFF) requests must be conservative: shared Strapi cache, no auto-fetching, explicit user intent only.

## Architecture

### Module layout

**New: `react-oyl/modules/user/daily/nutrition/`** — mirrors existing `daily/activities/` and `daily/goals/` patterns.

```
daily/nutrition/
  index.ts
  UserDailyNutrition.tsx              # the <Section> shell
  UserDailyNutritionList.tsx          # renders rows
  UserDailyNutritionRow.tsx           # one logged item
  UserDailyNutritionTotals.tsx        # totals + target progress strip
  UserDailyNutritionQuickAdd.tsx      # last-N-recent chips
  UserDailyAddNutritionForm.tsx       # add/search/scan flow
  UserDailyNutritionSearchInput.tsx   # tiered Autocomplete
  UserDailyBarcodeButton.tsx          # opens scanner dialog
  UserDailyBarcodeScanner.tsx         # camera + decoder
```

**Rewritten: `react-oyl/modules/user/nutrition/`** — promoted to the single owner of user-nutrition CRUD; mirrors `user/activity/` structure.

```
user/nutrition/
  index.ts
  user-nutrition-context.ts
  UserNutritionProvider.tsx           # thin CRUD wrapper over useData('user-nutritions')
  useUserNutrition.ts
  useRecentNutritionItems.ts          # derived from provider state
```

**New: `react-oyl/modules/nutrition/openfoodfacts/`** — owns the OFF integration.

```
nutrition/openfoodfacts/
  openfoodfacts-client.ts             # pure typed fetch wrapper, no React
  off-types.ts                        # OFFProduct, OFFSearchResponse, normalizeProduct
  useNutritionSearch.ts               # tiered local→OFF search hook + cache writes
  useBarcodeScanner.ts                # BarcodeDetector + ZXing fallback
```

**Deleted:**
- `react-oyl/modules/nutrition/NutritionPage.tsx`, `NutritionProvider.tsx`, `nutrition-context.ts`, `useNutrition.ts` — the duplicate standalone OFF search page. OFF concerns move into the search hook.
- The duplicate OFF code in the current `react-oyl/modules/user/nutrition/UserNutritionProvider.tsx` (the rewrite replaces it).

### Daily page integration

`UserDailyDataProviders` adds `<UserNutritionProvider>` (innermost). `useUserDailyOrchestrator` gains nutrition-derived shapes and mutators. `UserDailyPage` adds `<UserDailyNutrition />` as a **full-width row below** the existing Activities/Goals 2-column grid.

```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
  <UserDailyActivities />
  <UserDailyGoals />
</div>
<div className="mt-8">
  <UserDailyNutrition />
</div>
```

Rationale: the totals strip + search + log list is wider than the activity/goal cards; a third grid column wouldn't read well.

## Strapi schema changes

### `nutrition-item` — expand existing schema

```jsonc
{
  "attributes": {
    "uuid":     { "type": "uid" },                                  // existing
    "name":     { "type": "string", "required": true },             // existing — drop "unique"
    "barcode":  { "type": "string", "unique": true },               // NEW — sparse-unique
    "brand":    { "type": "string" },                               // NEW
    "image_url":{ "type": "string" },                               // NEW
    "serving_size": { "type": "decimal", "min": 0 },                // NEW
    "serving_unit": { "type": "enumeration",                        // NEW
                      "enum": ["g", "ml", "serving"], "default": "g" },
    "calories_per_100": { "type": "decimal", "min": 0 },            // NEW — per 100 of serving_unit
    "protein_per_100":  { "type": "decimal", "min": 0 },
    "carbs_per_100":    { "type": "decimal", "min": 0 },
    "fat_per_100":      { "type": "decimal", "min": 0 },
    "package_quantity": { "type": "string" },                       // NEW — OFF `quantity`, e.g. "500 g"
    "nutri_score": { "type": "enumeration",                         // NEW — A–E grade
                     "enum": ["a", "b", "c", "d", "e"] },
    "nutri_score_value": { "type": "integer" },                     // NEW — numeric Nutri-Score
    "nova_group": { "type": "integer", "min": 1, "max": 4 },        // NEW — processing classification
    "allergens": { "type": "json" },                                // NEW — string[] (normalized, no `en:` prefix)
    "source":   { "type": "enumeration",                            // NEW
                  "enum": ["user", "openfoodfacts"], "default": "user", "required": true },
    "creator":  { "type": "relation", "relation": "oneToOne",       // existing
                  "target": "plugin::users-permissions.user", "private": true },
    "data":     { "type": "json" }                                  // existing — keeps full OFF payload
  }
}
```

**Drop `"unique": true` on `name`** — OFF has many "Coca-Cola" products by different brands/sizes. Uniqueness lives on `barcode`.

### `nutrition-search` — no schema change

Keeps `query` (unique), `results` JSON, `uuid`. Stores normalized query → array of product summaries (enough to render the autocomplete row + `barcode` to fetch the full item on selection).

- **Normalization:** `lowercased + trimmed + collapsed whitespace`. Applied on write and read.
- **No TTL.** Cache forever. Users can edit a stale item locally if they encounter one.

### `user-nutrition` — small tightening

- `calories`, `protein`, `carbs`, `fat`: change type from `integer` to `decimal` (servings produce fractional macros).
- All other fields stay. `name`, `calories`, `protein`, `carbs`, `fat` are snapshots taken at log time.
- `data` JSON keeps `{ meal?, source, serving_size_at_log, serving_unit_at_log }`.
- `deleted_at` (already in schema, currently unused) enables soft-delete.

### `user-daily` controller — field-name fix

`saveByDate` currently reads `nutrition` (singular) from the body but the typed `TUserDaily` uses `nutritions` (plural). Align everything on **`nutritions`** to match `activities`/`goals`. Update `saveByDate` body destructure and the `documents.update` payload.

### Controller behavior

- `nutrition-item.create` — authenticated only; force `creator = ctx.state.user.id`. If `barcode` already exists, return the existing record's documentId (let client dedupe; avoids the 400 round-trip).
- `nutrition-item.find / findOne` — authenticated; **not** filtered by creator (items are shared).
- `nutrition-search.find / create` — authenticated; cache is shared. Customize `create`: if `query` already exists, **update** that row (upsert).
- `user-nutrition` — owner-scoped via existing factory. Customize `delete` → set `deleted_at = now()` and return; do not hard-delete.

## OpenFoodFacts integration & caching

### `openfoodfacts-client.ts`

Pure typed fetch wrapper, no React. Targets **OFF API v3** (the current recommended version; v2 is deprecated, the existing in-tree code uses v2 and is being replaced).

```ts
searchByQuery(query: string, signal: AbortSignal): Promise<OFFProductSummary[]>
fetchByBarcode(barcode: string, signal: AbortSignal): Promise<OFFProduct | null>
```

Fields requested: barcode, product name, brands, image URL, serving size/quantity, nutriments — exact v3 field names to be confirmed against the v3 spec during implementation (v3 response shapes differ from v2 in places, particularly around the search response envelope and nutriment keys). The `normalizeProduct()` mapper described below is written against v3 docs at implementation time, not copied from the existing v2 code.

### Base URL & environments

Base URL is parameterized via env var so dev points at OFF's staging environment and prod points at production. Per OFF guidance: *"While testing your applications, make all API requests to the staging environment."*

| Env | Base URL |
|---|---|
| Dev | `https://world.openfoodfacts.net/api/v3` (staging) |
| Prod | `https://world.openfoodfacts.org/api/v3` |

**Staging basic auth:** OFF's staging may require `Authorization: Basic ${btoa('off:off')}` (used to prevent search-engine indexing). The client detects this conditionally — if the base URL contains `openfoodfacts.net`, attach the staging basic-auth header. Production calls send no `Authorization` header. Handled inside `openfoodfacts-client.ts` so consumers don't think about it.

Single env var, two values:

```
# react-oyl/.env.example
VITE_OFF_BASE_URL=https://world.openfoodfacts.net/api/v3   # prod override: https://world.openfoodfacts.org/api/v3
```

### Client identification

OFF wants `User-Agent: AppName/Version (ContactEmail)` to avoid bot classification, but browsers strip custom `User-Agent` from `fetch`. OFF allows web clients to identify themselves via custom non-forbidden headers instead. Every OFF request sets:

| Header | Source |
|---|---|
| `X-App-Name` | `import.meta.env.VITE_OFF_APP_NAME` |
| `X-App-Version` | `import.meta.env.VITE_OFF_APP_VERSION` |
| `X-Client-Id` | `import.meta.env.VITE_OFF_CLIENT_ID` |

Full `.env.example`:

```
# react-oyl/.env.example
VITE_OFF_BASE_URL=https://world.openfoodfacts.net/api/v3
VITE_OFF_APP_NAME=OYL/1.0
VITE_OFF_APP_VERSION=1.0
VITE_OFF_CLIENT_ID=https://github.com/hynding/oyl
```

Reading the values lives in `openfoodfacts-client.ts` (one place, easy to mock in tests). Missing env vars at build time log a single dev-mode warning; OFF calls still proceed (degraded identification, not blocked).

### Rate limits

OFF enforces **15 req/min/IP for product reads** and **10 req/min/IP for search reads**, but explicitly states: *"If your requests come from your users directly (ex: mobile app), the rate limits apply per user."* Browser-direct gives each user their own quota — a server proxy would concentrate all users on one IP. This is the primary architectural reason to keep OFF traffic in the browser.

Per-request `AbortController` allows cancellation on new keystrokes.

### `useNutritionSearch(query)` — tiered hook

State: `{ localResults, offResults, offLoading, offError, searchOff }`.

**On `query` change** (debounced 200ms, only when length ≥ 1):

1. Build `localResults` synchronously:
   - **Tier 1 — Recently consumed:** dedup last ~30 of the user's `user-nutrition` rows by `nutrition_item.documentId`, prefix-match on `name`/`brand`, sort most-recent-first.
   - **Tier 2 — Global items:** `GET /nutrition-items?filters[$or][0][name][$startsWithi]=…&filters[$or][1][brand][$startsWithi]=…&pagination[pageSize]=20`. Cached client-side per query for the session.
   - Merge: Tier-1 first (tagged `source: 'recent'`), then Tier-2 minus any documentIds already in Tier-1.

2. `offResults` starts empty. A sentinel row "Search OpenFoodFacts for '<query>'" renders last in the dropdown.

3. User clicks sentinel → `searchOff()`:
   - Normalize query.
   - **Read-through cache:** `GET /nutrition-searches?filters[query][$eq]=<normalized>&pagination[pageSize]=1`. On hit, set `offResults` immediately.
   - On miss: `searchByQuery()` against OFF. On success:
     - **Write-through:** `POST /nutrition-searches` with `{ query: normalized, results: summaries }` (controller upserts).
     - Set `offResults`.
   - Set `offLoading`/`offError` around the call. Errors surface inline in the dropdown; local results stay rendered.

### Selection flow (OFF row or barcode scan)

1. **Find-or-create nutrition-item** by barcode:
   - `GET /nutrition-items?filters[barcode][$eq]=<barcode>&pagination[pageSize]=1` → if hit, use that documentId.
   - On miss: `fetchByBarcode()` against OFF → `normalizeProduct()` → `POST /nutrition-items` with `source: 'openfoodfacts'` + the full OFF payload in `data`. Controller returns the new documentId (or the existing one on a race).
2. Hand the documentId to the add-log mini-form (servings + time) → create the `user-nutrition` row.

### `normalizeProduct()` — OFF → our schema

`normalizeProduct()` produces two outputs in a single pass: (1) the typed column values, and (2) the curated `data` JSON subset. Exact v3 field names verified against the v3 spec at implementation time (v3 differs from v2 in several keys).

**Column values** — OFF gives macros as per-100 (g or ml) and/or per-serving; we always store **per 100 of `serving_unit`**.

| Our column | Source (semantic) |
|---|---|
| `name` | OFF product name; fall back to `generic_name` then `code` |
| `brand` | First entry of OFF `brands` (string-split on comma, trimmed) |
| `image_url` | OFF `image_front_small_url` (thumbnail; full URL kept in `data`) |
| `serving_unit` | `'g'` if a per-100g macro is present; `'ml'` if per-100ml is present; else `'serving'` (preferring g when both present) |
| `serving_size` | OFF's `serving_quantity` (numeric) or null |
| `package_quantity` | OFF's `quantity` string (e.g. "500 g") or null |
| `calories_per_100` | OFF's energy in kcal per 100 of `serving_unit` |
| `protein_per_100` | OFF's protein per 100 of `serving_unit` |
| `carbs_per_100` | OFF's carbohydrates per 100 of `serving_unit` |
| `fat_per_100` | OFF's fat per 100 of `serving_unit` |
| `nutri_score` | OFF's `nutriscore_grade` (lowercase a–e) or null |
| `nutri_score_value` | OFF's `nutriscore_score` (integer) or null |
| `nova_group` | OFF's `nova_group` (1–4) or null |
| `allergens` | OFF's `allergens_tags` array, with `en:` prefixes stripped (e.g. `['gluten', 'milk']`) or null |
| `source` | `'openfoodfacts'` |

Missing values stay null. Forms render null fields as "—" with editable inputs.

**Curated `data` JSON subset** — kept so future features don't require re-fetching OFF for items we've already cached:

```ts
data = {
  generic_name: string | null,         // language-neutral name fallback
  categories_tags: string[],           // e.g. ['en:beverages', 'en:plant-based-milks']
  ingredients_text: string | null,     // free-form, English only
  ecoscore_grade: 'a'|'b'|'c'|'d'|'e' | null,
  nutrient_levels: {                   // OFF's traffic-light low/moderate/high
    fat?: 'low'|'moderate'|'high',
    'saturated-fat'?: 'low'|'moderate'|'high',
    sugars?: 'low'|'moderate'|'high',
    salt?: 'low'|'moderate'|'high',
  } | null,
  labels_tags: string[],               // e.g. ['en:organic', 'en:fair-trade']
  image_front_url: string | null,      // full-size image (small URL is promoted to column)
  traces_tags: string[],               // may-contain allergens, normalized like `allergens`
  off_last_modified_t: number | null,  // OFF's last_modified_t, lets us detect staleness later
}
```

**Deliberately not stored:**
- All translations (`*_en`, `*_fr`, …) beyond what's pulled into English fields above
- Edit history metadata (`last_modified_by`, `correctors_tags`, `editors_tags`, etc.)
- Image variants beyond the small thumb (column) and full URL (`data.image_front_url`) — no `*_2x_url`, no `selected_images.*` arrays
- The raw `nutriments` object — only the promoted-to-column macros are kept

This is the v1 subset. If a future feature needs another field, add it to the `data` schema and the normalizer; existing cached items are re-fetched only when explicitly invalidated (out of scope for v1).

### Rate-limit posture

Three layers stacked:

1. OFF only called on **explicit click** (sentinel row) or **explicit scan** (deliberate user action).
2. Before any OFF call, check Strapi cache (`nutrition-search` for queries, `nutrition-item` for barcodes). Cache hits → zero OFF traffic.
3. Per-query `AbortController` ensures one in-flight OFF request max per autocomplete instance.

No background polling, no auto-refresh, no "load more" pagination against OFF (cap at OFF's default 20 per query).

## React data layer

### `UserNutritionProvider` (rewritten)

Mirrors `UserActivityProvider` — thin CRUD wrapper around `useData('user-nutritions')`. The existing OFF-search code is removed from this file; that logic lives in `useNutritionSearch`.

```ts
return <context.Provider value={{
  nutritions: data.find(),
  addNutrition,    // (input: Partial<TUserNutrition>) => Promise<void>
  updateNutrition, // (id, patch) => Promise<void>
  removeNutrition, // (id) => Promise<void>  — sets deleted_at via PUT
}}>
```

### Sync engine

Add `'user-nutritions'` to `SYNCED_PATHS` in `react-oyl/modules/data/sync/types.ts`. Single-line change. Inherits offline-first behavior, optimistic updates, queued sync.

`nutrition-item` and `nutrition-search` are **not** synced (shared catalogs, not per-user data). When offline, the barcode-scan / OFF-search find-or-create flow fails with a clear message ("Offline — connect to add new items. Items you've logged before still work.").

### `useUserDailyOrchestrator` — additions

```ts
export type NutritionRow = {
  log: TUserNutritionData
  item: TNutritionItemData | null
  calories: number
  protein: number
  carbs: number
  fat: number
}

export type DailyTotals = {
  calories: number
  protein: number
  carbs: number
  fat: number
  targets: { calories?: number; protein?: number; carbs?: number; fat?: number }
  progress: { calories?: number; protein?: number; carbs?: number; fat?: number }
}
```

Derivation:
- `nutritionRows`: filter `user-nutritions` whose date-portion (in user's profile timezone) === `selectedDate` and `deleted_at == null`. Sort chronologically.
- `dailyTotals`: reduce over `nutritionRows`. Targets pulled from a small `useUserNutritionSettings()` hook (reads `useData('user-nutrition-settings')`, returns first record's `data` JSON, undefined fallback).
- `recentNutritionItems`: returned directly from the `useRecentNutritionItems` hook (lives in `user/nutrition/`), called from the orchestrator and re-exposed to consumers. Single source of truth for the dedup-by-documentId, sort-most-recent logic.

Mutators:
- `addNutritionLog({ nutritionItemDocumentId, servings, datetime })` — creates user-nutrition row, snapshots `name`/`brand`/macros from the item.
- `updateNutritionServings(id, servings)` — patches only `servings`. Macros displayed always recompute from `log.servings × item.macros_per_100 × item.serving_size` when item available; stored snapshot macros are only used as fallback when the item is missing.
- `removeNutritionLog(id)` — soft delete (PUT with `deleted_at = now()`).

### Shared types (`all-of-oyl`)

```ts
// modules/nutrition/item/nutrition-item-types.ts
export type TNutritionItem = {
  name: string
  barcode?: string | null
  brand?: string | null
  image_url?: string | null
  serving_size?: number | null
  serving_unit: 'g' | 'ml' | 'serving'
  package_quantity?: string | null
  calories_per_100?: number | null
  protein_per_100?: number | null
  carbs_per_100?: number | null
  fat_per_100?: number | null
  nutri_score?: 'a' | 'b' | 'c' | 'd' | 'e' | null
  nutri_score_value?: number | null
  nova_group?: 1 | 2 | 3 | 4 | null
  allergens?: string[] | null
  source: 'user' | 'openfoodfacts'
  data?: Record<string, unknown>
}

// modules/user/nutrition/user-nutrition-types.ts
export type TUserNutrition = {
  user: TUser | TDataId
  nutrition_item: TNutritionItemData | TDataId
  name: string                   // snapshot
  date: string                   // ISO datetime
  servings: number
  calories?: number | null       // snapshot
  protein?: number | null
  carbs?: number | null
  fat?: number | null
  deleted_at?: string | null
  data?: Record<string, unknown>
}

// modules/user/daily/user-daily-types.ts
// rename to plural `nutritions`, align element type
export type TUserDaily = {
  date: string
  activities: TUserActivityData[] | TDataId[]
  goals: TUserGoalData[] | TDataId[]
  nutritions: TUserNutritionData[] | TDataId[]
}
```

The old `amount: number` on `TUserNutrition` is removed (never persisted; schema uses `servings`).

## UI

### Section layout

```
┌─ Section "Nutrition" ─────────────────────────────────────┐
│  [Totals strip] kcal 1240/2000   P 78  C 132  F 41        │
│  [Recent chips] [🍎 Apple]  [🥛 Oat Milk]  [🍞 Toast]  …   │
│  [Search input + 📷 Scan button]                          │
│  ───────────────────────────────────────────────────────  │
│  Logged today:                                            │
│  ● 08:14  Oatmeal — 1.5 srv     342 kcal    [⋯]          │
│  ● 12:30  Chicken Salad — 1 srv 510 kcal    [⋯]          │
│  ● 15:45  Apple — 1 srv         95 kcal     [⋯]          │
└────────────────────────────────────────────────────────────┘
```

### Components

**`UserDailyNutritionTotals`** — 4 metrics (kcal, P, C, F). When target defined: shows `current / target` with thin progress bar (green `0 < p < 1`, amber `1 ≤ p < 1.1`, red `≥ 1.1`). No target: just current.

**`UserDailyNutritionQuickAdd`** — horizontally scrollable row of last 8 unique items (thumbnail + name + brand truncated). Click → small inline "servings + time" mini-form (defaults: 1 srv, now). Component renders nothing when list empty.

**`UserDailyNutritionSearchInput`** — `<Autocomplete>` from `@oyl/storybook-oyl`. `onInputChange` drives `useNutritionSearch` (debounced inside the hook). Options assembled: Tier-1 recents, Tier-2 globals, sentinel "Search OpenFoodFacts…" row. When OFF results loaded, OFF rows append below local results. Selecting `__off_search__` triggers `searchOff()` (loading spinner; dropdown stays open). Selecting any item branches: OFF row → find-or-create nutrition-item; any row → open add-log mini-form.

Row description line composition: `<brand> · <package_quantity> · <Nutri-Score badge> <NOVA badge>` — each segment shown only when present. Nutri-Score renders as a small colored letter badge (A green → E red); NOVA renders as a small numeric badge (1 green → 4 red). Allergens, when present, appear on a second line as `Contains: gluten, milk` (English labels derived from the normalized tokens).

**`UserDailyBarcodeButton` + `UserDailyBarcodeScanner`** — button beside the search input. Click → modal with scanner. `useBarcodeScanner`:
- Feature-detect `'BarcodeDetector' in window`. If yes: `getUserMedia({ video: { facingMode: 'environment' } })`, scan at ~5fps, formats `['ean_13', 'ean_8', 'upc_a', 'upc_e']`.
- Else: dynamic `import('@zxing/browser')`, `BrowserMultiFormatReader.decodeFromVideoDevice()`.
- First successful decode → `onDetected(barcode)` → close → find-or-create flow.
- Permission/camera errors: clear message + fallback "Enter barcode manually" text input.
- Scanner UI: full-viewport video preview, centered crosshair overlay, dark surrounding gradient, "Cancel" button (matches OFF discover-page UX).

**`UserDailyNutritionList` + `UserDailyNutritionRow`** — sorted chronologically. Row: time (HH:mm in user's profile timezone), name + brand, servings (inline editable number input, 400ms debounce commit), computed kcal, kebab menu with Edit time / Remove.

**`UserDailyAddNutritionForm`** — wraps search + scan + post-selection mini-form. Owns modal state. Mini-form pre-fills `time` (now, rounded to nearest minute) and `servings` (1). When the selected item has `allergens`, the mini-form surfaces a prominent "Contains: …" callout above the submit button so users see allergens before logging.

### State ownership

| Concern | Owner |
|---|---|
| Modal open/close | local `useState` in `UserDailyNutrition` |
| Search query string | local `useState` in `UserDailyNutritionSearchInput` |
| Search results (local + OFF + cache) | `useNutritionSearch` hook |
| Camera stream | `useBarcodeScanner` hook (cleans up on unmount) |
| Recent items, totals, rows | `useUserDailyOrchestrator` (derived) |
| CRUD persistence | `UserNutritionProvider` + sync engine |

Styling: Tailwind utilities only. No new CSS modules.

## Error handling & edge cases

### OFF availability
- Network failure / 5xx: `offError` set; inline message in dropdown; local results stay; sentinel remains clickable to retry.
- OFF returns empty: "No OpenFoodFacts results" + "+ Add '<query>' manually" row (creates `source: 'user'` item with null macros, opens add-log form).
- Cache write fails post-success: log, still return results. Best-effort.
- In-flight cancelled by new keystroke: `AbortController` swallows.

### Barcode scanner
- Permission denied / no camera: message + manual barcode entry input (same find-or-create flow).
- `BarcodeDetector` `NotSupportedError` at decode time (some Safari versions): catch, dynamic-import ZXing, retry once.
- Decoded barcode not in OFF: open add-log form with barcode pre-filled and macros empty (user-sourced item with `barcode` set so future scans cache-hit).
- Multiple decodes in one session: first wins; subsequent ignored until reopened.

### Barcode collision races
- Two clients scan same new barcode simultaneously: second's `POST` hits unique constraint. Client catches the rejection, retries the `GET ?filters[barcode][$eq]=…`, uses the now-existing record. (Server's "return existing on dup" behavior covers this too — belt and braces.)

### user-nutrition edge cases
- Upstream `nutrition_item` deleted after log created: `NutritionRow.item` is null; row renders snapshot fields. Servings still editable. Displayed macros use the snapshot.
- Servings ≤ 0: client-side rejection, no PUT. Schema's `min: 0` is backstop.
- Servings mid-edit during sync flush: 400ms debounce + sync queue handle the race. Last value wins.
- Time edit moves a log across midnight: filter uses `Intl.DateTimeFormat({ timeZone: profile.timezone }).formatToParts(date)` to compute the local date. Editing to 00:10 next-day local moves the log to the next day's view.

### Sync engine integration
- Offline + barcode scan / OFF lookup: surfaces "Offline — connect to add new items. Items you've logged before still work." Don't queue (nutrition-item is not a synced path).
- Offline servings edit on existing log: normal update on a synced path; queued.
- Offline soft-delete: normal update; queued.

### Daily totals
- Targets undefined for some metrics: render current only, no bar. Mixing OK.
- No `user-nutrition-setting` at all: totals show currents only.
- Stale snapshot macros: totals always recompute from `log.servings × item.macros_per_100 × item.serving_size` when item available; snapshot only used when item missing.

### Search ranking
- Multiple recents with same name (different brands): sort by most-recent log, dedup by documentId.
- Tier-2 result already in Tier-1: filtered out.
- Tier-2 matching only on `brand`: still shown; description emphasizes brand match.

### Search cache hits with stale results
- Cache is forever (v1). Users can edit a stale item in the add-log form. Cache stays; item updates.

### Quick-add chips
- Recent items list empty: component renders nothing.
- Upstream nutrition-item deleted: chip omitted.

## Testing strategy

### Unit tests (Vitest, colocated)

**`react-oyl/modules/nutrition/openfoodfacts/`**
- `openfoodfacts-client.test.ts`: URL construction, `AbortSignal` pass-through, 404 → null, 5xx throws.
- `normalizeProduct.test.ts`: `_100g` → `'g'`, `_100ml` → `'ml'`, fallback `'serving'`, null preservation, brand-prefix stripping, `en:`-prefix stripping on `allergens_tags`, Nutri-Score/NOVA promoted to columns, curated `data` subset excludes raw `nutriments` and translation fields.
- `useNutritionSearch.test.ts` (RTL + MSW): tier merge, sentinel rendering, cache read-through, cache miss → OFF + write, cache write failure doesn't fail user search, abort on new query.

**`react-oyl/modules/user/daily/`**
- Extend `orchestrator-utils.test.ts`:
  - `filterNutritionsForDate` — timezone-aware date filter, excludes `deleted_at`, chronological sort.
  - `computeDailyTotals` — sum with mixed null/present macros, undefined progress when target undefined, ratio math.
  - `dedupRecentItems` — dedup by documentId, most-recent sort.

### Integration tests

**`react-oyl/modules/user/daily/nutrition/UserDailyNutrition.test.tsx`** (RTL + MSW):
- Renders totals, recent chips, search, scan button, list.
- Search → select recent → mini-form → submit → row appears, totals update.
- Search → sentinel → mocked OFF → row appears → select → find-or-create item → log entry.
- Edit servings inline → totals update after debounce.
- Remove row → soft-deletes, row disappears, totals decrease.

### Barcode scanner

Unit-tested via mocking `BarcodeDetector` and `getUserMedia`. Full camera flow manually tested in real browsers via a documented checklist:
- Native BarcodeDetector path (Chrome, Edge)
- ZXing fallback path (Firefox)
- Permission-denied fallback
- Manual barcode entry path

Checklist filed alongside this spec at `docs/superpowers/specs/2026-06-02-user-daily-nutrition-manual-tests.md` during implementation.

### Strapi

No test suite per existing package conventions; schema validated at boot. Controller customizations (upsert on nutrition-search, soft-delete on user-nutrition, find-or-create on nutrition-item create-by-barcode) exercised via the React integration tests against the dev API.

### Not tested

- OFF API itself (mocked at `openfoodfacts-client` boundary).
- `Autocomplete` storybook component (own stories).
- Sync engine offline queue (existing `SyncEngine.test.ts`).
- Real camera streams (manual checklist).

### Verification before complete

- `pnpm --filter @oyl/react-oyl test` passes
- `pnpm --filter @oyl/react-oyl exec tsc -b --noEmit` clean on modified files
- `pnpm --filter @oyl/react-oyl exec eslint modules/user/daily/nutrition modules/user/nutrition modules/nutrition` clean
- `pnpm --filter @oyl/strapi-oyl exec tsc --noEmit` clean; Strapi boots without schema errors
- Manual-test checklist run in dev browser

## Open questions / TODOs before merge

- **`.env.example` for the OFF identification vars** must be added to the `react-oyl` package (`VITE_OFF_APP_NAME`, `VITE_OFF_APP_VERSION`, `VITE_OFF_CLIENT_ID`) and referenced in the package README so contributors set them locally. CI / deployment env needs the same vars.
