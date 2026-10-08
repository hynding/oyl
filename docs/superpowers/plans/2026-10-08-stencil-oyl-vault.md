# `apps/stencil-oyl` Vault screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the `/vault` placeholder in `apps/stencil-oyl` with the redesigned Vault (Upcoming feed with a horizon, a kind segment showing Documents / Possessions / Subscriptions / Contacts one at a time with collapsed forms, gift ideas under Contacts), extending `oyl-item-row` with one optional secondary action. Same domain behavior as vanilla's vault; vanilla and ui-oyl untouched.

**Architecture:** `oyl-vault` owns `kind` + `horizon` state and one `effect` over the vault store; five small forms submit through native `<form>`s on form-associated primitives; every row is `oyl-item-row` (`remove` / `act`). Row line builders and option lists live in `src/vault/format.ts` with unit tests.

**Tech Stack:** as sub-projects 2–6.

**Spec:** `docs/superpowers/specs/2026-10-08-stencil-oyl-vault-design.md`

## Global Constraints

- **Branch** `feat/stencil-oyl-vault` (stacked on `feat/stencil-oyl-finance`; spec commit `497c14b`). One commit per task; session trailer; never commit on red; no push/PR unless asked.
- **Behavior parity with vanilla's vault** (store calls, domain construction incl. the birthday occasion, resets, announcements, Upcoming math, empty texts). New: the look, one kind at a time, `oyl-item-row` everywhere.
- **Selectors for e2e** (keep stable): `oyl-vault`, `ui-select[name="horizon"] select`, `oyl-vault ol.upcoming li`, `[data-role="upcoming-empty"]`, `oyl-vault ui-segment [data-value="documents|possessions|subscriptions|contacts"]`, `section.documents|possessions|subscriptions|contacts details summary`, `oyl-document-form|oyl-possession-form|oyl-subscription-form|oyl-contact-form ui-field[name="…"] input`, `ui-select[name="currency|cadenceUnit|category|giftContact"] select`, `ui-button[type="submit"] button`, `oyl-item-row [data-act="renew"|"log"|"delete"|"confirm-yes"|"confirm-no"]`, `oyl-gift-idea-form` (hint text "Add a contact first." / `ui-field[name="giftText"] input`), `ol.documents|possessions|subscriptions|contacts|gifts oyl-item-row`, `.monthly-total`.
- **Gates per task:** `pnpm stencil test|typecheck|build`; Task 5 runs the stencil e2e projects (`PW_CHROMIUM_PATH`, `--workers=4`, ports 1341/1342/8043 freed first).
- Handlers on `ui-*` hosts never close over render state; `@Event()` names avoid native ones (`act`, `remove`, `added` are fine); forms read values from the primitives at submit time; `ui-select` state is owned by the form (silent option sync).

---

## Task 1: `src/vault/format.ts` + `oyl-item-row` action

**Files:** `apps/stencil-oyl/src/vault/format.ts` + `format.unit.ts`, `apps/stencil-oyl/src/components/oyl-item-row/{oyl-item-row.tsx,oyl-item-row.css,oyl-item-row.spec.tsx}`

- [ ] **Step 1: failing tests** — `HORIZONS` ([30,'Next 30 days'],[90,'Next 90 days'],[365,'Next year']), `CADENCE_UNITS`, `SUBSCRIPTION_CATEGORIES`; `stalenessLabel` (ported: never / today / yesterday / "Last contacted 3 months ago"); `upcomingEmptyText(30|90|365)`; `documentLines(d)`, `possessionLines(p)`, `possessionValue(p)`, `subscriptionLines(s, today)` (with "Overdue · " prefix when `nextDueOn < today`, no second line when `nextDueOn` is undefined), `contactLines(c, today)` (staleness + capitalised occasions with `monthDayLabel`), `giftLines(g, namesById)` ("For Alex" / "For Unknown contact"). Row spec: with `action={{ act: 'renew', label: 'Renew' }}` a `button[data-act=renew]` renders before Delete and click emits `act` `{ act: 'renew', itemId }` without opening the confirm; without `action` no extra button.
- [ ] **Step 2: implement.**
- [ ] **Step 3: gate + commit** — `feat(stencil-oyl): oyl-item-row action; vault format helpers`.

## Task 2: `oyl-document-form` + `oyl-possession-form`

- [ ] **Step 1: failing specs** — document: name/kind/expiresOn fields; submit → `Document` with `expiresOn` when given (undefined when blank), clears, emits `added`; empty kind → error inline with the Kind field marked (the message names it); empty name → Name marked. Possession: name, location, warrantyUntil, amount + currency, purchasedOn; submit with all → `Possession` with `location`, `warrantyUntil`, `purchasePrice` (Money, minor 99999 for "999.99", currency from the select), `purchasedOn`; blank optionals → undefined; amount "0" → no `purchasePrice`; clears; empty name → error.
- [ ] **Step 2: implement.**
- [ ] **Step 3: gate + commit** — `feat(stencil-oyl): oyl-document-form, oyl-possession-form`.

## Task 3: `oyl-subscription-form` + `oyl-contact-form` + `oyl-gift-idea-form`

- [ ] **Step 1: failing specs** — subscription: defaults (cadenceN "1", unit months, anchor today, category entertainment); submit → `Subscription` (amount Money, `Cadence.of(n, unit)`, `anchor` DayKey, category); re-defaults after submit (cadenceN 1, unit months, anchor today, currency USD, category entertainment — vanilla's form.reset()); missing amount → domain error inline. Contact: submit with birthday + lastContacted → `Contact` with `lastContactedOn` and one `birthday` occasion (anchor = that day, cadence 1 year); blanks → no occasions / no lastContactedOn; empty name → error. Gift idea: with no contacts renders the hint and no fields; with contacts (mirrored through an effect; reacts to `addContact`) renders `giftText` + `giftContact` with the contacts as options; the form's `contactId` re-derives on contact changes (first contact adopted when none chosen; kept when still present); submit → `GiftIdea({ text, contactId: Id.of(contactId) })` → `store.addGiftIdea`, clears text, emits `added`; empty text → error.
- [ ] **Step 2: implement.**
- [ ] **Step 3: gate + commit** — `feat(stencil-oyl): oyl-subscription-form, oyl-contact-form, oyl-gift-idea-form`.

## Task 4: `oyl-vault` screen + route

**Files:** `apps/stencil-oyl/src/components/oyl-vault/{…}`, `apps/stencil-oyl/src/boot/routes.ts` + `routes.unit.ts`

- [ ] **Step 1: failing specs** — fake store (scripted `documents/possessions/subscriptions/contacts/giftIdeas/upcoming/monthlySubscriptionTotals`, spies for every `addX/removeX/recordContact`), a `renew` spy, `tz='UTC'`, reactive through `core()`: Upcoming rows (label, dueIn, iso) + empty text per horizon after a select change (the horizon is a bundle signal read inside the effect, so the feed re-computes); default kind documents with its details form + rows (lines) and empty text; switching the segment shows possessions (value = price), subscriptions (monthly total label, Renew action, lines) and contacts (Log contact action, staleness line, occasions) + the gift form and gift rows naming their contact; `remove` on each kind calls the right `removeX` + "Deleted"; `act renew` → `renew(id, today)` + "Renewed — expense recorded"; `act log` → `recordContact(id, today)` + "Logged"; `added` from a kind form → "Added to vault", from the gift form → "Gift idea added".
- [ ] **Step 2: implement** — the effect mirrors the five lists + totals + upcoming into `@State`; lines/values/actions derive in `render()`.
- [ ] **Step 3: route** — `vault` creates `oyl-vault` with `app.dataState.vault`, `renew = app.dataState.renewSubscription`, `tz`; remove from `NOT_YET`; unit test text (the routing spec's placeholder already deep-links `/goals`).
- [ ] **Step 4: gate + commit** — `feat(stencil-oyl): Vault screen replaces the placeholder`.

## Task 5: e2e

**Files:** `apps/e2e-oyl/tests-stencil/vault.spec.ts`, `tests-stencil/lib.ts` (`vaultKind(page, kind)` = click the segment + open that section's details; `addDocument`, `addSubscription`, `addContact`)

- [ ] **Step 1:** port vanilla's seven vault tests with `deepText`/`expect.poll` for text (empty states across the four kinds + upcoming, document → Documents + Upcoming, possession price/location, renew → finance ledger via `navTo` + `oyl-finance ol.ledger oyl-item-row`, horizon select, gift ideas gated on a contact, contact log + delete).
- [ ] **Step 2:** run `--project stencil-desktop --project stencil-mobile --workers=4` green.
- [ ] **Step 3: commit** — `test(e2e): stencil vault spec`.

## Task 6: Visual check + docs

- [ ] Headless screenshots desktop + Pixel 7; check the four-label segment at 412px (shorten labels if it overflows); fix anything off.
- [ ] CLAUDE.md (stencil-oyl row: Vault; `oyl-item-row` action; placeholders list), spec statuses (vault implemented; program table row 7), tick this plan.
- [ ] Final gates; commit `docs: stencil-oyl Vault`.

## Deferred

- Backing the vault collections; editing; more occasions; search.
