# Backend SP5d — Sync-status UI (visible + live) — Design

**Status:** approved (core scope: ambient chip + resync + auto-refresh; multi-tab=SP5d2, per-action retry=SP5d3; R-1–R-6)
**Date:** 2026-06-15
**Packages:** `@oyl/all-of-oyl` (a `pulledAt` field) + `apps/vanilla-oyl` (bridge, chip, Status block, effect).
**Context:** SP5a–SP5b2 built the offline-first engine; `syncState` is exposed but **nothing renders it**, and reconnect-pulls/conflict-resolutions merge into the cache without re-hydrating the live aggregates (so they don't show until a manual reload). SP5d makes sync **visible** (an ambient header chip) and **live** (auto-refresh on pull/conflict), plus a **Resync** control. Multi-tab = SP5d2; per-action retry = SP5d3.

---

## What this is

A small `pulledAt` on `SyncState`; a one-time bridge of the framework-free `syncState` observable to a vanilla `Signal`; an **ambient chip** in the header toolbar (visible only when syncing/offline/pending/error); a **Sync block** on Status → Connection (last-synced + counts + **Resync now**); and a `data.js`-owned **effect** that re-hydrates the stores when a pull or conflict changes the cache.

### Decisions (settled)

1. **Ambient chip** (fork): visible only when there's something to show — `syncing` / `offline` (+pending) / `error` / transient `pending>0`; **hidden when idle+synced** and in local mode. The chip's mere presence is the signal.
2. **`pulledAt?: Date` on `SyncState`** (set by `pull()` only) is the auto-refresh trigger — distinct from `lastSyncedAt` (which flush also sets), so refresh fires on **pulls** (boot/reconnect), never per write.
3. **Bridge once** (`data.js`): `syncState` becomes a `Signal<SyncState | null>` (null in local); expose `resync`.
4. **R-2 · the auto-refresh effect lives in `data.js`** (it has the signal + `refresh`), gated by a **pure predicate** `syncTriggersRefresh(prev, next)` (true when `pulledAt` or `conflicts` changed) — unit-testable; `main.js` stays thin.
5. **R-1 · absolute last-synced time** (`HH:MM`), not a ticking "2m ago" (which freezes between emits).
6. **R-3 · Resync disabled when offline** (`resync` clears cursors then `pull()` no-ops offline → would silently clear cursors with no visible effect).
7. **R-4 · the chip is a labeled visual indicator** (`aria-label`/`title`), **not** an `aria-live` region (it re-renders per emit; a live region would spam SRs). Errors remain the job of `oyl-notice`.

### Out of scope (→ SP5d2 / SP5d3)

Multi-tab cross-tab propagation (SP5d2). Per-action retry affordances (SP5d3). A transient "conflict reconciled" toast. Notes: R-5 — `pulledAt` is set on every pull, so an empty-delta reconnect pull triggers one redundant `refresh()` (pulls are infrequent — accepted). R-6 — the observable→signal bridge subscription is app-lifetime (one engine per boot); no teardown.

---

## Architecture

### 1. `@oyl/all-of-oyl/src/core/sync-engine.ts` — `pulledAt`
`SyncState` gains `pulledAt?: Date`. In `pull()`, the final emit becomes `emit({ lastSyncedAt: now(), pulledAt: now() })`. (Additive optional field; existing tests/`conflicts` unaffected.)

### 2. `apps/vanilla-oyl/src/state/data.js` — bridge + resync + auto-refresh
```js
import { effect } from '../lib/reactive/effect.js'   // signal already imported
// after engine is available:
const syncStateSignal = signal(/** @type {SyncState|null} */ (engine ? engine.syncState.get() : null))
engine?.syncState.subscribe((v) => syncStateSignal.set(v))   // app-lifetime (R-6)
function resync() { return engine ? engine.resync() : Promise.resolve() }

// pure, testable trigger (R-2):
export function syncTriggersRefresh(prev, next) {
  return !!next && (next.pulledAt !== prev?.pulledAt || next.conflicts !== prev?.conflicts)
}
// remote-only effect: re-hydrate when a pull/conflict changed the cache
if (engine) {
  let prev = syncStateSignal.get()
  effect(() => {
    const s = syncStateSignal.get()
    if (syncTriggersRefresh(prev, s)) { prev = s; void refresh() }
    else prev = s
  })
}
```
`dataState.syncState` is now the **Signal** (was the raw observable — consumed by nothing before SP5d, so safe to change). Add `syncState` (the signal) + `resync` to the returned object (keep `startSync`/`syncFlush`). `refresh` is the existing function (in scope).

### 3. `apps/vanilla-oyl/src/components/oyl-sync-status.js` (new) — ambient chip
An `OylElement` with a `syncState` prop (the Signal); guard `if (!this.syncState) return` (R-8). `track()` reads the signal and renders a chip, or nothing:
- `syncing` → "Syncing…" (accent dot)
- `offline` || `!online` → `Offline` (+ ` · ${pending}` when `pending>0`) (amber dot)
- `status==='error'` → "Sync error", `title=lastError` (danger dot)
- `status==='idle' && pending>0` → `${pending} pending` (amber dot)
- else (idle+synced, or null) → nothing
**R-7 · take no layout when hidden:** toggle the host — `this.toggleAttribute('hidden', !visible)` with `:host([hidden]) { display: none }` in the sheet (an empty shadow root still occupies a flex slot). The chip carries an `aria-label` matching the text (R-4 — not a live region). `defineSyncStatus()` idempotent.

### 4. `apps/vanilla-oyl/src/components/oyl-status-panel.js` — Sync block + Resync
Add a `sync` prop: `{ state: Signal<SyncState|null>, onResync: () => void } | null` (default null). In `render()`, when `this.sync?.state.get()` is non-null (remote), append a **Sync** section (after the Connection section) and a `track()` that reflects the signal:
- "Last synced \<HH:MM\>" (from `lastSyncedAt`, absolute — R-1: `new Date(s.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })`), or "—" if never. The block updates via a `track()` in `render()` (R-10 — render-once + a lifecycle effect; the existing `_paint` diagnostics path is untouched).
- `N pending`, and `N reconciled this session` (from `conflicts`) when `>0`.
- a **Resync now** `button` → `this.sync.onResync()`, **disabled when** `!s.online || s.status==='offline'` (R-3).
Local mode (`sync` null or `state.get()` null) → no Sync section.

### 5. `apps/vanilla-oyl/src/main.js` — mount + wire
- **Drop** the `.then(() => dataState.refresh())` after `startSync()` (the data.js effect now refreshes on the boot pull's `pulledAt`): `if (mode === 'remote') void dataState.startSync().catch(() => {})`.
- **Mount the chip** (remote only) in the `toolbar` slot. Create it next to `toggle` (`chip.slot = 'toolbar'`, `chip.syncState = dataState.syncState`) and include it in the **existing single `shell.append(navEl, …, toggle, router)` call** (R-9 — match the file's append pattern; place the chip before `toggle` so it sits left of the theme toggle). In local mode, don't create/append the chip.
- **Status route:** `panel.sync = mode === 'remote' ? { state: dataState.syncState, onResync: dataState.resync } : null`.

---

## Testing (Vitest + happy-dom)

- **`sync-engine.test.ts`**: `pull()` sets `pulledAt`; `flush()` does not (assert `pulledAt` unchanged after a flush-only).
- **`data.test.js`**: `syncTriggersRefresh` truth table (changed `pulledAt`→true; changed `conflicts`→true; status-only change→false; null next→false). `dataState.syncState` is a Signal (`.get`/`.subscribe`); `resync()` calls `engine.resync` (stub). Optional integration: push a state with a new `pulledAt` through a stub engine's observable → a refresh side-effect runs (counts re-read / a `repos.list` spy).
- **`oyl-sync-status.test.js`** (new): `null` → hidden; idle+synced → hidden; `offline`+pending → "Offline · N"; `syncing` → "Syncing…"; `error` → "Sync error". (Drive a signal; assert via the component's own shadow root.)
- **`oyl-status-panel.test.js`** (extend): remote `sync` (signal with `lastSyncedAt`) → a Sync section + a Resync button (click → `onResync`); offline state → the button is `disabled`; local (`sync` null) → no Sync section.

## File structure
```
packages/all-of-oyl/src/core/sync-engine.ts     (modify: SyncState.pulledAt + pull sets it) + test
apps/vanilla-oyl/src/state/data.js               (bridge→signal, resync, syncTriggersRefresh + effect) + data.test.js
apps/vanilla-oyl/src/components/oyl-sync-status.js (new) + oyl-sync-status.test.js
apps/vanilla-oyl/src/components/oyl-status-panel.js (modify: sync prop + Sync block) + status-panel test
apps/vanilla-oyl/src/main.js                     (drop .then(refresh); mount chip; panel.sync)
```
The engine's flush/pull logic, cache/outbox/cursor, auth, and stores are otherwise untouched. Local mode renders no chip and no Sync block.

## Acceptance

`pnpm all-of test` + `typecheck:src` + `pnpm all-of build` green; `pnpm vanilla test` + typecheck green. Then real-Chrome against the running backend in **remote** mode: the header chip is **hidden when synced**; it shows "Syncing…" briefly on a write, "Offline · N" when the backend is down (with N queued), and "Sync error" on an auth failure; Status → Connection shows the last-synced time + a **Resync now** button (disabled while offline) that forces a full pull; a change made on the backend appears **without a manual reload** (the auto-refresh effect re-hydrates on the next pull); a server-wins conflict re-hydrates the screen + increments the "reconciled" count. Ready for SP5d2 (multi-tab) and SP5d3 (per-action retry).
