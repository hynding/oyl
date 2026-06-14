# Vanilla-OYL Vault Screen — Slice 3 (Contacts & Gift Ideas) — Design

**Status:** approved (recommendations + review refinements accepted)
**Date:** 2026-06-14
**App:** `apps/vanilla-oyl` (`@oyl/vanilla-oyl`)
**Predecessors:** Vault Slice 1 (shell + upcoming feed + Documents & Possessions) and Slice 2 (Subscriptions), both merged to master. Specs: `2026-06-13-vanilla-oyl-vault-screen-design.md`, `2026-06-13-vanilla-oyl-vault-subscriptions-design.md`.

---

## What this is

The final Vault slice: **Contacts** (people you care about — staleness nudges + occasions) and **Gift ideas** (notes tied to a contact). Contacts' occasions already feed the Upcoming feed (Slice 1 hydrates all five registries), so this slice adds the inventory + maintenance surface: a Contacts section with a "Log contact" action and staleness, a contact composer mode, and a flat Gift Ideas section.

This completes the Vault screen. Two registries remain unwritten before this slice (contacts, gift-ideas); after it, all five vault registries are fully CRUD-able.

### Decisions (settled, incl. review refinements R1–R7)

1. **Occasions → birthday-only.** The contact composer collects a single optional **Birthday** date → one occasion `{ name: 'birthday', anchor: <date>, cadence: Cadence.of(1, 'years') }`. Arbitrary/repeatable occasions are deferred (the contact row renders `occasions` generically, so it's forward-compatible).
2. **Gift ideas → separate flat section** (consistent with the screen's section layout), not nested under each contact.
3. **Gift-idea add → an inline mini-form in the Gift Ideas section** (a dedicated `<oyl-gift-idea-form>`), not a 5th composer segment — gift ideas depend on existing contacts and are notes-about-a-person, not owned things.
4. **One slice** (~6 tasks), kept in scope by 1–3 above.
5. **(R2) The contact row does NOT show a relative next-occasion** — the Upcoming feed already owns "Sam — birthday · in 2 months". The row shows **staleness** + a **static** birthday line ("Birthday Jun 20") + the actions. Feed = urgency; row = relationship upkeep.
6. **(R1) Deleting a contact cascade-deletes its gift ideas.** `Vault.removeContact` does not cascade, so the *store's* `removeContact(id)` first removes `giftIdeasFor(id)` (repo + aggregate), then the contact. The gift-idea row defends against an unresolved contact name → "Unknown contact" (covers imported orphans).
7. **(R3) Shared relative-phrasing helper.** `stalenessLabel` and `dueInLabel` share a private `relativeSpan(n)` (days/weeks/months bucketing) so thresholds can't drift.
8. **(R4) Gift-idea add form is guarded** — with zero contacts it shows "Add a contact first" instead of an empty contact `<select>`.
9. **(R5) "Last contacted" does NOT default to today** (empty/optional — adding a contact ≠ contacting them).
10. **(R6) The composer segment wraps** (`flex-wrap`) now that it has four options.
11. **(R7) `recordContact` is a stateful store mutation** (mutate in place → persist → re-hydrate, rollback-on-failure), mirroring `renew`. The "Log contact" button is a single click, no confirm (benign + idempotent).
12. **(R8) The gift-idea form preserves typed text across reactive refreshes** — it builds DOM once and only refreshes the contact `<select>` options + guard in `track()` (never recreates the text input), because `store.contacts()` ties the form to every `revision` bump.
13. **(R10) The composer's shared price field must hide in Contact mode** — `priceField.hidden = !(isPos || isSub)` (not the Slice-2 `isDoc`), the one shared field whose condition isn't self-keyed.

### Out of scope (future)

- Repeatable / arbitrary occasions (anniversaries, custom names + cadences).
- Editing any vault item.
- Gift ideas nested/inline under each contact.
- Finance wiring (unrelated; still deferred from Slice 2).

---

## Domain API this consumes (already built, verified)

- `new Contact({ id?, name, lastContactedOn?: DayKey, occasions?: Occasion[] })`; `Occasion = { name: string, anchor: DayKey, cadence: Cadence }`. Throws if `name` or any `occasion.name` is empty.
- `contact.recordContact(on: DayKey): void` — **mutates** `lastContactedOn` in place.
- `contact.staleness(day: DayKey): number | undefined` — days since last contact; `undefined` when never contacted.
- `contact.lastContactedOn`, `contact.occasions` (readonly array), `contact.id`, `contact.name`. `contact.nextDueOn(asOf)` (earliest occasion) already feeds `vault.upcoming`.
- `new GiftIdea({ id?, text, contactId: Id })`. Throws if `text` empty.
- `Vault`: `addContact`/`removeContact`/`contacts()`, `addGiftIdea`/`removeGiftIdea`/`giftIdeas()`, `giftIdeasFor(contactId): readonly GiftIdea[]`.
- `@oyl/all-of-oyl` exports `Contact`, `GiftIdea`, `Cadence`, `DayKey`, `Id`. `DayKey` exposes `.value`, `.month`, `.dayOfMonth`, `.compare`. `Id.of(string)`.
- The `contacts` and `giftIdeas` codecs are already in `COLLECTIONS`; the store already hydrates both.

---

## Architecture

### 1. `src/vault/format.js` — `stalenessLabel`, `monthDayLabel`, shared `relativeSpan`

Refactor `dueInLabel` to use a shared private helper, and add two exports:

```js
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Magnitude phrase for a positive day count: "5 days" / "3 weeks" / "2 months". @param {number} n */
function relativeSpan(n) {
  if (n < 14) return `${n} day${n === 1 ? '' : 's'}`
  if (n < 60) return `${Math.round(n / 7)} weeks`
  return `${Math.round(n / 30)} months`
}

// dueInLabel becomes: today/tomorrow/yesterday special-cases, else
//   return days > 0 ? `in ${relativeSpan(n)}` : `${relativeSpan(n)} ago`

/** "Last contacted 3 months ago" / "Last contacted today" / "Never contacted". @param {number | undefined} days @returns {string} */
export function stalenessLabel(days) {
  if (days === undefined) return 'Never contacted'
  if (days <= 0) return 'Last contacted today'
  if (days === 1) return 'Last contacted yesterday'
  return `Last contacted ${relativeSpan(days)} ago`
}

/** "Jun 20" from a DayKey (month/day only — birthdays ignore the year). @param {DayKey} day @returns {string} */
export function monthDayLabel(day) {
  return `${MONTHS[day.month - 1] ?? ''} ${day.dayOfMonth}`
}
```

### 2. `src/state/vault-store.js` — contact + gift-idea methods

Add (the store already hydrates contacts + giftIdeas):

```js
    /** @param {Contact} c @returns {Promise<Contact>} */
    async addContact(c) { const saved = await repos.contacts.save(c); vault.addContact(saved); revision.set((n += 1)); return saved },

    /** Cascade: remove the contact's gift ideas first, then the contact. @param {Id} id */
    async removeContact(id) {
      for (const g of vault.giftIdeasFor(id)) {
        await repos.giftIdeas.delete(g.id)
        vault.removeGiftIdea(g.id)
      }
      await repos.contacts.delete(id)
      vault.removeContact(id)
      revision.set((n += 1))
    },

    /** Stateful (like renew): record contact in place, persist, re-hydrate, rollback-on-failure. @param {Id} id @param {DayKey} on */
    async recordContact(id, on) {
      const c = vault.contacts().find((x) => x.id === id)
      if (!c) return
      c.recordContact(on)
      try { await repos.contacts.save(c) } catch (err) { await hydrate(); throw err }
      await hydrate()
    },

    /** @returns {readonly Contact[]} */
    contacts() { revision.get(); return vault.contacts() },

    /** @param {GiftIdea} g @returns {Promise<GiftIdea>} */
    async addGiftIdea(g) { const saved = await repos.giftIdeas.save(g); vault.addGiftIdea(saved); revision.set((n += 1)); return saved },
    /** @param {Id} id */
    async removeGiftIdea(id) { await repos.giftIdeas.delete(id); vault.removeGiftIdea(id); revision.set((n += 1)) },
    /** @returns {readonly GiftIdea[]} */
    giftIdeas() { revision.get(); return vault.giftIdeas() },
```

Add `Contact`/`GiftIdea` typedefs. (Cascade delete is best-effort persist-first like the existing single deletes; a mid-cascade failure is the same negligible risk as `removeDocument` — no atomic batch needed for deletes.)

### 3. `src/components/oyl-contact-row.js` — `<oyl-contact-row>` (new)

Mirrors `oyl-subscription-row` (two actions in one `.actions` mount; Delete via shared `inlineConfirm`; Log contact single-click). Properties: `contact` (Contact), `today` (DayKey), `onLog` (`(id) => void`), `onDelete` (`(id) => void`).

Render:
- **name** (title).
- line: `stalenessLabel(contact.staleness(today))`.
- one line per occasion: `${cap(o.name)} ${monthDayLabel(o.anchor)}` (e.g. "Birthday Jun 20"); `cap` = first-letter-upper. (Zero occasions → no line. Generic over `contact.occasions`, so future multi-occasion contacts render too.)
- actions: **Log contact** (`data-act="log"`, single click → `onLog(contact.id)`) + **Delete** (`data-act="delete"` → shared `inlineConfirm` → `onDelete(contact.id)`; restore via `_renderActions`).

`defineContactRow()` idempotent.

### 4. `src/components/oyl-gift-idea-form.js` — `<oyl-gift-idea-form>` (new)

A small add form for the Gift Ideas section. Properties: `store` (VaultStore), `onAdded` (`() => void`).

**Build the DOM once in `render()`** — a guard hint element ("Add a contact first."), an inputs group (text input `name="giftText"` + a contact `<select name="giftContact" aria-label="Contact">` + an Add button + a `[data-role="error"]`). Submit → `new GiftIdea({ text, contactId: Id.of(select.value) })` → `store.addGiftIdea(...)`, reset **only** the text input, call `onAdded`. Empty text → `GiftIdea` throws → caught + shown inline (same pattern as the composer).

**(R8) `this.track()` must NOT recreate the inputs** — it only:
1. toggles the guard hint vs the inputs group by `contacts.length === 0`, and
2. refreshes the `<select>` options from `store.contacts()`, preserving the current selection if that contact still exists (capture `select.value`, rebuild `<option>`s, restore).

This is because `store.contacts()` touches `revision`, so the form re-runs on *any* vault change (even from another tab); rebuilding the text input would wipe a half-typed idea.

`defineGiftIdeaForm()` idempotent.

### 5. `src/components/oyl-vault-composer.js` — add the Contact mode

A fourth segment `contact`. Contact-only fields: **Birthday** (optional date, `name="birthday"`) and **Last contacted** (optional date, `name="lastContacted"`, **no default**). `name` is the shared field (already present). Extend `applyType` to a 4-way switch (`isContact`); contact shows only name + birthday + lastContacted (hide kind/expires, location/warranty/price/purchased, cadence/anchor/category). Add `flex-wrap: wrap` to the `.seg` style (R6).

**(R10) Critical visibility fix:** the shared price control is currently hidden via `priceField.hidden = isDoc` (shown for everything except document). With a Contact mode added, that would wrongly **show the price field in Contact mode** (`isDoc` is false for contacts). Change it to key on the modes that actually use price:
```js
priceField.hidden = !(isPos || isSub)
```
The other conditionals are already self-keyed and stay correct for contact: kind/expires `!isDoc`; location/warranty/purchased `!isPos`; cadence/anchor/category `!isSub` (all hidden in contact mode). Birthday/last-contacted fields are `!isContact`.

Submit branch (`_submit`):
```js
} else { // contact
  const props = /** @type {{ name: string, lastContactedOn?: DayKey, occasions?: {name:string,anchor:DayKey,cadence:Cadence}[] }} */ ({ name: ctx.name.value })
  if (ctx.lastContacted.value) props.lastContactedOn = DayKey.of(ctx.lastContacted.value)
  if (ctx.birthday.value) props.occasions = [{ name: 'birthday', anchor: DayKey.of(ctx.birthday.value), cadence: Cadence.of(1, 'years') }]
  await this.store.addContact(new Contact(props))
}
```
(The three-way `if/else if/else` becomes four-way: `document` / `possession` / `subscription` / else `contact`.) Add `Contact` to the static import (`Cadence`, `DayKey` already imported). Validation stays domain-delegated (empty name → `Contact` throws → caught inline); no new error path.

### 6. `src/components/oyl-vault.js` — Contacts + Gift Ideas sections

After the Subscriptions section, add two sections:
- **Contacts:** `section-label` "Contacts" + an `<ol>` of `<oyl-contact-row>` (one per `store.contacts()`), each wired `today`, `onLog: (id) => { void store.recordContact(id, today); live = 'Logged' }`, `onDelete: (id) => { void store.removeContact(id); live = 'Deleted' }`. Empty: "No contacts yet."
- **Gift ideas:** `section-label` "Gift ideas" + an `<oyl-gift-idea-form>` (`store`, `onAdded → live = 'Added'`) + an `<ol>` of `<oyl-vault-item>` (one per `store.giftIdeas()`): `label = idea.text`, `lines = ['For ' + contactName]`, `onDelete: (id) => { void store.removeGiftIdea(id); live = 'Deleted' }`. Resolve `contactName` from `store.contacts()` by `idea.contactId` → name, falling back to **"Unknown contact"**. Empty: "No gift ideas yet."

Register `defineContactRow()` + `defineGiftIdeaForm()` in `render()`. Repaint both in the existing `this.track()` (a `today` is already computed there for subscriptions; reuse it). Build a `Map(contactId → name)` once per repaint for the gift-idea name lookup.

---

## Data flow

```
add contact (composer Contact segment) → new Contact({name, lastContactedOn?, occasions?}) → store.addContact → persist-first → repaint Contacts + (if birthday) Upcoming feed
Log contact → store.recordContact(id, today) → contact.recordContact in place → persist → re-hydrate → staleness resets to "today"
delete contact → store.removeContact(id) → cascade-delete its gift ideas → delete contact → Contacts + Gift ideas + feed repaint
add gift idea (section form) → new GiftIdea({text, contactId}) → store.addGiftIdea → Gift ideas repaint
delete gift idea → store.removeGiftIdea(id) → repaint
```

## Error handling

- Composer/gift-form validation delegated to the domain (empty contact name, empty gift text both throw and are caught inline). No new error code.
- `recordContact`/cascade-delete failures reject; the screen stays silent on failure (consistent with prior slices). The cascade is best-effort persist-first (negligible localStorage failure risk).

## Testing (Vitest + happy-dom)

- **`format.test.js`** (extend): `stalenessLabel` (undefined → "Never contacted"; 0 → "today"; 1 → "yesterday"; 95 → "3 months ago"); `monthDayLabel(DayKey.of('1990-06-20'))` → "Jun 20"; a `dueInLabel` regression case still passes after the `relativeSpan` refactor.
- **`vault-store.test.js`** (extend): `addContact`/`contacts()`; `recordContact` sets `staleness` to 0; `removeContact` **cascade-deletes the contact's gift ideas but only those** — add two contacts A and B, a gift idea for each, remove A, then assert A and A's idea are gone while B and B's idea survive (guards against a "delete all gift ideas" implementation); `addGiftIdea`/`removeGiftIdea`/`giftIdeas()`.
- **`oyl-contact-row.test.js`** (new): renders name + staleness + a "Birthday …" line; **Log** calls `onLog(id)`; Delete → `confirm-yes` calls `onDelete(id)`, `confirm-no` reverts.
- **`oyl-gift-idea-form.test.js`** (new): with contacts, adds a `GiftIdea` with the selected `contactId` + typed text; empty text shows the inline error and doesn't add; with **zero** contacts, shows the "Add a contact first" hint and the inputs hidden; **(R8)** typed text survives a reassignment of `store` / a `revision` bump (set the text, trigger a repaint by reassigning a store whose `contacts()` changed, assert the text input still holds the value).
- **`oyl-vault-composer.test.js`** (extend): Contact segment builds a `Contact` with `lastContactedOn` and a yearly birthday `occasion`; toggling to Contact shows birthday/last-contacted and hides the other modes' fields.
- **`oyl-vault.test.js`** (extend): Contacts section renders a seeded contact with staleness; Gift ideas section renders a seeded idea as "⟨text⟩ / For ⟨name⟩"; Log advances staleness; deleting a contact removes its gift idea from the Gift ideas section (cascade, end-to-end).

## File structure

```
apps/vanilla-oyl/src/
  vault/format.js                    (modify: relativeSpan refactor + stalenessLabel + monthDayLabel)
  state/vault-store.js               (modify: contact + gift-idea methods, cascade removeContact)
  components/oyl-contact-row.js       (new)
  components/oyl-gift-idea-form.js    (new)
  components/oyl-vault-composer.js    (modify: 4th Contact segment + flex-wrap seg)
  components/oyl-vault.js            (modify: Contacts + Gift ideas sections)
  + new tests for the two new components; extend format/vault-store/composer/vault tests
```

No `data.js`, `oyl-nav.js`, `main.js`, or routing changes — the screen and store already exist and already hydrate contacts + gift-ideas.

## Acceptance

`pnpm vanilla test` green + `pnpm vanilla typecheck` clean, then a real-Chrome pass: seed demo data, open `#/vault`:
- **Contacts** lists **Sam** with a "Last contacted … months ago" staleness (the exact figure drifts with the run date — Sam's seed `lastContactedOn` is fixture-anchored) + "Birthday Jun 20"; **Log contact** flips it to "Last contacted today".
- **Gift ideas** lists "kettle — For Sam".
- Add a contact (name + birthday) → appears in Contacts and (birthday) in the Upcoming feed; add a gift idea for them via the section form → appears under Gift ideas.
- **Delete Sam** → Sam *and* "kettle" both disappear (cascade).
- With no contacts, the Gift ideas form shows "Add a contact first".
