# all-of-oyl Phase 5: Vault — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `vault/` module — the five registries (`Document`, `Possession`, `Subscription`, `Contact`, `GiftIdea`), the shared `Due` contract in core, and the `Vault` root with the unified upcoming feed, gift-idea lookup, and per-currency monthly subscription totals — plus fixtures/seed extension.

**Architecture:** `vault/` imports `core/` only. Anything with a future date implements `core`'s `Due { nextDueOn(asOf) }` — fixed dues (document expiry, warranty) ignore `asOf`; recurring dues (occasions) compute the next occurrence; a subscription's pending renewal is cursor-based (`anchor` + `renewedThrough`) so a lapsed renewal surfaces as a past due date instead of silently skipping. **One sanctioned spec amendment** (Task 3): `Subscription.renew()` returns a plain `SubscriptionCharge` shape, NOT a `Transaction` — the spec's stated return type would force a vault→finance import that the spec's own growth invariant forbids; the import rule outranks the convenience, and the caller (app/test) converts the charge.

**Tech Stack:** TypeScript 5 strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest 4, zero runtime dependencies. Phases 1–4 (merged on `master`) provide everything imported here.

**Read first:** `docs/superpowers/specs/2026-06-11-all-of-oyl-domain-core-design.md` — sections "Vault: registries of what you have", "The two unifying contracts" (#2, dues), and the `Cadence` bullet (anchor-based recurrence). Reference code: `core/cadence.ts` (`nextOnOrAfter`), `user/user.ts` (the tolerant-reader template every registry copies), `plan/planner.ts` (the aggregate-root pattern).

**Working conventions (same as phases 1–4):** TDD per task; `let caught: unknown` capture; run from repo root; kebab-case files, named exports, colocated tests; conditional spreads for optional props (`delete` to clear; explicit `undefined` as an *argument* is fine).

---

### Task 1: `Due` contract + Document

**Files:**
- Create: `packages/all-of-oyl/src/core/due.ts`
- Create: `packages/all-of-oyl/src/vault/document.ts`
- Test: `packages/all-of-oyl/src/vault/document.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/vault/document.test.ts
import { describe, expect, it } from 'vitest'
import { Document } from './document'
import { DayKey } from '../core/day-key'
import { Id } from '../core/id'
import { DomainError } from '../core/domain-error'

const day = (s: string) => DayKey.of(s)

describe('Document', () => {
  it('constructs with name, kind, optional expiry', () => {
    const passport = new Document({ name: 'Passport', kind: 'passport', expiresOn: day('2026-09-01') })
    expect(passport.name).toBe('Passport')
    expect(passport.kind).toBe('passport')
    expect(Id.of(passport.id)).toBe(passport.id)
  })

  it('rejects empty name or kind', () => {
    for (const props of [
      { name: '', kind: 'passport' },
      { name: 'Passport', kind: '' },
    ]) {
      let caught: unknown
      try {
        new Document(props)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
    }
  })

  it('a fixed due: nextDueOn returns the expiry regardless of asOf; undefined without one', () => {
    const passport = new Document({ name: 'Passport', kind: 'passport', expiresOn: day('2026-09-01') })
    expect(passport.nextDueOn(day('2026-06-01'))?.value).toBe('2026-09-01')
    expect(passport.nextDueOn(day('2030-01-01'))?.value).toBe('2026-09-01') // expired docs still report their expiry
    expect(new Document({ name: 'Will', kind: 'legal' }).nextDueOn(day('2026-06-01'))).toBeUndefined()
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const shape = { id: '00000000-0000-4000-8000-000000002000', name: 'Passport', kind: 'passport', expiresOn: '2026-09-01', futureField: 14 }
    expect(Document.fromJSON(shape).toJSON()).toEqual(shape)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [null, { name: 'x', kind: 'y' }, { id: 'nope', name: 'x', kind: 'y' }, { id: '00000000-0000-4000-8000-000000002000', name: 'x', kind: 'y', expiresOn: 'garbage' }]) {
      let caught: unknown
      try {
        Document.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/vault/document.test.ts`
Expected: FAIL — cannot resolve `./document`.

- [ ] **Step 3: Implement Due + Document**

```ts
// packages/all-of-oyl/src/core/due.ts
import type { DayKey } from './day-key'

/**
 * Anything with a future obligation. `asOf` exists because recurring dues
 * (birthdays, renewals) have no single due date — only a next occurrence
 * relative to a day; fixed dues (a document's expiry) simply ignore it.
 * Named nextDueOn (not dueOn) so it never collides with planner.dueOn(day).
 */
export interface Due {
  nextDueOn(asOf: DayKey): DayKey | undefined
}
```

```ts
// packages/all-of-oyl/src/vault/document.ts
import { DayKey } from '../core/day-key'
import { DomainError } from '../core/domain-error'
import type { Due } from '../core/due'
import { Id } from '../core/id'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta'

/** An important record — passport, insurance policy, warranty paper, will. */
export class Document implements Due {
  readonly id: Id
  readonly name: string
  /** What sort of document this is (passport/insurance/warranty/...), free-form. */
  readonly kind: string
  readonly expiresOn?: DayKey
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(props: { id?: Id; name: string; kind: string; expiresOn?: DayKey }, extra: Record<string, unknown> = {}) {
    if (props.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'name must be non-empty')
    if (props.kind.length === 0) throw new DomainError('INVALID_QUANTITY', 'kind must be non-empty')
    this.id = props.id ?? Id.create()
    this.name = props.name
    this.kind = props.kind
    if (props.expiresOn !== undefined) this.expiresOn = props.expiresOn
    this.extra = extra
  }

  /** Fixed due: the expiry, regardless of asOf — an expired document still reports it. */
  nextDueOn(_asOf: DayKey): DayKey | undefined {
    return this.expiresOn
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      name: this.name,
      kind: this.kind,
      ...(this.expiresOn !== undefined ? { expiresOn: this.expiresOn.value } : {}),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): Document {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a Document shape')
    }
    const { id, name, kind, expiresOn, meta, ...extra } = shape as Record<string, unknown>
    if (typeof id !== 'string' || typeof name !== 'string' || typeof kind !== 'string' || (expiresOn !== undefined && typeof expiresOn !== 'string')) {
      throw new DomainError('MALFORMED_JSON', 'not a Document shape')
    }
    try {
      const doc = new Document(
        { id: Id.of(id), name, kind, ...(expiresOn !== undefined ? { expiresOn: DayKey.of(expiresOn) } : {}) },
        extra,
      )
      if (meta !== undefined) doc.meta = metaFromJSON(meta)
      return doc
    } catch (e) {
      if (e instanceof DomainError && e.code !== 'MALFORMED_JSON') {
        throw new DomainError('MALFORMED_JSON', 'not a Document shape')
      }
      throw e
    }
  }
}
```

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/vault/document.test.ts` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/core/due.ts packages/all-of-oyl/src/vault/document.ts packages/all-of-oyl/src/vault/document.test.ts
git commit -m "feat(all-of-oyl): Due contract + Document registry"
```

---

### Task 2: Possession + GiftIdea

**Files:**
- Create: `packages/all-of-oyl/src/vault/possession.ts`
- Create: `packages/all-of-oyl/src/vault/gift-idea.ts`
- Test: `packages/all-of-oyl/src/vault/possession.test.ts`
- Test: `packages/all-of-oyl/src/vault/gift-idea.test.ts`

- [ ] **Step 1: Write the failing Possession test**

```ts
// packages/all-of-oyl/src/vault/possession.test.ts
import { describe, expect, it } from 'vitest'
import { Possession } from './possession'
import { DayKey } from '../core/day-key'
import { Id } from '../core/id'
import { Money } from '../core/money'
import { DomainError } from '../core/domain-error'

const day = (s: string) => DayKey.of(s)

describe('Possession', () => {
  it('constructs with optional location, warranty, and purchase info', () => {
    const machine = new Possession({
      name: 'Espresso machine',
      location: 'Kitchen',
      warrantyUntil: day('2026-07-01'),
      purchasePrice: Money.usd(64900),
      purchasedOn: day('2025-07-01'),
    })
    expect(machine.name).toBe('Espresso machine')
    expect(machine.purchasePrice?.equals(Money.usd(64900))).toBe(true)
  })

  it('warranty expiry is its fixed due; none without a warranty', () => {
    const machine = new Possession({ name: 'Espresso machine', warrantyUntil: day('2026-07-01') })
    expect(machine.nextDueOn(day('2026-06-01'))?.value).toBe('2026-07-01')
    expect(new Possession({ name: 'Couch' }).nextDueOn(day('2026-06-01'))).toBeUndefined()
  })

  it('rejects an empty name', () => {
    let caught: unknown
    try {
      new Possession({ name: '' })
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const shape = {
      id: '00000000-0000-4000-8000-000000002010',
      name: 'Espresso machine',
      location: 'Kitchen',
      warrantyUntil: '2026-07-01',
      purchasePrice: { minor: 64900, currency: 'USD', exponent: 2 },
      purchasedOn: '2025-07-01',
      futureField: 15,
    }
    expect(Possession.fromJSON(shape).toJSON()).toEqual(shape)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [null, { id: 'nope', name: 'x' }, { id: '00000000-0000-4000-8000-000000002010', name: 'x', purchasePrice: { minor: 'lots' } }]) {
      let caught: unknown
      try {
        Possession.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
```

Run: `pnpm --filter @oyl/all-of-oyl test -- src/vault/possession.test.ts` → FAIL.

- [ ] **Step 2: Implement Possession**

```ts
// packages/all-of-oyl/src/vault/possession.ts
import { DayKey } from '../core/day-key'
import { DomainError } from '../core/domain-error'
import type { Due } from '../core/due'
import { Id } from '../core/id'
import { Money } from '../core/money'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta'

/**
 * Something you own. Upkeep is NOT a vault concept — it's a recurring Task
 * carrying the possessionId (one recurrence-of-duty mechanism). The warranty
 * expiry is this item's fixed due.
 */
export class Possession implements Due {
  readonly id: Id
  readonly name: string
  readonly location?: string
  readonly warrantyUntil?: DayKey
  readonly purchasePrice?: Money
  readonly purchasedOn?: DayKey
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: { id?: Id; name: string; location?: string; warrantyUntil?: DayKey; purchasePrice?: Money; purchasedOn?: DayKey },
    extra: Record<string, unknown> = {},
  ) {
    if (props.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'name must be non-empty')
    this.id = props.id ?? Id.create()
    this.name = props.name
    if (props.location !== undefined) this.location = props.location
    if (props.warrantyUntil !== undefined) this.warrantyUntil = props.warrantyUntil
    if (props.purchasePrice !== undefined) this.purchasePrice = props.purchasePrice
    if (props.purchasedOn !== undefined) this.purchasedOn = props.purchasedOn
    this.extra = extra
  }

  /** Fixed due: the warranty expiry. */
  nextDueOn(_asOf: DayKey): DayKey | undefined {
    return this.warrantyUntil
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      name: this.name,
      ...(this.location !== undefined ? { location: this.location } : {}),
      ...(this.warrantyUntil !== undefined ? { warrantyUntil: this.warrantyUntil.value } : {}),
      ...(this.purchasePrice !== undefined ? { purchasePrice: this.purchasePrice.toJSON() } : {}),
      ...(this.purchasedOn !== undefined ? { purchasedOn: this.purchasedOn.value } : {}),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): Possession {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a Possession shape')
    }
    const { id, name, location, warrantyUntil, purchasePrice, purchasedOn, meta, ...extra } = shape as Record<string, unknown>
    if (
      typeof id !== 'string' ||
      typeof name !== 'string' ||
      (location !== undefined && typeof location !== 'string') ||
      (warrantyUntil !== undefined && typeof warrantyUntil !== 'string') ||
      (purchasedOn !== undefined && typeof purchasedOn !== 'string')
    ) {
      throw new DomainError('MALFORMED_JSON', 'not a Possession shape')
    }
    try {
      const item = new Possession(
        {
          id: Id.of(id),
          name,
          ...(location !== undefined ? { location } : {}),
          ...(warrantyUntil !== undefined ? { warrantyUntil: DayKey.of(warrantyUntil) } : {}),
          ...(purchasePrice !== undefined ? { purchasePrice: Money.fromJSON(purchasePrice) } : {}),
          ...(purchasedOn !== undefined ? { purchasedOn: DayKey.of(purchasedOn) } : {}),
        },
        extra,
      )
      if (meta !== undefined) item.meta = metaFromJSON(meta)
      return item
    } catch (e) {
      if (e instanceof DomainError && e.code !== 'MALFORMED_JSON') {
        throw new DomainError('MALFORMED_JSON', 'not a Possession shape')
      }
      throw e
    }
  }
}
```

Run: `pnpm --filter @oyl/all-of-oyl test -- src/vault/possession.test.ts` → PASS.

- [ ] **Step 3: Write the failing GiftIdea test, then implement**

```ts
// packages/all-of-oyl/src/vault/gift-idea.test.ts
import { describe, expect, it } from 'vitest'
import { GiftIdea } from './gift-idea'
import { Id } from '../core/id'
import { DomainError } from '../core/domain-error'

const contactId = Id.of('00000000-0000-4000-8000-000000002030')

describe('GiftIdea', () => {
  it('constructs with text and a contact link', () => {
    const idea = new GiftIdea({ text: 'Pour-over kettle', contactId })
    expect(idea.text).toBe('Pour-over kettle')
    expect(idea.contactId).toBe(contactId)
    expect(Id.of(idea.id)).toBe(idea.id)
  })

  it('rejects empty text', () => {
    let caught: unknown
    try {
      new GiftIdea({ text: '', contactId })
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const shape = { id: '00000000-0000-4000-8000-000000002040', text: 'Pour-over kettle', contactId: contactId as string, futureField: 16 }
    expect(GiftIdea.fromJSON(shape).toJSON()).toEqual(shape)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [null, { text: 'x' }, { id: '00000000-0000-4000-8000-000000002040', text: 'x', contactId: 'nope' }]) {
      let caught: unknown
      try {
        GiftIdea.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
```

Run → FAIL, then implement:

```ts
// packages/all-of-oyl/src/vault/gift-idea.ts
import { DomainError } from '../core/domain-error'
import { Id } from '../core/id'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta'

/** A gift thought, tied to a contact; surfaces alongside their next occasion. */
export class GiftIdea {
  readonly id: Id
  readonly text: string
  readonly contactId: Id
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(props: { id?: Id; text: string; contactId: Id }, extra: Record<string, unknown> = {}) {
    if (props.text.length === 0) throw new DomainError('INVALID_QUANTITY', 'text must be non-empty')
    this.id = props.id ?? Id.create()
    this.text = props.text
    this.contactId = props.contactId
    this.extra = extra
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      text: this.text,
      contactId: this.contactId,
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): GiftIdea {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a GiftIdea shape')
    }
    const { id, text, contactId, meta, ...extra } = shape as Record<string, unknown>
    if (typeof id !== 'string' || typeof text !== 'string' || typeof contactId !== 'string') {
      throw new DomainError('MALFORMED_JSON', 'not a GiftIdea shape')
    }
    try {
      const idea = new GiftIdea({ id: Id.of(id), text, contactId: Id.of(contactId) }, extra)
      if (meta !== undefined) idea.meta = metaFromJSON(meta)
      return idea
    } catch (e) {
      if (e instanceof DomainError && e.code !== 'MALFORMED_JSON') {
        throw new DomainError('MALFORMED_JSON', 'not a GiftIdea shape')
      }
      throw e
    }
  }
}
```

- [ ] **Step 4: Run + typecheck, then commit**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/vault` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

```bash
git add packages/all-of-oyl/src/vault/possession.ts packages/all-of-oyl/src/vault/possession.test.ts packages/all-of-oyl/src/vault/gift-idea.ts packages/all-of-oyl/src/vault/gift-idea.test.ts
git commit -m "feat(all-of-oyl): Possession and GiftIdea registries"
```

---

### Task 3: Subscription (cursor-based renewals + the charge amendment)

**Files:**
- Create: `packages/all-of-oyl/src/vault/subscription.ts`
- Test: `packages/all-of-oyl/src/vault/subscription.test.ts`
- Modify: `docs/superpowers/specs/2026-06-11-all-of-oyl-domain-core-design.md` (the renew() return type amendment)

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/vault/subscription.test.ts
import { describe, expect, it } from 'vitest'
import { Subscription } from './subscription'
import { Cadence } from '../core/cadence'
import { DayKey } from '../core/day-key'
import { Id } from '../core/id'
import { Money } from '../core/money'
import { DomainError } from '../core/domain-error'

const day = (s: string) => DayKey.of(s)

function netflix(renewedThrough?: string): Subscription {
  return new Subscription({
    name: 'Netflix',
    amount: Money.usd(1599),
    cadence: Cadence.of(1, 'months'),
    anchor: day('2026-01-15'),
    ...(renewedThrough !== undefined ? { renewedThrough: day(renewedThrough) } : {}),
    category: 'streaming',
  })
}

describe('Subscription', () => {
  it('the pending occurrence is anchor-derived: never renewed → the anchor itself', () => {
    expect(netflix().nextDueOn(day('2026-06-01'))?.value).toBe('2026-01-15')
  })

  it('the cursor advances along anchored occurrences (31st-style anchors never drift)', () => {
    const sub = netflix('2026-05-15')
    expect(sub.nextDueOn(day('2026-06-01'))?.value).toBe('2026-06-15')
  })

  it('a lapsed subscription surfaces its overdue occurrence — never skips to next month', () => {
    const gym = new Subscription({
      name: 'Gym',
      amount: Money.usd(4000),
      cadence: Cadence.of(1, 'months'),
      anchor: day('2026-01-01'),
      renewedThrough: day('2026-04-01'),
      category: 'fitness',
    })
    // pending is May 1 even when asked in June — lapsed, visible, honest
    expect(gym.nextDueOn(day('2026-06-01'))?.value).toBe('2026-05-01')
  })

  it('renew() moves the cursor to the pending occurrence and returns a charge for the caller to journal', () => {
    const accountId = Id.of('00000000-0000-4000-8000-000000000032')
    const sub = new Subscription({
      name: 'Netflix',
      amount: Money.usd(1599),
      cadence: Cadence.of(1, 'months'),
      anchor: day('2026-01-15'),
      renewedThrough: day('2026-05-15'),
      category: 'streaming',
      accountId,
    })
    const charge = sub.renew(day('2026-06-16')) // paid a day late
    expect(charge.amount.equals(Money.usd(1599))).toBe(true)
    expect(charge.category).toBe('streaming')
    expect(charge.direction).toBe('expense')
    expect(charge.accountId).toBe(accountId)
    expect(charge.on.value).toBe('2026-06-16')
    // late renewal does NOT drift the schedule: cursor sits on the anchored occurrence
    expect(sub.renewedThrough?.value).toBe('2026-06-15')
    expect(sub.nextDueOn(day('2026-06-16'))?.value).toBe('2026-07-15')
  })

  it('validates construction', () => {
    const base = { name: 'X', amount: Money.usd(100), cadence: Cadence.of(1, 'months'), anchor: day('2026-01-01'), category: 'streaming' }
    const cases: [() => unknown, string][] = [
      [() => new Subscription({ ...base, name: '' }), 'INVALID_QUANTITY'],
      [() => new Subscription({ ...base, amount: Money.usd(0) }), 'INVALID_QUANTITY'],
      [() => new Subscription({ ...base, amount: Money.usd(-100) }), 'INVALID_QUANTITY'],
      [() => new Subscription({ ...base, category: 'two words' }), 'INVALID_SLUG'],
      [() => new Subscription({ ...base, renewedThrough: day('2025-12-01') }), 'INVALID_RANGE'], // cursor before anchor
    ]
    for (const [build, code] of cases) {
      let caught: unknown
      try {
        build()
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe(code)
    }
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const sub = new Subscription({
      id: Id.of('00000000-0000-4000-8000-000000002020'),
      name: 'Netflix',
      amount: Money.usd(1599),
      cadence: Cadence.of(1, 'months'),
      anchor: day('2026-01-15'),
      renewedThrough: day('2026-05-15'),
      category: 'streaming',
    })
    const revived = Subscription.fromJSON({ ...sub.toJSON(), futureField: 17 })
    expect(revived.nextDueOn(day('2026-06-01'))?.value).toBe('2026-06-15')
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(17)
    expect(Subscription.fromJSON(revived.toJSON()).toJSON()).toEqual(revived.toJSON())
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [null, { id: '00000000-0000-4000-8000-000000002020', name: 'X' }, { id: '00000000-0000-4000-8000-000000002020', name: 'X', amount: Money.usd(1).toJSON(), cadence: { n: 1, unit: 'months' }, anchor: 'garbage', category: 'streaming' }]) {
      let caught: unknown
      try {
        Subscription.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/vault/subscription.test.ts`
Expected: FAIL — cannot resolve `./subscription`.

- [ ] **Step 3: Implement Subscription**

```ts
// packages/all-of-oyl/src/vault/subscription.ts
import { Cadence } from '../core/cadence'
import { DayKey } from '../core/day-key'
import { DomainError } from '../core/domain-error'
import type { Due } from '../core/due'
import { Id } from '../core/id'
import { Money } from '../core/money'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta'
import { assertSlug } from '../core/slug'

/**
 * What renew() hands the caller — the data a Transaction needs, as a plain
 * shape. Vault never imports finance types (the import rule outranks the
 * convenience); the app or barrel converts a charge into a Transaction and
 * adds it to the Journal.
 */
export type SubscriptionCharge = {
  amount: Money
  category: string
  direction: 'expense'
  accountId?: Id
  on: DayKey
}

/**
 * A recurring bill. Calendar cadence: occurrences are anchor-derived (a
 * schedule anchored on the 15th stays on the 15th; late renewals never
 * drift it), and the renewedThrough cursor makes a lapsed renewal surface
 * as a PAST pending date instead of silently skipping ahead.
 */
export class Subscription implements Due {
  readonly id: Id
  readonly name: string
  readonly amount: Money
  readonly cadence: Cadence
  readonly anchor: DayKey
  readonly category: string
  readonly accountId?: Id
  /** Cursor: the last occurrence already paid. Mutates via renew(). */
  private renewedThroughDay?: DayKey
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: {
      id?: Id
      name: string
      amount: Money
      cadence: Cadence
      anchor: DayKey
      renewedThrough?: DayKey
      category: string
      accountId?: Id
    },
    extra: Record<string, unknown> = {},
  ) {
    if (props.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'name must be non-empty')
    if (props.amount.minor <= 0) throw new DomainError('INVALID_QUANTITY', 'amount must be positive')
    if (props.renewedThrough !== undefined && props.renewedThrough.compare(props.anchor) < 0) {
      throw new DomainError('INVALID_RANGE', `renewedThrough ${props.renewedThrough.value} precedes anchor ${props.anchor.value}`)
    }
    this.id = props.id ?? Id.create()
    this.name = props.name
    this.amount = props.amount
    this.cadence = props.cadence
    this.anchor = props.anchor
    this.category = assertSlug(props.category)
    if (props.accountId !== undefined) this.accountId = props.accountId
    if (props.renewedThrough !== undefined) this.renewedThroughDay = props.renewedThrough
    this.extra = extra
  }

  get renewedThrough(): DayKey | undefined {
    return this.renewedThroughDay
  }

  /** The first anchored occurrence after the cursor (the anchor itself if never renewed). */
  private pendingRenewal(): DayKey {
    if (this.renewedThroughDay === undefined) return this.anchor
    return this.cadence.nextOnOrAfter(this.anchor, this.renewedThroughDay.addDays(1))
  }

  /** Returns the pending occurrence EVEN WHEN PAST — a lapsed renewal must surface as overdue. */
  nextDueOn(_asOf: DayKey): DayKey | undefined {
    return this.pendingRenewal()
  }

  /** Pay the pending occurrence on `on`; the cursor stays anchored, so late payments never drift the schedule. */
  renew(on: DayKey): SubscriptionCharge {
    this.renewedThroughDay = this.pendingRenewal()
    return {
      amount: this.amount,
      category: this.category,
      direction: 'expense',
      ...(this.accountId !== undefined ? { accountId: this.accountId } : {}),
      on,
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      name: this.name,
      amount: this.amount.toJSON(),
      cadence: this.cadence.toJSON(),
      anchor: this.anchor.value,
      ...(this.renewedThroughDay !== undefined ? { renewedThrough: this.renewedThroughDay.value } : {}),
      category: this.category,
      ...(this.accountId !== undefined ? { accountId: this.accountId } : {}),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): Subscription {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a Subscription shape')
    }
    const { id, name, amount, cadence, anchor, renewedThrough, category, accountId, meta, ...extra } = shape as Record<string, unknown>
    if (
      typeof id !== 'string' ||
      typeof name !== 'string' ||
      amount === undefined ||
      cadence === undefined ||
      typeof anchor !== 'string' ||
      (renewedThrough !== undefined && typeof renewedThrough !== 'string') ||
      typeof category !== 'string' ||
      (accountId !== undefined && typeof accountId !== 'string')
    ) {
      throw new DomainError('MALFORMED_JSON', 'not a Subscription shape')
    }
    try {
      const sub = new Subscription(
        {
          id: Id.of(id),
          name,
          amount: Money.fromJSON(amount),
          cadence: Cadence.fromJSON(cadence),
          anchor: DayKey.of(anchor),
          ...(renewedThrough !== undefined ? { renewedThrough: DayKey.of(renewedThrough) } : {}),
          category,
          ...(accountId !== undefined ? { accountId: Id.of(accountId) } : {}),
        },
        extra,
      )
      if (meta !== undefined) sub.meta = metaFromJSON(meta)
      return sub
    } catch (e) {
      if (e instanceof DomainError && e.code !== 'MALFORMED_JSON') {
        throw new DomainError('MALFORMED_JSON', 'not a Subscription shape')
      }
      throw e
    }
  }
}
```

- [ ] **Step 4: Amend the spec (sanctioned)**

In `docs/superpowers/specs/2026-06-11-all-of-oyl-domain-core-design.md`, in the Vault section's `Subscription` bullet, replace the fragment:

`` `renew(on: DayKey)` moves the cursor to the pending occurrence (anchor-derived, so late renewals never drift the schedule) and returns a `Transaction` (dated `on`, charged to `accountId`) for the caller to add to the Journal ``

with:

`` `renew(on: DayKey)` moves the cursor to the pending occurrence (anchor-derived, so late renewals never drift the schedule) and returns a `SubscriptionCharge` — a plain shape carrying amount/category/direction/accountId/on. It is NOT a `Transaction`: vault never imports finance types (the import rule outranks the convenience); the app converts the charge into a `Transaction` (dated `on`, charged to `accountId`) and adds it to the Journal ``

- [ ] **Step 5: Run + typecheck, then commit**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/vault/subscription.test.ts` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

```bash
git add packages/all-of-oyl/src/vault/subscription.ts packages/all-of-oyl/src/vault/subscription.test.ts docs/superpowers/specs/2026-06-11-all-of-oyl-domain-core-design.md
git commit -m "feat(all-of-oyl): Subscription with anchored cursor; renew returns a charge (spec amendment)"
```

---

### Task 4: Contact (occasions + staleness)

**Files:**
- Create: `packages/all-of-oyl/src/vault/contact.ts`
- Test: `packages/all-of-oyl/src/vault/contact.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/vault/contact.test.ts
import { describe, expect, it } from 'vitest'
import { Contact } from './contact'
import { Cadence } from '../core/cadence'
import { DayKey } from '../core/day-key'
import { Id } from '../core/id'
import { DomainError } from '../core/domain-error'

const day = (s: string) => DayKey.of(s)

describe('Contact', () => {
  it('constructs with occasions and tracks last contact', () => {
    const sam = new Contact({
      name: 'Sam',
      lastContactedOn: day('2026-02-26'),
      occasions: [{ name: 'birthday', anchor: day('1990-06-20'), cadence: Cadence.of(1, 'years') }],
    })
    expect(sam.name).toBe('Sam')
    expect(sam.occasions).toHaveLength(1)
    expect(Id.of(sam.id)).toBe(sam.id)
  })

  it("an occasion's next due is its next anchored occurrence on or after asOf", () => {
    const sam = new Contact({ name: 'Sam', occasions: [{ name: 'birthday', anchor: day('1990-06-20'), cadence: Cadence.of(1, 'years') }] })
    expect(sam.nextDueOn(day('2026-06-01'))?.value).toBe('2026-06-20')
    expect(sam.nextDueOn(day('2026-06-21'))?.value).toBe('2027-06-20') // already passed this year
  })

  it('with several occasions the earliest upcoming wins; none → undefined', () => {
    const sam = new Contact({
      name: 'Sam',
      occasions: [
        { name: 'birthday', anchor: day('1990-06-20'), cadence: Cadence.of(1, 'years') },
        { name: 'anniversary', anchor: day('2015-06-10'), cadence: Cadence.of(1, 'years') },
      ],
    })
    expect(sam.nextDueOn(day('2026-06-01'))?.value).toBe('2026-06-10')
    expect(new Contact({ name: 'Pat' }).nextDueOn(day('2026-06-01'))).toBeUndefined()
  })

  it('leap-day birthdays clamp in common years', () => {
    const leapling = new Contact({ name: 'Leap', occasions: [{ name: 'birthday', anchor: day('1992-02-29'), cadence: Cadence.of(1, 'years') }] })
    expect(leapling.nextDueOn(day('2026-01-01'))?.value).toBe('2026-02-28')
    expect(leapling.nextDueOn(day('2028-01-01'))?.value).toBe('2028-02-29')
  })

  it('staleness counts days since last contact; undefined when never contacted', () => {
    const sam = new Contact({ name: 'Sam', lastContactedOn: day('2026-02-26') })
    expect(sam.staleness(day('2026-06-01'))).toBe(95)
    expect(new Contact({ name: 'Pat' }).staleness(day('2026-06-01'))).toBeUndefined()
    sam.recordContact(day('2026-05-30'))
    expect(sam.staleness(day('2026-06-01'))).toBe(2)
  })

  it('validates occasion names and rejects empty contact names', () => {
    let caught1: unknown
    try {
      new Contact({ name: '' })
    } catch (e) {
      caught1 = e
    }
    expect((caught1 as DomainError)?.code).toBe('INVALID_QUANTITY')

    let caught2: unknown
    try {
      new Contact({ name: 'Sam', occasions: [{ name: '', anchor: day('1990-06-20'), cadence: Cadence.of(1, 'years') }] })
    } catch (e) {
      caught2 = e
    }
    expect((caught2 as DomainError)?.code).toBe('INVALID_QUANTITY')
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const sam = new Contact({
      id: Id.of('00000000-0000-4000-8000-000000002030'),
      name: 'Sam',
      lastContactedOn: day('2026-02-26'),
      occasions: [{ name: 'birthday', anchor: day('1990-06-20'), cadence: Cadence.of(1, 'years') }],
    })
    const revived = Contact.fromJSON({ ...sam.toJSON(), futureField: 18 })
    expect(revived.nextDueOn(day('2026-06-01'))?.value).toBe('2026-06-20')
    expect(revived.staleness(day('2026-06-01'))).toBe(95)
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(18)
    expect(Contact.fromJSON(revived.toJSON()).toJSON()).toEqual(revived.toJSON())
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [null, { name: 'Sam' }, { id: '00000000-0000-4000-8000-000000002030', name: 'Sam', occasions: [{ name: 'b', anchor: 'garbage', cadence: { n: 1, unit: 'years' } }] }]) {
      let caught: unknown
      try {
        Contact.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/vault/contact.test.ts`
Expected: FAIL — cannot resolve `./contact`.

- [ ] **Step 3: Implement Contact**

```ts
// packages/all-of-oyl/src/vault/contact.ts
import { Cadence } from '../core/cadence'
import { DayKey } from '../core/day-key'
import { DomainError } from '../core/domain-error'
import type { Due } from '../core/due'
import { Id } from '../core/id'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta'

/** A recurring date that matters: birthday = anchor day + yearly cadence. */
export type Occasion = { name: string; anchor: DayKey; cadence: Cadence }

/**
 * A person you care about. Occasions are recurring dues (next occurrence
 * relative to asOf — anchored, so Feb-29 birthdays clamp correctly);
 * staleness powers "you haven't talked to Sam in 3 months" nudges.
 */
export class Contact implements Due {
  readonly id: Id
  readonly name: string
  readonly occasions: readonly Occasion[]
  private lastContactedDay?: DayKey
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: { id?: Id; name: string; lastContactedOn?: DayKey; occasions?: readonly Occasion[] },
    extra: Record<string, unknown> = {},
  ) {
    if (props.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'name must be non-empty')
    for (const occasion of props.occasions ?? []) {
      if (occasion.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'occasion name must be non-empty')
    }
    this.id = props.id ?? Id.create()
    this.name = props.name
    this.occasions = (props.occasions ?? []).map((o) => ({ ...o }))
    if (props.lastContactedOn !== undefined) this.lastContactedDay = props.lastContactedOn
    this.extra = extra
  }

  get lastContactedOn(): DayKey | undefined {
    return this.lastContactedDay
  }

  recordContact(on: DayKey): void {
    this.lastContactedDay = on
  }

  /** Days since last contact as of `day`; undefined when never contacted. */
  staleness(day: DayKey): number | undefined {
    if (this.lastContactedDay === undefined) return undefined
    return Math.round(
      (Date.parse(`${day.value}T00:00:00Z`) - Date.parse(`${this.lastContactedDay.value}T00:00:00Z`)) / 86_400_000,
    )
  }

  /** The earliest upcoming occasion on or after asOf; undefined with no occasions. */
  nextDueOn(asOf: DayKey): DayKey | undefined {
    let earliest: DayKey | undefined
    for (const occasion of this.occasions) {
      const next = occasion.cadence.nextOnOrAfter(occasion.anchor, asOf)
      if (earliest === undefined || next.compare(earliest) < 0) earliest = next
    }
    return earliest
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      name: this.name,
      ...(this.lastContactedDay !== undefined ? { lastContactedOn: this.lastContactedDay.value } : {}),
      ...(this.occasions.length > 0
        ? { occasions: this.occasions.map((o) => ({ name: o.name, anchor: o.anchor.value, cadence: o.cadence.toJSON() })) }
        : {}),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): Contact {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a Contact shape')
    }
    const { id, name, lastContactedOn, occasions, meta, ...extra } = shape as Record<string, unknown>
    if (
      typeof id !== 'string' ||
      typeof name !== 'string' ||
      (lastContactedOn !== undefined && typeof lastContactedOn !== 'string') ||
      (occasions !== undefined && !Array.isArray(occasions))
    ) {
      throw new DomainError('MALFORMED_JSON', 'not a Contact shape')
    }
    try {
      const parsedOccasions: Occasion[] = (occasions ?? []).map((raw: unknown) => {
        const o = raw as { name?: unknown; anchor?: unknown; cadence?: unknown }
        if (typeof o?.name !== 'string' || typeof o?.anchor !== 'string' || o?.cadence === undefined) {
          throw new DomainError('MALFORMED_JSON', 'bad occasion')
        }
        return { name: o.name, anchor: DayKey.of(o.anchor), cadence: Cadence.fromJSON(o.cadence) }
      })
      const contact = new Contact(
        {
          id: Id.of(id),
          name,
          ...(lastContactedOn !== undefined ? { lastContactedOn: DayKey.of(lastContactedOn) } : {}),
          ...(parsedOccasions.length > 0 ? { occasions: parsedOccasions } : {}),
        },
        extra,
      )
      if (meta !== undefined) contact.meta = metaFromJSON(meta)
      return contact
    } catch (e) {
      if (e instanceof DomainError && e.code !== 'MALFORMED_JSON') {
        throw new DomainError('MALFORMED_JSON', 'not a Contact shape')
      }
      throw e
    }
  }
}
```

- [ ] **Step 4: Run + typecheck, then commit**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/vault/contact.test.ts` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

```bash
git add packages/all-of-oyl/src/vault/contact.ts packages/all-of-oyl/src/vault/contact.test.ts
git commit -m "feat(all-of-oyl): Contact with recurring occasions and staleness"
```

---

### Task 5: Vault root

**Files:**
- Create: `packages/all-of-oyl/src/vault/vault.ts`
- Test: `packages/all-of-oyl/src/vault/vault.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/vault/vault.test.ts
import { describe, expect, it } from 'vitest'
import { Vault } from './vault'
import { Document } from './document'
import { Possession } from './possession'
import { Subscription } from './subscription'
import { Contact } from './contact'
import { GiftIdea } from './gift-idea'
import { Cadence } from '../core/cadence'
import { DayKey } from '../core/day-key'
import { DayRange } from '../core/day-range'
import { Id } from '../core/id'
import { Money } from '../core/money'
import { DomainError } from '../core/domain-error'

const day = (s: string) => DayKey.of(s)
const range = (a: string, b: string) => DayRange.of(day(a), day(b))

function loadedVault() {
  const vault = new Vault()
  const passport = new Document({ name: 'Passport', kind: 'passport', expiresOn: day('2026-08-30') })
  const machine = new Possession({ name: 'Espresso machine', warrantyUntil: day('2026-07-01') })
  const netflix = new Subscription({
    name: 'Netflix', amount: Money.usd(1599), cadence: Cadence.of(1, 'months'),
    anchor: day('2026-01-15'), renewedThrough: day('2026-05-15'), category: 'streaming',
  })
  const sam = new Contact({ name: 'Sam', occasions: [{ name: 'birthday', anchor: day('1990-06-20'), cadence: Cadence.of(1, 'years') }] })
  const kettle = new GiftIdea({ text: 'Pour-over kettle', contactId: sam.id })
  vault.addDocument(passport)
  vault.addPossession(machine)
  vault.addSubscription(netflix)
  vault.addContact(sam)
  vault.addGiftIdea(kettle)
  return { vault, passport, machine, netflix, sam, kettle }
}

describe('Vault', () => {
  it('strict adds and idempotent removes per registry', () => {
    const { vault, passport, sam } = loadedVault()
    let caught: unknown
    try {
      vault.addDocument(passport)
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('DUPLICATE_ID')
    vault.removeDocument(passport.id)
    vault.removeDocument(passport.id) // no-op
    expect(vault.documents()).toHaveLength(0)
    expect(vault.contacts().map((c) => c.id)).toEqual([sam.id])
  })

  it('upcoming() unifies every registry into one sorted feed', () => {
    const { vault, passport, machine, netflix, sam } = loadedVault()
    const feed = vault.upcoming(range('2026-06-01', '2026-09-30'))
    expect(feed.map((d) => [d.due.value, d.label])).toEqual([
      ['2026-06-15', 'Netflix'],
      ['2026-06-20', 'Sam — birthday'],
      ['2026-07-01', 'Espresso machine (warranty)'],
      ['2026-08-30', 'Passport'],
    ])
    expect(feed.map((d) => d.itemId)).toEqual([netflix.id, sam.id, machine.id, passport.id])
  })

  it('upcoming() excludes dues outside the range (lapsed pendings surface via nextDueOn, not the feed)', () => {
    const { vault } = loadedVault()
    const gym = new Subscription({
      name: 'Gym', amount: Money.usd(4000), cadence: Cadence.of(1, 'months'),
      anchor: day('2026-01-01'), renewedThrough: day('2026-04-01'), category: 'fitness',
    })
    vault.addSubscription(gym)
    const feed = vault.upcoming(range('2026-06-01', '2026-06-30'))
    expect(feed.map((d) => d.label)).toEqual(['Netflix', 'Sam — birthday'])
    // the lapsed pending is still visible directly — never silently skipped
    expect(gym.nextDueOn(day('2026-06-01'))?.value).toBe('2026-05-01')
  })

  it('giftIdeasFor returns ideas linked to a contact', () => {
    const { vault, sam, kettle } = loadedVault()
    expect(vault.giftIdeasFor(sam.id).map((g) => g.id)).toEqual([kettle.id])
    expect(vault.giftIdeasFor(Id.create())).toHaveLength(0)
  })

  it('monthlySubscriptionTotals prorates per currency', () => {
    const { vault } = loadedVault() // Netflix monthly 15.99 USD
    vault.addSubscription(
      new Subscription({
        name: 'Backups', amount: Money.usd(6000), cadence: Cadence.of(1, 'years'),
        anchor: day('2026-01-01'), category: 'software',
      }),
    ) // 60.00/year → 5.00/month
    vault.addSubscription(
      new Subscription({
        name: 'Comic', amount: Money.of(700, 'EUR'), cadence: Cadence.of(1, 'months'),
        anchor: day('2026-01-01'), category: 'fun',
      }),
    )
    const totals = vault.monthlySubscriptionTotals()
    expect(totals.get('USD')?.equals(Money.usd(1599 + 500))).toBe(true)
    expect(totals.get('EUR')?.equals(Money.of(700, 'EUR'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/vault/vault.test.ts`
Expected: FAIL — cannot resolve `./vault`.

- [ ] **Step 3: Implement the Vault**

```ts
// packages/all-of-oyl/src/vault/vault.ts
import type { DayKey } from '../core/day-key'
import type { DayRange } from '../core/day-range'
import { DomainError } from '../core/domain-error'
import type { Id } from '../core/id'
import { Money } from '../core/money'
import { Contact } from './contact'
import { Document } from './document'
import { GiftIdea } from './gift-idea'
import { Possession } from './possession'
import { Subscription } from './subscription'

/** One item in the unified reminder feed. */
export type UpcomingDue = { itemId: Id; label: string; due: DayKey }

/** Average Gregorian month, in days — the proration convention for subscription totals. */
const AVG_MONTH_DAYS = 30.4375

type Registry<T extends { id: Id }> = { items: T[]; byId: Set<Id> }

function makeRegistry<T extends { id: Id }>(): Registry<T> {
  return { items: [], byId: new Set() }
}

function addTo<T extends { id: Id }>(registry: Registry<T>, item: T, what: string): void {
  if (registry.byId.has(item.id)) {
    throw new DomainError('DUPLICATE_ID', `${what} already in vault: ${item.id}`)
  }
  registry.byId.add(item.id)
  registry.items.push(item)
}

function removeFrom<T extends { id: Id }>(registry: Registry<T>, id: Id): void {
  if (!registry.byId.delete(id)) return
  registry.items.splice(registry.items.findIndex((i) => i.id === id), 1)
}

/**
 * One person's record of what they have. A plain in-memory aggregate (apps
 * hydrate it from repositories). Anything with a future date feeds
 * upcoming(); apps merge it with planner.upcoming(range) for the complete
 * what's-coming view.
 */
export class Vault {
  private readonly documentRegistry = makeRegistry<Document>()
  private readonly possessionRegistry = makeRegistry<Possession>()
  private readonly subscriptionRegistry = makeRegistry<Subscription>()
  private readonly contactRegistry = makeRegistry<Contact>()
  private readonly giftIdeaRegistry = makeRegistry<GiftIdea>()

  addDocument(item: Document): void {
    addTo(this.documentRegistry, item, 'document')
  }
  removeDocument(id: Id): void {
    removeFrom(this.documentRegistry, id)
  }
  documents(): readonly Document[] {
    return [...this.documentRegistry.items]
  }

  addPossession(item: Possession): void {
    addTo(this.possessionRegistry, item, 'possession')
  }
  removePossession(id: Id): void {
    removeFrom(this.possessionRegistry, id)
  }
  possessions(): readonly Possession[] {
    return [...this.possessionRegistry.items]
  }

  addSubscription(item: Subscription): void {
    addTo(this.subscriptionRegistry, item, 'subscription')
  }
  removeSubscription(id: Id): void {
    removeFrom(this.subscriptionRegistry, id)
  }
  subscriptions(): readonly Subscription[] {
    return [...this.subscriptionRegistry.items]
  }

  addContact(item: Contact): void {
    addTo(this.contactRegistry, item, 'contact')
  }
  removeContact(id: Id): void {
    removeFrom(this.contactRegistry, id)
  }
  contacts(): readonly Contact[] {
    return [...this.contactRegistry.items]
  }

  addGiftIdea(item: GiftIdea): void {
    addTo(this.giftIdeaRegistry, item, 'gift idea')
  }
  removeGiftIdea(id: Id): void {
    removeFrom(this.giftIdeaRegistry, id)
  }
  giftIdeas(): readonly GiftIdea[] {
    return [...this.giftIdeaRegistry.items]
  }

  giftIdeasFor(contactId: Id): readonly GiftIdea[] {
    return this.giftIdeaRegistry.items.filter((g) => g.contactId === contactId)
  }

  /**
   * The unified reminder feed: document expiries, warranty expiries,
   * subscription renewals, and contact occasions whose next due (as of the
   * range start) falls inside the range, sorted by due day then insertion.
   * One entry per item — the NEXT occurrence only.
   */
  upcoming(range: DayRange): readonly UpcomingDue[] {
    const feed: UpcomingDue[] = []
    const consider = (itemId: Id, label: string, due: DayKey | undefined) => {
      if (due !== undefined && range.contains(due)) feed.push({ itemId, label, due })
    }
    for (const doc of this.documentRegistry.items) consider(doc.id, doc.name, doc.nextDueOn(range.start))
    for (const item of this.possessionRegistry.items) consider(item.id, `${item.name} (warranty)`, item.nextDueOn(range.start))
    for (const sub of this.subscriptionRegistry.items) consider(sub.id, sub.name, sub.nextDueOn(range.start))
    for (const contact of this.contactRegistry.items) {
      for (const occasion of contact.occasions) {
        consider(contact.id, `${contact.name} — ${occasion.name}`, occasion.cadence.nextOnOrAfter(occasion.anchor, range.start))
      }
    }
    return feed.sort((a, b) => a.due.compare(b.due))
  }

  /**
   * What subscriptions cost per month, per currency (Money refuses to add
   * across currencies). Proration convention: months exact, years /12,
   * weeks and days via the average Gregorian month (30.4375 days), rounded
   * to minor units.
   */
  monthlySubscriptionTotals(): ReadonlyMap<string, Money> {
    const totals = new Map<string, Money>()
    for (const sub of this.subscriptionRegistry.items) {
      const { n, unit } = sub.cadence
      const factor =
        unit === 'months' ? 1 / n : unit === 'years' ? 1 / (12 * n) : unit === 'weeks' ? AVG_MONTH_DAYS / (7 * n) : AVG_MONTH_DAYS / n
      const monthly = Money.of(Math.round(sub.amount.minor * factor), sub.amount.currency, sub.amount.exponent)
      const existing = totals.get(sub.amount.currency)
      totals.set(sub.amount.currency, existing === undefined ? monthly : existing.add(monthly))
    }
    return totals
  }
}
```

- [ ] **Step 4: Run + typecheck, then commit**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/vault` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

```bash
git add packages/all-of-oyl/src/vault/vault.ts packages/all-of-oyl/src/vault/vault.test.ts
git commit -m "feat(all-of-oyl): Vault root with unified due feed and subscription totals"
```

---

### Task 6: Barrel + fixtures + gates

**Files:**
- Modify: `packages/all-of-oyl/src/index.ts`
- Modify: `packages/all-of-oyl/src/fixtures/builders.ts`
- Modify: `packages/all-of-oyl/src/fixtures/seed.ts`
- Test: `packages/all-of-oyl/src/fixtures/fixtures.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

Append to `fixtures.test.ts` (extend imports: `makeContact, makeDocument, makeGiftIdea, makePossession, makeSubscription` from `./builders`; `Vault` from `../vault/vault`; `Document` from `../vault/document`; `Possession` from `../vault/possession`; `Subscription` from `../vault/subscription`; `Contact` from `../vault/contact`; `GiftIdea` from `../vault/gift-idea`; `Transaction` is already imported):

```ts
  it('phase 5 builders produce valid objects with overridable fields', () => {
    expect(makeDocument().kind).toBe('passport')
    expect(makePossession().name).toBe('Espresso machine')
    expect(makeSubscription().category).toBe('streaming')
    expect(makeContact().name).toBe('Sam')
    expect(makeGiftIdea().text.length).toBeGreaterThan(0)
  })

  it('seed vault items revive, hydrate a Vault, and answer real questions', () => {
    expect(seed.documents).toHaveLength(1)
    expect(seed.possessions).toHaveLength(1)
    expect(seed.subscriptions).toHaveLength(2)
    expect(seed.contacts).toHaveLength(1)
    expect(seed.giftIdeas).toHaveLength(1)

    const vault = new Vault()
    for (const shape of seed.documents) vault.addDocument(Document.fromJSON(shape))
    for (const shape of seed.possessions) vault.addPossession(Possession.fromJSON(shape))
    for (const shape of seed.subscriptions) vault.addSubscription(Subscription.fromJSON(shape))
    for (const shape of seed.contacts) vault.addContact(Contact.fromJSON(shape))
    for (const shape of seed.giftIdeas) vault.addGiftIdea(GiftIdea.fromJSON(shape))

    // the unified feed for the next 120 days: netflix renewal, Sam's birthday, warranty, passport
    const feed = vault.upcoming(DayRange.of(FIXTURE_TODAY, FIXTURE_TODAY.addDays(120)))
    expect(feed.map((d) => d.label)).toEqual(['Netflix', 'Sam — birthday', 'Espresso machine (warranty)', 'Passport'])

    // the lapsed gym subscription surfaces its overdue pending — the showcase
    const gym = vault.subscriptions().find((s) => s.name === 'Gym')!
    expect(gym.nextDueOn(FIXTURE_TODAY)!.compare(FIXTURE_TODAY)).toBeLessThan(0)

    // Sam is stale and has a gift idea waiting
    const sam = vault.contacts()[0]!
    expect(sam.staleness(FIXTURE_TODAY)).toBeGreaterThan(90)
    expect(vault.giftIdeasFor(sam.id)).toHaveLength(1)

    // renewing netflix yields a charge that converts to a Transaction (the app-side conversion)
    const netflix = vault.subscriptions().find((s) => s.name === 'Netflix')!
    const charge = netflix.renew(FIXTURE_TODAY.addDays(14))
    const tx = new Transaction({
      occurredAt: new Date(`${charge.on.value}T16:00:00Z`),
      amount: charge.amount,
      category: charge.category,
      direction: charge.direction,
      ...(charge.accountId !== undefined ? { accountId: charge.accountId } : {}),
    })
    expect(tx.metrics().size).toBe(1)
    expect(netflix.nextDueOn(FIXTURE_TODAY.addDays(15))?.value).toBe('2026-07-15') // anchor preserved

    // totals per currency
    expect(vault.monthlySubscriptionTotals().get('USD')?.minor).toBeGreaterThan(0)

    // serialization idempotence across all five registries
    for (const [shapes, revive] of [
      [seed.documents, Document.fromJSON],
      [seed.possessions, Possession.fromJSON],
      [seed.subscriptions, Subscription.fromJSON],
      [seed.contacts, Contact.fromJSON],
      [seed.giftIdeas, GiftIdea.fromJSON],
    ] as const) {
      for (const shape of shapes) {
        expect(revive(revive(shape).toJSON()).toJSON()).toEqual(revive(shape).toJSON())
      }
    }
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/fixtures/fixtures.test.ts`
Expected: FAIL — `makeDocument` not exported.

- [ ] **Step 3: Extend builders**

Append to `packages/all-of-oyl/src/fixtures/builders.ts` (extend imports: `Document` from `../vault/document`, `Possession` from `../vault/possession`, `Subscription` from `../vault/subscription`, `Contact, type Occasion` from `../vault/contact`, `GiftIdea` from `../vault/gift-idea`; `Money`, `Cadence`, `DayKey`, `FIXTURE_TODAY` already imported):

```ts
export function makeDocument(overrides: { id?: Id; name?: string; kind?: string; expiresOn?: DayKey } = {}): Document {
  return new Document({
    id: overrides.id ?? fixtureId(2000),
    name: overrides.name ?? 'Passport',
    kind: overrides.kind ?? 'passport',
    ...(overrides.expiresOn !== undefined ? { expiresOn: overrides.expiresOn } : { expiresOn: FIXTURE_TODAY.addDays(90) }),
  })
}

export function makePossession(
  overrides: { id?: Id; name?: string; location?: string; warrantyUntil?: DayKey; purchasePrice?: Money; purchasedOn?: DayKey } = {},
): Possession {
  return new Possession({
    id: overrides.id ?? fixtureId(2010),
    name: overrides.name ?? 'Espresso machine',
    location: overrides.location ?? 'Kitchen',
    ...(overrides.warrantyUntil !== undefined ? { warrantyUntil: overrides.warrantyUntil } : { warrantyUntil: FIXTURE_TODAY.addDays(30) }),
    ...(overrides.purchasePrice !== undefined ? { purchasePrice: overrides.purchasePrice } : {}),
    ...(overrides.purchasedOn !== undefined ? { purchasedOn: overrides.purchasedOn } : {}),
  })
}

export function makeSubscription(
  overrides: { id?: Id; name?: string; amount?: Money; cadence?: Cadence; anchor?: DayKey; renewedThrough?: DayKey; category?: string; accountId?: Id } = {},
): Subscription {
  return new Subscription({
    id: overrides.id ?? fixtureId(2020),
    name: overrides.name ?? 'Netflix',
    amount: overrides.amount ?? Money.usd(1599),
    cadence: overrides.cadence ?? Cadence.of(1, 'months'),
    anchor: overrides.anchor ?? DayKey.of('2026-01-15'),
    ...(overrides.renewedThrough !== undefined ? { renewedThrough: overrides.renewedThrough } : {}),
    category: overrides.category ?? 'streaming',
    ...(overrides.accountId !== undefined ? { accountId: overrides.accountId } : {}),
  })
}

export function makeContact(
  overrides: { id?: Id; name?: string; lastContactedOn?: DayKey; occasions?: readonly Occasion[] } = {},
): Contact {
  return new Contact({
    id: overrides.id ?? fixtureId(2030),
    name: overrides.name ?? 'Sam',
    ...(overrides.lastContactedOn !== undefined ? { lastContactedOn: overrides.lastContactedOn } : {}),
    occasions: overrides.occasions ?? [{ name: 'birthday', anchor: DayKey.of('1990-06-20'), cadence: Cadence.of(1, 'years') }],
  })
}

export function makeGiftIdea(overrides: { id?: Id; text?: string; contactId?: Id } = {}): GiftIdea {
  return new GiftIdea({
    id: overrides.id ?? fixtureId(2040),
    text: overrides.text ?? 'Pour-over kettle',
    contactId: overrides.contactId ?? fixtureId(2030),
  })
}
```

- [ ] **Step 4: Extend the seed**

In `packages/all-of-oyl/src/fixtures/seed.ts`: extend the `Seed` type with `documents`, `possessions`, `subscriptions`, `contacts`, `giftIdeas` (all `Record<string, unknown>[]`); extend the builders import with the five new makers; inside `makeSeed()` after the plans block add:

```ts
  // ── Vault (id block 2000-2999) ──────────────────────────────────────────
  const passport = makeDocument({ id: fixtureId(2000), expiresOn: FIXTURE_TODAY.addDays(90) })
  const espresso = makePossession({ id: fixtureId(2010), warrantyUntil: FIXTURE_TODAY.addDays(30), purchasePrice: Money.usd(64900), purchasedOn: DayKey.of('2025-07-01') })
  const netflix = makeSubscription({ id: fixtureId(2020), renewedThrough: DayKey.of('2026-05-15'), accountId: fixtureId(32) })
  // showcase: a lapsed subscription — pending May 1 surfaces as overdue, never skipped
  const gym = makeSubscription({ id: fixtureId(2021), name: 'Gym', amount: Money.usd(4000), anchor: DayKey.of('2026-01-01'), renewedThrough: DayKey.of('2026-04-01'), category: 'fitness' })
  const sam = makeContact({ id: fixtureId(2030), lastContactedOn: FIXTURE_TODAY.addDays(-95) })
  const kettle = makeGiftIdea({ id: fixtureId(2040), contactId: sam.id })
```

(`DayKey` needs importing in seed.ts if not already — check; it is already imported.) Extend the cached object with:

```ts
    documents: [passport.toJSON()],
    possessions: [espresso.toJSON()],
    subscriptions: [netflix.toJSON(), gym.toJSON()],
    contacts: [sam.toJSON()],
    giftIdeas: [kettle.toJSON()],
```

- [ ] **Step 5: Extend the barrel**

In `packages/all-of-oyl/src/index.ts`, add (with the other module exports):

```ts
export { type Due } from './core/due'
export { Document } from './vault/document'
export { Possession } from './vault/possession'
export { Subscription, type SubscriptionCharge } from './vault/subscription'
export { Contact, type Occasion } from './vault/contact'
export { GiftIdea } from './vault/gift-idea'
export { Vault, type UpcomingDue } from './vault/vault'
```

and add `makeContact, makeDocument, makeGiftIdea, makePossession, makeSubscription,` to the builders export list (alphabetical).

- [ ] **Step 6: Run the full gates, then commit**

Run: `pnpm --filter @oyl/all-of-oyl test` → all green.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.
Run: `pnpm --filter @oyl/all-of-oyl exec tsc --noEmit` → exit 0.
Confirm `packages/all-of-oyl/package.json` dependencies unchanged.

```bash
git add packages/all-of-oyl/src/fixtures packages/all-of-oyl/src/index.ts
git commit -m "feat(all-of-oyl): phase 5 fixtures — Avery's vault with the lapsed-subscription showcase"
```

---

## Phase 5 exit criteria

- [ ] All gates green; no dependencies added.
- [ ] Import discipline: `vault/` imports `core/` only (+ intra-module siblings); `SubscriptionCharge` is a plain shape — NO finance imports anywhere in vault/ (grep for `finance` in `src/vault/` must return nothing).
- [ ] Every phase-5 spec behavior tested: fixed dues (expiry/warranty, asOf-independent), cursor-based pending renewals (never-renewed → anchor; anchored advance; lapsed surfacing the PAST occurrence; late renewal not drifting the schedule), the renew→charge handoff (incl. app-side Transaction conversion in fixtures), occasion recurrence (year boundaries via anchor preservation, Feb-29 clamping, earliest-of-several, none → undefined), staleness (+ recordContact), the unified upcoming feed (sorted, label conventions, one-next-occurrence-per-item, range-scoped), giftIdeasFor, per-currency monthly totals with the documented proration convention, tolerant-reader round-trips + idempotence for all five registries.
- [ ] The sanctioned spec amendment (renew returns `SubscriptionCharge`) is committed with Task 3.
- [ ] Seed showcases the lapsed gym subscription, the stale contact with a waiting gift idea, and the renewal→Transaction conversion.

## Explicitly NOT in phase 5 (resist the urge)

`insights/` (phase 6), `share/` (phase 7), a vault-item reviver (the five registries are homogeneous collections revived per-collection — no kind discriminants, no third heterogeneous reviver, so the reviver-helper extraction flagged in phase 4 stays parked), maintenance items (cut from the spec — upkeep is a recurring Task), and any Money multi-currency conversion (totals stay per-currency).
