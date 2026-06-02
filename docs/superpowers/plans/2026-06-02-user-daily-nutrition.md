# User Daily Nutrition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a nutrition section to `UserDailyPage` so users can search/scan/log foods (local first, then OpenFoodFacts v3) with running daily macro totals.

**Architecture:** Mirror the existing Activities/Goals patterns — a new `daily/nutrition/` UI module fed by an extended `useUserDailyOrchestrator`, a rewritten `user/nutrition/` provider over the offline-first sync engine, and a new `nutrition/openfoodfacts/` module that calls OFF directly from the browser with custom `X-App-Name`/`X-App-Version`/`X-Client-Id` headers (since browsers strip `User-Agent`). Strapi `nutrition-item` schema gains typed columns for barcode/macros/Nutri-Score/NOVA/allergens + a curated OFF data JSON subset.

**Tech Stack:** Strapi 5 (Node 20), React 19 + Vite + TypeScript, Vitest + @testing-library/react + MSW for unit/integration, Playwright for e2e, native `BarcodeDetector` + `@zxing/browser` fallback for scanning, Tailwind for styling.

**Reference spec:** `docs/superpowers/specs/2026-06-02-user-daily-nutrition-design.md`. When this plan says "see spec", read that document.

---

## Phase 0 — Setup

### Task 0.1: Add test/runtime dependencies

**Files:**
- Modify: `packages/react-oyl/package.json`

- [ ] **Step 1: Add deps**

```bash
pnpm --filter @oyl/react-oyl add -D @testing-library/react @testing-library/user-event @testing-library/jest-dom msw@2
pnpm --filter @oyl/react-oyl add @zxing/browser
```

- [ ] **Step 2: Update `src/test-setup.ts` to import jest-dom matchers**

```ts
// packages/react-oyl/src/test-setup.ts
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})
```

- [ ] **Step 3: Verify install**

Run: `pnpm --filter @oyl/react-oyl test`
Expected: existing 3 tests still pass.

- [ ] **Step 4: Commit**

```bash
git add packages/react-oyl/package.json packages/react-oyl/src/test-setup.ts pnpm-lock.yaml
git commit -m "chore(react): add testing-library, msw, and zxing/browser deps"
```

### Task 0.2: Add `.env.example` for OFF identification

**Files:**
- Create: `packages/react-oyl/.env.example`

- [ ] **Step 1: Write file**

```
# OpenFoodFacts integration — see docs/superpowers/specs/2026-06-02-user-daily-nutrition-design.md
VITE_OFF_BASE_URL=https://world.openfoodfacts.net/api/v3
VITE_OFF_APP_NAME=OYL/1.0
VITE_OFF_APP_VERSION=1.0
VITE_OFF_CLIENT_ID=https://github.com/hynding/oyl
```

- [ ] **Step 2: Commit**

```bash
git add packages/react-oyl/.env.example
git commit -m "chore(react): add .env.example for OpenFoodFacts config"
```

---

## Phase 1 — Strapi schema + shared types

### Task 1.1: Expand `nutrition-item` schema

**Files:**
- Modify: `packages/strapi-oyl/src/api/nutrition-item/content-types/nutrition-item/schema.json`

- [ ] **Step 1: Replace the entire `attributes` block**

```json
{
  "kind": "collectionType",
  "collectionName": "nutrition_items",
  "info": {
    "singularName": "nutrition-item",
    "pluralName": "nutrition-items",
    "displayName": "Nutrition Item"
  },
  "options": { "draftAndPublish": false },
  "pluginOptions": { "i18n": { "localized": true } },
  "attributes": {
    "uuid": { "type": "uid", "pluginOptions": { "i18n": { "localized": true } } },
    "name": { "type": "string", "required": true, "pluginOptions": { "i18n": { "localized": true } } },
    "barcode": { "type": "string", "unique": true },
    "brand": { "type": "string" },
    "image_url": { "type": "string" },
    "serving_size": { "type": "decimal", "min": 0 },
    "serving_unit": { "type": "enumeration", "enum": ["g", "ml", "serving"], "default": "g" },
    "package_quantity": { "type": "string" },
    "calories_per_100": { "type": "decimal", "min": 0 },
    "protein_per_100": { "type": "decimal", "min": 0 },
    "carbs_per_100": { "type": "decimal", "min": 0 },
    "fat_per_100": { "type": "decimal", "min": 0 },
    "nutri_score": { "type": "enumeration", "enum": ["a", "b", "c", "d", "e"] },
    "nutri_score_value": { "type": "integer" },
    "nova_group": { "type": "integer", "min": 1, "max": 4 },
    "allergens": { "type": "json" },
    "source": { "type": "enumeration", "enum": ["user", "openfoodfacts"], "default": "user", "required": true },
    "creator": { "type": "relation", "relation": "oneToOne", "target": "plugin::users-permissions.user", "private": true },
    "data": { "type": "json", "pluginOptions": { "i18n": { "localized": false } } }
  }
}
```

Note the removed `"unique": true` on `name` (see spec — barcode is the dedup key, not name).

- [ ] **Step 2: Boot Strapi to verify**

Run: `pnpm --filter @oyl/strapi-oyl exec strapi develop --no-build` (Ctrl-C after schema applies)
Expected: no schema errors; new columns visible in admin UI under Content-Type Builder.

- [ ] **Step 3: Commit**

```bash
git add packages/strapi-oyl/src/api/nutrition-item/content-types/nutrition-item/schema.json
git commit -m "feat(strapi): expand nutrition-item with barcode, macros, nutri-score, nova, allergens"
```

### Task 1.2: Promote `user-nutrition` macros from integer to decimal

**Files:**
- Modify: `packages/strapi-oyl/src/api/user-nutrition/content-types/user-nutrition/schema.json`

- [ ] **Step 1: Change four field types**

Edit the file: change `"type": "integer"` to `"type": "decimal"` for `calories`, `protein`, `carbs`, `fat`. Leave everything else.

- [ ] **Step 2: Boot Strapi**

Run: `pnpm --filter @oyl/strapi-oyl exec strapi develop --no-build` (Ctrl-C after apply)
Expected: clean migration.

- [ ] **Step 3: Commit**

```bash
git add packages/strapi-oyl/src/api/user-nutrition/content-types/user-nutrition/schema.json
git commit -m "feat(strapi): make user-nutrition macros decimal so fractional servings work"
```

### Task 1.3: Add `nutrition-search` upsert behavior

**Files:**
- Modify: `packages/strapi-oyl/src/api/nutrition-search/controllers/nutrition-search.ts`

- [ ] **Step 1: Replace controller**

```ts
/**
 * nutrition-search controller — upsert on create.
 */
import { factories } from '@strapi/strapi'

const UID = 'api::nutrition-search.nutrition-search' as const

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ')
}

export default factories.createCoreController(UID, ({ strapi }) => ({
  async create(ctx: any) {
    const raw = ctx.request.body?.data?.query
    if (typeof raw !== 'string') return ctx.badRequest('Missing query')
    const query = normalizeQuery(raw)
    const results = ctx.request.body?.data?.results
    const existing = await strapi.documents(UID).findFirst({ filters: { query: { $eq: query } } })
    if (existing) {
      return await strapi.documents(UID).update({
        documentId: existing.documentId,
        data: { results },
      })
    }
    return await strapi.documents(UID).create({ data: { query, results } })
  },
}))
```

- [ ] **Step 2: Boot Strapi to verify**

Run: `pnpm --filter @oyl/strapi-oyl exec strapi develop --no-build` (Ctrl-C after start succeeds)
Expected: no boot errors.

- [ ] **Step 3: Commit**

```bash
git add packages/strapi-oyl/src/api/nutrition-search/controllers/nutrition-search.ts
git commit -m "feat(strapi): upsert nutrition-search on create + normalize query"
```

### Task 1.4: Add `nutrition-item` find-or-create-by-barcode

**Files:**
- Modify: `packages/strapi-oyl/src/api/nutrition-item/controllers/nutrition-item.ts`

- [ ] **Step 1: Replace controller**

```ts
/**
 * nutrition-item controller — on create, dedup by barcode; force creator.
 */
import { factories } from '@strapi/strapi'

const UID = 'api::nutrition-item.nutrition-item' as const

export default factories.createCoreController(UID, ({ strapi }) => ({
  async create(ctx: any) {
    const user = ctx.state.user
    if (!user) return ctx.unauthorized('You are not logged in')
    const data = ctx.request.body?.data ?? {}
    const barcode = typeof data.barcode === 'string' && data.barcode.length > 0 ? data.barcode : null
    if (barcode) {
      const existing = await strapi.documents(UID).findFirst({ filters: { barcode: { $eq: barcode } } })
      if (existing) return existing
    }
    return await strapi.documents(UID).create({
      data: { ...data, creator: user.id },
    })
  },
}))
```

- [ ] **Step 2: Boot Strapi**

Expected: no boot errors.

- [ ] **Step 3: Commit**

```bash
git add packages/strapi-oyl/src/api/nutrition-item/controllers/nutrition-item.ts
git commit -m "feat(strapi): find-or-create nutrition-item by barcode; force creator"
```

### Task 1.5: Soft-delete on `user-nutrition`

**Files:**
- Modify: `packages/strapi-oyl/src/api/user-nutrition/controllers/user-nutrition.ts`

- [ ] **Step 1: Replace controller**

```ts
// user-nutrition controller — owner-scoped + soft delete via deleted_at.
import { createUserScopedController } from '../../../utils/user-scoped-controller'

const UID = 'api::user-nutrition.user-nutrition' as const

export default createUserScopedController(UID, {}, () => ({
  async delete(ctx: any) {
    // The factory's update path already enforces ownership.
    ctx.request.body = { data: { deleted_at: new Date().toISOString() } }
    // @ts-ignore -- super.update is the owner-scoped factory action.
    return await super.update(ctx)
  },
}))
```

- [ ] **Step 2: Boot Strapi**

Expected: no boot errors.

- [ ] **Step 3: Commit**

```bash
git add packages/strapi-oyl/src/api/user-nutrition/controllers/user-nutrition.ts
git commit -m "feat(strapi): soft-delete user-nutrition by setting deleted_at"
```

### Task 1.6: Fix `user-daily.saveByDate` to use plural `nutritions`

**Files:**
- Modify: `packages/strapi-oyl/src/api/user-daily/controllers/user-daily.ts`

- [ ] **Step 1: Edit destructure + final payload**

In `saveByDate`, change:
```ts
const { documentId, activities = [], goals = [], nutrition = [], journal } = ctx.request.body ?? {}
```
to:
```ts
const { documentId, activities = [], goals = [], nutritions = [], journal } = ctx.request.body ?? {}
```

Replace all subsequent references to the local `nutrition` array with `nutritions`. In the final `documents.create` and `documents.update` `data` payloads, change `nutrition: nutritionIds` to `nutritions: nutritionIds`.

- [ ] **Step 2: Boot Strapi**

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/strapi-oyl/src/api/user-daily/controllers/user-daily.ts
git commit -m "fix(strapi): align user-daily field name on plural 'nutritions'"
```

### Task 1.7: Reconcile shared `TNutritionItem`

**Files:**
- Modify: `packages/all-of-oyl/modules/nutrition/item/nutrition-item-types.ts`

- [ ] **Step 1: Replace contents**

```ts
import type { TDataItem } from "../../data";

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

export type TNutritionItemData = TNutritionItem & TDataItem
```

- [ ] **Step 2: Commit**

```bash
git add packages/all-of-oyl/modules/nutrition/item/nutrition-item-types.ts
git commit -m "feat(types): expand TNutritionItem to match Strapi schema"
```

### Task 1.8: Reconcile shared `TUserNutrition`

**Files:**
- Modify: `packages/all-of-oyl/modules/user/nutrition/user-nutrition-types.ts`

- [ ] **Step 1: Replace contents**

```ts
import type { TDataId, TDataItem } from "../../data"
import type { TUser } from "../user-types"
import type { TNutritionItemData } from "../../nutrition"
import type { TCalendarItemSettings } from "../../calendar"

export type TUserNutrition = {
  user: TUser | TDataId
  nutrition_item: TNutritionItemData | TDataId
  name: string
  date: string
  servings: number
  calories?: number | null
  protein?: number | null
  carbs?: number | null
  fat?: number | null
  deleted_at?: string | null
  data?: Record<string, unknown>
}

export type TUserNutritionData = TUserNutrition & TDataItem

export type TUserNutritionSettings = TCalendarItemSettings & {
  nutrition: TUserNutritionData | TDataId
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/all-of-oyl/modules/user/nutrition/user-nutrition-types.ts
git commit -m "feat(types): reconcile TUserNutrition with Strapi schema"
```

### Task 1.9: Verify types compile across packages

- [ ] **Step 1: Typecheck**

Run:
```bash
pnpm --filter @oyl/all-of-oyl exec tsc -b --noEmit
pnpm --filter @oyl/react-oyl exec tsc -b --noEmit 2>&1 | grep -E "nutrition" || echo "ok"
pnpm --filter @oyl/strapi-oyl exec tsc --noEmit 2>&1 | grep -E "nutrition" || echo "ok"
```
Expected: no errors in nutrition-related files. (Pre-existing unrelated errors are fine.)

- [ ] **Step 2: No commit (verification only)**

---

## Phase 2 — OpenFoodFacts client module

### Task 2.1: Create OFF types module

**Files:**
- Create: `packages/react-oyl/modules/nutrition/openfoodfacts/off-types.ts`

- [ ] **Step 1: Write the file**

```ts
// OFF v3 response shapes — subset of fields we request.
// Source spec: docs/superpowers/specs/2026-06-02-user-daily-nutrition-design.md
// Field names below match the v3 spec; if a name turns out to be different at
// implementation time, update both this file and normalize-product.ts together.

export type OFFNutriments = {
  'energy-kcal_100g'?: number
  'energy-kcal_100ml'?: number
  proteins_100g?: number
  proteins_100ml?: number
  carbohydrates_100g?: number
  carbohydrates_100ml?: number
  fat_100g?: number
  fat_100ml?: number
}

export type OFFProduct = {
  code: string
  product_name?: string
  generic_name?: string
  brands?: string
  image_url?: string
  image_front_small_url?: string
  image_front_url?: string
  serving_size?: string | null
  serving_quantity?: number | null
  quantity?: string | null
  nutriments?: OFFNutriments
  nutriscore_grade?: 'a' | 'b' | 'c' | 'd' | 'e'
  nutriscore_score?: number
  nova_group?: number
  ecoscore_grade?: 'a' | 'b' | 'c' | 'd' | 'e'
  allergens_tags?: string[]
  traces_tags?: string[]
  categories_tags?: string[]
  labels_tags?: string[]
  ingredients_text?: string
  nutrient_levels?: Record<string, 'low' | 'moderate' | 'high'>
  last_modified_t?: number
}

export type OFFProductSummary = {
  code: string
  product_name?: string
  brands?: string
  image_front_small_url?: string
  nutriscore_grade?: 'a' | 'b' | 'c' | 'd' | 'e'
  nova_group?: number
}

export type OFFSearchResponse = {
  products: OFFProductSummary[]
  count: number
  page: number
  page_count: number
  page_size: number
}

export type OFFGetByBarcodeResponse = {
  status: 0 | 1
  product?: OFFProduct
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/react-oyl/modules/nutrition/openfoodfacts/off-types.ts
git commit -m "feat(nutrition): add OFF v3 response types"
```

### Task 2.2: Test for OFF client URL construction

**Files:**
- Create: `packages/react-oyl/modules/nutrition/openfoodfacts/openfoodfacts-client.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOFFClient } from './openfoodfacts-client'

const FIELDS = 'code,product_name,brands,image_front_small_url,nutriscore_grade,nova_group'

describe('openfoodfacts-client', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ products: [], count: 0, page: 1, page_count: 0, page_size: 0 }), { status: 200 }),
    )
  })
  afterEach(() => fetchSpy.mockRestore())

  it('builds search URL and includes identification headers', async () => {
    const client = createOFFClient({
      baseUrl: 'https://world.openfoodfacts.net/api/v3',
      appName: 'OYL/1.0',
      appVersion: '1.0',
      clientId: 'https://github.com/hynding/oyl',
    })
    await client.searchByQuery('oat milk', new AbortController().signal)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('https://world.openfoodfacts.net/api/v3/search?')
    expect(url).toContain('search_terms=oat+milk')
    expect(url).toContain(`fields=${encodeURIComponent(FIELDS)}`)
    const headers = init.headers as Record<string, string>
    expect(headers['X-App-Name']).toBe('OYL/1.0')
    expect(headers['X-App-Version']).toBe('1.0')
    expect(headers['X-Client-Id']).toBe('https://github.com/hynding/oyl')
    expect(headers['Authorization']).toBe('Basic ' + btoa('off:off'))
  })

  it('omits staging basic auth when base URL is production .org', async () => {
    const client = createOFFClient({
      baseUrl: 'https://world.openfoodfacts.org/api/v3',
      appName: 'OYL/1.0',
      appVersion: '1.0',
      clientId: 'https://github.com/hynding/oyl',
    })
    await client.searchByQuery('apple', new AbortController().signal)
    const init = fetchSpy.mock.calls[0][1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
  })

  it('builds barcode URL and returns null on 404', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('not found', { status: 404 }))
    const client = createOFFClient({
      baseUrl: 'https://world.openfoodfacts.net/api/v3',
      appName: 'OYL/1.0', appVersion: '1.0', clientId: 'x',
    })
    const result = await client.fetchByBarcode('1234567890123', new AbortController().signal)
    expect(result).toBeNull()
    expect(fetchSpy.mock.calls[0][0]).toContain('/product/1234567890123')
  })

  it('returns null when v3 response status=0', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ status: 0 }), { status: 200 }))
    const client = createOFFClient({
      baseUrl: 'https://world.openfoodfacts.net/api/v3',
      appName: 'OYL/1.0', appVersion: '1.0', clientId: 'x',
    })
    expect(await client.fetchByBarcode('000', new AbortController().signal)).toBeNull()
  })

  it('throws on 5xx', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('boom', { status: 503 }))
    const client = createOFFClient({
      baseUrl: 'https://world.openfoodfacts.net/api/v3',
      appName: 'OYL/1.0', appVersion: '1.0', clientId: 'x',
    })
    await expect(client.searchByQuery('x', new AbortController().signal)).rejects.toThrow(/503/)
  })

  it('propagates AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()
    const client = createOFFClient({
      baseUrl: 'https://world.openfoodfacts.net/api/v3',
      appName: 'OYL/1.0', appVersion: '1.0', clientId: 'x',
    })
    fetchSpy.mockImplementationOnce((_, init) => {
      expect((init as RequestInit).signal).toBeDefined()
      return Promise.reject(new DOMException('aborted', 'AbortError'))
    })
    await expect(client.searchByQuery('x', controller.signal)).rejects.toThrow(/abort/i)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm --filter @oyl/react-oyl test openfoodfacts-client`
Expected: FAIL — module not found.

### Task 2.3: Implement OFF client

**Files:**
- Create: `packages/react-oyl/modules/nutrition/openfoodfacts/openfoodfacts-client.ts`

- [ ] **Step 1: Write the implementation**

```ts
import type { OFFGetByBarcodeResponse, OFFProduct, OFFProductSummary, OFFSearchResponse } from './off-types'

const SEARCH_FIELDS = 'code,product_name,brands,image_front_small_url,nutriscore_grade,nova_group'
const PRODUCT_FIELDS = [
  'code', 'product_name', 'generic_name', 'brands',
  'image_url', 'image_front_small_url', 'image_front_url',
  'serving_size', 'serving_quantity', 'quantity', 'nutriments',
  'nutriscore_grade', 'nutriscore_score', 'nova_group',
  'ecoscore_grade', 'allergens_tags', 'traces_tags',
  'categories_tags', 'labels_tags', 'ingredients_text',
  'nutrient_levels', 'last_modified_t',
].join(',')

export type OFFClientConfig = {
  baseUrl: string
  appName: string
  appVersion: string
  clientId: string
}

export type OFFClient = {
  searchByQuery(query: string, signal: AbortSignal): Promise<OFFProductSummary[]>
  fetchByBarcode(barcode: string, signal: AbortSignal): Promise<OFFProduct | null>
}

function buildHeaders(cfg: OFFClientConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'X-App-Name': cfg.appName,
    'X-App-Version': cfg.appVersion,
    'X-Client-Id': cfg.clientId,
    Accept: 'application/json',
  }
  if (cfg.baseUrl.includes('openfoodfacts.net')) {
    headers.Authorization = 'Basic ' + btoa('off:off')
  }
  return headers
}

export function createOFFClient(cfg: OFFClientConfig): OFFClient {
  return {
    async searchByQuery(query, signal) {
      const params = new URLSearchParams({
        search_terms: query,
        fields: SEARCH_FIELDS,
        page_size: '20',
      })
      const res = await fetch(`${cfg.baseUrl}/search?${params.toString()}`, {
        headers: buildHeaders(cfg),
        signal,
      })
      if (!res.ok) throw new Error(`OFF search failed: ${res.status}`)
      const json = (await res.json()) as OFFSearchResponse
      return json.products ?? []
    },
    async fetchByBarcode(barcode, signal) {
      const params = new URLSearchParams({ fields: PRODUCT_FIELDS })
      const res = await fetch(`${cfg.baseUrl}/product/${encodeURIComponent(barcode)}?${params.toString()}`, {
        headers: buildHeaders(cfg),
        signal,
      })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`OFF product failed: ${res.status}`)
      const json = (await res.json()) as OFFGetByBarcodeResponse
      if (json.status === 0 || !json.product) return null
      return json.product
    },
  }
}

export function createOFFClientFromEnv(): OFFClient {
  const baseUrl = import.meta.env.VITE_OFF_BASE_URL
  const appName = import.meta.env.VITE_OFF_APP_NAME
  const appVersion = import.meta.env.VITE_OFF_APP_VERSION
  const clientId = import.meta.env.VITE_OFF_CLIENT_ID
  if (!baseUrl || !appName || !appVersion || !clientId) {
    console.warn('[OFF] missing VITE_OFF_* env vars; OFF identification will be degraded')
  }
  return createOFFClient({
    baseUrl: baseUrl ?? 'https://world.openfoodfacts.net/api/v3',
    appName: appName ?? 'OYL/dev',
    appVersion: appVersion ?? 'dev',
    clientId: clientId ?? 'https://github.com/hynding/oyl',
  })
}
```

- [ ] **Step 2: Run tests and confirm pass**

Run: `pnpm --filter @oyl/react-oyl test openfoodfacts-client`
Expected: all 6 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/react-oyl/modules/nutrition/openfoodfacts/openfoodfacts-client.ts packages/react-oyl/modules/nutrition/openfoodfacts/openfoodfacts-client.test.ts
git commit -m "feat(nutrition): OFF v3 client with X-* identification headers"
```

### Task 2.4: Test for `normalizeProduct`

**Files:**
- Create: `packages/react-oyl/modules/nutrition/openfoodfacts/normalize-product.test.ts`

- [ ] **Step 1: Write tests**

```ts
import { describe, expect, it } from 'vitest'
import type { OFFProduct } from './off-types'
import { normalizeProduct } from './normalize-product'

const base: OFFProduct = {
  code: '5060337502222',
  product_name: 'Oat Drink',
  brands: 'Oatly, Foo',
  image_url: 'https://x/full.jpg',
  image_front_small_url: 'https://x/small.jpg',
  image_front_url: 'https://x/front.jpg',
  serving_quantity: 240,
  quantity: '1 L',
  nutriments: {
    'energy-kcal_100ml': 47,
    proteins_100ml: 1,
    carbohydrates_100ml: 6.6,
    fat_100ml: 1.5,
  },
  nutriscore_grade: 'b',
  nutriscore_score: 1,
  nova_group: 4,
  allergens_tags: ['en:gluten', 'en:milk'],
  categories_tags: ['en:plant-based-foods', 'en:beverages'],
  ingredients_text: 'Water, oats (10%)…',
  ecoscore_grade: 'c',
  labels_tags: ['en:organic'],
  nutrient_levels: { fat: 'low' },
  last_modified_t: 1700000000,
}

describe('normalizeProduct', () => {
  it('promotes columns and produces curated data subset', () => {
    const r = normalizeProduct(base)
    expect(r.columns.name).toBe('Oat Drink')
    expect(r.columns.brand).toBe('Oatly')
    expect(r.columns.image_url).toBe('https://x/small.jpg')
    expect(r.columns.serving_unit).toBe('ml')
    expect(r.columns.serving_size).toBe(240)
    expect(r.columns.package_quantity).toBe('1 L')
    expect(r.columns.calories_per_100).toBe(47)
    expect(r.columns.protein_per_100).toBe(1)
    expect(r.columns.nutri_score).toBe('b')
    expect(r.columns.nova_group).toBe(4)
    expect(r.columns.allergens).toEqual(['gluten', 'milk'])
    expect(r.columns.source).toBe('openfoodfacts')
    expect(r.columns.barcode).toBe('5060337502222')
    expect(r.data.image_front_url).toBe('https://x/front.jpg')
    expect(r.data.categories_tags).toEqual(['en:plant-based-foods', 'en:beverages'])
    expect(r.data.ingredients_text).toBe('Water, oats (10%)…')
    expect(r.data.ecoscore_grade).toBe('c')
    expect(r.data).not.toHaveProperty('nutriments')
    expect(r.data).not.toHaveProperty('product_name')
  })

  it('prefers g over ml when both present', () => {
    const r = normalizeProduct({
      ...base,
      nutriments: { 'energy-kcal_100g': 50, 'energy-kcal_100ml': 47 },
    })
    expect(r.columns.serving_unit).toBe('g')
    expect(r.columns.calories_per_100).toBe(50)
  })

  it('falls back to serving when neither g nor ml macros present', () => {
    const r = normalizeProduct({ ...base, nutriments: {} })
    expect(r.columns.serving_unit).toBe('serving')
    expect(r.columns.calories_per_100).toBeNull()
  })

  it('preserves nulls — no zero coercion', () => {
    const r = normalizeProduct({ ...base, nutriments: { 'energy-kcal_100ml': 47 } })
    expect(r.columns.protein_per_100).toBeNull()
    expect(r.columns.carbs_per_100).toBeNull()
    expect(r.columns.fat_per_100).toBeNull()
  })

  it('falls back to generic_name then code when product_name missing', () => {
    expect(normalizeProduct({ ...base, product_name: undefined }).columns.name).toBe(base.code)
    expect(normalizeProduct({ ...base, product_name: undefined, generic_name: 'Generic Oat' }).columns.name).toBe('Generic Oat')
  })

  it('strips en: prefix from allergens', () => {
    expect(normalizeProduct({ ...base, allergens_tags: ['en:gluten', 'en:milk'] }).columns.allergens).toEqual(['gluten', 'milk'])
  })

  it('clamps nova_group to 1-4 or null', () => {
    expect(normalizeProduct({ ...base, nova_group: 7 as unknown as number }).columns.nova_group).toBeNull()
    expect(normalizeProduct({ ...base, nova_group: undefined }).columns.nova_group).toBeNull()
  })
})
```

- [ ] **Step 2: Run and confirm fail**

Run: `pnpm --filter @oyl/react-oyl test normalize-product`
Expected: FAIL — module not found.

### Task 2.5: Implement `normalizeProduct`

**Files:**
- Create: `packages/react-oyl/modules/nutrition/openfoodfacts/normalize-product.ts`

- [ ] **Step 1: Write implementation**

```ts
import type { OFFProduct } from './off-types'
import type { TNutritionItem } from '@oyl/all-of-oyl/modules'

export type NormalizedProduct = {
  columns: Omit<TNutritionItem, 'data'> & { barcode: string }
  data: Record<string, unknown>
}

function pickUnit(n: OFFProduct['nutriments']): { unit: 'g' | 'ml' | 'serving'; suffix: '100g' | '100ml' | null } {
  if (!n) return { unit: 'serving', suffix: null }
  if (n['energy-kcal_100g'] !== undefined) return { unit: 'g', suffix: '100g' }
  if (n['energy-kcal_100ml'] !== undefined) return { unit: 'ml', suffix: '100ml' }
  return { unit: 'serving', suffix: null }
}

function macro(n: OFFProduct['nutriments'], key: 'energy-kcal' | 'proteins' | 'carbohydrates' | 'fat', suffix: '100g' | '100ml' | null): number | null {
  if (!n || !suffix) return null
  const value = n[`${key}_${suffix}` as keyof typeof n]
  return typeof value === 'number' ? value : null
}

function stripPrefix(tag: string): string {
  const colon = tag.indexOf(':')
  return colon === -1 ? tag : tag.slice(colon + 1)
}

function clampNova(v: number | undefined): 1 | 2 | 3 | 4 | null {
  if (typeof v !== 'number') return null
  if (v === 1 || v === 2 || v === 3 || v === 4) return v
  return null
}

export function normalizeProduct(p: OFFProduct): NormalizedProduct {
  const { unit, suffix } = pickUnit(p.nutriments)
  const brand = (p.brands ?? '').split(',')[0]?.trim() || null
  const name = p.product_name?.trim() || p.generic_name?.trim() || p.code
  return {
    columns: {
      barcode: p.code,
      name,
      brand,
      image_url: p.image_front_small_url ?? null,
      serving_size: typeof p.serving_quantity === 'number' ? p.serving_quantity : null,
      serving_unit: unit,
      package_quantity: p.quantity ?? null,
      calories_per_100: macro(p.nutriments, 'energy-kcal', suffix),
      protein_per_100: macro(p.nutriments, 'proteins', suffix),
      carbs_per_100: macro(p.nutriments, 'carbohydrates', suffix),
      fat_per_100: macro(p.nutriments, 'fat', suffix),
      nutri_score: p.nutriscore_grade ?? null,
      nutri_score_value: typeof p.nutriscore_score === 'number' ? p.nutriscore_score : null,
      nova_group: clampNova(p.nova_group),
      allergens: p.allergens_tags?.map(stripPrefix) ?? null,
      source: 'openfoodfacts',
    },
    data: {
      generic_name: p.generic_name ?? null,
      categories_tags: p.categories_tags ?? [],
      ingredients_text: p.ingredients_text ?? null,
      ecoscore_grade: p.ecoscore_grade ?? null,
      nutrient_levels: p.nutrient_levels ?? null,
      labels_tags: p.labels_tags ?? [],
      image_front_url: p.image_front_url ?? null,
      traces_tags: p.traces_tags?.map(stripPrefix) ?? [],
      off_last_modified_t: p.last_modified_t ?? null,
    },
  }
}
```

- [ ] **Step 2: Run and confirm pass**

Run: `pnpm --filter @oyl/react-oyl test normalize-product`
Expected: all 7 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/react-oyl/modules/nutrition/openfoodfacts/normalize-product.ts packages/react-oyl/modules/nutrition/openfoodfacts/normalize-product.test.ts
git commit -m "feat(nutrition): normalizeProduct maps OFF v3 to typed columns + curated data"
```

### Task 2.6: Implement `useBarcodeScanner` hook with tests

**Files:**
- Create: `packages/react-oyl/modules/nutrition/openfoodfacts/useBarcodeScanner.test.tsx`
- Create: `packages/react-oyl/modules/nutrition/openfoodfacts/useBarcodeScanner.ts`

- [ ] **Step 1: Write tests first**

```tsx
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBarcodeScanner } from './useBarcodeScanner'

describe('useBarcodeScanner', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'BarcodeDetector', {
      configurable: true,
      value: class { async detect() { return [{ rawValue: '1234567890123' }] } },
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
    })
  })
  afterEach(() => {
    // @ts-expect-error - cleanup
    delete globalThis.BarcodeDetector
  })

  it('emits decoded barcode via onDetected', async () => {
    const onDetected = vi.fn()
    const videoRef = { current: document.createElement('video') } as { current: HTMLVideoElement | null }
    renderHook(() => useBarcodeScanner({ videoRef, onDetected, enabled: true }))
    await waitFor(() => expect(onDetected).toHaveBeenCalledWith('1234567890123'))
  })

  it('surfaces permission denied as typed error', async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('denied'), { name: 'NotAllowedError' }),
    )
    const videoRef = { current: document.createElement('video') } as { current: HTMLVideoElement | null }
    const { result } = renderHook(() => useBarcodeScanner({ videoRef, onDetected: vi.fn(), enabled: true }))
    await waitFor(() => expect(result.current.error).toBe('permission-denied'))
  })

  it('falls back to ZXing when BarcodeDetector missing', async () => {
    // @ts-expect-error - remove for this test
    delete globalThis.BarcodeDetector
    const videoRef = { current: document.createElement('video') } as { current: HTMLVideoElement | null }
    const onDetected = vi.fn()
    const { result } = renderHook(() => useBarcodeScanner({ videoRef, onDetected, enabled: true }))
    await waitFor(() => expect(result.current.mode).toBe('zxing'))
  })

  it('cleans up stream on unmount', async () => {
    const stop = vi.fn()
    ;(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      getTracks: () => [{ stop }],
    })
    const videoRef = { current: document.createElement('video') } as { current: HTMLVideoElement | null }
    const { unmount } = renderHook(() => useBarcodeScanner({ videoRef, onDetected: vi.fn(), enabled: true }))
    await act(async () => { await Promise.resolve() })
    unmount()
    await waitFor(() => expect(stop).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Run and confirm fail**

Run: `pnpm --filter @oyl/react-oyl test useBarcodeScanner`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement hook**

```ts
// packages/react-oyl/modules/nutrition/openfoodfacts/useBarcodeScanner.ts
import { useEffect, useRef, useState } from 'react'

type ScanError = 'permission-denied' | 'no-camera' | 'decode-failed' | null
type ScanMode = 'idle' | 'native' | 'zxing'

type Args = {
  videoRef: { current: HTMLVideoElement | null }
  onDetected: (barcode: string) => void
  enabled: boolean
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const

export function useBarcodeScanner({ videoRef, onDetected, enabled }: Args) {
  const [error, setError] = useState<ScanError>(null)
  const [mode, setMode] = useState<ScanMode>('idle')
  const streamRef = useRef<MediaStream | null>(null)
  const stopRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        if ('BarcodeDetector' in globalThis) {
          setMode('native')
          await runNative(cancelled, videoRef, onDetected, setError)
        } else {
          setMode('zxing')
          await runZxing(cancelled, videoRef, onDetected, setError, stopRef)
        }
      } catch (err) {
        const name = (err as { name?: string }).name
        if (name === 'NotAllowedError') setError('permission-denied')
        else if (name === 'NotFoundError') setError('no-camera')
        else setError('decode-failed')
      }
    }

    start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      stopRef.current?.()
      stopRef.current = null
    }
  }, [enabled, videoRef, onDetected])

  return { error, mode }
}

async function runNative(
  cancelledFlag: boolean,
  videoRef: { current: HTMLVideoElement | null },
  onDetected: (b: string) => void,
  setError: (e: ScanError) => void,
) {
  const Ctor = (globalThis as unknown as { BarcodeDetector: new (opts: { formats: readonly string[] }) => { detect: (s: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector
  const detector = new Ctor({ formats: FORMATS })
  while (!cancelledFlag && videoRef.current) {
    try {
      const results = await detector.detect(videoRef.current)
      if (results.length > 0) { onDetected(results[0].rawValue); return }
    } catch {
      setError('decode-failed'); return
    }
    await new Promise(r => setTimeout(r, 200))
  }
}

async function runZxing(
  cancelledFlag: boolean,
  videoRef: { current: HTMLVideoElement | null },
  onDetected: (b: string) => void,
  setError: (e: ScanError) => void,
  stopRef: { current: (() => void) | null },
) {
  try {
    const { BrowserMultiFormatReader } = await import('@zxing/browser')
    const reader = new BrowserMultiFormatReader()
    if (!videoRef.current || cancelledFlag) return
    const controls = await reader.decodeFromVideoElement(videoRef.current, (result) => {
      if (result) onDetected(result.getText())
    })
    stopRef.current = () => controls.stop()
  } catch {
    setError('decode-failed')
  }
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `pnpm --filter @oyl/react-oyl test useBarcodeScanner`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/react-oyl/modules/nutrition/openfoodfacts/useBarcodeScanner.ts packages/react-oyl/modules/nutrition/openfoodfacts/useBarcodeScanner.test.tsx
git commit -m "feat(nutrition): barcode scanner hook with BarcodeDetector + ZXing fallback"
```

### Task 2.7: Implement `useNutritionSearch` hook with tests

**Files:**
- Create: `packages/react-oyl/modules/nutrition/openfoodfacts/useNutritionSearch.test.tsx`
- Create: `packages/react-oyl/modules/nutrition/openfoodfacts/useNutritionSearch.ts`

- [ ] **Step 1: Write tests**

```tsx
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TNutritionItemData } from '@oyl/all-of-oyl/modules'
import { useNutritionSearch } from './useNutritionSearch'

const recent: TNutritionItemData = {
  id: 1, documentId: 'rec-1',
  name: 'Oatmeal', source: 'user', serving_unit: 'g',
} as TNutritionItemData
const global1: TNutritionItemData = {
  id: 2, documentId: 'glo-1',
  name: 'Oat Milk', source: 'user', serving_unit: 'ml',
} as TNutritionItemData

describe('useNutritionSearch', () => {
  it('returns local-only tier-1 + tier-2 merged, dedup by documentId', async () => {
    const offClient = { searchByQuery: vi.fn(), fetchByBarcode: vi.fn() }
    const cache = { findSearch: vi.fn().mockResolvedValue(null), saveSearch: vi.fn() }
    const fetchGlobals = vi.fn().mockResolvedValue([recent, global1])
    const { result } = renderHook(() => useNutritionSearch({
      query: 'oat',
      recentItems: [recent],
      offClient: offClient as never,
      cache: cache as never,
      fetchGlobals,
      debounceMs: 0,
    }))
    await waitFor(() => expect(result.current.localResults).toHaveLength(2))
    expect(result.current.localResults[0].source).toBe('recent')
    expect(result.current.localResults[1].item.documentId).toBe('glo-1')
    expect(result.current.offResults).toHaveLength(0)
    expect(offClient.searchByQuery).not.toHaveBeenCalled()
  })

  it('searchOff reads cache; cache hit avoids OFF call', async () => {
    const offClient = { searchByQuery: vi.fn(), fetchByBarcode: vi.fn() }
    const cached = [{ code: '1', product_name: 'Cached' }]
    const cache = { findSearch: vi.fn().mockResolvedValue(cached), saveSearch: vi.fn() }
    const { result } = renderHook(() => useNutritionSearch({
      query: 'cached',
      recentItems: [],
      offClient: offClient as never,
      cache: cache as never,
      fetchGlobals: vi.fn().mockResolvedValue([]),
      debounceMs: 0,
    }))
    await waitFor(() => expect(result.current.localResults).toBeDefined())
    await act(async () => { await result.current.searchOff() })
    expect(offClient.searchByQuery).not.toHaveBeenCalled()
    expect(result.current.offResults).toEqual(cached)
  })

  it('cache miss falls through to OFF and writes back', async () => {
    const offResp = [{ code: '2', product_name: 'Fresh' }]
    const offClient = { searchByQuery: vi.fn().mockResolvedValue(offResp), fetchByBarcode: vi.fn() }
    const cache = { findSearch: vi.fn().mockResolvedValue(null), saveSearch: vi.fn() }
    const { result } = renderHook(() => useNutritionSearch({
      query: 'fresh',
      recentItems: [],
      offClient: offClient as never,
      cache: cache as never,
      fetchGlobals: vi.fn().mockResolvedValue([]),
      debounceMs: 0,
    }))
    await waitFor(() => expect(result.current.localResults).toBeDefined())
    await act(async () => { await result.current.searchOff() })
    expect(offClient.searchByQuery).toHaveBeenCalledOnce()
    expect(cache.saveSearch).toHaveBeenCalledWith('fresh', offResp)
    expect(result.current.offResults).toEqual(offResp)
  })

  it('surfaces OFF errors without breaking local results', async () => {
    const offClient = { searchByQuery: vi.fn().mockRejectedValue(new Error('503')), fetchByBarcode: vi.fn() }
    const cache = { findSearch: vi.fn().mockResolvedValue(null), saveSearch: vi.fn() }
    const { result } = renderHook(() => useNutritionSearch({
      query: 'boom',
      recentItems: [recent],
      offClient: offClient as never,
      cache: cache as never,
      fetchGlobals: vi.fn().mockResolvedValue([]),
      debounceMs: 0,
    }))
    await waitFor(() => expect(result.current.localResults).toHaveLength(1))
    await act(async () => { await result.current.searchOff() })
    expect(result.current.offError).toMatch(/503/)
    expect(result.current.localResults).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run and confirm fail**

Run: `pnpm --filter @oyl/react-oyl test useNutritionSearch`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/react-oyl/modules/nutrition/openfoodfacts/useNutritionSearch.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TNutritionItemData } from '@oyl/all-of-oyl/modules'
import type { OFFClient, OFFProductSummary } from './off-types-and-client'
// NOTE: re-import paths get fixed in Task 2.8 when we add the index barrel.
import type { OFFProductSummary as _Summary } from './off-types'
import type { OFFClient as _Client } from './openfoodfacts-client'

export type LocalResultSource = 'recent' | 'global'
export type LocalResult = { item: TNutritionItemData; source: LocalResultSource }

export type NutritionSearchCache = {
  findSearch(query: string): Promise<OFFProductSummary[] | null>
  saveSearch(query: string, results: OFFProductSummary[]): Promise<void>
}

export type UseNutritionSearchArgs = {
  query: string
  recentItems: TNutritionItemData[]
  offClient: _Client
  cache: NutritionSearchCache
  fetchGlobals: (q: string, signal: AbortSignal) => Promise<TNutritionItemData[]>
  debounceMs?: number
}

function normalize(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ')
}

function prefixMatch(item: TNutritionItemData, q: string): boolean {
  const lower = q.toLowerCase()
  return (item.name?.toLowerCase().startsWith(lower) ?? false)
    || (item.brand?.toLowerCase().startsWith(lower) ?? false)
}

export function useNutritionSearch({ query, recentItems, offClient, cache, fetchGlobals, debounceMs = 200 }: UseNutritionSearchArgs) {
  const [localResults, setLocalResults] = useState<LocalResult[]>([])
  const [offResults, setOffResults] = useState<_Summary[]>([])
  const [offLoading, setOffLoading] = useState(false)
  const [offError, setOffError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const normalizedQuery = useMemo(() => normalize(query), [query])

  useEffect(() => {
    setOffResults([])
    setOffError(null)
    if (!query) { setLocalResults([]); return }
    const handle = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const tier1 = recentItems.filter(i => prefixMatch(i, query))
      const recentIds = new Set(tier1.map(i => i.documentId))
      const globals = await fetchGlobals(query, controller.signal).catch(() => [] as TNutritionItemData[])
      const tier2 = globals.filter(g => !recentIds.has(g.documentId))
      if (controller.signal.aborted) return
      setLocalResults([
        ...tier1.map(item => ({ item, source: 'recent' as const })),
        ...tier2.map(item => ({ item, source: 'global' as const })),
      ])
    }, debounceMs)
    return () => clearTimeout(handle)
  }, [query, recentItems, fetchGlobals, debounceMs])

  const searchOff = useCallback(async () => {
    if (!normalizedQuery) return
    setOffLoading(true); setOffError(null)
    try {
      const cached = await cache.findSearch(normalizedQuery)
      if (cached) { setOffResults(cached); return }
      const controller = new AbortController()
      const results = await offClient.searchByQuery(normalizedQuery, controller.signal)
      setOffResults(results)
      cache.saveSearch(normalizedQuery, results).catch(() => { /* best-effort */ })
    } catch (err) {
      setOffError(err instanceof Error ? err.message : 'OpenFoodFacts unavailable')
    } finally {
      setOffLoading(false)
    }
  }, [cache, normalizedQuery, offClient])

  return { localResults, offResults, offLoading, offError, searchOff }
}
```

Note: the duplicate type imports above are temporary — Task 2.8 introduces an index barrel. Adjust the import paths to `from './off-types'` and `from './openfoodfacts-client'` directly (delete the aliasing); leave only the necessary ones. Concretely, the file should import:

```ts
import type { OFFProductSummary } from './off-types'
import type { OFFClient } from './openfoodfacts-client'
```

Replace all uses of `_Summary` and `_Client` with `OFFProductSummary` and `OFFClient`.

- [ ] **Step 4: Run and confirm pass**

Run: `pnpm --filter @oyl/react-oyl test useNutritionSearch`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/react-oyl/modules/nutrition/openfoodfacts/useNutritionSearch.ts packages/react-oyl/modules/nutrition/openfoodfacts/useNutritionSearch.test.tsx
git commit -m "feat(nutrition): tiered local→OFF search hook with read-through cache"
```

### Task 2.8: Add barrel export

**Files:**
- Create: `packages/react-oyl/modules/nutrition/openfoodfacts/index.ts`

- [ ] **Step 1: Write**

```ts
export { createOFFClient, createOFFClientFromEnv } from './openfoodfacts-client'
export type { OFFClient, OFFClientConfig } from './openfoodfacts-client'
export type {
  OFFProduct, OFFProductSummary, OFFSearchResponse, OFFGetByBarcodeResponse, OFFNutriments,
} from './off-types'
export { normalizeProduct } from './normalize-product'
export type { NormalizedProduct } from './normalize-product'
export { useNutritionSearch } from './useNutritionSearch'
export type {
  LocalResult, LocalResultSource, NutritionSearchCache, UseNutritionSearchArgs,
} from './useNutritionSearch'
export { useBarcodeScanner } from './useBarcodeScanner'
```

- [ ] **Step 2: Commit**

```bash
git add packages/react-oyl/modules/nutrition/openfoodfacts/index.ts
git commit -m "feat(nutrition): openfoodfacts module barrel export"
```

---

## Phase 3 — User nutrition provider + sync

### Task 3.1: Add `user-nutritions` to sync paths

**Files:**
- Modify: `packages/react-oyl/modules/data/sync/types.ts`

- [ ] **Step 1: Edit**

Change the `SYNCED_PATHS` array to include `'user-nutritions'` after `'user-goal-milestones'`.

```ts
export const SYNCED_PATHS = [
  'user-dailies',
  'user-activities',
  'user-activity-logs',
  'user-goals',
  'user-goal-milestones',
  'user-nutritions',
] as const
```

- [ ] **Step 2: Run sync engine tests**

Run: `pnpm --filter @oyl/react-oyl test SyncEngine`
Expected: PASS (the path is just additive).

- [ ] **Step 3: Commit**

```bash
git add packages/react-oyl/modules/data/sync/types.ts
git commit -m "feat(sync): mirror user-nutritions for offline-first CRUD"
```

### Task 3.2: Rewrite `user-nutrition-context`

**Files:**
- Modify: `packages/react-oyl/modules/user/nutrition/user-nutrition-context.ts`

- [ ] **Step 1: Replace contents**

```ts
import { createContext, useContext } from 'react'
import type { TDataId, TUserNutritionData } from '@oyl/all-of-oyl/modules'

export type UserNutritionContextValue = {
  nutritions: TUserNutritionData[]
  addNutrition: (input: Partial<TUserNutritionData>) => Promise<void>
  updateNutrition: (id: TDataId, patch: Partial<TUserNutritionData>) => Promise<void>
  removeNutrition: (id: TDataId) => Promise<void>
}

const defaultValue: UserNutritionContextValue = {
  nutritions: [],
  addNutrition: async () => {},
  updateNutrition: async () => {},
  removeNutrition: async () => {},
}

export const context = createContext<UserNutritionContextValue>(defaultValue)
export const useUserNutritionContext = () => useContext(context)
```

- [ ] **Step 2: Commit**

```bash
git add packages/react-oyl/modules/user/nutrition/user-nutrition-context.ts
git commit -m "refactor(nutrition): replace OFF-mixed context with clean CRUD shape"
```

### Task 3.3: Write `UserNutritionProvider` test then rewrite provider

**Files:**
- Create: `packages/react-oyl/modules/user/nutrition/UserNutritionProvider.test.tsx`
- Modify: `packages/react-oyl/modules/user/nutrition/UserNutritionProvider.tsx`

- [ ] **Step 1: Write test**

```tsx
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UserNutritionProvider } from './UserNutritionProvider'
import { useUserNutritionContext } from './user-nutrition-context'

const save = vi.fn().mockResolvedValue(undefined)
const update = vi.fn().mockResolvedValue(undefined)

vi.mock('@/modules/data', () => ({
  useData: () => ({
    find: () => [],
    get: () => undefined,
    save,
    update,
    remove: vi.fn(),
    refresh: vi.fn(),
    syncState: { pendingCount: 0, online: true },
  }),
}))

function Probe() {
  const ctx = useUserNutritionContext()
  return (
    <div>
      <button onClick={() => ctx.addNutrition({ servings: 1 })}>add</button>
      <button onClick={() => ctx.removeNutrition(42)}>remove</button>
    </div>
  )
}

describe('UserNutritionProvider', () => {
  it('addNutrition delegates to data.save', async () => {
    render(<UserNutritionProvider><Probe /></UserNutritionProvider>)
    await act(async () => { screen.getByText('add').click() })
    expect(save).toHaveBeenCalledWith({ servings: 1 })
  })

  it('removeNutrition soft-deletes via data.update', async () => {
    render(<UserNutritionProvider><Probe /></UserNutritionProvider>)
    await act(async () => { screen.getByText('remove').click() })
    expect(update).toHaveBeenCalledWith(42, expect.objectContaining({ deleted_at: expect.any(String) }))
  })
})
```

- [ ] **Step 2: Run and confirm fail**

Run: `pnpm --filter @oyl/react-oyl test UserNutritionProvider`
Expected: FAIL — the current provider uses different exports.

- [ ] **Step 3: Replace provider implementation**

```tsx
// packages/react-oyl/modules/user/nutrition/UserNutritionProvider.tsx
import React, { useCallback } from 'react'
import type { TDataId, TUserNutritionData } from '@oyl/all-of-oyl/modules'
import { useData } from '@/modules/data'
import { context } from './user-nutrition-context'

export function UserNutritionProvider({ children }: { children: React.ReactNode }) {
  const data = useData<TUserNutritionData>('user-nutritions')

  const addNutrition = useCallback(async (input: Partial<TUserNutritionData>) => {
    await data.save(input)
  }, [data])

  const updateNutrition = useCallback(async (id: TDataId, patch: Partial<TUserNutritionData>) => {
    await data.update(id, patch)
  }, [data])

  const removeNutrition = useCallback(async (id: TDataId) => {
    await data.update(id, { deleted_at: new Date().toISOString() } as Partial<TUserNutritionData>)
  }, [data])

  return (
    <context.Provider value={{ nutritions: data.find(), addNutrition, updateNutrition, removeNutrition }}>
      {children}
    </context.Provider>
  )
}

export default UserNutritionProvider
```

- [ ] **Step 4: Run and confirm pass**

Run: `pnpm --filter @oyl/react-oyl test UserNutritionProvider`
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/react-oyl/modules/user/nutrition/UserNutritionProvider.tsx packages/react-oyl/modules/user/nutrition/UserNutritionProvider.test.tsx
git commit -m "feat(nutrition): rewrite UserNutritionProvider as thin CRUD over sync engine"
```

### Task 3.4: Rewrite `useUserNutrition`

**Files:**
- Modify: `packages/react-oyl/modules/user/nutrition/useUserNutrition.ts`

- [ ] **Step 1: Replace**

```ts
import { useUserNutritionContext } from './user-nutrition-context'
export const useUserNutrition = useUserNutritionContext
export type { UserNutritionContextValue } from './user-nutrition-context'
```

- [ ] **Step 2: Commit**

```bash
git add packages/react-oyl/modules/user/nutrition/useUserNutrition.ts
git commit -m "refactor(nutrition): useUserNutrition is the context hook"
```

### Task 3.5: Add `useRecentNutritionItems` with tests

**Files:**
- Create: `packages/react-oyl/modules/user/nutrition/useRecentNutritionItems.test.ts`
- Create: `packages/react-oyl/modules/user/nutrition/useRecentNutritionItems.ts`

- [ ] **Step 1: Write tests**

```ts
import { describe, expect, it } from 'vitest'
import type { TUserNutritionData, TNutritionItemData } from '@oyl/all-of-oyl/modules'
import { dedupRecentItemsFrom } from './useRecentNutritionItems'

function mk(itemId: string, date: string): TUserNutritionData {
  return {
    id: Number(itemId.slice(-1)),
    documentId: `log-${itemId}`,
    date,
    servings: 1,
    name: `Item ${itemId}`,
    nutrition_item: { documentId: itemId, id: 1, name: `Item ${itemId}`, serving_unit: 'g', source: 'user' } as TNutritionItemData,
    user: 1,
  } as TUserNutritionData
}

describe('dedupRecentItemsFrom', () => {
  it('dedups by nutrition_item.documentId, most-recent first, respects limit', () => {
    const logs = [
      mk('a', '2026-06-01T08:00:00.000Z'),
      mk('b', '2026-06-02T08:00:00.000Z'),
      mk('a', '2026-06-03T08:00:00.000Z'),
      mk('c', '2026-05-30T08:00:00.000Z'),
    ]
    const result = dedupRecentItemsFrom(logs, 5)
    expect(result.map(i => i.documentId)).toEqual(['a', 'b', 'c'])
  })

  it('ignores logs whose nutrition_item is null', () => {
    const broken = { ...mk('a', '2026-06-03T08:00:00.000Z'), nutrition_item: null as unknown as TNutritionItemData }
    expect(dedupRecentItemsFrom([broken], 5)).toEqual([])
  })
})
```

- [ ] **Step 2: Run and confirm fail**

Run: `pnpm --filter @oyl/react-oyl test useRecentNutritionItems`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// packages/react-oyl/modules/user/nutrition/useRecentNutritionItems.ts
import { useMemo } from 'react'
import type { TNutritionItemData, TUserNutritionData } from '@oyl/all-of-oyl/modules'
import { useUserNutritionContext } from './user-nutrition-context'

export function dedupRecentItemsFrom(logs: TUserNutritionData[], limit: number): TNutritionItemData[] {
  const seen = new Map<string, { item: TNutritionItemData; date: string }>()
  for (const log of logs) {
    const item = log.nutrition_item
    if (!item || typeof item !== 'object' || !('documentId' in item) || !item.documentId) continue
    const existing = seen.get(item.documentId)
    if (!existing || existing.date < log.date) {
      seen.set(item.documentId, { item: item as TNutritionItemData, date: log.date })
    }
  }
  return Array.from(seen.values())
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map(e => e.item)
}

export function useRecentNutritionItems(limit = 8): TNutritionItemData[] {
  const { nutritions } = useUserNutritionContext()
  return useMemo(() => dedupRecentItemsFrom(nutritions, limit), [nutritions, limit])
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `pnpm --filter @oyl/react-oyl test useRecentNutritionItems`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/react-oyl/modules/user/nutrition/useRecentNutritionItems.ts packages/react-oyl/modules/user/nutrition/useRecentNutritionItems.test.ts
git commit -m "feat(nutrition): useRecentNutritionItems derives dedup+sorted recents"
```

### Task 3.6: Add `useUserNutritionSettings` with tests

**Files:**
- Create: `packages/react-oyl/modules/user/nutrition/useUserNutritionSettings.test.tsx`
- Create: `packages/react-oyl/modules/user/nutrition/useUserNutritionSettings.ts`

- [ ] **Step 1: Write tests**

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useUserNutritionSettings } from './useUserNutritionSettings'

vi.mock('@/modules/data', () => ({
  useData: () => ({
    find: () => [{ id: 1, documentId: 's1', data: { targets: { calories: 2000, protein: 80 } } }],
    get: () => undefined, save: vi.fn(), update: vi.fn(), remove: vi.fn(), refresh: vi.fn(),
    syncState: { pendingCount: 0, online: true },
  }),
}))

describe('useUserNutritionSettings', () => {
  it('returns first record targets', () => {
    const { result } = renderHook(() => useUserNutritionSettings())
    expect(result.current.targets).toEqual({ calories: 2000, protein: 80 })
  })
})
```

- [ ] **Step 2: Run and confirm fail**

Run: `pnpm --filter @oyl/react-oyl test useUserNutritionSettings`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// packages/react-oyl/modules/user/nutrition/useUserNutritionSettings.ts
import { useMemo } from 'react'
import { useData } from '@/modules/data'

export type NutritionTargets = {
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
}

type Settings = { id: number; documentId: string; data?: { targets?: NutritionTargets } }

export function useUserNutritionSettings(): { targets: NutritionTargets | undefined } {
  const { find } = useData<Settings>('user-nutrition-settings')
  return useMemo(() => {
    const records = find()
    const first = records[0]
    return { targets: first?.data?.targets }
  }, [find])
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `pnpm --filter @oyl/react-oyl test useUserNutritionSettings`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/react-oyl/modules/user/nutrition/useUserNutritionSettings.ts packages/react-oyl/modules/user/nutrition/useUserNutritionSettings.test.tsx
git commit -m "feat(nutrition): useUserNutritionSettings exposes daily targets"
```

### Task 3.7: Add module barrel + clean up alternate user/nutrition exports

**Files:**
- Create: `packages/react-oyl/modules/user/nutrition/index.ts`

- [ ] **Step 1: Write**

```ts
export { UserNutritionProvider } from './UserNutritionProvider'
export { useUserNutrition } from './useUserNutrition'
export { useUserNutritionContext } from './user-nutrition-context'
export type { UserNutritionContextValue } from './user-nutrition-context'
export { useRecentNutritionItems } from './useRecentNutritionItems'
export { useUserNutritionSettings } from './useUserNutritionSettings'
export type { NutritionTargets } from './useUserNutritionSettings'
```

- [ ] **Step 2: Commit**

```bash
git add packages/react-oyl/modules/user/nutrition/index.ts
git commit -m "feat(nutrition): user/nutrition barrel export"
```

---

## Phase 4 — Orchestrator extension

### Task 4.1: Add orchestrator-utils functions for nutrition (tests first)

**Files:**
- Modify: `packages/react-oyl/modules/user/daily/orchestrator-utils.test.ts`
- Modify: `packages/react-oyl/modules/user/daily/orchestrator-utils.ts`

- [ ] **Step 1: Add tests**

Append to `orchestrator-utils.test.ts`:

```ts
import { computeDailyTotals, filterNutritionsForDate } from './orchestrator-utils'
import type { TUserNutritionData, TNutritionItemData } from '@oyl/all-of-oyl/modules'

function mkLog(opts: Partial<TUserNutritionData> & { item?: Partial<TNutritionItemData> }): TUserNutritionData {
  return {
    id: 1, documentId: 'log',
    date: '2026-06-02T12:00:00.000Z',
    servings: 1,
    user: 1,
    name: 'X',
    nutrition_item: opts.item
      ? ({ id: 1, documentId: 'item', name: 'X', serving_unit: 'g', source: 'user', serving_size: 100, calories_per_100: 100, ...opts.item } as TNutritionItemData)
      : (1 as unknown as TNutritionItemData),
    ...opts,
  } as TUserNutritionData
}

describe('filterNutritionsForDate', () => {
  it('keeps logs whose local date matches and excludes deleted', () => {
    const logs = [
      mkLog({ id: 1, date: '2026-06-02T03:00:00.000Z' }),
      mkLog({ id: 2, date: '2026-06-02T22:00:00.000Z' }),
      mkLog({ id: 3, date: '2026-06-03T01:00:00.000Z' }),
      { ...mkLog({ id: 4, date: '2026-06-02T15:00:00.000Z' }), deleted_at: 'now' } as TUserNutritionData,
    ]
    const result = filterNutritionsForDate(logs, '2026-06-02', 'UTC')
    expect(result.map(l => l.id)).toEqual([1, 2])
  })

  it('sorts chronologically ascending', () => {
    const logs = [
      mkLog({ id: 1, date: '2026-06-02T22:00:00.000Z' }),
      mkLog({ id: 2, date: '2026-06-02T08:00:00.000Z' }),
    ]
    expect(filterNutritionsForDate(logs, '2026-06-02', 'UTC').map(l => l.id)).toEqual([2, 1])
  })
})

describe('computeDailyTotals', () => {
  it('sums macros computed from servings × item per-100 × serving_size/100', () => {
    const rows = [
      { log: mkLog({ servings: 2, item: { calories_per_100: 100, serving_size: 100 } }), item: { id: 1, documentId: 'i', name: 'X', serving_unit: 'g', source: 'user', serving_size: 100, calories_per_100: 100 } as TNutritionItemData },
    ]
    const totals = computeDailyTotals(rows as never, { calories: 1000 })
    expect(totals.calories).toBe(200)
    expect(totals.progress.calories).toBeCloseTo(0.2)
  })

  it('returns undefined progress when target missing', () => {
    const totals = computeDailyTotals([], {})
    expect(totals.progress.calories).toBeUndefined()
  })

  it('falls back to snapshot macros when item is null', () => {
    const log = { ...mkLog({ servings: 1, calories: 250 }), nutrition_item: null as unknown as TNutritionItemData }
    const totals = computeDailyTotals([{ log: log as TUserNutritionData, item: null } as never], {})
    expect(totals.calories).toBe(250)
  })
})
```

- [ ] **Step 2: Run and confirm fail**

Run: `pnpm --filter @oyl/react-oyl test orchestrator-utils`
Expected: FAIL — new functions missing.

- [ ] **Step 3: Implement**

Append to `orchestrator-utils.ts`:

```ts
import type { TUserNutritionData, TNutritionItemData } from '@oyl/all-of-oyl/modules'

export type NutritionRow = {
  log: TUserNutritionData
  item: TNutritionItemData | null
}

export type DailyTotals = {
  calories: number; protein: number; carbs: number; fat: number
  targets: { calories?: number; protein?: number; carbs?: number; fat?: number }
  progress: { calories?: number; protein?: number; carbs?: number; fat?: number }
}

function localDate(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso))
  const y = parts.find(p => p.type === 'year')?.value ?? ''
  const m = parts.find(p => p.type === 'month')?.value ?? ''
  const d = parts.find(p => p.type === 'day')?.value ?? ''
  return `${y}-${m}-${d}`
}

export function filterNutritionsForDate(logs: TUserNutritionData[], date: string, timezone: string): TUserNutritionData[] {
  return logs
    .filter(l => !l.deleted_at && localDate(l.date, timezone) === date)
    .sort((a, b) => a.date.localeCompare(b.date))
}

function macroFromRow(row: NutritionRow, key: 'calories' | 'protein' | 'carbs' | 'fat'): number {
  const { log, item } = row
  if (item && item.serving_size && item[`${key}_per_100` as const] != null) {
    return Number(log.servings) * Number(item[`${key}_per_100` as const]) * Number(item.serving_size) / 100
  }
  return Number(log[key] ?? 0)
}

export function computeDailyTotals(rows: NutritionRow[], targets: DailyTotals['targets']): DailyTotals {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 }
  for (const row of rows) {
    totals.calories += macroFromRow(row, 'calories')
    totals.protein += macroFromRow(row, 'protein')
    totals.carbs += macroFromRow(row, 'carbs')
    totals.fat += macroFromRow(row, 'fat')
  }
  const progress: DailyTotals['progress'] = {}
  for (const k of ['calories', 'protein', 'carbs', 'fat'] as const) {
    const t = targets[k]
    if (typeof t === 'number' && t > 0) progress[k] = totals[k] / t
  }
  return { ...totals, targets, progress }
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `pnpm --filter @oyl/react-oyl test orchestrator-utils`
Expected: existing + new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/react-oyl/modules/user/daily/orchestrator-utils.ts packages/react-oyl/modules/user/daily/orchestrator-utils.test.ts
git commit -m "feat(daily): orchestrator utils for nutrition rows + daily totals"
```

### Task 4.2: Extend `useUserDailyOrchestrator`

**Files:**
- Modify: `packages/react-oyl/modules/user/daily/useUserDailyOrchestrator.ts`

- [ ] **Step 1: Edit — read profile timezone, add nutrition derivations + mutators**

At the top, add imports:

```ts
import type { TNutritionItemData, TUserNutritionData } from '@oyl/all-of-oyl/modules'
import { useUserNutritionContext, useRecentNutritionItems, useUserNutritionSettings } from '../nutrition'
import { useUserProfile } from '../profile/useUserProfile'
import { computeDailyTotals, filterNutritionsForDate } from './orchestrator-utils'
import type { NutritionRow, DailyTotals } from './orchestrator-utils'
```

Inside `useUserDailyOrchestrator`, after the existing context reads, add:

```ts
  // -- nutrition ---------------------------------------------------------------
  const { nutritions, addNutrition, updateNutrition, removeNutrition } = useUserNutritionContext()
  const recentNutritionItems = useRecentNutritionItems(8)
  const { targets } = useUserNutritionSettings()
  const { timezone } = useUserProfile()
  const tz = timezone || 'UTC'

  const nutritionRows: NutritionRow[] = useMemo(() => {
    return filterNutritionsForDate(nutritions, selectedDate, tz).map(log => ({
      log,
      item: (log.nutrition_item && typeof log.nutrition_item === 'object' && 'documentId' in log.nutrition_item)
        ? (log.nutrition_item as TNutritionItemData)
        : null,
    }))
  }, [nutritions, selectedDate, tz])

  const dailyTotals: DailyTotals = useMemo(
    () => computeDailyTotals(nutritionRows, targets ?? {}),
    [nutritionRows, targets],
  )

  async function addNutritionLog(args: { nutritionItemDocumentId: string; servings: number; datetime: string; item: TNutritionItemData }) {
    const { item, nutritionItemDocumentId, servings, datetime } = args
    const factor = (item.serving_size ?? 100) / 100
    await addNutrition({
      nutrition_item: nutritionItemDocumentId as unknown as TUserNutritionData['nutrition_item'],
      servings,
      date: datetime,
      name: item.brand ? `${item.name} — ${item.brand}` : item.name,
      calories: item.calories_per_100 != null ? Number(item.calories_per_100) * servings * factor : null,
      protein: item.protein_per_100 != null ? Number(item.protein_per_100) * servings * factor : null,
      carbs: item.carbs_per_100 != null ? Number(item.carbs_per_100) * servings * factor : null,
      fat: item.fat_per_100 != null ? Number(item.fat_per_100) * servings * factor : null,
    })
  }

  async function updateNutritionServings(id: number, servings: number) {
    await updateNutrition(id, { servings })
  }

  async function removeNutritionLog(id: number) {
    await removeNutrition(id)
  }
```

In the returned object, add:
```ts
    nutritionRows,
    dailyTotals,
    recentNutritionItems,
    addNutritionLog,
    updateNutritionServings,
    removeNutritionLog,
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @oyl/react-oyl exec tsc -b --noEmit 2>&1 | grep useUserDailyOrchestrator || echo ok`
Expected: ok.

- [ ] **Step 3: Commit**

```bash
git add packages/react-oyl/modules/user/daily/useUserDailyOrchestrator.ts
git commit -m "feat(daily): orchestrator exposes nutritionRows, dailyTotals, and mutators"
```

### Task 4.3: Add `UserNutritionProvider` to daily data providers

**Files:**
- Modify: `packages/react-oyl/modules/user/daily/UserDailyDataProviders.tsx`

- [ ] **Step 1: Add provider as the innermost wrap**

```tsx
import React from 'react'
import UserDailyProvider from './UserDailyProvider'
import { UserActivityProvider } from '@/modules/user/activity'
import { UserActivityLogProvider } from '@/modules/user/activity-log'
import { UserGoalProvider } from '@/modules/user/goal'
import { UserGoalMilestoneProvider } from '@/modules/user/goal-milestone'
import { UserNutritionProvider } from '@/modules/user/nutrition'

export default function UserDailyDataProviders({ children }: { children: React.ReactNode }) {
  return (
    <UserDailyProvider>
      <UserActivityProvider>
        <UserActivityLogProvider>
          <UserGoalProvider>
            <UserGoalMilestoneProvider>
              <UserNutritionProvider>
                {children}
              </UserNutritionProvider>
            </UserGoalMilestoneProvider>
          </UserGoalProvider>
        </UserActivityLogProvider>
      </UserActivityProvider>
    </UserDailyProvider>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/react-oyl/modules/user/daily/UserDailyDataProviders.tsx
git commit -m "feat(daily): mount UserNutritionProvider"
```

---

## Phase 5 — UI components

Each component is built test-first. Files live in `packages/react-oyl/modules/user/daily/nutrition/`.

### Task 5.1: `UserDailyNutritionTotals` — test + impl

**Files:**
- Create: `packages/react-oyl/modules/user/daily/nutrition/UserDailyNutritionTotals.test.tsx`
- Create: `packages/react-oyl/modules/user/daily/nutrition/UserDailyNutritionTotals.tsx`

- [ ] **Step 1: Write tests**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import UserDailyNutritionTotals from './UserDailyNutritionTotals'

describe('UserDailyNutritionTotals', () => {
  it('renders four metrics with current values when no targets', () => {
    render(<UserDailyNutritionTotals totals={{
      calories: 1200, protein: 90, carbs: 130, fat: 40,
      targets: {}, progress: {},
    }} />)
    expect(screen.getByText('1200')).toBeInTheDocument()
    expect(screen.getByText(/P 90/)).toBeInTheDocument()
    expect(screen.getByText(/C 130/)).toBeInTheDocument()
    expect(screen.getByText(/F 40/)).toBeInTheDocument()
  })

  it('renders bars with green / amber / red when over target', () => {
    render(<UserDailyNutritionTotals totals={{
      calories: 2200, protein: 80, carbs: 130, fat: 40,
      targets: { calories: 2000, protein: 100 },
      progress: { calories: 1.1, protein: 0.8 },
    }} />)
    expect(screen.getByRole('progressbar', { name: /calories/i })).toHaveAttribute('aria-valuenow', '1.1')
    expect(screen.getByRole('progressbar', { name: /protein/i })).toHaveAttribute('aria-valuenow', '0.8')
  })
})
```

- [ ] **Step 2: Run and confirm fail**

Run: `pnpm --filter @oyl/react-oyl test UserDailyNutritionTotals`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
import React from 'react'
import type { DailyTotals } from '../orchestrator-utils'

function barColor(p: number): string {
  if (p < 1) return 'bg-green-500'
  if (p < 1.1) return 'bg-amber-500'
  return 'bg-red-500'
}

function Metric({ name, label, value, target, progress }: { name: string; label: string; value: number; target?: number; progress?: number }) {
  return (
    <div className="flex-1 min-w-[120px]">
      <div className="text-sm text-gray-600 dark:text-gray-300">
        {label} {Math.round(value)}{target != null && <span className="text-gray-400"> / {Math.round(target)}</span>}
      </div>
      {progress != null && (
        <div className="h-1.5 rounded bg-gray-200 dark:bg-gray-700 mt-1 overflow-hidden">
          <div
            role="progressbar"
            aria-label={name}
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={2}
            className={`h-full ${barColor(progress)}`}
            style={{ width: `${Math.min(1, progress) * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}

export default function UserDailyNutritionTotals({ totals }: { totals: DailyTotals }) {
  return (
    <div className="flex flex-wrap gap-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
      <Metric name="calories" label="kcal" value={totals.calories} target={totals.targets.calories} progress={totals.progress.calories} />
      <Metric name="protein" label="P" value={totals.protein} target={totals.targets.protein} progress={totals.progress.protein} />
      <Metric name="carbs" label="C" value={totals.carbs} target={totals.targets.carbs} progress={totals.progress.carbs} />
      <Metric name="fat" label="F" value={totals.fat} target={totals.targets.fat} progress={totals.progress.fat} />
    </div>
  )
}
```

The label inside `Metric` outputs `kcal 1200` or `P 90`. Tests assert `1200`, `P 90`, etc. — adjust if you prefer different label ordering.

- [ ] **Step 4: Run and confirm pass**

Run: `pnpm --filter @oyl/react-oyl test UserDailyNutritionTotals`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/react-oyl/modules/user/daily/nutrition/UserDailyNutritionTotals.tsx packages/react-oyl/modules/user/daily/nutrition/UserDailyNutritionTotals.test.tsx
git commit -m "feat(daily-nutrition): totals strip with target progress"
```

### Task 5.2: `UserDailyNutritionRow` — test + impl

**Files:**
- Create: `packages/react-oyl/modules/user/daily/nutrition/UserDailyNutritionRow.test.tsx`
- Create: `packages/react-oyl/modules/user/daily/nutrition/UserDailyNutritionRow.tsx`

- [ ] **Step 1: Write tests**

```tsx
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import UserDailyNutritionRow from './UserDailyNutritionRow'
import type { NutritionRow } from '../orchestrator-utils'

const row: NutritionRow = {
  log: {
    id: 1, documentId: 'l1', date: '2026-06-02T08:30:00.000Z',
    servings: 1, name: 'Oatmeal', user: 1,
    nutrition_item: { documentId: 'i1', id: 1, name: 'Oatmeal', serving_unit: 'g', source: 'user', serving_size: 100, calories_per_100: 380 } as never,
  } as never,
  item: { documentId: 'i1', id: 1, name: 'Oatmeal', serving_unit: 'g', source: 'user', serving_size: 100, calories_per_100: 380 } as never,
}

describe('UserDailyNutritionRow', () => {
  it('renders name, time, kcal', () => {
    render(<UserDailyNutritionRow row={row} timezone="UTC" onServingsChange={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('Oatmeal')).toBeInTheDocument()
    expect(screen.getByText(/08:30/)).toBeInTheDocument()
    expect(screen.getByText(/380/)).toBeInTheDocument()
  })

  it('debounces servings change', async () => {
    vi.useFakeTimers()
    const onServingsChange = vi.fn()
    render(<UserDailyNutritionRow row={row} timezone="UTC" onServingsChange={onServingsChange} onRemove={vi.fn()} />)
    const input = screen.getByLabelText(/servings/i)
    await act(async () => {
      ;(input as HTMLInputElement).value = '2'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onServingsChange).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(400) })
    expect(onServingsChange).toHaveBeenCalledWith(2)
    vi.useRealTimers()
  })

  it('Remove confirms then calls onRemove', async () => {
    const onRemove = vi.fn()
    const user = userEvent.setup()
    render(<UserDailyNutritionRow row={row} timezone="UTC" onServingsChange={vi.fn()} onRemove={onRemove} />)
    await user.click(screen.getByRole('button', { name: /more/i }))
    await user.click(screen.getByRole('menuitem', { name: /remove/i }))
    await user.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onRemove).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run and confirm fail**

Run: `pnpm --filter @oyl/react-oyl test UserDailyNutritionRow`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
import { useEffect, useState } from 'react'
import type { NutritionRow } from '../orchestrator-utils'

function formatTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
}

function computeCalories(row: NutritionRow): number {
  const { log, item } = row
  if (item && item.serving_size && item.calories_per_100 != null) {
    return Math.round(Number(log.servings) * Number(item.calories_per_100) * Number(item.serving_size) / 100)
  }
  return Math.round(Number(log.calories ?? 0))
}

export default function UserDailyNutritionRow({
  row, timezone, onServingsChange, onRemove,
}: {
  row: NutritionRow
  timezone: string
  onServingsChange: (servings: number) => void
  onRemove: () => void
}) {
  const [servings, setServings] = useState(row.log.servings)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    const handle = setTimeout(() => {
      if (servings !== row.log.servings) onServingsChange(servings)
    }, 400)
    return () => clearTimeout(handle)
  }, [servings, onServingsChange, row.log.servings])

  const calories = computeCalories({ ...row, log: { ...row.log, servings } })

  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800">
      <span className="text-xs text-gray-500 w-12 shrink-0">{formatTime(row.log.date, timezone)}</span>
      <span className="flex-1 truncate">{row.log.name}</span>
      <label className="text-xs text-gray-500">
        <span className="sr-only">Servings</span>
        <input
          type="number" min={0} step={0.5}
          aria-label="servings"
          value={servings}
          onChange={e => setServings(Number(e.target.value))}
          className="w-16 px-1 py-0.5 text-sm border rounded"
        />
      </label>
      <span className="text-sm tabular-nums w-16 text-right">{calories} kcal</span>
      <button aria-label="more" onClick={() => setMenuOpen(o => !o)} className="px-2 py-1">⋯</button>
      {menuOpen && (
        <div role="menu" className="absolute mt-8 right-4 bg-white dark:bg-gray-800 border rounded shadow">
          <button role="menuitem" onClick={() => { setMenuOpen(false); setConfirmOpen(true) }} className="px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700">Remove</button>
        </div>
      )}
      {confirmOpen && (
        <div className="absolute mt-8 right-4 bg-white dark:bg-gray-800 border rounded shadow p-2 flex gap-2">
          <button onClick={() => { setConfirmOpen(false); onRemove() }} className="px-2 py-1 bg-red-600 text-white text-sm">Confirm</button>
          <button onClick={() => setConfirmOpen(false)} className="px-2 py-1 text-sm">Cancel</button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `pnpm --filter @oyl/react-oyl test UserDailyNutritionRow`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/react-oyl/modules/user/daily/nutrition/UserDailyNutritionRow.tsx packages/react-oyl/modules/user/daily/nutrition/UserDailyNutritionRow.test.tsx
git commit -m "feat(daily-nutrition): row with inline servings + remove confirm"
```

### Task 5.3: `UserDailyNutritionList` — test + impl

**Files:**
- Create: `packages/react-oyl/modules/user/daily/nutrition/UserDailyNutritionList.test.tsx`
- Create: `packages/react-oyl/modules/user/daily/nutrition/UserDailyNutritionList.tsx`

- [ ] **Step 1: Tests**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import UserDailyNutritionList from './UserDailyNutritionList'

describe('UserDailyNutritionList', () => {
  it('renders empty state', () => {
    render(<UserDailyNutritionList rows={[]} timezone="UTC" onServingsChange={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText(/nothing logged/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Implement**

```tsx
import type { NutritionRow } from '../orchestrator-utils'
import UserDailyNutritionRow from './UserDailyNutritionRow'

export default function UserDailyNutritionList({
  rows, timezone, onServingsChange, onRemove,
}: {
  rows: NutritionRow[]
  timezone: string
  onServingsChange: (id: number, servings: number) => void
  onRemove: (id: number) => void
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400 py-2">Nothing logged for this date yet.</p>
  }
  return (
    <div className="relative">
      {rows.map(row => (
        <UserDailyNutritionRow
          key={row.log.id}
          row={row}
          timezone={timezone}
          onServingsChange={(s) => row.log.id && onServingsChange(row.log.id, s)}
          onRemove={() => row.log.id && onRemove(row.log.id)}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Run and confirm pass**

Run: `pnpm --filter @oyl/react-oyl test UserDailyNutritionList`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/react-oyl/modules/user/daily/nutrition/UserDailyNutritionList.tsx packages/react-oyl/modules/user/daily/nutrition/UserDailyNutritionList.test.tsx
git commit -m "feat(daily-nutrition): list with empty state"
```

### Task 5.4: `UserDailyNutritionSearchInput` — test + impl

**Files:**
- Create: `packages/react-oyl/modules/user/daily/nutrition/UserDailyNutritionSearchInput.test.tsx`
- Create: `packages/react-oyl/modules/user/daily/nutrition/UserDailyNutritionSearchInput.tsx`

- [ ] **Step 1: Tests** (covers tier ordering, sentinel, badges, allergens line)

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import UserDailyNutritionSearchInput from './UserDailyNutritionSearchInput'
import type { LocalResult } from '@/modules/nutrition/openfoodfacts'

const tier1: LocalResult = {
  source: 'recent',
  item: { id: 1, documentId: 'r', name: 'Oatmeal', brand: 'Generic', serving_unit: 'g', source: 'user', nutri_score: 'b', nova_group: 2, allergens: ['gluten'] } as never,
}

describe('UserDailyNutritionSearchInput', () => {
  it('renders tier-1 row with Nutri-Score and NOVA badges and allergens line', async () => {
    const user = userEvent.setup()
    render(<UserDailyNutritionSearchInput
      localResults={[tier1]}
      offResults={[]} offLoading={false} offError={null}
      onQueryChange={vi.fn()} onSelect={vi.fn()} onSearchOff={vi.fn()}
    />)
    await user.click(screen.getByPlaceholderText(/search foods/i))
    await user.keyboard('o')
    expect(screen.getByText('Oatmeal')).toBeInTheDocument()
    expect(screen.getByText(/Generic/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Nutri-Score B/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/NOVA 2/i)).toBeInTheDocument()
    expect(screen.getByText(/Contains.*gluten/i)).toBeInTheDocument()
  })

  it('clicking sentinel calls onSearchOff', async () => {
    const user = userEvent.setup()
    const onSearchOff = vi.fn()
    render(<UserDailyNutritionSearchInput
      localResults={[]} offResults={[]} offLoading={false} offError={null}
      onQueryChange={vi.fn()} onSelect={vi.fn()} onSearchOff={onSearchOff}
    />)
    await user.type(screen.getByPlaceholderText(/search foods/i), 'x')
    await user.click(screen.getByText(/Search OpenFoodFacts for/i))
    expect(onSearchOff).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run and confirm fail**

Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// packages/react-oyl/modules/user/daily/nutrition/UserDailyNutritionSearchInput.tsx
import { useEffect, useState } from 'react'
import type { LocalResult } from '@/modules/nutrition/openfoodfacts'
import type { OFFProductSummary } from '@/modules/nutrition/openfoodfacts'

type Selection =
  | { kind: 'local'; result: LocalResult }
  | { kind: 'off'; product: OFFProductSummary }

type Props = {
  localResults: LocalResult[]
  offResults: OFFProductSummary[]
  offLoading: boolean
  offError: string | null
  onQueryChange: (query: string) => void
  onSelect: (selection: Selection) => void
  onSearchOff: () => void
}

function Badge({ children, label }: { children: React.ReactNode; label: string }) {
  return <span aria-label={label} className="inline-block text-[10px] px-1 rounded bg-gray-200 dark:bg-gray-700">{children}</span>
}

function nutriColor(g: 'a'|'b'|'c'|'d'|'e'): string {
  return { a: 'bg-green-600 text-white', b: 'bg-lime-600 text-white', c: 'bg-yellow-500 text-black', d: 'bg-orange-600 text-white', e: 'bg-red-600 text-white' }[g]
}

export default function UserDailyNutritionSearchInput({
  localResults, offResults, offLoading, offError, onQueryChange, onSelect, onSearchOff,
}: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => { onQueryChange(query) }, [query, onQueryChange])

  return (
    <div className="relative w-full">
      <input
        type="text" placeholder="Search foods…"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-800"
      />
      {open && query.length > 0 && (
        <div className="absolute z-10 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border rounded shadow max-h-80 overflow-auto">
          {localResults.map(r => {
            const item = r.item
            return (
              <button key={item.documentId} type="button" onClick={() => onSelect({ kind: 'local', result: r })} className="w-full text-left p-2 hover:bg-gray-100 dark:hover:bg-gray-700 border-b">
                <div className="flex items-center gap-2">
                  {item.image_url && <img src={item.image_url} alt="" className="w-8 h-8 object-cover rounded" />}
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.name}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      {item.brand && <span className="truncate">{item.brand}</span>}
                      {item.package_quantity && <span>· {item.package_quantity}</span>}
                      {item.nutri_score && <Badge label={`Nutri-Score ${item.nutri_score.toUpperCase()}`}><span className={`px-1 ${nutriColor(item.nutri_score)}`}>{item.nutri_score.toUpperCase()}</span></Badge>}
                      {item.nova_group != null && <Badge label={`NOVA ${item.nova_group}`}>NOVA {item.nova_group}</Badge>}
                    </div>
                    {item.allergens && item.allergens.length > 0 && (
                      <div className="text-xs text-amber-700 dark:text-amber-400">Contains: {item.allergens.join(', ')}</div>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
          {offError && <div className="p-2 text-sm text-red-600">{offError}</div>}
          {offLoading && <div className="p-2 text-sm text-gray-500">Searching OpenFoodFacts…</div>}
          {offResults.map(p => (
            <button key={p.code} type="button" onClick={() => onSelect({ kind: 'off', product: p })} className="w-full text-left p-2 hover:bg-gray-100 dark:hover:bg-gray-700 border-b">
              <div className="flex items-center gap-2">
                {p.image_front_small_url && <img src={p.image_front_small_url} alt="" className="w-8 h-8 object-cover rounded" />}
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.product_name ?? p.code}</div>
                  <div className="text-xs text-gray-500">{p.brands}</div>
                </div>
              </div>
            </button>
          ))}
          {!offLoading && offResults.length === 0 && (
            <button type="button" onClick={onSearchOff} className="w-full text-left p-2 text-sm text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-700">
              Search OpenFoodFacts for &ldquo;{query}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `pnpm --filter @oyl/react-oyl test UserDailyNutritionSearchInput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/react-oyl/modules/user/daily/nutrition/UserDailyNutritionSearchInput.tsx packages/react-oyl/modules/user/daily/nutrition/UserDailyNutritionSearchInput.test.tsx
git commit -m "feat(daily-nutrition): tiered search input with Nutri-Score/NOVA badges + OFF sentinel"
```

### Task 5.5: `UserDailyBarcodeScanner` — test + impl

**Files:**
- Create: `packages/react-oyl/modules/user/daily/nutrition/UserDailyBarcodeScanner.test.tsx`
- Create: `packages/react-oyl/modules/user/daily/nutrition/UserDailyBarcodeScanner.tsx`

- [ ] **Step 1: Tests**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import UserDailyBarcodeScanner from './UserDailyBarcodeScanner'

vi.mock('@/modules/nutrition/openfoodfacts', async (original) => {
  const actual = await original<typeof import('@/modules/nutrition/openfoodfacts')>()
  return { ...actual, useBarcodeScanner: () => ({ error: null, mode: 'native' }) }
})

describe('UserDailyBarcodeScanner', () => {
  it('renders video element when no error', () => {
    render(<UserDailyBarcodeScanner open onClose={vi.fn()} onBarcode={vi.fn()} />)
    expect(screen.getByTestId('scanner-video')).toBeInTheDocument()
  })

  it('manual entry triggers onBarcode', async () => {
    const user = userEvent.setup()
    const onBarcode = vi.fn()
    render(<UserDailyBarcodeScanner open onClose={vi.fn()} onBarcode={onBarcode} />)
    await user.type(screen.getByPlaceholderText(/enter barcode/i), '1234567890123')
    await user.click(screen.getByRole('button', { name: /use barcode/i }))
    expect(onBarcode).toHaveBeenCalledWith('1234567890123')
  })
})
```

- [ ] **Step 2: Run and confirm fail**

Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
import { useRef, useState } from 'react'
import { useBarcodeScanner } from '@/modules/nutrition/openfoodfacts'

export default function UserDailyBarcodeScanner({
  open, onClose, onBarcode,
}: { open: boolean; onClose: () => void; onBarcode: (barcode: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [manual, setManual] = useState('')
  const { error } = useBarcodeScanner({ videoRef, onDetected: onBarcode, enabled: open })
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4">
      {!error && (
        <div className="relative w-full max-w-md aspect-square bg-black rounded overflow-hidden">
          <video ref={videoRef} data-testid="scanner-video" autoPlay playsInline className="w-full h-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-3/4 h-1/3 border-2 border-white/70 rounded" />
          </div>
        </div>
      )}
      {error && (
        <div className="text-white text-center max-w-md">
          {error === 'permission-denied' && 'Camera permission denied.'}
          {error === 'no-camera' && 'No camera available.'}
          {error === 'decode-failed' && 'Couldn’t use the camera scanner.'}
        </div>
      )}
      <div className="mt-4 flex flex-col gap-2 w-full max-w-md">
        <input
          type="text" inputMode="numeric"
          placeholder="Enter barcode manually"
          value={manual}
          onChange={e => setManual(e.target.value)}
          className="px-3 py-2 rounded bg-white text-black"
        />
        <div className="flex gap-2">
          <button
            onClick={() => manual.length >= 8 && onBarcode(manual)}
            disabled={manual.length < 8}
            className="flex-1 px-3 py-2 rounded bg-indigo-600 text-white disabled:opacity-50"
          >Use barcode</button>
          <button onClick={onClose} className="flex-1 px-3 py-2 rounded bg-gray-200">Cancel</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run and confirm pass**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/react-oyl/modules/user/daily/nutrition/UserDailyBarcodeScanner.tsx packages/react-oyl/modules/user/daily/nutrition/UserDailyBarcodeScanner.test.tsx
git commit -m "feat(daily-nutrition): barcode scanner modal w/ manual fallback"
```

### Task 5.6: `UserDailyBarcodeButton` — test + impl

**Files:**
- Create: `packages/react-oyl/modules/user/daily/nutrition/UserDailyBarcodeButton.test.tsx`
- Create: `packages/react-oyl/modules/user/daily/nutrition/UserDailyBarcodeButton.tsx`

- [ ] **Step 1: Test + impl**

```tsx
// UserDailyBarcodeButton.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import UserDailyBarcodeButton from './UserDailyBarcodeButton'

vi.mock('./UserDailyBarcodeScanner', () => ({
  default: ({ open }: { open: boolean }) => open ? <div data-testid="scanner">scanner</div> : null,
}))

describe('UserDailyBarcodeButton', () => {
  it('opens scanner on click', async () => {
    const user = userEvent.setup()
    render(<UserDailyBarcodeButton onBarcode={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /scan/i }))
    expect(screen.getByTestId('scanner')).toBeInTheDocument()
  })
})
```

```tsx
// UserDailyBarcodeButton.tsx
import { useState } from 'react'
import UserDailyBarcodeScanner from './UserDailyBarcodeScanner'

export default function UserDailyBarcodeButton({ onBarcode }: { onBarcode: (b: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Scan barcode" className="px-3 py-2 rounded bg-gray-200 dark:bg-gray-700">📷 Scan</button>
      <UserDailyBarcodeScanner open={open} onClose={() => setOpen(false)} onBarcode={(b) => { setOpen(false); onBarcode(b) }} />
    </>
  )
}
```

- [ ] **Step 2: Verify + commit**

Run: `pnpm --filter @oyl/react-oyl test UserDailyBarcodeButton`
Expected: PASS.

```bash
git add packages/react-oyl/modules/user/daily/nutrition/UserDailyBarcodeButton.tsx packages/react-oyl/modules/user/daily/nutrition/UserDailyBarcodeButton.test.tsx
git commit -m "feat(daily-nutrition): scan-barcode button opens scanner modal"
```

### Task 5.7: `UserDailyNutritionQuickAdd` — test + impl

**Files:**
- Create: `packages/react-oyl/modules/user/daily/nutrition/UserDailyNutritionQuickAdd.test.tsx`
- Create: `packages/react-oyl/modules/user/daily/nutrition/UserDailyNutritionQuickAdd.tsx`

- [ ] **Step 1: Test + impl**

```tsx
// test
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import UserDailyNutritionQuickAdd from './UserDailyNutritionQuickAdd'

describe('UserDailyNutritionQuickAdd', () => {
  it('renders nothing when list empty', () => {
    const { container } = render(<UserDailyNutritionQuickAdd items={[]} onPick={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('clicking a chip calls onPick', async () => {
    const user = userEvent.setup()
    const items = [{ id: 1, documentId: 'a', name: 'Oat', serving_unit: 'g', source: 'user' } as never]
    const onPick = vi.fn()
    render(<UserDailyNutritionQuickAdd items={items} onPick={onPick} />)
    await user.click(screen.getByText('Oat'))
    expect(onPick).toHaveBeenCalledWith(items[0])
  })
})
```

```tsx
// impl
import type { TNutritionItemData } from '@oyl/all-of-oyl/modules'

export default function UserDailyNutritionQuickAdd({ items, onPick }: { items: TNutritionItemData[]; onPick: (item: TNutritionItemData) => void }) {
  if (items.length === 0) return null
  return (
    <div className="flex gap-2 overflow-x-auto py-2">
      {items.map(item => (
        <button
          key={item.documentId}
          onClick={() => onPick(item)}
          className="shrink-0 flex items-center gap-2 px-3 py-1 rounded-full border bg-white dark:bg-gray-800"
        >
          {item.image_url && <img src={item.image_url} alt="" className="w-6 h-6 rounded object-cover" />}
          <span className="text-sm">{item.name}</span>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify + commit**

Run: `pnpm --filter @oyl/react-oyl test UserDailyNutritionQuickAdd`
Expected: PASS.

```bash
git add packages/react-oyl/modules/user/daily/nutrition/UserDailyNutritionQuickAdd.tsx packages/react-oyl/modules/user/daily/nutrition/UserDailyNutritionQuickAdd.test.tsx
git commit -m "feat(daily-nutrition): quick-add chips from recent items"
```

### Task 5.8: `UserDailyAddNutritionForm` — test + impl

**Files:**
- Create: `packages/react-oyl/modules/user/daily/nutrition/UserDailyAddNutritionForm.test.tsx`
- Create: `packages/react-oyl/modules/user/daily/nutrition/UserDailyAddNutritionForm.tsx`

- [ ] **Step 1: Tests**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import UserDailyAddNutritionForm from './UserDailyAddNutritionForm'

const item = { id: 1, documentId: 'i', name: 'Yogurt', serving_unit: 'g', source: 'user', allergens: ['milk'] } as never

describe('UserDailyAddNutritionForm', () => {
  it('shows allergen warning', () => {
    render(<UserDailyAddNutritionForm item={item} selectedDate="2026-06-02" onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText(/Contains.*milk/i)).toBeInTheDocument()
  })

  it('rejects servings <= 0', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<UserDailyAddNutritionForm item={item} selectedDate="2026-06-02" onSubmit={onSubmit} onCancel={vi.fn()} />)
    const input = screen.getByLabelText(/servings/i)
    await user.clear(input)
    await user.type(input, '0')
    await user.click(screen.getByRole('button', { name: /log/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits with servings + datetime', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<UserDailyAddNutritionForm item={item} selectedDate="2026-06-02" onSubmit={onSubmit} onCancel={vi.fn()} />)
    await user.clear(screen.getByLabelText(/servings/i))
    await user.type(screen.getByLabelText(/servings/i), '1.5')
    await user.click(screen.getByRole('button', { name: /log/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ servings: 1.5 }))
    expect(onSubmit.mock.calls[0][0].datetime).toMatch(/^2026-06-02T/)
  })
})
```

- [ ] **Step 2: Implement**

```tsx
import { useState } from 'react'
import type { TNutritionItemData } from '@oyl/all-of-oyl/modules'

function defaultTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function UserDailyAddNutritionForm({
  item, selectedDate, onSubmit, onCancel,
}: {
  item: TNutritionItemData
  selectedDate: string
  onSubmit: (args: { servings: number; datetime: string }) => void
  onCancel: () => void
}) {
  const [servings, setServings] = useState<number>(1)
  const [time, setTime] = useState<string>(defaultTime())
  const valid = servings > 0

  return (
    <div className="p-3 border rounded bg-white dark:bg-gray-800 space-y-2">
      <div className="font-medium">{item.name}{item.brand ? ` — ${item.brand}` : ''}</div>
      {item.allergens && item.allergens.length > 0 && (
        <div className="text-sm text-amber-700 dark:text-amber-400">Contains: {item.allergens.join(', ')}</div>
      )}
      <div className="flex gap-2 items-center">
        <label className="text-sm">
          Servings <input aria-label="servings" type="number" min={0} step={0.5} value={servings} onChange={e => setServings(Number(e.target.value))} className="w-20 px-1 py-0.5 border rounded ml-1" />
        </label>
        <label className="text-sm">
          Time <input aria-label="time" type="time" value={time} onChange={e => setTime(e.target.value)} className="px-1 py-0.5 border rounded ml-1" />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          disabled={!valid}
          onClick={() => onSubmit({ servings, datetime: `${selectedDate}T${time}:00.000Z` })}
          className="px-3 py-1 rounded bg-indigo-600 text-white disabled:opacity-50"
        >Log</button>
        <button onClick={onCancel} className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700">Cancel</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run and confirm pass**

Run: `pnpm --filter @oyl/react-oyl test UserDailyAddNutritionForm`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/react-oyl/modules/user/daily/nutrition/UserDailyAddNutritionForm.tsx packages/react-oyl/modules/user/daily/nutrition/UserDailyAddNutritionForm.test.tsx
git commit -m "feat(daily-nutrition): add-log mini-form with allergen warning"
```

### Task 5.9: `UserDailyNutrition` section composition + barrel

**Files:**
- Create: `packages/react-oyl/modules/user/daily/nutrition/UserDailyNutrition.tsx`
- Create: `packages/react-oyl/modules/user/daily/nutrition/index.ts`

- [ ] **Step 1: Implement section** (wires orchestrator to subcomponents and handles the OFF→nutrition-item find-or-create dance via the remote client)

```tsx
import { useCallback, useMemo, useState } from 'react'
import { Section } from '@oyl/storybook-oyl'
import type { TNutritionItemData } from '@oyl/all-of-oyl/modules'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'
import { useUserProfile } from '@/modules/user/profile/useUserProfile'
import {
  createOFFClientFromEnv,
  normalizeProduct,
  useNutritionSearch,
} from '@/modules/nutrition/openfoodfacts'
import type { LocalResult, NutritionSearchCache, OFFProductSummary } from '@/modules/nutrition/openfoodfacts'
import { createRemoteClient } from '@/modules/data/useDataRemote'
import useAuth from '@/modules/auth/useAuth'
import UserDailyNutritionTotals from './UserDailyNutritionTotals'
import UserDailyNutritionList from './UserDailyNutritionList'
import UserDailyNutritionQuickAdd from './UserDailyNutritionQuickAdd'
import UserDailyNutritionSearchInput from './UserDailyNutritionSearchInput'
import UserDailyBarcodeButton from './UserDailyBarcodeButton'
import UserDailyAddNutritionForm from './UserDailyAddNutritionForm'

export default function UserDailyNutrition() {
  const {
    selectedDate, nutritionRows, dailyTotals, recentNutritionItems,
    addNutritionLog, updateNutritionServings, removeNutritionLog,
  } = useUserDailyOrchestrator()
  const { timezone } = useUserProfile()
  const tz = timezone || 'UTC'
  const { apiToken } = useAuth()
  const remote = useMemo(() => createRemoteClient(() => apiToken), [apiToken])
  const offClient = useMemo(() => createOFFClientFromEnv(), [])
  const cache: NutritionSearchCache = useMemo(() => ({
    async findSearch(query) {
      const list = await remote.findAll<{ query: string; results: OFFProductSummary[] }>('nutrition-searches').catch(() => [])
      return list.find(r => r.query === query)?.results ?? null
    },
    async saveSearch(query, results) {
      await remote.create('nutrition-searches', { query, results })
    },
  }), [remote])

  const fetchGlobals = useCallback(async (q: string): Promise<TNutritionItemData[]> => {
    const params = new URLSearchParams({
      'filters[$or][0][name][$startsWithi]': q,
      'filters[$or][1][brand][$startsWithi]': q,
      'pagination[pageSize]': '20',
    })
    return await remote.findAll<TNutritionItemData>(`nutrition-items?${params.toString()}`).catch(() => [])
  }, [remote])

  const [query, setQuery] = useState('')
  const search = useNutritionSearch({
    query,
    recentItems: recentNutritionItems,
    offClient,
    cache,
    fetchGlobals: (q) => fetchGlobals(q),
  })

  const [picked, setPicked] = useState<TNutritionItemData | null>(null)

  const findOrCreateByBarcode = useCallback(async (barcode: string): Promise<TNutritionItemData | null> => {
    const params = new URLSearchParams({
      'filters[barcode][$eq]': barcode, 'pagination[pageSize]': '1',
    })
    const existing = await remote.findAll<TNutritionItemData>(`nutrition-items?${params.toString()}`).catch(() => [])
    if (existing.length > 0) return existing[0]
    const product = await offClient.fetchByBarcode(barcode, new AbortController().signal).catch(() => null)
    if (!product) return null
    const { columns, data } = normalizeProduct(product)
    return await remote.create<TNutritionItemData>('nutrition-items', { ...columns, data })
  }, [offClient, remote])

  const handleSelect = useCallback(async (selection: { kind: 'local'; result: LocalResult } | { kind: 'off'; product: OFFProductSummary }) => {
    if (selection.kind === 'local') {
      setPicked(selection.result.item)
      return
    }
    const found = await findOrCreateByBarcode(selection.product.code)
    if (found) setPicked(found)
  }, [findOrCreateByBarcode])

  const handleBarcode = useCallback(async (barcode: string) => {
    const found = await findOrCreateByBarcode(barcode)
    if (found) setPicked(found)
  }, [findOrCreateByBarcode])

  const submit = useCallback(async ({ servings, datetime }: { servings: number; datetime: string }) => {
    if (!picked || !picked.documentId) return
    await addNutritionLog({
      nutritionItemDocumentId: picked.documentId,
      servings,
      datetime,
      item: picked,
    })
    setPicked(null)
    setQuery('')
  }, [picked, addNutritionLog])

  return (
    <Section title="Nutrition">
      <UserDailyNutritionTotals totals={dailyTotals} />
      <UserDailyNutritionQuickAdd items={recentNutritionItems} onPick={setPicked} />
      <div className="flex gap-2 mt-2">
        <div className="flex-1">
          <UserDailyNutritionSearchInput
            localResults={search.localResults}
            offResults={search.offResults}
            offLoading={search.offLoading}
            offError={search.offError}
            onQueryChange={setQuery}
            onSelect={handleSelect}
            onSearchOff={search.searchOff}
          />
        </div>
        <UserDailyBarcodeButton onBarcode={handleBarcode} />
      </div>
      {picked && (
        <div className="mt-2">
          <UserDailyAddNutritionForm
            item={picked}
            selectedDate={selectedDate}
            onSubmit={submit}
            onCancel={() => setPicked(null)}
          />
        </div>
      )}
      <div className="mt-3">
        <UserDailyNutritionList
          rows={nutritionRows}
          timezone={tz}
          onServingsChange={updateNutritionServings}
          onRemove={removeNutritionLog}
        />
      </div>
    </Section>
  )
}
```

- [ ] **Step 2: Add barrel**

```ts
// packages/react-oyl/modules/user/daily/nutrition/index.ts
export { default as UserDailyNutrition } from './UserDailyNutrition'
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @oyl/react-oyl exec tsc -b --noEmit 2>&1 | grep daily/nutrition || echo ok`
Expected: ok.

- [ ] **Step 4: Commit**

```bash
git add packages/react-oyl/modules/user/daily/nutrition/UserDailyNutrition.tsx packages/react-oyl/modules/user/daily/nutrition/index.ts
git commit -m "feat(daily-nutrition): compose section + wire OFF cache & barcode flows"
```

---

## Phase 6 — Page wiring + cleanup

### Task 6.1: Add `UserDailyNutrition` to `UserDailyPage`

**Files:**
- Modify: `packages/react-oyl/modules/user/daily/UserDailyPage.tsx`

- [ ] **Step 1: Edit**

```tsx
import UserDailyHeader from './UserDailyHeader'
import { UserDailyActivities } from './activities'
import { UserDailyGoals } from './goals'
import { UserDailyNutrition } from './nutrition'
import UserDailyDataProviders from './UserDailyDataProviders'

export default function UserDailyPage() {
  return (
    <UserDailyDataProviders>
      <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-900 py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <UserDailyHeader />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <UserDailyActivities />
            <UserDailyGoals />
          </div>
          <div className="mt-8">
            <UserDailyNutrition />
          </div>
        </div>
      </div>
    </UserDailyDataProviders>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/react-oyl/modules/user/daily/UserDailyPage.tsx
git commit -m "feat(daily): mount nutrition section under activities/goals grid"
```

### Task 6.2: Delete the standalone nutrition page and remove route

**Files:**
- Delete: `packages/react-oyl/modules/nutrition/NutritionPage.tsx`
- Delete: `packages/react-oyl/modules/nutrition/NutritionProvider.tsx`
- Delete: `packages/react-oyl/modules/nutrition/nutrition-context.ts`
- Delete: `packages/react-oyl/modules/nutrition/useNutrition.ts`
- Modify: `packages/react-oyl/src/main.tsx`

- [ ] **Step 1: Delete files**

```bash
git rm packages/react-oyl/modules/nutrition/NutritionPage.tsx packages/react-oyl/modules/nutrition/NutritionProvider.tsx packages/react-oyl/modules/nutrition/nutrition-context.ts packages/react-oyl/modules/nutrition/useNutrition.ts
```

- [ ] **Step 2: Edit `main.tsx`**

Remove the `NutritionPage` import and the `/nutrition` route.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @oyl/react-oyl exec tsc -b --noEmit 2>&1 | grep -i nutrition || echo ok`
Expected: ok.

- [ ] **Step 4: Commit**

```bash
git add packages/react-oyl/src/main.tsx
git commit -m "refactor(nutrition): drop standalone OFF search page + route"
```

### Task 6.3: Manually verify in dev browser

- [ ] **Step 1: Start dev stack**

In two terminals:
```bash
pnpm --filter @oyl/strapi-oyl develop
pnpm --filter @oyl/react-oyl dev
```

- [ ] **Step 2: Smoke test**

In the browser:
1. Log in as a test user.
2. Navigate to `/daily`.
3. Confirm the Nutrition section appears below Activities/Goals.
4. Type "oat" → confirm "Search OpenFoodFacts" sentinel shows.
5. Click sentinel → confirm OFF results render (network tab shows the `.net` staging call with the X-* headers).
6. Select a result, log it, confirm totals update and the row appears.
7. Edit servings → totals update after debounce.
8. Remove the log → row disappears.

- [ ] **Step 3: No commit (verification only)**

---

## Phase 7 — Integration tests (Vitest + MSW)

### Task 7.1: Set up MSW handlers + test helpers

**Files:**
- Create: `packages/react-oyl/modules/user/daily/nutrition/__integration__/msw-handlers.ts`
- Create: `packages/react-oyl/modules/user/daily/nutrition/__integration__/test-utils.tsx`

- [ ] **Step 1: Write handlers**

```ts
import { http, HttpResponse } from 'msw'

type Store = {
  userNutritions: any[]
  nutritionItems: any[]
  nutritionSearches: any[]
  offSearch?: (query: string) => unknown
  offBarcode?: (code: string) => unknown
}

export function buildHandlers(store: Store) {
  return [
    http.get('http://localhost:3337/api/user-nutritions', () => HttpResponse.json({ data: store.userNutritions })),
    http.post('http://localhost:3337/api/user-nutritions', async ({ request }) => {
      const body = await request.json() as { data: any }
      const doc = { id: Date.now(), documentId: `un-${Date.now()}`, ...body.data }
      store.userNutritions.push(doc)
      return HttpResponse.json({ data: doc })
    }),
    http.put('http://localhost:3337/api/user-nutritions/:id', async ({ params, request }) => {
      const body = await request.json() as { data: any }
      const idx = store.userNutritions.findIndex(n => n.documentId === params.id || String(n.id) === params.id)
      if (idx >= 0) store.userNutritions[idx] = { ...store.userNutritions[idx], ...body.data }
      return HttpResponse.json({ data: store.userNutritions[idx] })
    }),
    http.get('http://localhost:3337/api/nutrition-items', ({ request }) => {
      const url = new URL(request.url)
      const barcode = url.searchParams.get('filters[barcode][$eq]')
      if (barcode) {
        const found = store.nutritionItems.filter(i => i.barcode === barcode)
        return HttpResponse.json({ data: found })
      }
      return HttpResponse.json({ data: store.nutritionItems })
    }),
    http.post('http://localhost:3337/api/nutrition-items', async ({ request }) => {
      const body = await request.json() as { data: any }
      const doc = { id: Date.now(), documentId: `ni-${Date.now()}`, ...body.data }
      store.nutritionItems.push(doc)
      return HttpResponse.json({ data: doc })
    }),
    http.get('http://localhost:3337/api/nutrition-searches', () => HttpResponse.json({ data: store.nutritionSearches })),
    http.post('http://localhost:3337/api/nutrition-searches', async ({ request }) => {
      const body = await request.json() as { data: any }
      const doc = { id: Date.now(), documentId: `ns-${Date.now()}`, ...body.data }
      store.nutritionSearches.push(doc)
      return HttpResponse.json({ data: doc })
    }),
    http.get('*/api/v3/search', ({ request }) => {
      const url = new URL(request.url)
      const q = url.searchParams.get('search_terms') ?? ''
      return HttpResponse.json(store.offSearch?.(q) ?? { products: [], count: 0, page: 1, page_count: 0, page_size: 0 })
    }),
    http.get('*/api/v3/product/:code', ({ params }) => {
      return HttpResponse.json(store.offBarcode?.(params.code as string) ?? { status: 0 })
    }),
  ]
}

export function emptyStore(): Store {
  return { userNutritions: [], nutritionItems: [], nutritionSearches: [] }
}
```

- [ ] **Step 2: Write test-utils**

```tsx
// test-utils.tsx
import { ReactNode } from 'react'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import UserDailyDataProviders from '../../UserDailyDataProviders'
import AppProvider from '@/modules/app/AppProvider'
import { Provider as AuthProvider } from '@/modules/auth/auth-context'

export function setupMockServer(handlers: ReturnType<typeof import('msw').http.get>[]) {
  const server = setupServer(...handlers)
  beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())
  return server
}

export function renderWithDaily(children: ReactNode) {
  return render(
    <AppProvider>
      <AuthProvider value={{
        isAuthenticated: true, apiToken: 'fake', user: { id: 1, username: 'u', email: 'u@x' },
        updateApiToken: () => {}, updateUser: () => {},
      }}>
        <UserDailyDataProviders>{children}</UserDailyDataProviders>
      </AuthProvider>
    </AppProvider>,
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/react-oyl/modules/user/daily/nutrition/__integration__/
git commit -m "test(daily-nutrition): MSW handlers + test render harness"
```

### Task 7.2 — 7.6: Integration scenarios

For each scenario below, the structure is the same: arrange the MSW `Store`, render `<UserDailyNutrition />`, drive the UI with `userEvent`, assert.

Spec each as a separate `*.test.tsx` file under `__integration__/`:

- [ ] **7.2** `add-from-recent.test.tsx` — pre-seed a recent log; click chip; submit mini-form; assert second `POST /user-nutritions`.
- [ ] **7.3** `add-from-off.test.tsx` — empty local; type query; click sentinel; MSW returns OFF result; select; assert `POST /nutrition-items` then `POST /user-nutritions`; assert `POST /nutrition-searches` (cache write).
- [ ] **7.4** `add-from-off-cache-hit.test.tsx` — pre-seed nutrition-search cache; click sentinel; assert no `*/api/v3/search` call fires.
- [ ] **7.5** `edit-servings.test.tsx` — pre-seed log; type new servings; advance timers; assert single PUT after 400ms; totals recompute.
- [ ] **7.6** `remove-log.test.tsx` — pre-seed log; open kebab → Remove → Confirm; assert PUT with `deleted_at`; row disappears.

Each commit message: `test(daily-nutrition): <scenario>`. For each: write the test, run, observe pass (the implementation is already done), commit.

### Task 7.7: Run full unit + integration suite

- [ ] **Step 1: Run**

```bash
pnpm --filter @oyl/react-oyl test
```
Expected: all tests pass.

- [ ] **Step 2: Lint + typecheck**

```bash
pnpm --filter @oyl/react-oyl exec tsc -b --noEmit
pnpm --filter @oyl/react-oyl exec eslint modules/user/daily/nutrition modules/user/nutrition modules/nutrition/openfoodfacts
```
Expected: clean.

- [ ] **Step 3: No commit (verification only)**

---

## Phase 8 — E2E (Playwright)

### Task 8.1: Add `packages/e2e-oyl` workspace

**Files:**
- Create: `packages/e2e-oyl/package.json`
- Create: `packages/e2e-oyl/playwright.config.ts`
- Create: `packages/e2e-oyl/tsconfig.json`

- [ ] **Step 1: Scaffold**

```json
// packages/e2e-oyl/package.json
{
  "name": "@oyl/e2e-oyl",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "test": "playwright test",
    "test:headed": "playwright test --headed",
    "install:browsers": "playwright install chromium firefox"
  },
  "devDependencies": {
    "@playwright/test": "^1.50.0",
    "typescript": "~5.9.3"
  }
}
```

```ts
// packages/e2e-oyl/playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: [
    { command: 'pnpm --filter @oyl/strapi-oyl develop', port: 3337, reuseExistingServer: true, timeout: 120_000 },
    { command: 'pnpm --filter @oyl/react-oyl dev', port: 5173, reuseExistingServer: true, timeout: 60_000 },
  ],
})
```

```json
// packages/e2e-oyl/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "skipLibCheck": true, "esModuleInterop": true, "resolveJsonModule": true
  },
  "include": ["tests/**/*", "playwright.config.ts"]
}
```

- [ ] **Step 2: Install**

```bash
pnpm install
pnpm --filter @oyl/e2e-oyl install:browsers
```

- [ ] **Step 3: Commit**

```bash
git add packages/e2e-oyl/ pnpm-lock.yaml
git commit -m "chore(e2e): scaffold Playwright workspace"
```

### Task 8.2: Add seed fixture for Strapi

**Files:**
- Create: `packages/e2e-oyl/tests/fixtures/seed.ts`

- [ ] **Step 1: Write**

Use Strapi REST + admin API to create a test user (if not present), obtain an API token, and seed a few `nutrition-items`. Document the expected env vars `STRAPI_ADMIN_EMAIL`, `STRAPI_ADMIN_PASSWORD` (set locally via `.env`). The fixture exposes:

```ts
export type SeedContext = {
  apiToken: string
  testUserEmail: string
  testUserPassword: string
}

export async function seed(): Promise<SeedContext> { /* ... */ }
```

Implementation: POST to `/api/auth/local/register` with idempotent email; on collision, POST to `/api/auth/local` to log in and grab `jwt`. Then POST a couple of `nutrition-items` (one user-source, one openfoodfacts-source with a known barcode like `'5060337502222'`).

- [ ] **Step 2: Commit**

```bash
git add packages/e2e-oyl/tests/fixtures/seed.ts
git commit -m "test(e2e): Strapi seed fixture for test user + nutrition items"
```

### Task 8.3 — 8.5: Three foundational e2e specs

Each spec uses `page.route('**/openfoodfacts.net/**', ...)` to intercept OFF traffic with canned v3 fixtures. Each spec starts authenticated on `/daily`. Write one task per spec.

- [ ] **8.3** `add-from-global.spec.ts` — pre-seeded global item appears in autocomplete, log via mini-form, assert row visible after reload.
- [ ] **8.4** `off-search-and-cache.spec.ts` — query with no local results; click sentinel; OFF intercept returns 1 product; select; log. Re-run identical query → assert intercept count stays at 1 (cache hit).
- [ ] **8.5** `barcode-manual-fallback.spec.ts` — open scanner; type known barcode (which is in the OFF intercept's product fixture); submit; assert find-or-create flow + log.

Each task: write spec, `pnpm --filter @oyl/e2e-oyl test <spec>`, observe pass, commit.

Additional e2e scenarios in the spec (`add-from-off`, `add-from-recent`, `barcode-scan-happy`, `barcode-scan-unknown`, `edit-servings`, `soft-delete`, `offline-graceful`, `allergen-warning`, `quick-add-recent`, `targets-progress`) follow the same pattern. Implement each as a separate task in the same style: write the spec, run, observe pass, commit. Use the seed fixture; intercept OFF; assert via DOM + network counts.

### Task 8.6: Add e2e to root pnpm scripts

**Files:**
- Modify: `package.json` (repo root)

- [ ] **Step 1: Add script**

Add to `scripts`:
```json
"e2e": "pnpm --filter @oyl/e2e-oyl"
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "chore: add root e2e script alias"
```

---

## Phase 9 — Final verification

### Task 9.1: Full verification

- [ ] **Step 1: All checks**

```bash
pnpm --filter @oyl/react-oyl test
pnpm --filter @oyl/react-oyl exec tsc -b --noEmit
pnpm --filter @oyl/react-oyl exec eslint modules/user/daily/nutrition modules/user/nutrition modules/nutrition/openfoodfacts
pnpm --filter @oyl/strapi-oyl exec tsc --noEmit
pnpm --filter @oyl/e2e-oyl test --project=chromium
```

Expected: all pass.

- [ ] **Step 2: Manual checklist**

Write `docs/superpowers/specs/2026-06-02-user-daily-nutrition-manual-tests.md` enumerating:
- Native BarcodeDetector path: Chrome desktop, real device camera
- ZXing fallback: Firefox desktop, real device camera
- Permission denied flow: Chrome with denied permission
- iOS Safari permission prompt UX

- [ ] **Step 3: Commit manual checklist**

```bash
git add docs/superpowers/specs/2026-06-02-user-daily-nutrition-manual-tests.md
git commit -m "docs(specs): manual-test checklist for nutrition camera flows"
```

### Task 9.2: Open PR

- [ ] **Step 1: Push branch + PR**

```bash
git push -u origin HEAD
gh pr create --title "User Daily Nutrition section" --body "$(cat <<'EOF'
## Summary
- Add Nutrition section to the daily page (search/scan/log, tiered local→OFF, browser-direct OFF v3 with X-* identification headers, Strapi nutrition-item schema expansion w/ Nutri-Score/NOVA/allergens, soft-delete user-nutritions, sync engine integration).

## Spec
- docs/superpowers/specs/2026-06-02-user-daily-nutrition-design.md
- docs/superpowers/plans/2026-06-02-user-daily-nutrition.md

## Test plan
- [ ] Unit + integration: `pnpm --filter @oyl/react-oyl test`
- [ ] E2E: `pnpm --filter @oyl/e2e-oyl test`
- [ ] Manual camera flows per the manual-tests checklist

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Reference: known cleanups deferred

- Strapi-side Vitest suite (out of scope — controllers are exercised by React integration tests + e2e).
- iOS Safari support for `BarcodeDetector` is browser-version dependent; manual checklist tracks this.
- The OFF attribution headers are best-effort given browser constraints. If OFF flags us as a bot via rate-limit responses, revisit.
