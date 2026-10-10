# `apps/stencil-oyl` Vault screen — Design

**Date:** 2026-10-08
**Status:** implemented on branch feat/stencil-oyl-vault (stacked on feat/stencil-oyl-finance; plan: `docs/superpowers/plans/2026-10-08-stencil-oyl-vault.md`)
**Program:** Stencil front-end — sub-project 7 (fifth redesigned screen; see
`2026-10-06-extract-client-layer-design.md` §Program context). Depends on 6 (`oyl-item-row`,
the collapsed-form section pattern, `ui-select`).

## Purpose

Replace the `/vault` placeholder: documents, possessions, subscriptions (with renewal → finance
expense), contacts (with "log contact" and occasions) and gift ideas, plus the Upcoming feed
over a horizon. Same domain behavior as vanilla's `oyl-vault` (the vault store and
`dataState.renewSubscription` are unchanged); new look and a much shorter page.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Layout | **Upcoming on top, then one kind at a time** (mockup B): a `ui-segment` picks Documents / Possessions / Subscriptions / Contacts; the chosen kind shows its collapsed "New …" form and its list. Gift ideas (form + list) sit under Contacts, as they depend on one. Vanilla's one four-type composer becomes four small forms. |
| Rows | **`oyl-item-row` gains one optional secondary action** (`action: { act, label }` → an `act` event); subscriptions (Renew) and contacts (Log contact) reuse the shared row. No new row components. |
| Horizon | **`ui-select`** with Next 30 days / Next 90 days / Next year (default 90), as vanilla. |

## Screen anatomy

```
<oyl-vault store tz onRenew>
  h2[tabindex=-1] "Vault"     sr-only aria-live
  .section-head  "Upcoming" · <ui-select name="horizon" label="Within">
  <ol class="upcoming"> <li class="due"> {label} / {dueInLabel} | mono {due.value} …    · .empty[data-role=upcoming-empty]
  <ui-segment name="kind"> Documents / Possessions / Subscriptions / Contacts   (default documents)
  section.documents     <details><summary>New document</summary><oyl-document-form></details>   <ol class="documents"> oyl-item-row … · .empty "No documents yet."
  section.possessions   <details><summary>New possession</summary><oyl-possession-form></details> <ol class="possessions"> oyl-item-row … · "No possessions yet."
  section.subscriptions .section-head "Subscriptions" · .monthly-total {monthlyTotalLabel}
                        <details><summary>New subscription</summary><oyl-subscription-form></details> <ol class="subscriptions"> oyl-item-row(action Renew) … · "No subscriptions yet."
  section.contacts      <details><summary>New contact</summary><oyl-contact-form></details> <ol class="contacts"> oyl-item-row(action Log contact) … · "No contacts yet."
                        .section-label "Gift ideas" · <oyl-gift-idea-form store> (always visible; hint "Add a contact first." without contacts)
                        <ol class="gifts"> oyl-item-row … · "No gift ideas yet."
```

Only the chosen kind's `section` renders; the `kind` is `@State()` (default `documents`).

- **Upcoming:** `store.upcoming(DayRange.of(today, today.addDays(horizon)))`; each row shows the
  label, `dueInLabel(due, today)` and the mono ISO day; empty text "Nothing coming up in the next
  N days." / "… in the next year." (vanilla's).
- **Rows** (label / lines / value / action, all through `oyl-item-row`):
  - Document: `name` / `[kind, expiresOn ? "Expires {iso}" : null]`.
  - Possession: `name` / `[location, warrantyUntil ? "Warranty until {iso}" : null]` /
    `value = purchasePrice ? formatMoney(price) : undefined`.
  - Subscription: `name` / `["{formatMoney(amount)} · {cadenceLabel}", due ? "Renews {iso} · {dueInLabel}" : null]`
    with `tone = 'warn'`-styled line when overdue (vanilla's `.overdue`; here the second line is
    prefixed "Overdue · " instead of a color — rows have one tone slot, for the value) /
    `action = { act: 'renew', label: 'Renew' }`.
  - Contact: `name` / `[stalenessLabel(staleness(today)), ...occasions.map("{Name} {monthDayLabel}")]` /
    `action = { act: 'log', label: 'Log contact' }`.
  - Gift idea: `text` / `["For {contact name ?? 'Unknown contact'}"]`.
- **Callbacks:** `remove` → the matching `store.removeX(id)` + "Deleted"; `act renew` →
  `renew(id, today)` (the screen's `renew` prop = `app.dataState.renewSubscription`) + "Renewed
  — expense recorded"; `act log` → `store.recordContact(id, today)` + "Logged"; each form's
  `added` → "Added to vault" (gift form: "Gift idea added").
- One `effect` over the vault revision (every store read touches it) and a bundle `signal`
  for the horizon (a Stencil `@State` is not tracked by an effect — the Planner's day signal is
  the pattern): the effect assigns the five lists, the monthly totals and the upcoming feed to
  `@State` fields; row lines/values/actions are derived in `render()`, never cached per row, so
  in-place mutations (`renew`, `recordContact`) show up because the store hands back fresh
  arrays. `kind` is plain `@State` (render-only).

### Forms (one component each, all `ui-card`-less — they live inside the `<details>`)

| Tag | Fields | Builds |
|---|---|---|
| `oyl-document-form` | `ui-field name` (Name), `ui-field kind` (Kind), `ui-field expiresOn type=date` (Expires, optional) | `new Document({ name, kind, expiresOn? })` → `store.addDocument` |
| `oyl-possession-form` | `name`, `location` (optional), `warrantyUntil` date (optional), `.price`: `amount` number + `ui-select currency`, `purchasedOn` date (optional) | `new Possession({ name, location?, warrantyUntil?, purchasePrice? (only when amount > 0), purchasedOn? })` → `store.addPossession` |
| `oyl-subscription-form` | `name`, `.price`: `amount` + `currency`, `.cadence`: `cadenceN` (default 1) + `ui-select cadenceUnit` (days/weeks/months/years, default months), `anchor` date (default today, label "Renews on"), `ui-select category` (entertainment/software/fitness/utilities/news/other) | `new Subscription({ name, amount: Money.fromMajor, cadence: Cadence.of, anchor: DayKey.of, category })` → `store.addSubscription` |
| `oyl-contact-form` | `name`, `birthday` date (optional), `lastContacted` date (optional) | `new Contact({ name, lastContactedOn?, occasions: birthday ? [{ name: 'birthday', anchor, cadence: Cadence.of(1,'years') }] : undefined })` → `store.addContact` |
| `oyl-gift-idea-form` | `ui-field giftText` (Idea) + `ui-select giftContact` (contacts, mirrored through an effect that also re-derives the form's own `contactId` — keep it when still present, else the first contact, else `''` — because `ui-select` syncs silently); with no contacts renders the hint "Add a contact first." instead of the fields | `new GiftIdea({ text, contactId: Id.of(contactId) })` → `store.addGiftIdea` |

Every form: native `<form>`, `ui-button type=submit variant=primary` ("Add to vault" / "Add"),
domain errors in `[data-role=error]` (aria-live) — the field the message names is marked
invalid (`kind must be non-empty` marks Kind; otherwise Name) — clears on success (the
subscription form re-defaults everything as vanilla's `form.reset()` did: cadenceN 1, unit
months, anchor today, currency USD, category entertainment), emits `added`.
`CURRENCIES` is shared from `src/finance/format.ts`; `CADENCE_UNITS`, `SUBSCRIPTION_CATEGORIES`,
`HORIZONS`, `stalenessLabel` (ported with its test), `upcomingEmptyText(horizon)` and the row
line builders live in `src/vault/format.ts`.

### `oyl-item-row` extension

`@Prop() action?: { act: string; label: string }` renders `<button data-act={act}>` before
Delete (quiet style) and emits `@Event() act: EventEmitter<{ act: string; itemId: string }>`.
The confirm cluster is unchanged. Spec adds: no extra button without `action`; clicking it
emits `act` with both fields and never opens the confirm.

## Shared code

- Nothing new in `@oyl/all-of-oyl`: `Document`, `Possession`, `Subscription`, `Contact`,
  `GiftIdea`, `Cadence`, `Money`, `DayRange`, `dueInLabel`, `cadenceLabel`, `monthDayLabel`,
  `monthlyTotalLabel`, `spanLabel` and `createVaultStore`/`renewSubscription` exist.
- `boot/routes.ts`: `vault` creates `oyl-vault` with `store = app.dataState.vault`, `renew =
  app.dataState.renewSubscription`, `tz = app.tz`; `vault` leaves `NOT_YET` (the routing spec's
  placeholder deep link already uses `/goals`, which stays a placeholder).
- Vault collections are **unbacked** (not in `BACKED`): in-session assertions only, as vanilla's
  e2e notes. The renewal's Transaction IS backed (asserted through the Finance ledger).

## Verification

- **Unit:** `stalenessLabel`, `upcomingEmptyText`, the line builders (`documentLines`,
  `possessionLines`, `subscriptionLines` incl. the overdue prefix, `contactLines`, `giftLines`),
  the option lists.
- **Specs:** `oyl-item-row` (action button + `act` event); each form (fields, built object,
  clear, `added`, inline error; the gift form's hint ↔ select switch and contact mirroring);
  `oyl-vault` (fake store with scripted lists + `upcoming`, reactive through `core()`: upcoming
  rows + empty text per horizon (select change), segment switches the visible section, each
  kind's rows with the right label/lines/value/action, monthly total label, `remove` → the
  right `removeX`, `act renew` → the `renew` prop with today + announcement, `act log` →
  `recordContact`, gift rows name their contact, each `added` announces).
- **e2e:** `tests-stencil/vault.spec.ts` = vanilla's seven vault tests on stencil selectors
  (`oyl-vault ui-segment [data-value=documents|possessions|subscriptions|contacts]`, each
  section's `details summary` opened by scoped helpers, `oyl-document-form ui-field[name=name]
  input` …, `ui-select[name=horizon] select`, `ol.upcoming li`, `oyl-item-row` with
  `[data-act=renew|log|delete]`, `oyl-gift-idea-form` hint / `ui-field[name=giftText]` /
  `ui-select[name=giftContact]`, the Finance ledger after a renew via `navTo`). Every list has
  its own class (`ol.documents|possessions|subscriptions|contacts|gifts`) so contact rows and
  gift rows in the same section never collide in a strict-mode locator; text assertions go
  through `deepText`/`expect.poll`, as in the Finance spec. The existing mobile overflow test
  covers `/vault`: if the four segment labels overflow at 412px, shorten them (Docs / Items /
  Subs / Contacts) rather than letting the segment wrap.
- Definition of Done per CLAUDE.md: `pnpm stencil test|typecheck|build`, stencil e2e projects
  green; ui-oyl and vanilla untouched.

## Out of scope

- Backing the vault collections; editing items; occasions beyond a birthday; document
  attachments; search.

## Risks

| Risk | Mitigation |
|---|---|
| Hidden sections lose form state when switching kinds | Only the chosen section renders (vanilla reset the whole form on every submit anyway); the segment is a navigation control, not a tab with unsaved drafts. |
| Renew's cross-store write fails offline | `renewSubscription` already queues the Transaction through the outbox; the announcement follows the vault write as in vanilla. |
| `act` event name | Not a native DOM event name; `remove`/`added` already in use. |

## Amendments during implementation

1. The pre-build review's findings (horizon as a bundle signal, the gift form owning `contactId`, the subscription form's full reset, per-list classes, the field-named-by-the-message rule, no routing-spec change) were folded in before any code.
2. The five forms share `src/vault/form.css` (imported per component) and `fieldValue`/`clearFields` helpers.
3. The four segment labels fit at Pixel 7 width unshortened; the mobile overflow e2e confirms it.
4. e2e: a `deepText` read right after a `toHaveCount` now polls across the stencil specs (the host exists before its shadow root renders — one race on mobile Finance).
