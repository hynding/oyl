# Vanilla-OYL Vault Screen (Slice 1) — Design

**Status:** approved (design settled in prior session; this records it)
**Date:** 2026-06-13
**App:** `apps/vanilla-oyl` (`@oyl/vanilla-oyl`)
**Predecessors:** foundation → Journal → Planner (all merged to local master). Reuses the same aggregate-store + Web-Component + design-token patterns, and the shared `inlineConfirm` helper landed in the UI-consolidation pass.

---

## What this is

The Vault is the third domain screen: **the things you have and what's coming up about them.** The full domain `Vault` aggregate (`@oyl/all-of-oyl/src/vault/vault.ts`) holds five registries — documents, possessions, subscriptions, contacts, gift-ideas — and a unified `upcoming(range)` reminder feed that merges document expiries, warranty expiries, subscription renewals, and contact occasions into one date-sorted list.

That is too much for one screen build. We slice it:

- **Slice 1 (this spec):** the Vault shell, the **upcoming due feed** with a horizon selector, and **add/delete for Documents and Possessions** only.
- **Slice 2 (later):** Subscriptions — a form, a list, and `monthlySubscriptionTotals()` display.
- **Slice 3 (later):** Contacts + gift-ideas — staleness, occasions, per-contact gift ideas.

Crucially, **the upcoming feed in Slice 1 reads the whole `Vault`**: the store hydrates all five registries from their repositories, so subscription renewals and contact occasions from the demo seed already appear in the feed even though Slice 1 has no forms for them. Only the *write surface* is limited to documents + possessions.

### Out of scope for Slice 1

- Subscription / contact / gift-idea **forms** (slices 2 & 3).
- `monthlySubscriptionTotals()` display (slice 2).
- **Editing** any item (add + delete only — matches Journal's entry model).
- Merging `planner.upcoming(range)` into the feed (a richer "what's coming" view; deferred).

---

## Domain API this consumes (already built in all-of-oyl/src)

All real, verified against source:

- `Vault` aggregate — `addDocument(d)`, `removeDocument(id)`, `documents(): readonly Document[]`; `addPossession(p)`, `removePossession(id)`, `possessions(): readonly Possession[]`; the other three registries' add/remove/list; and `upcoming(range: DayRange): readonly UpcomingDue[]`.
- `UpcomingDue = { itemId: Id; label: string; due: DayKey }`. The feed is sorted by due day. **`itemId` is NOT unique** — a contact emits one row per occasion; rows are unique by `(itemId, label)`. Use `(itemId + '|' + label)` as the list key.
- `Document` — `new Document({ id?, name, kind, expiresOn? })`. Both `name` and `kind` are required non-empty (throws `DomainError('INVALID_QUANTITY')` otherwise). `nextDueOn()` returns `expiresOn`.
- `Possession` — `new Possession({ id?, name, location?, warrantyUntil?, purchasePrice?: Money, purchasedOn?: DayKey })`. Only `name` required. `nextDueOn()` returns `warrantyUntil`.
- `Money` — `Money.of(minor, currency, exponent=2)` or `Money.fromMajor(major, currency, exponent=2)` (rounds major→minor). Currency must match `/^[A-Z]{3}$/`.
- `DayRange.of(start: DayKey, end: DayKey)` — inclusive; `end` must not precede `start`.
- `DayKey` — `DayKey.from(date, tz)`, `.addDays(n)`, `.compare(o)`, `.equals(o)`, `.value` (ISO `YYYY-MM-DD`), `.of(iso)`.

The `documents` and `possessions` codecs are already registered in `COLLECTIONS`, so `repos.documents` and `repos.possessions` already exist (built by `makeRepositories`). The demo seed (`makeSeed()`) already populates a passport (expires +90d), an espresso machine (warranty +30d), two subscriptions, and a contact — so a freshly-seeded Vault feed is non-empty.

---

## Architecture

### 1. `src/state/vault-store.js` — `createVaultStore(repos)`

App-level reactive wrapper over the documents + possessions repositories and a domain `Vault`. Modeled on `createJournalStore` (persist-first surgical writes — Vault items are immutable records with no mutations in Slice 1), NOT the stateful planner store.

```js
import { Vault } from '@oyl/all-of-oyl'
import { signal } from '../lib/reactive/signal.js'

/**
 * @param {{ documents: Repo<Document>, possessions: Repo<Possession>,
 *           subscriptions: Repo<Subscription>, contacts: Repo<Contact>,
 *           giftIdeas: Repo<GiftIdea> }} repos
 */
export function createVaultStore(repos) {
  let vault = new Vault()
  let n = 0
  const revision = signal(0)

  async function hydrate() {
    const fresh = new Vault()
    for (const d of await repos.documents.list()) fresh.addDocument(d)
    for (const p of await repos.possessions.list()) fresh.addPossession(p)
    for (const s of await repos.subscriptions.list()) fresh.addSubscription(s)
    for (const c of await repos.contacts.list()) fresh.addContact(c)
    for (const g of await repos.giftIdeas.list()) fresh.addGiftIdea(g)
    vault = fresh
    revision.set((n += 1))
  }

  return {
    revision,
    hydrate,
    async addDocument(doc) {
      const saved = await repos.documents.save(doc)
      vault.addDocument(saved); revision.set((n += 1)); return saved
    },
    async removeDocument(id) {
      await repos.documents.delete(id); vault.removeDocument(id); revision.set((n += 1))
    },
    async addPossession(p) {
      const saved = await repos.possessions.save(p)
      vault.addPossession(saved); revision.set((n += 1)); return saved
    },
    async removePossession(id) {
      await repos.possessions.delete(id); vault.removePossession(id); revision.set((n += 1))
    },
    documents() { revision.get(); return vault.documents() },
    possessions() { revision.get(); return vault.possessions() },
    upcoming(range) { revision.get(); return vault.upcoming(range) },
  }
}
```

Hydrating all five registries (not just the two we write) is deliberate: it keeps the `upcoming` feed complete. The three read-only registries are never mutated by the store in Slice 1; slices 2 & 3 add their write methods.

### 2. `src/state/data.js` — wire the store

Add alongside `journal` and `planner`:

```js
import { createVaultStore } from './vault-store.js'
// ...
const vault = createVaultStore(repos)
// inside refresh(): await vault.hydrate()
// return { repos, counts, schema, refresh, readDiagnostics, journal, planner, vault }
```

### 3. `src/vault/format.js` — presentation helpers (pure)

- `dueInLabel(due: DayKey, today: DayKey): string` — relative phrasing for the feed: `"today"`, `"tomorrow"`, `"in 5 days"`, `"in 3 weeks"`, `"in 2 months"`, and past → `"5 days ago"` (overdue subscription renewals can be in the past). Mirrors the tone of `planner/format.js` `overdueBadge` / `relativeDayLabel`.
- `formatMoney(m: Money): string` — `"$649.00"` for USD, else `"649.00 EUR"` style (symbol map for USD/EUR/GBP, fallback to `"<amount> <CUR>"`). Uses `m.minor / 10**m.exponent` with fixed `exponent` decimals.

### 4. Components

All extend `OylElement`, shadow DOM, `static styles = [sheet(css)]`, createElement-only, tokens for all color/space/type. Registered via idempotent `defineX()`.

**`src/components/oyl-vault.js` — `<oyl-vault>`** (screen root)
Properties: `store` (VaultStore), `tz` (string, default `'UTC'`). NOT day-centric — no day nav.
Layout, top to bottom:
1. `<h2 tabindex="-1">Vault</h2>` (screen heading — shell owns the page `h1`).
2. **Upcoming section:** label `Upcoming` + a horizon selector — a labeled `<select>` (`aria-label="Horizon"`) with options **30 / 90 / 365 days, default 90** (`<select>`, not a segment, to keep it visually distinct from the composer's type segment and natively accessible). Selecting recomputes the feed. Build the range as `DayRange.of(today, today.addDays(horizon))` where `today = DayKey.from(now(), this.tz)`. Render each `UpcomingDue` as a row: label + `dueInLabel(due, today)` + the absolute date (`due.value`). Empty state: `"Nothing coming up in the next N days."`
3. **`<oyl-vault-composer>`** — the add form.
4. **Documents section:** label `Documents` + a list of `<oyl-vault-item>` (one per `store.documents()`), or an empty state. Each item: title = `name`, lines = [`kind`, `expiresOn ? 'Expires ' + expiresOn.value : null`]; delete → `store.removeDocument(id)`.
5. **Possessions section:** label `Possessions` + list of `<oyl-vault-item>` (one per `store.possessions()`), or empty state. Each item: title = `name`, lines = [`location`, `warrantyUntil ? 'Warranty until ' + warrantyUntil.value : null`, `purchasePrice ? formatMoney(purchasePrice) : null`]; delete → `store.removePossession(id)`.

All reactive reads go through `this.track(() => { … })` so they re-run on `store.revision` and on horizon change (keep the horizon in a local `signal`). A `.sr-only` `aria-live` region announces add/delete like Journal/Planner.

**`src/components/oyl-vault-composer.js` — `<oyl-vault-composer>`**
Properties: `store`, `tz`. Emits via `onAdded?: () => void`.
- A **Document | Possession** segmented toggle (reuse the visual pattern from `oyl-plan-composer`'s Task/Appointment segment).
- **Document fields:** `name` (text, required), `kind` (text, required), `expiresOn` (date, optional → `DayKey.of(input.value)` when set).
- **Possession fields:** `name` (text, required), `location` (text, optional), `warrantyUntil` (date, optional), **price** = a number input + a currency `<select>` (USD/EUR/GBP) → `Money.fromMajor(amount, currency)` when amount is a positive number, `purchasedOn` (date, optional).
- Submit builds the right domain object and calls `store.addDocument(...)` / `store.addPossession(...)`, then resets the form and calls `onAdded`. Guard required fields; on a `DomainError` show an inline message rather than throwing. Use a **static import** of the domain classes (the dynamic-import-in-submit pitfall from the planner build).

**`src/components/oyl-vault-item.js` — `<oyl-vault-item>`**
A generic display row. Properties: `title` (string), `lines` (string[], falsy entries filtered), `onDelete` (`() => void`). Renders the title, the non-empty lines (muted), and a Delete button wired through the shared **`inlineConfirm`** helper (`mount` = its actions span, `prompt: 'Delete?'`, `onYes: this.onDelete`, `restore` re-renders the Delete button). This is exactly the entry-row/plan-row delete pattern, now via the shared helper.

### 5. Routing + nav

- `src/components/oyl-router.js` (or wherever routes are registered): add `#/vault` → `<oyl-vault>` with `store = data.vault`, `tz = defaultTimezone()`.
- Nav: add a **Vault** item after Planner (Status · Journal · Planner · Vault).

---

## Data flow

```
user submits composer
  → new Document/Possession(...)            (domain validates)
  → store.addDocument/Possession(it)
      → repos.X.save(it)                    (persist-first)
      → vault.addX(saved)
      → revision++                          (signal)
  → every this.track() reading store.* re-runs
      → Documents/Possessions list repaints
      → upcoming(range) recomputes (new item may have a future due)
  → onAdded() → aria-live "Added"

horizon change
  → local horizon signal set
  → track() re-runs → upcoming(DayRange.of(today, today.addDays(h))) repaints

delete (inline-confirm Yes)
  → store.removeX(id) → repos.X.delete + vault.removeX + revision++
  → lists + feed repaint; aria-live "Deleted"
```

Full re-hydrate (`data.refresh()` → `vault.hydrate()`) still runs on boot / seed / import / multi-tab, identical to the other stores.

---

## Error handling

- Composer validates required fields before constructing domain objects; a thrown `DomainError` (e.g. empty name/kind, bad currency) is caught and shown inline — never crashes the screen.
- `DayRange.of` cannot throw here (`end = today + horizon ≥ today`).
- Save/delete failures propagate as rejected promises; the screen's `aria-live` stays silent on failure (consistent with current screens — a dedicated error toast is a cross-screen follow-up, not Vault-specific).

---

## Testing

Vitest + happy-dom, matching existing component/store tests.

- **`vault-store.test.js`** — hydrate pulls all five registries into `upcoming`; `addDocument`/`addPossession` persist-first then appear in `documents()`/`possessions()` and (if dated) in `upcoming`; `removeX` deletes from repo and registry; `revision` bumps drive reads. Use `InMemoryRepository` for each of the five repos.
- **`format.test.js`** — `dueInLabel` for today/tomorrow/in-N-days/weeks/months/past; `formatMoney` for USD ($), EUR/GBP, and a fallback currency.
- **`oyl-vault-item.test.js`** — renders title + non-empty lines (filters falsy); Delete → `confirm-no` reverts, Delete → `confirm-yes` calls `onDelete` (shared-helper selectors).
- **`oyl-vault-composer.test.js`** — Document mode requires name+kind; Possession mode builds `Money.fromMajor` from amount+currency; segment toggle swaps fields; submit calls the right store method and resets.
- **`oyl-vault.test.js`** (integration) — with a seeded in-memory store: renders Upcoming feed, Documents, Possessions; horizon change re-filters the feed; adding a document makes it appear; deleting removes it.

---

## File structure

```
apps/vanilla-oyl/src/
  state/vault-store.js          (new)
  state/data.js                 (modify: wire vault)
  vault/format.js               (new)
  components/oyl-vault.js       (new)
  components/oyl-vault-composer.js (new)
  components/oyl-vault-item.js  (new)
  components/oyl-router.js      (modify: #/vault route)
  components/oyl-nav.js         (modify: Vault nav item)
  + the five *.test.js above
```

Acceptance: `pnpm vanilla test` green, `pnpm vanilla typecheck` clean (strict checkJs), and a real-Chrome pass — seed demo data, see passport + espresso warranty + subscription renewals in the 90-day feed, switch horizon to 30/365, add and delete a document and a possession.
