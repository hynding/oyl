# Vanilla-OYL Vault Screen — Slice 2 (Subscriptions) — Design

**Status:** approved (recommendations accepted)
**Date:** 2026-06-13
**App:** `apps/vanilla-oyl` (`@oyl/vanilla-oyl`)
**Predecessor:** Vault Slice 1 (shell + upcoming feed + Documents & Possessions), merged to master. Spec: `docs/superpowers/specs/2026-06-13-vanilla-oyl-vault-screen-design.md`.

---

## What this is

Slice 2 adds **Subscriptions** to the existing Vault screen: a composer mode, a dedicated subscription row with a renew action, and a monthly-cost summary. Subscriptions are *already* hydrated by `VaultStore` and *already* surface in the upcoming feed (Slice 1 hydrates all five registries), so this slice is purely additive within the vault module — **no nav, route, or `data.js` changes.**

The `Subscription` domain type (`@oyl/all-of-oyl/src/vault/subscription.ts`) is richer than documents/possessions, which drives the three decisions below.

A subscription intentionally appears in **two** places: as a renewal row in the cross-cutting **Upcoming** feed (the "what's due" view) *and* in its own **Subscriptions** registry section. This is by design — the feed is the unified due timeline, the section is the inventory — so do not deduplicate. Renewing advances the cursor, which moves the item forward in both.

### Decisions (settled)

1. **Category → preset `<select>`.** The domain stores `category` as a slug (`assertSlug`, `[a-z0-9_]+`). A fixed list of valid slugs makes invalid input impossible — no validation/error path. List: `entertainment`, `software`, `fitness`, `utilities`, `news`, `other`.
2. **Renew → advance cursor only.** `renew(on)` mutates the cursor *and* returns a finance `SubscriptionCharge`. Posting that to the Journal needs a finance `Transaction` wired into the journal store — a cross-cutting concern deferred to its own slice (Slice 1 already deferred finance). Slice 2's renew advances the cursor (the renewal moves to the next period; the upcoming feed updates) and the returned charge is discarded. Renew is included (not deferred) because without it lapsed subscriptions pile up as permanent overdue rows.
3. **Row → dedicated `<oyl-subscription-row>`.** Subscriptions render differently (amount + cadence + relative next-due) and carry *two* actions (Renew + Delete), so a dedicated component mirroring `oyl-plan-row` is cleaner than stretching the generic `oyl-vault-item`. It reuses the shared `inlineConfirm` for delete.
4. **Monthly total → inline on the section header** (e.g. `SUBSCRIPTIONS · $13.99/mo`), per-currency, joined.

### Out of scope (later slices)

- Finance wiring (`SubscriptionCharge` → `Transaction` → Journal).
- `accountId` capture on the subscription form (finance seam; left undefined).
- Editing any vault item.
- Contacts + gift-ideas (Slice 3).

---

## Domain API this consumes (already built, verified)

- `new Subscription({ id?, name, amount: Money, cadence: Cadence, anchor: DayKey, renewedThrough?, category: string, accountId? })`. Throws `DomainError` if `name` empty, `amount.minor <= 0` (amount must be **positive**), `category` not a slug, or `renewedThrough < anchor`. `renewedThrough` omitted → first due is the `anchor`.
- `subscription.nextDueOn(asOf)` → the pending occurrence **even when past** (lapsed renewal surfaces as overdue).
- `subscription.renew(on: DayKey): SubscriptionCharge` — **mutates** `renewedThrough` to the pending occurrence (cursor stays anchored; late payment never drifts the schedule) and returns `{ amount, category, direction: 'expense', accountId?, on }`.
- `subscription.amount` (Money), `subscription.cadence` (Cadence), `subscription.name`, `subscription.id`.
- `Cadence.of(n, unit)` — `unit ∈ {'days','weeks','months','years'}`, `n` integer ≥ 1.
- `Money.fromMajor(major, currency, exponent=2)`, `Money.of(...)`.
- `vault.addSubscription(s)`, `vault.removeSubscription(id)`, `vault.subscriptions(): readonly Subscription[]`, `vault.monthlySubscriptionTotals(): ReadonlyMap<string, Money>` (per-currency, prorated to a month).
- `@oyl/all-of-oyl` exports `Subscription`, `Cadence`, `Money`, `DayKey`. The `subscriptions` codec is already in `COLLECTIONS`, so `repos.subscriptions` already exists and the store already hydrates it.

---

## Architecture

### 1. `src/state/vault-store.js` — extend the store

Add to the returned object (the store already hydrates subscriptions in `hydrate()`):

```js
    /** @param {Subscription} sub @returns {Promise<Subscription>} */
    async addSubscription(sub) {
      const saved = await repos.subscriptions.save(sub)
      vault.addSubscription(saved)
      revision.set((n += 1))
      return saved
    },
    /** @param {Id} id */
    async removeSubscription(id) {
      await repos.subscriptions.delete(id)
      vault.removeSubscription(id)
      revision.set((n += 1))
    },
    /**
     * Pay the pending occurrence (stateful: advances the cursor in place, persists,
     * re-hydrates to resync — rollback-on-failure, like planner cancel). The returned
     * SubscriptionCharge is the finance seam; callers may ignore it (Slice 2 does).
     * @param {Id} id @param {DayKey} on @returns {Promise<SubscriptionCharge | undefined>}
     */
    async renew(id, on) {
      const sub = vault.subscriptions().find((s) => s.id === id)
      if (!sub) return undefined
      const charge = sub.renew(on)
      try {
        await repos.subscriptions.save(sub)
      } catch (err) {
        await hydrate()
        throw err
      }
      await hydrate()
      return charge
    },
    /** @returns {readonly Subscription[]} */
    subscriptions() {
      revision.get()
      return vault.subscriptions()
    },
    /** @returns {ReadonlyMap<string, Money>} */
    monthlySubscriptionTotals() {
      revision.get()
      return vault.monthlySubscriptionTotals()
    },
```

Add the needed typedefs (`Subscription`, `Cadence` not needed here, `SubscriptionCharge`, `Money`, `DayKey`). The subscriptions repo typedef already exists in `VaultRepos` as `Repository<Subscription>`; tighten its element type from `any` to `Subscription` if convenient.

### 2. `src/vault/format.js` — add `monthlyTotalLabel`

```js
/** @typedef {import('@oyl/all-of-oyl').Money} Money */

/**
 * "$13.99/mo" for one currency, "£5.00 + $13.99/mo" for several, "" when empty.
 * Entries are sorted by currency code so the output is deterministic regardless of
 * the subscriptions' add-order (the source Map iterates in insertion order).
 * @param {ReadonlyMap<string, Money>} totals @returns {string}
 */
export function monthlyTotalLabel(totals) {
  const parts = [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, m]) => formatMoney(m))
  return parts.length === 0 ? '' : `${parts.join(' + ')}/mo`
}
```

`cadenceLabel` ("every month" / "every 2 weeks") is reused from `src/planner/format.js`. `dueInLabel` and `formatMoney` already exist here.

### 3. `src/components/oyl-subscription-row.js` — `<oyl-subscription-row>`

Mirrors `oyl-plan-row` (`OylElement`, shadow DOM, tokens, `inlineConfirm` delete). Properties:
- `subscription` (Subscription) — externally assigned (double-cast default).
- `today` (DayKey) — passed by the screen so the row is pure/testable without the clock.
- `onRenew` (`(id: Id) => void`), `onDelete` (`(id: Id) => void`) — default no-ops.

Render:
- **name** (title).
- meta line: `formatMoney(subscription.amount)` · `cadenceLabel(subscription.cadence)`.
- due line: `Renews ${due.value} · ${dueInLabel(due, today)}` where `due = subscription.nextDueOn(today)`. When `due.compare(today) < 0` (lapsed), add an `.overdue` class styled with `--color-warn` (matches the planner overdue convention).
- actions: **Renew** — a single-click button (`data-act="renew"`) calling `onRenew(subscription.id)` (no confirm; routine, mirrors the planner complete checkbox); **Delete** via the shared `inlineConfirm` (`data-act="delete"` → `confirm-yes`/`confirm-no`), calling `onDelete(subscription.id)`.

`defineSubscriptionRow()` idempotent registrar.

### 4. `src/components/oyl-vault-composer.js` — add the Subscription mode

Extend the segment to **three** buttons: `document` / `possession` / `subscription` (`aria-label="Item type"`). The shared **price** control (amount + currency `<select>`, `input[name="amount"]`) is shown for **both** possession and subscription (it already exists for possession; reusing it keeps the Slice 1 possession test's `input[name="amount"]` selector working and avoids a duplicate control). Because amount is *optional* for possessions but *required* for subscriptions, its `<label>` text is **dynamic** — keep a reference to the price field's `<label>` and, in the `this.track()` toggle, set it to `'Price (optional)'` in possession mode and `'Amount'` in subscription mode. Add subscription-only fields:
- **cadence:** a number input `cadenceN` (default `1`, min `1`) + a unit `<select>` `cadenceUnit` (`days`/`weeks`/`months`/`years`, default `months`), laid out like the planner composer's repeat row.
- **anchor:** a date input `anchor` ("Renews on"), required for subscriptions; default to today's ISO via the app clock: `import { now } from '../storage/clock.js'` then `anchor.value = now().toISOString().slice(0, 10)` (mockable, consistent with the rest of the app — not raw `new Date()`).
- **category:** a `<select>` `category` with options `entertainment`/`software`/`fitness`/`utilities`/`news`/`other` (all valid slugs).

Field visibility (driven by the existing `this.track()` toggle):
| field | document | possession | subscription |
|---|---|---|---|
| name | ✓ | ✓ | ✓ |
| kind, expiresOn | ✓ | | |
| location, warrantyUntil, purchasedOn | | ✓ | |
| price (amount+currency) | | ✓ | ✓ |
| cadence (n+unit), anchor, category | | | ✓ |

Submit branch for subscription (in `_submit`) — no manual validation; let the domain throw and the existing try/catch show it inline:
```js
} else { // subscription
  const sub = new Subscription({
    name: ctx.name.value,
    amount: Money.fromMajor(Number(ctx.amount.value), ctx.currency.value),
    cadence: Cadence.of(Number(ctx.cadenceN.value), /** @type {any} */ (ctx.cadenceUnit.value)),
    anchor: DayKey.of(ctx.anchor.value),
    category: ctx.category.value,
  })
  await this.store.addSubscription(sub)
}
```
Why this needs no new validation code: an empty/zero amount → `Money.fromMajor(0, …)` → `new Subscription` throws `INVALID_QUANTITY` ("amount must be positive"); an empty amount → `Number('')` is `0`, same path; an empty `anchor` → `DayKey.of('')` throws; the preset-select `category` is always a valid slug. Every case is caught by the existing `_submit` try/catch and rendered in the `[data-role="error"]` element — so the composer only needs field wiring, no new error path. (`ctx.cadenceN` defaults to `1`, so `Cadence.of(1, …)` is always valid.)

Add `Subscription`, `Cadence` to the static domain import (`Money`, `DayKey` already imported).

### 5. `src/components/oyl-vault.js` — add the Subscriptions section

After the Possessions section, add a Subscriptions section:
- A header row (like the `.upcoming-head` flex): label `Subscriptions` + a right-aligned `.monthly-total` span.
- An `<ol class="subs-list">` of `<oyl-subscription-row>` (one per `store.subscriptions()`), wired `today` + `onRenew` + `onDelete`.
- An empty state: `"No subscriptions yet."`

In the existing `this.track(() => {...})`, after possessions:
```js
const subs = this.store.subscriptions()
subLabelTotal.textContent = monthlyTotalLabel(this.store.monthlySubscriptionTotals())
subsList.replaceChildren()
for (const s of subs) {
  const row = document.createElement('oyl-subscription-row')
  row.subscription = s
  row.today = today
  row.onRenew = (id) => { void this.store.renew(id, today); live.textContent = 'Renewed' }
  row.onDelete = (id) => { void this.store.removeSubscription(id); live.textContent = 'Deleted' }
  const li = document.createElement('li'); li.append(row); subsList.append(li)
}
subsEmpty.hidden = subs.length > 0
subsEmpty.textContent = subsEmpty.hidden ? '' : 'No subscriptions yet.'
```
Call `defineSubscriptionRow()` alongside `defineVaultComposer()` / `defineVaultItem()` in `render()`. Renew uses `today` as the payment day (`on`).

---

## Data flow

```
submit composer (subscription mode)
  → new Subscription(...)                  (domain validates: positive amount, slug category)
  → store.addSubscription(it)              (persist-first: save → vault.add → revision++)
  → track() repaints subs list + monthly total + upcoming feed (new renewal may fall in horizon)

Renew (single click)
  → store.renew(id, today)
      → sub.renew(today)                   (mutates cursor in place)
      → repos.subscriptions.save(sub)      (rollback via hydrate on failure)
      → hydrate() → revision++
  → next-due advances; the row's "Renews …" + the upcoming feed move to the next period

Delete (inline-confirm Yes)
  → store.removeSubscription(id)           (soft-delete tombstone; excluded from list())
  → repaint
```

## Error handling

- Subscription validation is delegated to the domain via the composer's existing try/catch (positive amount, slug category from the preset select is always valid, valid anchor). No new error code.
- `renew`/add/delete failures reject; consistent with Slice 1, the screen stays silent on failure (a cross-screen error toast remains a separate follow-up).

## Testing (Vitest + happy-dom)

- **`vault-store.test.js`** (extend): `addSubscription` persists + appears in `subscriptions()` and `upcoming`; `removeSubscription` deletes; `renew` advances `nextDueOn` to the next occurrence and persists (assert the pending due moved forward); `monthlySubscriptionTotals` reflects added subs (per-currency Money).
- **`format.test.js`** (extend): `monthlyTotalLabel` for empty (`''`), one currency (`'$13.99/mo'`), and two currencies sorted by code regardless of insertion order — build the Map USD-then-GBP and still expect `'£5.00 + $13.99/mo'` (GBP sorts before USD).
- **`oyl-subscription-row.test.js`** (new): renders name + `formatMoney` + `cadenceLabel` + "Renews …"; Renew click calls `onRenew(id)`; Delete → `confirm-yes` calls `onDelete(id)`, `confirm-no` reverts; a past due gets the `.overdue` class.
- **`oyl-vault-composer.test.js`** (extend): Subscription segment builds a `Subscription` with `Money` amount, `Cadence`, anchor, category from the select; a non-positive amount surfaces the inline error and does not add; segment toggle shows the subscription fields and hides doc/possession-only ones.
- **`oyl-vault.test.js`** (extend): Subscriptions section renders the seeded subs with the monthly total on the header; clicking Renew advances the row's due; deleting removes it.

## File structure

```
apps/vanilla-oyl/src/
  state/vault-store.js                 (modify: add subscription methods + renew + totals)
  vault/format.js                      (modify: add monthlyTotalLabel)
  components/oyl-subscription-row.js    (new)
  components/oyl-vault-composer.js      (modify: 3rd segment + subscription fields)
  components/oyl-vault.js              (modify: Subscriptions section + monthly total)
  + oyl-subscription-row.test.js (new); extend vault-store / format / composer / vault tests
```

No `data.js`, `oyl-nav.js`, `main.js`, or routing changes — the Vault screen and store already exist and already hydrate subscriptions.

## Acceptance

`pnpm vanilla test` green + `pnpm vanilla typecheck` clean, then a real-Chrome pass: seed demo data, open `#/vault`; the Subscriptions section lists Netflix + Gym with a monthly total on the header; Renew advances a subscription's "Renews …" date and moves its entry forward in the upcoming feed; add a new subscription (price + cadence + anchor + category) and delete one via the inline confirm.
