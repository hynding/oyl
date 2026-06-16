# Backend SP5c — Local→remote migration (first-sign-in upload) — Design

**Status:** approved (prompt-for-consent; keep-local; validate-first; R-1–R-6)
**Date:** 2026-06-15
**Package:** `apps/vanilla-oyl` (a `storage/migrate.js` module + `data.js`/`main.js`/panel wiring). No `@oyl/all-of-oyl` change.
**Context:** The two datasets are fully separate (fork D): local mode uses `oyl/data/<collection>` (`LocalStorageRepository`); remote uses `oyl/cache/<collection>` + outbox + cursors. So a user who builds data in local mode, then switches to remote + signs in, sees the (empty) remote cache — **their local work appears to vanish** (stranded in `oyl/data/*`). SP5c closes that gap: on first remote sign-in it offers to **upload the local-only data** to the backend. The reverse (remote→local) + multi-tab (SP5d2) + per-action retry (SP5d3) are out of scope.

---

## What this is

A migration module + a one-time **confirm** prompt on first remote sign-in. "Migration" = **replay each local record through the remote facade** (cache + outbox), so the data reappears instantly from cache and uploads in the background via the existing sync engine. Client UUIDs carry over → clean creates. A manual "Upload local data (N)" button on Status → Connection is the fallback if the user declines.

### Decisions (settled)

1. **Prompt for consent** (native `confirm()`, consistent with the existing Reset confirm): "You have N local items — upload them to your account?" Upload → migrate; Not now → set `oyl/migrate-declined` (no re-prompt) + keep the manual button.
2. **Reuse the facade, not a bespoke upload** — `repos[name].save(revived)` per record → cache (instant) + outbox (durable, retried). The sync engine *is* the upload path.
3. **R-3 · validate-first** — revive ALL local records before saving any; a malformed/old-schema record aborts cleanly (nothing uploaded, flag unset, re-offer).
4. **Keep the local dataset** (non-destructive); `oyl/migrated` (a global one-time flag) prevents re-upload; the user can Reset manually. (Clear-on-migrate rejected — destructive.)
5. **Trigger** when `mode==='remote'` + signed in + local data present + `!oyl/migrated` + `!oyl/migrate-declined` — checked at boot (already-signed-in) and on the sign-in transition (mutually exclusive — R-5).
6. **`COLLECTIONS` only** (R-4) — settings/theme/schema-version are local UI bookkeeping, not synced.

### Out of scope / documented limits

Remote→local download. Deep merge with an account that already has overlapping ids (id collisions → the SP5b conflict policy; the common case is a fresh account → pure upload). SP5d2/SP5d3. R-1: keep-local ~doubles `localStorage` for the dataset (quota risk for large data — R-18a). R-2: migration is N per-record PUTs (the outbox flushes per-op, not batched) — one-time; progress is visible for free via the SP5d chip's "N pending" draining, and data appears instantly from cache.

---

## Architecture — `apps/vanilla-oyl`

### 1. `storage/keys.js` — flags
```js
export const MIGRATED_KEY = 'oyl/migrated'
export const MIGRATE_DECLINED_KEY = 'oyl/migrate-declined'
```

### 2. `storage/migrate.js` (new)
```js
import { COLLECTIONS } from '@oyl/all-of-oyl'
import { dataKey, MIGRATED_KEY, MIGRATE_DECLINED_KEY } from './keys.js'

/** Σ local (oyl/data/*) record counts across all collections. */
export function countLocalRecords(storage) {
  let n = 0
  for (const name of Object.keys(COLLECTIONS)) {
    const raw = storage.getItem(dataKey(name))
    if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) n += arr.length }
  }
  return n
}

/** Offer migration iff there's local data and it hasn't been migrated or declined. */
export function shouldOfferMigration(storage) {
  return countLocalRecords(storage) > 0 && !storage.getItem(MIGRATED_KEY) && !storage.getItem(MIGRATE_DECLINED_KEY)
}

/**
 * Upload local-only data to remote via the engine facades. Validate-first (R-3): revive
 * every record before saving any. Sets MIGRATED_KEY on success. @returns {Promise<number>}
 */
export async function migrateLocalToRemote(storage, repos) {
  /** @type {Array<{ name: string, item: any }>} */
  const revived = []
  for (const name of Object.keys(COLLECTIONS)) {
    const raw = storage.getItem(dataKey(name))
    if (!raw) continue
    const shapes = JSON.parse(raw)
    if (!Array.isArray(shapes)) continue
    const codec = /** @type {any} */ (COLLECTIONS[name])
    for (const shape of shapes) revived.push({ name, item: codec.fromJSON(shape) }) // throws on a bad shape → abort
  }
  for (const { name, item } of revived) await repos[name].save(item) // cache + outbox + flush trigger
  storage.setItem(MIGRATED_KEY, '1')
  return revived.length
}
```
(`facade.save` re-stamps `meta` — revision 1, `createdAt/updatedAt = now`; the domain **data** is preserved. The save completes on the local copy; the network upload is the engine's background job, so migration doesn't block on connectivity and the flag is correctly set after the *copy*.)

### 3. `state/data.js` — orchestration
```js
import { shouldOfferMigration, countLocalRecords, migrateLocalToRemote } from '../storage/migrate.js'
// inside createDataState (it has storage + repos + refresh):
function migrationOffer() { return shouldOfferMigration(storage) ? { count: countLocalRecords(storage) } : null }
async function migrateLocal() { const n = await migrateLocalToRemote(storage, repos); await refresh(); return n }
// add migrationOffer, migrateLocal to the returned object
```

### 4. `components/oyl-status-panel.js` — manual button
A `migration` prop `{ count: number, onUpload: () => void } | null` (default null). In remote mode with `count > 0`, render an "Upload local data (N)" button (`data-act="upload-local"`) in the Sync block → `onUpload`. R-6: on a successful click, self-hide the button (`btn.hidden = true`). Null/0 → no button.

### 5. `main.js` — prompt + wiring
- **Boot** (after the existing remote `startSync()`), and **in the sign-in effect** (the `authState.session` block that already fires `syncFlush`), call a shared `maybeOfferMigration()`:
  ```js
  function maybeOfferMigration() {
    if (mode !== 'remote' || !authState.session.get()) return
    const offer = dataState.migrationOffer()
    if (!offer) return
    if (confirm(`You have ${offer.count} local item(s). Upload them to your account?`)) {
      void dataState.migrateLocal().then((n) => noticeState.show(`Uploaded ${n} local item(s) to your account.`)).catch(() => {})
    } else {
      storage.setItem(MIGRATE_DECLINED_KEY, '1')
    }
  }
  ```
  Call it at boot (remote + signed-in) and from the sign-in effect (`if (signedIn && !wasSignedIn) { dataState.syncFlush(); maybeOfferMigration() }`).
- **Status route:** `panel.migration = mode === 'remote' && shouldOfferMigration(storage) ? { count: countLocalRecords(storage), onUpload: () => void dataState.migrateLocal() } : null`.

---

## Testing (Vitest + happy-dom)

- **`storage/migrate.test.js`** (new): `countLocalRecords` (sums `oyl/data/*`); `shouldOfferMigration` (true with local data + no flags; false when `MIGRATED_KEY`/`MIGRATE_DECLINED_KEY` set or empty); `migrateLocalToRemote` over **stub repos** (a `Record<name,{ save: spy }>`) seeded with real local data (write `dataKey(name)` with real domain `toJSON` shapes — reuse the seed/backup fixtures) → every record `save`d through the right collection's stub, `MIGRATED_KEY` set, count returned, and the local `oyl/data/*` is **left intact**; a malformed shape → `migrateLocalToRemote` throws and `MIGRATED_KEY` stays unset (R-3, nothing saved).
- **`oyl-status-panel.test.js`** (extend): remote `migration` (count>0) → an "Upload local data" button (`data-act="upload-local"`); click → `onUpload` called; null/0 → no button.
- (The `confirm` prompt + boot/sign-in wiring lives in `main.js` — covered by the real-Chrome pass.)

## File structure
```
apps/vanilla-oyl/src/storage/keys.js        (MIGRATED_KEY, MIGRATE_DECLINED_KEY)
apps/vanilla-oyl/src/storage/migrate.js      (new) + migrate.test.js
apps/vanilla-oyl/src/state/data.js           (migrationOffer, migrateLocal)
apps/vanilla-oyl/src/components/oyl-status-panel.js (migration prop + button) + test
apps/vanilla-oyl/src/main.js                 (maybeOfferMigration + panel.migration)
```
No `@oyl/all-of-oyl` change; the engine/facades are reused as-is.

## Acceptance

`pnpm vanilla test` + `pnpm vanilla typecheck` green. Then real-Chrome: in **local** mode create several records; Status → Connection → switch to **Remote** + URL + Apply (reload) → the app shows empty (remote cache) + a "sign in" notice; Account → register → a **confirm** appears ("You have N local items — upload…"); **Upload** → the records reappear (from cache), the SP5d chip shows them draining ("N pending → synced"), and they exist on the backend (verify via `curl`). Reload → still there. A second sign-in does **not** re-prompt (`oyl/migrated`). In a fresh profile, decline ("Not now") → no upload, but Status → Connection shows an "Upload local data (N)" button that performs the same migration. Ready for SP5d2 (multi-tab) + SP5d3 (per-action retry).
