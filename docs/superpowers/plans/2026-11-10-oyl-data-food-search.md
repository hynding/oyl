# Food search over the oyl-data seed database — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user search the published oyl-data food database (27,047 Open Food Facts US products + 13,341 USDA generic foods, release `v2026.11.18`, the first with `meta.release` and de-duplicated chain items) from the stencil Nutrition screen. The search runs server-side, and a picked result is **copied** into the user's catalog as an ordinary `Consumable` (plus a `ConsumableProduct` for barcoded products). After that, logging a meal works exactly as it does today, with no dependency on the seed DB. This is the "Catalog search" item that `2026-10-08-stencil-oyl-nutrition.md` deferred.

**Decision (made, not reopened here): Hybrid.** The backend searches; the client copies. Shipping the SQLite file to the browser was rejected (22.5 MB gzipped).

**Architecture:**
- **Data delivery.** A pinned release (`scripts/oyl-data/release.env`: tag + SHA-256 of both assets) is fetched by one bash script (`scripts/oyl-data/fetch.sh`) into `<dir>/<tag>/oyl-data.sqlite`, with `<dir>/current` pointing at it. The fetch runs explicitly on dev machines and on DreamHost during `publish-api.sh`. Neither backend downloads anything at boot.
- **Backends.** Both backends open the file **read-only** from `OYL_DATA_SQLITE` and serve four thin endpoints under `/api/food-db/*`:
  - strapi-oyl: `src/utils/oyl-data.ts` with better-sqlite3, which is already a runtime dependency.
  - camis-php-oyl, which is what production runs on DreamHost: an overlay controller using PDO sqlite.
  - The endpoints return oyl-data's own vocabulary (nutrient ids such as `energy` and `carbohydrate`, values per 100 g/ml). Keeping the server a pass-through means the PHP port holds only SQL and JSON, no OYL mapping.
- **Mapping and copying.** All OYL knowledge lives once, in `@oyl/all-of-oyl`:
  - `src/nutrition/seed-food.ts` maps oyl-data nutrient ids to `NutritionAmounts`, builds serving options, and turns a seed food into a `Consumable` / `ConsumableProduct`.
  - `src/client/stores/food-search.ts` is the status probe, the search/detail client, and `copyToCatalog`, which dedupes and then writes through the existing catalog stores and outbox.
- **UI.** In stencil, `oyl-meal-form`'s segment gains a third `search` mode, shown only when the backend reports the DB available. It hosts a new `oyl-food-search` component. Picking a result copies it and drops the composer back into `catalog` mode with the new item selected.

**Tech Stack:** better-sqlite3 12.10 (FTS5 verified: `"butt"*` prefix queries work), PDO sqlite (PHP 8.3), Strapi 5 custom API, Laravel overlay, Stencil 4, Vitest, Playwright, bash.

**Spec:** no separate spec. The "Design decisions" section below is the spec. The Hybrid decision was recorded 2026-11-10.

## Design decisions

### D1. Getting the DB to the backend

- **Pin.** `scripts/oyl-data/release.env` is a shell-sourceable file committed to the repo:
  - `OYL_DATA_REPO=hynding/oyl-data`
  - `OYL_DATA_TAG=v2026.11.18`
  - `OYL_DATA_SCHEMA_VERSION=1`
  - `OYL_DATA_GZ_SHA256=…`
  - `OYL_DATA_SQLITE_SHA256=…`

  The hashes are pinned **in OYL**, not just taken from the release's own `SHA256SUMS`, so a replaced release asset fails verification. Bumping the tag is a reviewed one-file PR. `scripts/oyl-data/pin.sh <tag>` fills the hashes from that release's `SHA256SUMS`.
- **Fetch at deploy/dev time, never at startup.** `scripts/oyl-data/fetch.sh [--dir D] [--keep N]` does the following:
  1. Downloads `oyl-data.sqlite.gz` and `manifest.json` from `https://github.com/<repo>/releases/download/<tag>/…` (`curl -fsSL --retry 3`).
  2. Checks the gz SHA, gunzips, and checks the sqlite SHA (`sha256sum`, falling back to `shasum -a 256` on macOS).
  3. Checks that the database's `meta.release` equals the pinned tag. oyl-data writes the tag into `meta` and `manifest.json` at release time (since oyl-data PR #2), so the file describes itself and needs no sidecar.
  4. Moves the temp dir to `<D>/<tag>/` and points the relative symlink `<D>/current` at `<tag>` (atomic `mv -T` where available).
  5. Prunes everything except the newest `N` tag dirs (default 2).

  It is idempotent: an existing `<tag>/oyl-data.sqlite` whose SHA matches is a no-op apart from the symlink. Startup download was rejected: it doesn't work for PHP (no boot hook), it slows cold starts, and it puts network calls on the request path. Downloading in CI and rsyncing 84 MB per deploy was also rejected: `gunzip` resets mtime, which defeats rsync's quick check. The host downloads it itself, once per tag.
- **Paths.**
  - Dev: `<repo>/.cache/oyl-data` (`.cache/` is added to `.gitignore`).
  - DreamHost: `~/<api-root>/oyl-data`, outside `laravel/`, so rsync `--delete` never touches it.
  - Docker compose: `./.cache/oyl-data` mounted read-only at `/data/oyl-data`.
- **Open.** Both backends read env `OYL_DATA_SQLITE`, the full path to the `.sqlite` file. The default is `<repo>/.cache/oyl-data/current/oyl-data.sqlite`.
  - Strapi opens it lazily on first use: `new Database(p, { readonly: true, fileMustExist: true })` plus `PRAGMA query_only = ON`, and memoizes the handle for the process.
  - PHP opens it per request: `PDO::SQLITE_ATTR_OPEN_FLAGS => PDO::SQLITE_OPEN_READONLY`.
  - On open, read `meta.release` (what `status` reports; local oyl-data builds lack it, so treat a missing value as unavailable outside tests), `meta.schema_version` and `meta.domains.nutrition.schema_version`. They must equal `SUPPORTED_SCHEMA = { top: 1, nutrition: 1 }`, a constant in each backend, and a test keeps it equal to `OYL_DATA_SCHEMA_VERSION`.
- **Absent, unreadable or wrong schema means "unavailable", never a crash.** Log one warning. `status` reports `available: false`, the data endpoints answer 503, and the UI hides the search mode. Each backend memoizes the result for its process. A new file takes effect on restart (Strapi) or on the next request (PHP).
- **Tests and e2e** never download anything. `apps/strapi-oyl/test/fixtures/oyl-data/{schema.sql,fixture.sql}` holds:
  - a verbatim copy of oyl-data's `scripts/nutrition/schema.sql` at schema v1, plus the `meta` table;
  - about 7 real rows copied from the pinned release (D6).

  `apps/strapi-oyl/scripts/build-oyl-data-fixture.mjs [--out]` builds it with better-sqlite3 into `.tmp/oyl-data-fixture/current/oyl-data.sqlite` (with `meta.release = 'fixture'`). Strapi tests and both e2e backend start scripts point `OYL_DATA_SQLITE` at it.

### D2. Endpoints (Strapi custom API `src/api/food-db/`; PHP overlay routes with the same paths and bodies)

| Route | Auth | Answer |
|---|---|---|
| `GET /api/food-db/status` | **public + authenticated**. Both roles are needed: Strapi's JWT strategy does not fall back to public grants, the same quirk as `/google/config`. | Always 200. `{ data: { available: true, release, builtAt, schemaVersion, counts: { products, generic } } }` or `{ data: { available: false } }`. Never says why it is unavailable; the server logs that. |
| `GET /api/food-db/search?q=&kind=&category=&page=&pageSize=` | authenticated | 200 `{ data: SeedFoodSummary[], meta: { page, pageSize, hasMore, release } }`; 400 on bad params; 503 when unavailable |
| `GET /api/food-db/foods/:id` (id URL-encoded, e.g. `off%3A00051500241288`) | authenticated | 200 `{ data: SeedFood }`; 404 |
| `GET /api/food-db/barcodes/:code` (8–14 digits) | authenticated | 200 `{ data: SeedFood }`; 404. Intended for a future scanner. |

- **Params.** `q` is trimmed, 2–100 chars. `kind` is `product|generic`. `category` is an oyl-data category id and matches it and its descendants, because foods carry one leaf category (e.g. `fruit` under `produce`). `page` is 1–10, default 1. `pageSize` is 1–50, default 20.
- **Barcode-shaped queries.** If `q` is barcode-shaped (`/^\d{8,14}$/`), search resolves it through `food_barcodes`, trying the raw value and `padStart(14,'0')`, and returns 0 or 1 items **with 200**. A miss typed into the search box therefore never logs a 404.
- **FTS match expression.**
  - Tokens are `q.normalize('NFKC').toLowerCase().split(/[^\p{L}\p{N}]+/u)`, max 8. The expression is `{name brand description}: "tok1" "tok2" … "last"*`.
  - Tokens are letters and digits only, so FTS syntax injection is impossible.
  - Ingredients are excluded from matching, so "milk" doesn't return every chocolate bar.
  - Order by `bm25(foods_fts, 0, 10, 4, 2, 0.5), length(f.name)`, and fetch `pageSize + 1` rows to compute `hasMore`.
  - Measured on the real 84 MB build: `peanut butt*` takes 2 ms and `banana*` takes 1 ms, so synchronous better-sqlite3 on Strapi's event loop is fine.
- **`SeedFoodSummary`:**

  ```ts
  {
    id; kind; name; brand?;
    basis: '100g'|'100ml';
    serving?: {size, unit, description?};
    per100: {energy?, protein?, carbohydrate?, fat?};
    source: 'off'|'fdc'|'manual';
  }
  ```

  `per100` comes from a second query (`food_nutrients … nutrient_id IN (…4 ids)` for the page's ids).
- **`SeedFood`:** the summary minus `per100`, plus:

  ```ts
  {
    gtin?; quantity?; netGrams?; servingsPerContainer?; ingredientsText?;
    allergens: string[];   // food_allergens kind 'contains'
    categories: string[];
    nutrients: Record<string, {per100: number; perServing?: number}>;
    portions: Array<{description, grams}>;
    sourceRef: {id, url?, modified?};
  }
  ```

  The camelCase keys are produced by the server. Nutrient keys are oyl-data ids.
- **Limits and caching.**
  - No new rate limiter: neither backend has one outside auth, and queries cost milliseconds.
  - Abuse is bounded by the auth requirement, the param caps, and a client-side 250 ms debounce with a 2-char minimum.
  - `Cache-Control: private, max-age=300` on search; `private, max-age=86400` on foods and barcodes (immutable within a release).

### D3. Mapping a seed food to the OYL catalog (`packages/all-of-oyl/src/nutrition/seed-food.ts`)

Nutrient ids, verified against `oyl-data/nutrition/nutrients.yaml` and `all-of-oyl/src/nutrition/{nutrients,nutrient-registry}.ts`. Every mapped unit already matches OYL's canonical unit, so no conversion is needed; a unit test asserts this.

| oyl-data id (unit) | OYL |
|---|---|
| `energy` (kcal) | `calories` |
| `fat` / `fat_saturated` / `fat_trans` (g) | `totalFat` / `saturatedFat` / `transFat` |
| `cholesterol`, `sodium` (mg) | `cholesterol`, `sodium` |
| `carbohydrate` / `fiber` / `sugars` / `sugars_added` (g) | `totalCarbohydrate` / `dietaryFiber` / `totalSugars` / `addedSugars` |
| `protein` (g) | `protein` |
| `vitamin_d` (mcg), `calcium`, `iron`, `potassium` (mg) | `vitaminD`, `calcium`, `iron`, `potassium` |
| `fat_monounsaturated`, `fat_polyunsaturated` (g), `vitamin_a` (mcg), `vitamin_c` (mg) | `additional: [{slug: 'monounsaturated-fat' \| 'polyunsaturated-fat' \| 'vitamin-a' \| 'vitamin-c'}]` |
| `water` (g) | **not mapped.** OYL's `waterMl` is the drinking-water tile; food water would inflate it (decided 2026-11-17). |
| everything else (vitamins E/K/B, minerals, caffeine, alcohol, omega-3, sugar alcohols) | dropped in v1. `assertNutritionFacts` rejects `additional` slugs that are missing from `NUTRIENTS`. |

**Serving.** `Consumable.facts` are **per serving**. `servingOptions(food)` returns `SeedServing[]` (`{ key, label, amount, unit: 'g'|'ml', household?, labelStated }`):
- **Products:** exactly one option. It is the label serving when `serving` exists; otherwise it is `100 g`/`100 ml` per `basis`. Facts use `perServing` where the label states it and `per100 × size / 100` otherwise, which is the rule from the oyl-data README.
- **Generic:** each portion (`"<description> (<grams> g)"`), then `100 g`, but only when `basis` is `100g`. A `100ml` generic offers only `100 ml`. Facts are `per100 × grams / 100`.
- Values are rounded to 2 decimals. The result is `servingSize: { amount, unit, household }`.

**Records.** `toCatalogRecords(food, serving, release)` returns `{ consumable, product? }`.
- **Generic (`fdc:`):** a `Consumable` only.
  - `name` is `food.name`, with ` (<household>)` appended when the serving isn't the first option.
  - `slug` is `toSlug(name)`.
  - `facts` as above; `allergens` when present.
- **Product (`off:`):**
  - A `Consumable`: `name` is `"<name> — <brand>"` when a brand exists, plus facts and allergens.
  - A `ConsumableProduct`: `consumableId` points at that consumable; `name`, `brand`, `upc: canonicalUpc(gtin)` (strip leading zeros, then `padStart(12,'0')`, so UPC-A stays 12 digits as in the existing `030000057247` test), `netWeight: {amount: netGrams, unit: 'g'}`, `servingsPerContainer`, the same `facts`, and `allergens`.
  - The free-text `ingredientsText` is **not** split into OYL's `ingredients: string[]` in v1.

**Schema change (the only one).** `Consumable` and `ConsumableProduct` gain optional `sourceId?: string` (pattern `^[a-z]+:[A-Za-z0-9_-]+$`, e.g. `off:00051500241288`) and `sourceRelease?: string` (e.g. `v2026.11.10`). This touches:
- the domain classes (typed fields, round-trip, validation);
- the Strapi `schema.json` for both types (`"sourceId": {"type":"string"}`, `"sourceRelease": {"type":"string"}`, not unique);
- both controllers' `create`/`update` destructuring;
- `test/parity.test.ts`;
- `pnpm php-app run import` (`camis.json`). The generated PHP serializers then carry the fields, and the overlay `ConsumableProductApiController` passes them through unchanged.

Bootstrap needs no change, because it returns whole rows. **This is a Strapi schema change: sync the DreamHost MySQL before the push that deploys it** (CLAUDE.md "Schema change ⇒ Strapi sync before PHP deploy").

**Dedupe on repeat picks.** `copyToCatalog` (D4) looks in the hydrated stores, which hold public-or-mine rows:
- **Generic:** reuse a consumable with the same `sourceId` and an equal `servingSize` (amount and unit).
- **Product:** reuse a product with the same `sourceId`, or failing that the same canonical `upc`, together with its parent consumable when that parent is visible.
  - If the product exists but its parent isn't visible, create only a `Consumable` copy. A second `ConsumableProduct` would collide with the server's global UPC dedupe, which returns the existing row.

### D4. Client (`packages/all-of-oyl/src/client/stores/food-search.ts`)

The pattern follows `createGoogleStore`. `createFoodSearchStore({ api, baseUrl, fetch })`:
- **`availability: Signal<FoodDbStatus>`**, starting as `{ available: false }`.
- **`probe()`** calls `GET {baseUrl}/food-db/status` through the injected `fetch`. The route is public, like `/google/config`. `probe()` never throws.
- **`search({ q, kind?, page? })`** calls `api.find('food-db/search', …)` and resolves to `{ items, hasMore }`.
- **`get(id)`** calls `api.findOne('food-db/foods', encodeURIComponent(id))`.
- **`copyToCatalog(food, servingKey, { consumables, consumableProducts })`** calls `toCatalogRecords`, applies the D3 dedupe, then `consumables.add` and `consumableProducts.add` (the existing outbox path). It sets `sourceRelease` from `availability.release` and resolves to `{ consumableId, consumableProductId?, name, reused }`.

`compose.ts` builds the store next to `googleStore`, probes at boot (pre-auth is fine), and exposes `foodSearch` on the app.

### D5. UI (stencil)

- **The segment.** `oyl-meal-form`'s segment becomes `catalog | search | adhoc` (labels "Catalog", "Search", "Ad hoc"). The `search` option renders only while `foodSearch.availability.get().available`. The default mode stays `catalog`.
- **Search mode.** It shows `<oyl-food-search>` and hides the servings/when fields and the form's submit button.
- **`oyl-food-search` contents:**
  - `ui-field[name="foodQuery"]` (debounced 250 ms, min 2 chars, a sequence counter drops stale responses) and a kind `ui-segment` (`data-value="all|product|generic"`).
  - `ol.food-results li` rows: name, `brand · 89 kcal · P 1 · C 23 · F 0 per 100 g · USDA`, and a `ui-button` `[data-act="pick"]`.
  - Picking expands that row **in place**: `ui-select[name="serving"]` (only when there are 2 or more options), `[data-act="add-food"]` "Add to catalog", and `[data-act="cancel-food"]`.
  - `[data-act="more"]` when `hasMore`, `[data-role="food-empty"]`, `[data-role="food-error"]`, and the attribution footer (D7).
- **After a pick.** On `picked {consumableId, consumableProductId?, name}` the meal form switches to `catalog` mode with both selects preselected, and announces "Added <name> — ready to log" (or "Already in your catalog — selected").
- **Catalog list.** Copied rows in `ol.catalog li` get a source suffix, "· Open Food Facts" or "· USDA", in `.meta`.
- **Selector rules** that keep the existing e2e selectors stable:
  - `oyl-food-search` **must not render a `<details>`**: `addConsumable` locates `oyl-nutrition details`, and Playwright pierces shadow roots, so a second match would break its strict-mode lookup.
  - It **must not render a `ui-button[type="submit"]`**: the tests click `oyl-meal-form ui-button[type="submit"] button`.
  - Its field and select names (`foodQuery`, `serving`) must not reuse `note|servings|when|calories|protein|totalCarbohydrate|totalFat|waterMl|consumable|consumableProduct`.
- **No thumbnails in v1.** The deployed CSP doesn't allow `images.openfoodfacts.org`.

### D6. Fixture rows (real rows, copied from the pinned release's build)

| Id | Food | Why it's in the fixture |
|---|---|---|
| `fdc:173944` | Bananas, raw | 8 portions, category `fruit` → `produce` |
| `fdc:2706887` | Cheeseburger slider, from fast food | restaurant |
| `off:00051500241288` | Jif Creamy Peanut Butter | 15 g serving, label-stated per-serving values, barcodes `051500241288` / `0051500241288` / `00051500241288` |
| `off:00051500255377` | Jif Extra Crunchy Peanut Butter | 33 g serving, no per-serving values |
| `off:00000008770000` | Simply Lemonade | `100ml`, 240 ml serving |
| `off:00070552502000` | Pretzel sticks | no serving |

The rows also include at least one unmapped nutrient (e.g. caffeine or water) and all their `food_barcodes`, `food_categories`, `food_portions`, `food_allergens` and `foods_fts` rows, plus the full `nutrients`/`categories`/`units`/`allergens` reference tables.

### D7. Attribution (ODbL)

`SEED_SOURCES` in `seed-food.ts` holds the texts from oyl-data's `LICENSE-DATA.md`:
- `off`: label "Open Food Facts", the text "Contains data from Open Food Facts (https://openfoodfacts.org), ODbL 1.0.", and the license URL.
- `fdc`: label "USDA", the text "Source: USDA FoodData Central.", and `https://fdc.nal.usda.gov`.

Where it appears:
- **Search footer.** `oyl-food-search [data-role="food-attribution"]` shows both lines, plus "Food database <release>" linking to `https://github.com/hynding/oyl-data/releases/tag/<release>`. That page offers the ODbL database and its `LICENSE-DATA.md`.
- **Catalog rows.** Copied rows carry the per-row source label (D5).
- **README.** A "Third-party data" section in the root `README.md` with the same texts.

Decided 2026-11-17: attribution plus the release link is the compliance approach. Copies are individual records a user picked, not a substantial extract, and the derived database is already published under ODbL by oyl-data. This was a product decision, not a legal opinion.

## Global Constraints

- **Branch and commits.**
  - Work on `feat/oyl-data-food-search` off `master`.
  - One commit per task, with the session trailer.
  - Never commit on red. No push or PR unless asked.
- **Stable e2e selectors (do not change):**
  - everything listed in `2026-10-08-stencil-oyl-nutrition.md`'s Global Constraints, in particular `oyl-meal-form ui-segment [data-value="catalog|adhoc"]`, `ui-select[name="consumable"|"consumableProduct"] select`, `ui-button[type="submit"] button`, `oyl-nutrition details summary` and `oyl-nutrition ol.catalog li`.
- **New selectors:**
  - `oyl-meal-form ui-segment [data-value="search"]`
  - `oyl-food-search ui-field[name="foodQuery"] input`
  - `oyl-food-search ui-segment [data-value="all|product|generic"]`
  - `oyl-food-search ol.food-results li`
  - `[data-act="pick"|"add-food"|"cancel-food"|"more"]`
  - `oyl-food-search ui-select[name="serving"] select`
  - `[data-role="food-attribution"|"food-empty"|"food-error"]`
- **Behavior parity across backends.** Every endpoint is implemented in strapi-oyl **and** the camis-php-oyl overlay with identical paths, status codes and JSON. `E2E_BACKEND=php pnpm e2e` is the gate.
- **Code placement.**
  - `@oyl/all-of-oyl/src` stays DOM-free. The store takes `fetch` and `api` injected, and uses `.js` import extensions.
  - Shared logic never lives app-side.
  - Strapi code must not import `@oyl/all-of-oyl` at runtime; it is a devDependency there. `import type` is fine.
- **Schema change ⇒ Strapi sync before PHP deploy** (Task 6).
- **Gates per task.** Run the touched package's tests and typecheck:
  - all-of-oyl: `pnpm all-of typecheck:src` and `pnpm all-of build`.
  - strapi: `pnpm strapi-app build` before its tests or `tsc`.
  - PHP: `pnpm php-app test` (overlay `php -l`).
  - Run the stencil e2e projects on both backends in Task 11 (`PW_CHROMIUM_PATH`, `--workers=4`, ports 1341/1342/8043 freed, kill :1341 when switching backends).

---

## Task 0: Preflight (no commit)

- [ ] On DreamHost (web **and** CLI PHP), confirm:
  - `pdo_sqlite` is loaded;
  - `new PDO('sqlite::memory:')` can `CREATE VIRTUAL TABLE t USING fts5(a)`;
  - `PDO::SQLITE_ATTR_OPEN_FLAGS` exists (PHP ≥ 8.1);
  - `curl`, `gunzip` and `sha256sum` are on the login-shell PATH;
  - the account has about 200 MB free (two tags of 84 MB).

  For the web SAPI, check through a throwaway route or `php -i` in the docroot, and remove it afterwards. Record the results in this plan. **If FTS5 is missing on the web SAPI, stop and resolve Open question 1 before Task 5.**
- [ ] Confirm camis mirrors arbitrary paths under `overlay/` (specifically `overlay/config/oyl-data.php` → `laravel/config/`). Try it with `pnpm php-app build`. If it doesn't, Task 5 reads the path from a constant in `OylData.php` that falls back to `getenv()`, and documents that `config:cache` doesn't apply to it.
- [ ] `pin.sh v2026.11.18` resolves and prints both hashes, and that release's `manifest.json` has `"release": "v2026.11.18"`.

## Task 1: Pin + fetch script

**Files:**
- `scripts/oyl-data/release.env`, `scripts/oyl-data/fetch.sh`, `scripts/oyl-data/pin.sh`
- root `package.json` (script `"oyl-data:fetch": "bash scripts/oyl-data/fetch.sh"`), `.gitignore` (`.cache/`)
- `apps/camis-php-oyl/test/oyl-data-fetch.test.ts`. The deploy-script guards already live in this package; see `publish-api.test.ts`.

- [ ] **Step 1: failing tests.** Use a fake `curl` on `PATH` that serves fixture files: a tiny gz and its manifest, with hashes computed in the test and written to a temp `release.env` passed through `OYL_DATA_RELEASE_ENV`. Cover:
  - a fresh fetch creates `<dir>/<tag>/oyl-data.sqlite` and makes `<dir>/current` a **relative** symlink to `<tag>`;
  - a re-run makes no curl calls;
  - a gz hash mismatch, a sqlite hash mismatch, and a `meta.release` that differs from the pinned tag each exit non-zero and leave no `<tag>` dir and no changed `current`;
  - `--keep 2` prunes the oldest of three tag dirs;
  - `pin.sh <tag>` rewrites the two hash lines from a fake `SHA256SUMS`.
- [ ] **Step 2: implement.** `set -euo pipefail`. Source `release.env` only when `OYL_DATA_TAG` is unset, so the remote invocation can prepend it. Work in a temp dir under `<dir>`, then `mv`. Hold no secrets.
- [ ] **Step 3: gate + commit.** `pnpm php-app test`. Commit as `feat(oyl-data): pinned release + verified fetch script`.

## Task 2: Fixture DB

**Files:** `apps/strapi-oyl/test/fixtures/oyl-data/schema.sql` (verbatim oyl-data `scripts/nutrition/schema.sql` plus `CREATE TABLE meta …`, with a header naming the oyl-data commit), `apps/strapi-oyl/test/fixtures/oyl-data/fixture.sql` (the D6 rows), `apps/strapi-oyl/scripts/build-oyl-data-fixture.mjs`, `apps/strapi-oyl/test/oyl-data-fixture.test.ts`

- [ ] **Step 1: failing test.** After building, the DB:
  - opens read-only;
  - has `meta.schema_version = 1`;
  - `foods_fts MATCH '"banana"*'` returns `fdc:173944`;
  - `food_barcodes` resolves `051500241288`;
  - `meta.release = 'fixture'`.
- [ ] **Step 2: implement.** Extract the rows with a one-off query against a local release build, which is not committed. The builder runs `db.exec(schema)`, then `db.exec(fixture)`, then `optimize`. It writes atomically and is idempotent.
- [ ] **Step 3: gate + commit.** Commit as `test(strapi-oyl): oyl-data fixture database`.

## Task 3: Strapi read layer

**Files:** `apps/strapi-oyl/config/oyl-data.ts` (`sqlite: env('OYL_DATA_SQLITE', path.join(__dirname, '..', '..', '..', '..', '.cache', 'oyl-data', 'current', 'oyl-data.sqlite'))`. Compiled config runs from `dist/config/`; `config/database.ts` resolves two levels up to the app dir, so verify four levels reach the repo root.) `apps/strapi-oyl/src/utils/oyl-data.ts`, `apps/strapi-oyl/test/oyl-data-util.test.ts`, `apps/strapi-oyl/test/oyl-data-real.test.ts`

- [ ] **Step 1: failing unit tests** (no Strapi boot; like `nutrition-facts-util.test.ts`):
  - `toMatchExpression('Peanut  Butt')` gives `{name brand description}: "peanut" "butt"*`; punctuation and quotes are stripped; 9 tokens are truncated to 8; an all-symbol input gives `null`.
  - `parseSearchParams` defaults and caps per D2 return typed errors.
  - `openOylData(path)`:
    - a missing file gives `{available:false}`;
    - a DB whose `meta.schema_version` is 2 gives `{available:false}`;
    - the fixture gives `available:true` with release `fixture` and counts.
  - `search` on the fixture:
    - "banana" returns the generic first;
    - `kind=product` filters;
    - `category=produce` matches `fruit` descendants;
    - `pageSize=1` sets `hasMore`;
    - barcode-shaped `q` resolves all three forms and misses with `[]`;
    - `per100` holds only the 4 summary ids.
  - `getFood` and `getByBarcode` return the D2 `SeedFood` shape (portions, allergens, nutrients with `perServing` for the Jif creamy), and an unknown id gives `undefined`.
  - `SUPPORTED_SCHEMA.nutrition` equals `OYL_DATA_SCHEMA_VERSION` parsed from `scripts/oyl-data/release.env`.
  - `oyl-data-real.test.ts` is `describe.skipIf(!existsSync(<repo>/.cache/oyl-data/current/oyl-data.sqlite))`. It runs the same queries against the real file to catch drift when the pin is bumped.
- [ ] **Step 2: implement** pure functions over a `Database`, plus a memoized `getOylData(strapi)` that reads `strapi.config.get('oyl-data.sqlite')` and logs one `strapi.log.warn` when unavailable.
- [ ] **Step 3: gate + commit.** `pnpm strapi-app build && pnpm --filter @oyl/strapi-oyl-app test`. Commit as `feat(strapi-oyl): read-only oyl-data access layer`.

## Task 4: Strapi `food-db` API

**Files:** `apps/strapi-oyl/src/api/food-db/routes/food-db.ts`, `apps/strapi-oyl/src/api/food-db/controllers/food-db.ts` (handlers `status`, `search`, `findOne`, `barcode`), `apps/strapi-oyl/src/index.ts` (grants), `apps/strapi-oyl/test/boot.ts` (point `OYL_DATA_SQLITE` at the fixture unless already set; build it if missing), `apps/strapi-oyl/test/food-db.test.ts`, `apps/strapi-oyl/test/food-db-unavailable.test.ts` (pattern: `google-unconfigured.test.ts`)

- [ ] **Step 1: failing boot tests.**
  - `status` is 200 both without a token and with one.
  - `search`, `foods/:id` and `barcodes/:code` are 401/403 without a JWT.
  - With a JWT, each D2 status code and body appears, including the 400s.
  - `foods/off%3A00051500241288` returns 200.
  - `Cache-Control` headers are set.
  - **Unavailable** (`OYL_DATA_SQLITE=/nonexistent`): `status` gives `{available:false}` and `search` gives 503 with a Strapi error envelope.
  - The bodies for `search?q=banana`, `search?q=051500241288`, `foods/off%3A00051500241288` and `foods/fdc%3A173944` are compared to golden files in `apps/strapi-oyl/test/fixtures/oyl-data/golden/*.json`, written by this step. Task 5 holds PHP to the same files.
- [ ] **Step 2: implement.** The routes look like `google.ts`. Grants:
  - `api::food-db.food-db.status` to **public and authenticated** (`grantRoleActions`);
  - `search`, `findOne` and `barcode` to authenticated.
- [ ] **Step 3: gate + commit.** Commit as `feat(strapi-oyl): /food-db status, search, food and barcode endpoints`.

## Task 5: PHP overlay parity

**Files:** `apps/camis-php-oyl/overlay/app/Support/OylData.php` (open, schema check, `toMatchExpression`, queries; the SQL is copied from `oyl-data.ts` with the same order and weights), `apps/camis-php-oyl/overlay/app/Http/Controllers/Api/FoodDbController.php`, `apps/camis-php-oyl/overlay/routes/api-custom.php`, `apps/camis-php-oyl/overlay/config/oyl-data.php` (`['sqlite' => env('OYL_DATA_SQLITE')]`; see Task 0), `apps/camis-php-oyl/scripts/dev.mjs` (default `OYL_DATA_SQLITE`), `apps/camis-php-oyl/.env.example`, `apps/camis-php-oyl/test/overlay.test.ts`

- [ ] **Step 1: failing overlay tests.**
  - The new files pass `php -l`.
  - `api-custom.php` registers the four paths, with `status` outside `StrapiJwtGuard` and the rest inside.
  - `OylData::SUPPORTED_SCHEMA` matches `release.env`.
  - When the generated app is present, the existing composer-autoload skip pattern applies, and a PHP-side smoke call on the fixture DB returns the same JSON as the Strapi test's golden file (`apps/strapi-oyl/test/fixtures/oyl-data/golden/*.json`, written in Task 4 Step 1 and now shared).
- [ ] **Step 2: implement.**
  - Unavailable means `available:false` and `abort(503)`; the routes sit inside the StrapiErrors group, so the response carries the Strapi envelope.
  - Return floats as JSON numbers.
- [ ] **Step 3: gate + commit.** `pnpm php-app build && pnpm php-app test`. Commit as `feat(camis-php-oyl): /food-db endpoints over the oyl-data SQLite`.

## Task 6: `sourceId` / `sourceRelease` on the catalog types

**Files:** `packages/all-of-oyl/src/nutrition/{consumable,consumable-product}.ts` + tests, `apps/strapi-oyl/src/api/consumable/content-types/consumable/schema.json`, `apps/strapi-oyl/src/api/consumable-product/content-types/consumable-product/schema.json`, both controllers (`create`/`update` destructuring and data), `apps/strapi-oyl/test/{parity,consumable.catalog,consumable-product.upc}.test.ts`, `apps/camis-php-oyl/camis.json` (regenerated)

- [ ] **Step 1: failing tests.**
  - Domain: both fields round-trip through `toJSON`/`fromJSON`, a malformed `sourceId` is rejected, and absent fields stay absent.
  - Parity: both schemas declare string `sourceId`/`sourceRelease`.
  - Strapi catalog tests: PUT with `sourceId` reads back on `find`, `findOne` and `/bootstrap`.
- [ ] **Step 2: implement.** Then run `pnpm php-app run import` and commit `camis.json`. `roles.json` should not change.
- [ ] **Step 3: gate + commit.** Run all-of-oyl, strapi and php-app tests, then `E2E_BACKEND=php pnpm e2e --project desktop tests/nutrition.spec.ts` for a smoke run. Commit as `feat: catalog items carry their seed source (sourceId, sourceRelease)`. **Before the eventual merge to `master`: Strapi schema sync against DreamHost MySQL** (`apps/camis-php-oyl/README.md` "Schema sync").

## Task 7: `seed-food.ts` mapping

**Files:** `packages/all-of-oyl/src/nutrition/seed-food.ts` + `seed-food.test.ts`, `packages/all-of-oyl/src/index.ts` (exports: `SeedFood`, `SeedFoodSummary`, `SeedServing`, `servingOptions`, `toCatalogRecords`, `canonicalUpc`, `SEED_SOURCES`, `sourceLabel`)

- [ ] **Step 1: failing tests** (use the D6 foods as literal JSON):
  - Every table row in D3 maps correctly, and the unit of each mapped id equals `nutrientDef(slug).canonicalUnit`.
  - `water`, `caffeine` and `vitamin_e` are dropped.
  - Products have exactly one serving option: label-stated `perServing` wins for the Jif creamy, `per100 × 33/100` applies for the crunchy, and pretzels get `100 g`.
  - The lemonade gives `ml` and 240.
  - The banana offers its 8 portions + `100 g`; picking the second portion scales by grams/100 and appends ` (<household>)` to the name.
  - `canonicalUpc('00051500241288')` is `051500241288`.
  - A product yields a consumable and a linked product (`consumableId`, `upc`, `brand`, `netWeight`, `allergens`, `sourceId` on both). A generic yields a consumable only.
  - `new Consumable(...)` accepts every output (no `DomainError`).
  - `sourceLabel('off:…')` is "Open Food Facts", `fdc:` gives "USDA", and an absent id gives `undefined`.
- [ ] **Step 2: implement.** Pure functions; no client imports.
- [ ] **Step 3: gate + commit.** Commit as `feat(all-of-oyl): map oyl-data seed foods onto Consumable/ConsumableProduct`.

## Task 8: `food-search` client store

**Files:** `packages/all-of-oyl/src/client/stores/food-search.ts` + `food-search.test.ts`, `packages/all-of-oyl/src/client/index.ts` (export `createFoodSearchStore`, `type FoodSearchStore`, `type FoodDbStatus`)

- [ ] **Step 1: failing tests** (fake `fetch`/`ApiClient`, real `signal`):
  - `probe()` sets `availability` from a 200; a network error or non-200 leaves `{available:false}` and does not throw.
  - `search` sends `q`/`kind`/`page`/`pageSize` and returns `{items, hasMore}`.
  - `get` URL-encodes the id.
  - `copyToCatalog`:
    - creates a consumable, then a product (in that order, linked);
    - sets `sourceRelease` to the probed release;
    - reuses a generic with the same `sourceId` and serving (`reused: true`, no `add`);
    - creates a new one for a different portion;
    - reuses by `sourceId` or by `upc` for products;
    - takes the "product visible, parent not" path, creating a consumable only.
- [ ] **Step 2: implement.**
- [ ] **Step 3: gate + commit.** `pnpm all-of test`, `typecheck:src` and `build`. Commit as `feat(all-of-oyl): food-search client store`.

## Task 9: `oyl-food-search` component

**Files:** `apps/stencil-oyl/src/components/oyl-food-search/{oyl-food-search.tsx,oyl-food-search.css,oyl-food-search.spec.tsx}`, `apps/stencil-oyl/src/nutrition/format.ts` (+ `format.unit.ts`: `foodResultMeta(summary)` and `catalogMeta(consumable)`, which appends `sourceLabel`)

- [ ] **Step 1: failing specs** (fake store through `core()` signals; fake timers for the debounce):
  - 1 char doesn't search; 2+ chars searches once after 250 ms; a stale response arriving after a newer one is ignored.
  - The kind segment re-queries.
  - Rows render name and meta.
  - `pick` calls `get`, then shows the serving select only for multi-option foods.
  - `add-food` calls `copyToCatalog` with the chosen serving key and emits `picked`. `cancel-food` collapses.
  - `more` appends page 2.
  - Empty and error states render.
  - The attribution footer shows both texts and the release link.
  - **No `details` element and no `ui-button[type=submit]` in the shadow root** (a guard spec).
- [ ] **Step 2: implement.**
  - Uses the `ui-field`, `ui-segment`, `ui-select` and `ui-button` primitives, which are already registered in `src/global/app.ts`.
  - Handlers are stable and read `this.*` at call time (the CLAUDE.md `ui-*` listener gotcha).
  - The `picked` event name doesn't collide with any native event.
- [ ] **Step 3: gate + commit.** `pnpm stencil test|typecheck|build`. Commit as `feat(stencil-oyl): oyl-food-search`.

## Task 10: Wire search into Nutrition

**Files:** `apps/stencil-oyl/src/components/oyl-meal-form/{oyl-meal-form.tsx,oyl-meal-form.spec.tsx}`, `apps/stencil-oyl/src/components/oyl-nutrition/{oyl-nutrition.tsx,oyl-nutrition.spec.tsx}`, `apps/stencil-oyl/src/boot/{compose.ts,compose.unit.ts,routes.ts,routes.unit.ts}`

- [ ] **Step 1: failing specs.**
  - `oyl-meal-form`:
    - with no `foodSearch`, or with `available:false`, the segment has exactly `catalog`/`adhoc`, so existing specs stay green;
    - with `available:true`, `search` appears;
    - search mode renders `oyl-food-search` and no submit button;
    - a `picked` event switches to `catalog` with `ui-select[name=consumable]` = the new id (and `consumableProduct` when given) and announces the result.
    - The meal form's `consumableProducts` prop type gains `add`, because `dataState.consumableProducts` already has it.
  - `oyl-nutrition`: passes `foodSearch` through, and a catalog row with `sourceId: 'off:…'` shows "· Open Food Facts".
  - `routes.unit.ts`: the `nutrition` route sets `el.foodSearch = app.foodSearch`.
  - `compose.unit.ts`: `foodSearch.probe()` is called at boot.
- [ ] **Step 2: implement.** Mirror `availability` into `@State() searchAvailable` with an `effect`, disposed on disconnect.
- [ ] **Step 3: gate + commit.** Commit as `feat(stencil-oyl): search the food database from the meal composer`.

## Task 11: e2e

**Files:** `apps/e2e-oyl/scripts/start-backend.mjs` (build the fixture, then `process.env.OYL_DATA_SQLITE ??= <fixture>`), `apps/e2e-oyl/scripts/start-php-backend.mjs` (pass the same env to the PHP server), `apps/e2e-oyl/tests/food-search.spec.ts`, `apps/e2e-oyl/tests/lib.ts` (`searchFood(page, q)` and `pickFood(page, name, servingLabel?)`), `apps/e2e-oyl/README.md` (fixture DB note)

- [ ] **Step 1: spec.** The catalog is shared and dedupe can reuse another test's copy, so assert on names and selections, never counts.
  1. "bananas" shows "Bananas, raw" with "USDA". Pick it, choose the "1 cup, sliced" portion, and add: the composer is in catalog mode with "Bananas, raw (1 cup, sliced)" selected. Log it: the totals tile shows the portion's rounded kcal. `awaitOutboxDrained`, reload, and the meal row and totals persist.
  2. Typing `051500241288` shows only Jif Creamy Peanut Butter. Add it: both selects are preselected, and logging gives the label-stated kcal per serving.
  3. The `product` kind filter hides "Bananas, raw".
  4. The attribution footer contains the OFF and USDA texts; the catalog row of a copied OFF item shows "Open Food Facts".
  5. The existing `nutrition.spec.ts` passes unchanged.
- [ ] **Step 2: run.** `pnpm e2e --workers=4` green on Strapi; then kill :1341 and run `E2E_BACKEND=php` green.
- [ ] **Step 3: commit.** Commit as `test(e2e): food search on both backends`.

## Task 12: Deploy + dev wiring + docs

**Files:** `scripts/dreamhost/publish-api.sh`, `apps/camis-php-oyl/test/publish-api.test.ts`, `docker-compose.yaml`, `apps/camis-php-oyl/README.md`, `README.md`, `CLAUDE.md`

- [ ] **Step 1: failing script test.** Extend `publish-api.test.ts`'s fake `ssh`/`curl` so that:
  - a remote step pipes `release.env + fetch.sh` with `--dir "$APP_ROOT/oyl-data"` **before** the rsync, and does not flip `current` until after `camis:strapi-schema-check`;
  - with `DH_API_URL` set, a `GET $DH_API_URL/api/food-db/status` must contain `"available":true`, or the publish fails with a message pointing at the README;
  - `--dry-run` runs no remote fetch.
- [ ] **Step 2: implement.** Split `fetch.sh` into `--no-switch` and `--switch-only` modes so the download and the flip can sit either side of the rsync.
  - **compose:** `strapi-app` gets `volumes: ['./.cache/oyl-data:/data/oyl-data:ro']` and `OYL_DATA_SQLITE: /data/oyl-data/current/oyl-data.sqlite`.
  - **camis README:** add a one-time setup step for the `OYL_DATA_SQLITE=/home/<user>/<api-root>/oyl-data/current/oyl-data.sqlite` line in `laravel/.env`, and a rollback note: older code is safe against newer data because of the schema check, and the symlink is not rolled back.
- [ ] **Step 3: docs.**
  - `CLAUDE.md`:
    - the strapi-oyl row (`/food-db/*`, `OYL_DATA_SQLITE`, read-only better-sqlite3);
    - the stencil-oyl row (`oyl-food-search`, search mode);
    - the camis row (`FoodDbController` overlay);
    - Dev workflows (`pnpm oyl-data:fetch`; dev can also point `OYL_DATA_SQLITE` at a sibling oyl-data checkout's `dist/oyl-data.sqlite`);
    - e2e (fixture DB).
  - `README.md` "Third-party data" (D7).
  - Tick this plan.
- [ ] **Step 4: final gates + commit.** Root `pnpm test` and `pnpm typecheck`, plus both e2e backends. Commit as `docs: oyl-data food search; deploy fetch step`.

## Out of scope / follow-ups

- **OFF live fallback** for barcodes outside the seed: `GET https://world.openfoodfacts.org/api/v2/product/<code>`, proxied and cached server-side, with OFF's required User-Agent and the same ODbL attribution. This only matters once a barcode scanner exists. `/food-db/barcodes/:code` is the seam.
- **Refreshing copies when a new tag ships.** Copies and logged consumptions are snapshots by design. A later "update from source" can compare `sourceRelease`, and per the oyl-data README, mark copies whose source disappeared as archived rather than deleting them.
- **Other features deferred:**
  - barcode camera scanning;
  - a category filter in the UI (the API supports `category`);
  - OFF thumbnails (needs a CSP `img-src` change);
  - splitting `ingredientsText` into `ingredients[]`;
  - more nutrients (extend `NUTRIENTS` in `nutrient-registry.ts` first);
  - ranking tuning beyond bm25 + name length;
  - a Status-screen "Food database" card.
- **Unchanged here:** editing or deleting catalog items (still deferred, per `createConsumablesStore`), private copies (decided 2026-11-17: copies stay public for now; `visibility` in the domain is a later change, mainly for hand-added items), vanilla-oyl (retiring), a server rate limiter, and automated pin bumps.

## Open questions

1. **DreamHost PHP FTS5 / pdo_sqlite on the web SAPI** is unverified (Task 0). If it's missing, the options are:
   - ship a prebuilt `FTS5`-free variant with `LIKE` search (slow, and needs an oyl-data change);
   - leave search Strapi-only, which production doesn't run.
2. **Does camis mirror `overlay/config/`?** This can't be determined from the OYL repo alone (Task 0).

## Decisions (2026-11-17)

- **Copies stay public.** The `Consumable` codec carries no `visibility`, so every hand-added consumable is already stored `public`, and copies inherit that. Other users see copies and dedupe reuses them, which is fine for public OFF/USDA data. Adding `visibility` to the domain is a later change.
- **Food water is not mapped to `waterMl`.** The tile tracks what you drank; a banana is about 75% water.
- **ODbL: attribution plus the release link (D7).** Copies are user-picked records, not a substantial extract, and the derived database is already published under ODbL. A product decision, not legal advice.
- **The release tag lives in the data.** oyl-data PR #2 writes `release` into the SQLite `meta` table and `manifest.json` at release time. That replaces the `release.json` sidecar this plan first proposed.
- **Counts.** `v2026.11.10` has 13,351 generic foods. PR #2 drops 10 SR Legacy chain-item duplicates (13,341). Pin `v2026.11.18`, the first release with that change.
