# all-of-oyl Phase 7: Sharing — Implementation Plan (final phase)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `share/` (`Connection` with its directional state machine, `Grant` with the closed scope union) and `insights/shared-progress.ts` — the ONE place cross-user visibility is decided — plus fixtures/seed and the final integration tests.

**Architecture:** `share/` imports `core/` only — scopes reference goals/areas by `Id` and metrics by prefix string, never by type. `sharedProgress` lives in `insights/` (downstream, may import anything) and **composes** the phase-6 primitives — `goal.progressOn` + `streak` for `goal-progress` grants, `review`'s `AreaRollup` for `area-summary`, `journal.totalsByPrefix` for `metric`, `planner.scheduleFor` for `day-plan` — never re-deriving any read logic. Default-deny is structural: a grant projects only after its connection exists, is `accepted`, the grantor is a member, the viewer is the *other* member, and the grant is live; absence at any step denies. Derived data only — no raw entries are ever projected.

**Tech Stack:** TypeScript 5 strict, Vitest 4, zero runtime dependencies. Phases 1–6 (merged on `master`) provide everything imported here.

**Read first:** spec sections "Users, security, and sharing" (the whole section — the state machine, scope union, and all six security commitments) and "Full-stack portability" (the trusted-boundary rule — worth echoing in `sharedProgress`'s doc comment). Reference code: `insights/review.ts` (the composition pattern + `GoalReview`/`AreaRollup` you reuse), `plan/planner.ts` (`scheduleFor`), `core/plan.ts` (`parsePlanBase`'s state-consistency enforcement — Connection's wire validation mirrors it).

**Working conventions (same as all phases):** TDD per task; `let caught: unknown` capture; run from repo root; kebab-case files, named exports, colocated tests; conditional spreads (never assign `undefined` to optional props; `delete` to clear).

**Two deliberate amendments (both committed with Task 4):**
1. The spec writes `revokedAt`; this plan uses `revokedOn: DayKey` — the codebase convention is `…At` for instants (`occurredAt: Date`) and `…On` for days (`completedOn: DayKey`), and grant liveness is day-granular.
2. `sharedProgress` gains a required `grantorId` input — the owner of the roots being passed — and processes ONLY grants whose `grantorId` matches. Without it, a caller mixing grants from two grantors against one journal would misattribute data (Blake's grant projecting Avery's journal). The spec's signature lacked it; the security model's "one place it can be wrong" demands it.

---

### Task 1: Connection

**Files:**
- Create: `packages/all-of-oyl/src/share/connection.ts`
- Test: `packages/all-of-oyl/src/share/connection.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/share/connection.test.ts
import { describe, expect, it } from 'vitest'
import { Connection } from './connection'
import { Id } from '../core/id'
import { DomainError } from '../core/domain-error'

const avery = Id.of('00000000-0000-4000-8000-000000000001')
const blake = Id.of('00000000-0000-4000-8000-000000000002')
const stranger = Id.of('00000000-0000-4000-8000-000000000099')

describe('Connection', () => {
  it('starts invited, directional, with member helpers', () => {
    const c = new Connection({ requesterId: blake, addresseeId: avery })
    expect(c.status).toBe('invited')
    expect(c.requesterId).toBe(blake)
    expect(c.isMember(avery)).toBe(true)
    expect(c.isMember(stranger)).toBe(false)
    expect(c.otherMember(blake)).toBe(avery)
    expect(Id.of(c.id)).toBe(c.id)
  })

  it('there is no self-connection', () => {
    let caught: unknown
    try {
      new Connection({ requesterId: avery, addresseeId: avery })
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_ID')
  })

  it('otherMember of a non-member throws', () => {
    const c = new Connection({ requesterId: blake, addresseeId: avery })
    let caught: unknown
    try {
      c.otherMember(stranger)
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_ID')
  })

  it('only the addressee accepts, and only from invited', () => {
    const c = new Connection({ requesterId: blake, addresseeId: avery })
    let caught: unknown
    try {
      c.accept(blake) // the requester cannot accept their own invitation
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('ILLEGAL_TRANSITION')

    c.accept(avery)
    expect(c.status).toBe('accepted')

    let caught2: unknown
    try {
      c.accept(avery) // already accepted
    } catch (e) {
      caught2 = e
    }
    expect((caught2 as DomainError)?.code).toBe('ILLEGAL_TRANSITION')
  })

  it('either member may block, from invited or accepted; non-members may not', () => {
    const fromInvited = new Connection({ requesterId: blake, addresseeId: avery })
    fromInvited.block(blake)
    expect(fromInvited.status).toBe('blocked')
    expect(fromInvited.blockedById).toBe(blake)

    const fromAccepted = new Connection({ requesterId: blake, addresseeId: avery })
    fromAccepted.accept(avery)
    fromAccepted.block(avery)
    expect(fromAccepted.status).toBe('blocked')
    expect(fromAccepted.blockedById).toBe(avery)

    const c = new Connection({ requesterId: blake, addresseeId: avery })
    let caught: unknown
    try {
      c.block(stranger)
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('ILLEGAL_TRANSITION')
  })

  it('accepting or blocking a blocked connection throws', () => {
    const c = new Connection({ requesterId: blake, addresseeId: avery })
    c.block(avery)
    for (const op of [() => c.accept(avery), () => c.block(blake)]) {
      let caught: unknown
      try {
        op()
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('ILLEGAL_TRANSITION')
    }
  })

  it('only the blocker unblocks — restoring accepted and clearing blockedById', () => {
    const c = new Connection({ requesterId: blake, addresseeId: avery })
    c.accept(avery)
    c.block(avery)

    let caught: unknown
    try {
      c.unblock(blake) // the blocked party cannot restore their own visibility
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('ILLEGAL_TRANSITION')

    c.unblock(avery)
    expect(c.status).toBe('accepted')
    expect(c.blockedById).toBeUndefined()

    let caught2: unknown
    try {
      c.unblock(avery) // nothing is blocked
    } catch (e) {
      caught2 = e
    }
    expect((caught2 as DomainError)?.code).toBe('ILLEGAL_TRANSITION')
  })

  it('round-trips JSON with state and unknown fields', () => {
    const c = new Connection({ id: Id.of('00000000-0000-4000-8000-000000003000'), requesterId: blake, addresseeId: avery })
    c.accept(avery)
    c.block(avery)
    const revived = Connection.fromJSON({ ...c.toJSON(), futureField: 19 })
    expect(revived.status).toBe('blocked')
    expect(revived.blockedById).toBe(avery)
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(19)
    expect(Connection.fromJSON(revived.toJSON()).toJSON()).toEqual(revived.toJSON())
  })

  it('throws MALFORMED_JSON on bad or inconsistent shapes', () => {
    const good = {
      id: '00000000-0000-4000-8000-000000003000',
      requesterId: blake as string,
      addresseeId: avery as string,
      status: 'invited',
    }
    for (const shape of [
      null,
      { ...good, status: 'pending' },
      { ...good, requesterId: 'nope' },
      { ...good, status: 'blocked' }, // blocked without blockedById is inconsistent
      { ...good, status: 'invited', blockedById: blake as string }, // not blocked but has a blocker
      { ...good, status: 'blocked', blockedById: stranger as string }, // blocker isn't a member
    ]) {
      let caught: unknown
      try {
        Connection.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/share/connection.test.ts`
Expected: FAIL — cannot resolve `./connection`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/share/connection.ts
import { DomainError } from '../core/domain-error'
import { Id } from '../core/id'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta'

export type ConnectionStatus = 'invited' | 'accepted' | 'blocked'

const CONNECTION_STATUSES: readonly ConnectionStatus[] = ['invited', 'accepted', 'blocked']

/**
 * A directional link between two users: the requester invited, the addressee
 * accepts. Either member may block; blockedById records who, because only
 * the blocker may unblock (the blocked party cannot restore their own
 * visibility). Only 'accepted' carries any visibility — grants are dead
 * without it.
 */
export class Connection {
  readonly id: Id
  readonly requesterId: Id
  readonly addresseeId: Id
  private currentStatus: ConnectionStatus
  private blockedBy?: Id
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: { id?: Id; requesterId: Id; addresseeId: Id; status?: ConnectionStatus; blockedById?: Id },
    extra: Record<string, unknown> = {},
  ) {
    if (props.requesterId === props.addresseeId) {
      throw new DomainError('INVALID_ID', 'there is no self-connection')
    }
    this.id = props.id ?? Id.create()
    this.requesterId = props.requesterId
    this.addresseeId = props.addresseeId
    this.currentStatus = props.status ?? 'invited'
    if (props.blockedById !== undefined) this.blockedBy = props.blockedById
    this.extra = extra
  }

  get status(): ConnectionStatus {
    return this.currentStatus
  }

  get blockedById(): Id | undefined {
    return this.blockedBy
  }

  isMember(userId: Id): boolean {
    return userId === this.requesterId || userId === this.addresseeId
  }

  otherMember(userId: Id): Id {
    if (userId === this.requesterId) return this.addresseeId
    if (userId === this.addresseeId) return this.requesterId
    throw new DomainError('INVALID_ID', `not a member of this connection: ${userId}`)
  }

  /** Only the addressee accepts, and only an open invitation. */
  accept(by: Id): void {
    if (this.currentStatus !== 'invited' || by !== this.addresseeId) {
      throw new DomainError('ILLEGAL_TRANSITION', `cannot accept (status ${this.currentStatus})`)
    }
    this.currentStatus = 'accepted'
  }

  /** Either member may block an invited or accepted connection. */
  block(by: Id): void {
    if (this.currentStatus === 'blocked' || !this.isMember(by)) {
      throw new DomainError('ILLEGAL_TRANSITION', `cannot block (status ${this.currentStatus})`)
    }
    this.currentStatus = 'blocked'
    this.blockedBy = by
  }

  /** Only the blocker unblocks — restoring accepted. */
  unblock(by: Id): void {
    if (this.currentStatus !== 'blocked' || by !== this.blockedBy) {
      throw new DomainError('ILLEGAL_TRANSITION', `cannot unblock (status ${this.currentStatus})`)
    }
    this.currentStatus = 'accepted'
    delete this.blockedBy
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      requesterId: this.requesterId,
      addresseeId: this.addresseeId,
      status: this.currentStatus,
      ...(this.blockedBy !== undefined ? { blockedById: this.blockedBy } : {}),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): Connection {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a Connection shape')
    }
    const { id, requesterId, addresseeId, status, blockedById, meta, ...extra } = shape as Record<string, unknown>
    if (
      typeof id !== 'string' ||
      typeof requesterId !== 'string' ||
      typeof addresseeId !== 'string' ||
      !(CONNECTION_STATUSES as readonly unknown[]).includes(status) ||
      (blockedById !== undefined && typeof blockedById !== 'string')
    ) {
      throw new DomainError('MALFORMED_JSON', 'not a Connection shape')
    }
    // state consistency: blocked ⇔ blockedById present, and the blocker is a member
    if ((status === 'blocked') !== (blockedById !== undefined)) {
      throw new DomainError('MALFORMED_JSON', 'inconsistent Connection state')
    }
    if (blockedById !== undefined && blockedById !== requesterId && blockedById !== addresseeId) {
      throw new DomainError('MALFORMED_JSON', 'Connection blocker is not a member')
    }
    try {
      const connection = new Connection(
        {
          id: Id.of(id),
          requesterId: Id.of(requesterId),
          addresseeId: Id.of(addresseeId),
          status: status as ConnectionStatus,
          ...(blockedById !== undefined ? { blockedById: Id.of(blockedById) } : {}),
        },
        extra,
      )
      if (meta !== undefined) connection.meta = metaFromJSON(meta)
      return connection
    } catch (e) {
      if (e instanceof DomainError && e.code !== 'MALFORMED_JSON') {
        throw new DomainError('MALFORMED_JSON', 'not a Connection shape')
      }
      throw e
    }
  }
}
```

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/share/connection.test.ts` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/share/connection.ts packages/all-of-oyl/src/share/connection.test.ts
git commit -m "feat(all-of-oyl): Connection with directional blocking state machine"
```

---

### Task 2: Grant

**Files:**
- Create: `packages/all-of-oyl/src/share/grant.ts`
- Test: `packages/all-of-oyl/src/share/grant.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/share/grant.test.ts
import { describe, expect, it } from 'vitest'
import { Grant } from './grant'
import { DayKey } from '../core/day-key'
import { Id } from '../core/id'
import { DomainError } from '../core/domain-error'

const day = (s: string) => DayKey.of(s)
const connectionId = Id.of('00000000-0000-4000-8000-000000003000')
const grantorId = Id.of('00000000-0000-4000-8000-000000000001')
const goalId = Id.of('00000000-0000-4000-8000-000000000051')

describe('Grant', () => {
  it('constructs each scope kind', () => {
    const goal = new Grant({ connectionId, grantorId, scope: { kind: 'goal-progress', goalId } })
    expect(goal.scope).toEqual({ kind: 'goal-progress', goalId })
    const area = new Grant({ connectionId, grantorId, scope: { kind: 'area-summary', areaId: goalId } })
    expect(area.scope.kind).toBe('area-summary')
    const metric = new Grant({ connectionId, grantorId, scope: { kind: 'metric', prefix: 'activity.run' } })
    expect(metric.scope).toEqual({ kind: 'metric', prefix: 'activity.run' })
    const dayPlan = new Grant({ connectionId, grantorId, scope: { kind: 'day-plan' } })
    expect(dayPlan.scope).toEqual({ kind: 'day-plan' })
  })

  it('validates metric prefixes against the slug grammar', () => {
    for (const prefix of ['', 'two words', 'activity..run', 'Activity.run']) {
      let caught: unknown
      try {
        new Grant({ connectionId, grantorId, scope: { kind: 'metric', prefix } })
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('INVALID_METRIC_KEY')
    }
    // a single namespace segment is a legal prefix
    expect(new Grant({ connectionId, grantorId, scope: { kind: 'metric', prefix: 'activity' } }).scope.kind).toBe('metric')
  })

  it('is live by default; expiresOn is INCLUSIVE — live through the end of that day', () => {
    const open = new Grant({ connectionId, grantorId, scope: { kind: 'day-plan' } })
    expect(open.isLiveOn(day('2030-01-01'))).toBe(true)

    const expiring = new Grant({ connectionId, grantorId, scope: { kind: 'day-plan' }, expiresOn: day('2026-06-15') })
    expect(expiring.isLiveOn(day('2026-06-15'))).toBe(true) // the boundary day itself
    expect(expiring.isLiveOn(day('2026-06-16'))).toBe(false)
  })

  it('revocation is immediate and total — dead for every asOf, nothing grandfathered', () => {
    const grant = new Grant({ connectionId, grantorId, scope: { kind: 'day-plan' } })
    grant.revoke(day('2026-06-10'))
    expect(grant.revokedOn?.value).toBe('2026-06-10')
    expect(grant.isLiveOn(day('2026-06-11'))).toBe(false)
    expect(grant.isLiveOn(day('2026-06-01'))).toBe(false) // even before the revocation day

    let caught: unknown
    try {
      grant.revoke(day('2026-06-12')) // already dead
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('ILLEGAL_TRANSITION')
  })

  it('round-trips JSON for every scope kind with unknown fields', () => {
    const grant = new Grant({
      id: Id.of('00000000-0000-4000-8000-000000003010'),
      connectionId,
      grantorId,
      scope: { kind: 'goal-progress', goalId },
      expiresOn: day('2026-12-31'),
    })
    grant.revoke(day('2026-06-10'))
    const revived = Grant.fromJSON({ ...grant.toJSON(), futureField: 20 })
    expect(revived.scope).toEqual({ kind: 'goal-progress', goalId })
    expect(revived.revokedOn?.value).toBe('2026-06-10')
    expect(revived.isLiveOn(day('2026-06-01'))).toBe(false)
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(20)
    expect(Grant.fromJSON(revived.toJSON()).toJSON()).toEqual(revived.toJSON())

    const dayPlanGrant = new Grant({ connectionId, grantorId, scope: { kind: 'day-plan' } })
    expect(Grant.fromJSON(dayPlanGrant.toJSON()).scope).toEqual({ kind: 'day-plan' })
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    const good = {
      id: '00000000-0000-4000-8000-000000003010',
      connectionId: connectionId as string,
      grantorId: grantorId as string,
      scope: { kind: 'day-plan' },
    }
    for (const shape of [
      null,
      { ...good, scope: undefined },
      { ...good, scope: { kind: 'raw-entries' } }, // deliberately not a scope — raw-entry sharing does not exist
      { ...good, scope: { kind: 'goal-progress' } }, // missing goalId
      { ...good, scope: { kind: 'metric', prefix: 'two words' } },
      { ...good, grantorId: 'nope' },
    ]) {
      let caught: unknown
      try {
        Grant.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/share/grant.test.ts`
Expected: FAIL — cannot resolve `./grant`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/share/grant.ts
import { DayKey } from '../core/day-key'
import { DomainError } from '../core/domain-error'
import { Id } from '../core/id'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta'
import { isSlug } from '../core/slug'

/**
 * What a grant exposes — a CLOSED union. Derived data only: progress,
 * summaries, aggregates, agendas. Raw-entry sharing deliberately does not
 * exist in v1 (a privacy decision, not a technical one).
 */
export type GrantScope =
  | { kind: 'goal-progress'; goalId: Id }
  | { kind: 'area-summary'; areaId: Id }
  | { kind: 'metric'; prefix: string }
  | { kind: 'day-plan' }

function assertMetricPrefix(prefix: string): string {
  const segments = prefix.split('.')
  if (segments.length === 0 || !segments.every(isSlug)) {
    throw new DomainError('INVALID_METRIC_KEY', `not a valid metric prefix: "${prefix}"`)
  }
  return prefix
}

/**
 * What one user lets a specific connection see. A grant flows ONE way: the
 * grantor shares their data; the viewer is the connection's other member.
 * expiresOn is inclusive (live through the end of that day, DayRange
 * semantics); revocation is immediate and total — a revoked grant is dead
 * for every projection, nothing grandfathered.
 */
export class Grant {
  readonly id: Id
  readonly connectionId: Id
  readonly grantorId: Id
  readonly scope: GrantScope
  readonly expiresOn?: DayKey
  private revokedOnDay?: DayKey
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: { id?: Id; connectionId: Id; grantorId: Id; scope: GrantScope; expiresOn?: DayKey; revokedOn?: DayKey },
    extra: Record<string, unknown> = {},
  ) {
    if (props.scope.kind === 'metric') assertMetricPrefix(props.scope.prefix)
    this.id = props.id ?? Id.create()
    this.connectionId = props.connectionId
    this.grantorId = props.grantorId
    this.scope = { ...props.scope }
    if (props.expiresOn !== undefined) this.expiresOn = props.expiresOn
    if (props.revokedOn !== undefined) this.revokedOnDay = props.revokedOn
    this.extra = extra
  }

  get revokedOn(): DayKey | undefined {
    return this.revokedOnDay
  }

  /** Immediate and total: presence of a revocation kills the grant for every asOf. */
  revoke(on: DayKey): void {
    if (this.revokedOnDay !== undefined) {
      throw new DomainError('ILLEGAL_TRANSITION', 'grant is already revoked')
    }
    this.revokedOnDay = on
  }

  isLiveOn(asOf: DayKey): boolean {
    if (this.revokedOnDay !== undefined) return false
    return this.expiresOn === undefined || asOf.compare(this.expiresOn) <= 0
  }

  toJSON(): Record<string, unknown> {
    const scope: Record<string, unknown> = { kind: this.scope.kind }
    if (this.scope.kind === 'goal-progress') scope['goalId'] = this.scope.goalId
    if (this.scope.kind === 'area-summary') scope['areaId'] = this.scope.areaId
    if (this.scope.kind === 'metric') scope['prefix'] = this.scope.prefix
    return {
      ...this.extra,
      id: this.id,
      connectionId: this.connectionId,
      grantorId: this.grantorId,
      scope,
      ...(this.expiresOn !== undefined ? { expiresOn: this.expiresOn.value } : {}),
      ...(this.revokedOnDay !== undefined ? { revokedOn: this.revokedOnDay.value } : {}),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): Grant {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a Grant shape')
    }
    const { id, connectionId, grantorId, scope, expiresOn, revokedOn, meta, ...extra } = shape as Record<string, unknown>
    if (
      typeof id !== 'string' ||
      typeof connectionId !== 'string' ||
      typeof grantorId !== 'string' ||
      typeof scope !== 'object' ||
      scope === null ||
      (expiresOn !== undefined && typeof expiresOn !== 'string') ||
      (revokedOn !== undefined && typeof revokedOn !== 'string')
    ) {
      throw new DomainError('MALFORMED_JSON', 'not a Grant shape')
    }
    const s = scope as { kind?: unknown; goalId?: unknown; areaId?: unknown; prefix?: unknown }
    try {
      let parsedScope: GrantScope
      if (s.kind === 'goal-progress' && typeof s.goalId === 'string') {
        parsedScope = { kind: 'goal-progress', goalId: Id.of(s.goalId) }
      } else if (s.kind === 'area-summary' && typeof s.areaId === 'string') {
        parsedScope = { kind: 'area-summary', areaId: Id.of(s.areaId) }
      } else if (s.kind === 'metric' && typeof s.prefix === 'string') {
        parsedScope = { kind: 'metric', prefix: s.prefix }
      } else if (s.kind === 'day-plan') {
        parsedScope = { kind: 'day-plan' }
      } else {
        throw new DomainError('MALFORMED_JSON', 'not a Grant scope')
      }
      const grant = new Grant(
        {
          id: Id.of(id),
          connectionId: Id.of(connectionId),
          grantorId: Id.of(grantorId),
          scope: parsedScope,
          ...(expiresOn !== undefined ? { expiresOn: DayKey.of(expiresOn) } : {}),
          ...(revokedOn !== undefined ? { revokedOn: DayKey.of(revokedOn) } : {}),
        },
        extra,
      )
      if (meta !== undefined) grant.meta = metaFromJSON(meta)
      return grant
    } catch (e) {
      if (e instanceof DomainError && e.code !== 'MALFORMED_JSON') {
        throw new DomainError('MALFORMED_JSON', 'not a Grant shape')
      }
      throw e
    }
  }
}
```

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/share/grant.test.ts` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/share/grant.ts packages/all-of-oyl/src/share/grant.test.ts
git commit -m "feat(all-of-oyl): Grant with closed scope union and total revocation"
```

---

### Task 3: sharedProgress

**Files:**
- Create: `packages/all-of-oyl/src/insights/shared-progress.ts`
- Test: `packages/all-of-oyl/src/insights/shared-progress.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/insights/shared-progress.test.ts
import { describe, expect, it } from 'vitest'
import { sharedProgress } from './shared-progress'
import { Connection } from '../share/connection'
import { Grant } from '../share/grant'
import { Goal } from '../goal/goal'
import { LifeArea } from '../core/life-area'
import { Activity } from '../activity/activity'
import { ActivitySession } from '../activity/activity-session'
import { Measurement } from '../track/measurement'
import { Task } from '../plan/task'
import { DayPlan } from '../plan/day-plan'
import { Planner } from '../plan/planner'
import { DayKey } from '../core/day-key'
import { Journal } from '../core/journal'
import { Quantity } from '../core/quantity'
import { Id } from '../core/id'

const NY = 'America/New_York'
const day = (s: string) => DayKey.of(s)
const at = (s: string, hourUtc: number) => new Date(`${s}T${String(hourUtc).padStart(2, '0')}:00:00Z`)

const avery = Id.of('00000000-0000-4000-8000-000000000001') // grantor
const blake = Id.of('00000000-0000-4000-8000-000000000002') // viewer
const mallory = Id.of('00000000-0000-4000-8000-000000000099')

function world() {
  const health = new LifeArea({ name: 'Health', slug: 'health' })
  const run = new Activity({ name: 'Run', slug: 'run', areaId: health.id })
  const journal = new Journal(NY)
  journal.add(new ActivitySession({ occurredAt: at('2026-06-09', 11), activity: run, quantities: [Quantity.of(30, 'minutes')] }))
  journal.add(new ActivitySession({ occurredAt: at('2026-06-10', 11), activity: run, quantities: [Quantity.of(30, 'minutes')] }))
  journal.add(new Measurement({ occurredAt: at('2026-06-10', 8), metric: 'body.weight_kg', value: 80 })) // private — never projected

  const planner = new Planner()
  const taxes = new Task({ title: 'File taxes', due: day('2026-06-10') })
  planner.add(taxes)
  planner.setDayPlan(new DayPlan({ day: day('2026-06-10'), slots: [{ planId: taxes.id, start: '09:00', end: '10:00' }] }))

  const runGoal = new Goal({ name: 'Run weekly', metric: 'activity.run.minutes', target: 50, direction: 'atLeast', period: 'week', areaId: health.id })
  const secretGoal = new Goal({ name: 'Secret', metric: 'body.weight_kg', target: 80, direction: 'atMost', period: 'day', aggregation: 'last' })

  const connection = new Connection({ requesterId: blake, addresseeId: avery })
  connection.accept(avery)

  return { journal, planner, goals: [runGoal, secretGoal], activities: [run], areas: [health], connection, runGoal }
}

const baseInput = (w: ReturnType<typeof world>, grants: Grant[], viewerId = blake) => ({
  journal: w.journal,
  planner: w.planner,
  goals: w.goals,
  connections: [w.connection],
  grants,
  grantorId: avery, // the owner of the roots above
  viewerId,
  asOf: day('2026-06-10'),
  activities: w.activities,
  areas: w.areas,
})

describe('sharedProgress', () => {
  it('projects exactly what a live grant exposes — and nothing else', () => {
    const w = world()
    const grant = new Grant({ connectionId: w.connection.id, grantorId: avery, scope: { kind: 'goal-progress', goalId: w.runGoal.id } })
    const view = sharedProgress(baseInput(w, [grant]))
    expect(view.goals).toHaveLength(1)
    expect(view.goals[0]?.name).toBe('Run weekly')
    expect(view.goals[0]?.progress.met).toBe(true) // 60 ≥ 50 this week
    expect(view.goals[0]?.streak).toBeGreaterThanOrEqual(1)
    // the secret goal, the weight data, the day plan: not in the view
    expect(view.goals.find((g) => g.name === 'Secret')).toBeUndefined()
    expect(view.areas).toHaveLength(0)
    expect(view.metrics).toHaveLength(0)
    expect(view.dayPlan).toBeUndefined()
  })

  it('default-deny: every broken precondition yields nothing', () => {
    const w = world()
    const goalScope = { kind: 'goal-progress', goalId: w.runGoal.id } as const

    // no connection for the grant
    const orphan = new Grant({ connectionId: Id.create(), grantorId: avery, scope: goalScope })
    expect(sharedProgress(baseInput(w, [orphan])).goals).toHaveLength(0)

    // connection not accepted
    const invited = new Connection({ requesterId: blake, addresseeId: avery })
    const pendingGrant = new Grant({ connectionId: invited.id, grantorId: avery, scope: goalScope })
    expect(
      sharedProgress({ ...baseInput(w, [pendingGrant]), connections: [invited] }).goals,
    ).toHaveLength(0)

    // viewer is not the other member
    const grant = new Grant({ connectionId: w.connection.id, grantorId: avery, scope: goalScope })
    expect(sharedProgress(baseInput(w, [grant], mallory)).goals).toHaveLength(0)

    // grantor is not a member of the connection
    const foreign = new Grant({ connectionId: w.connection.id, grantorId: mallory, scope: goalScope })
    expect(sharedProgress(baseInput(w, [foreign])).goals).toHaveLength(0)

    // a grant from the OTHER member never projects THIS grantor's roots (misattribution guard)
    const blakesGrant = new Grant({ connectionId: w.connection.id, grantorId: blake, scope: goalScope })
    expect(sharedProgress(baseInput(w, [blakesGrant], avery)).goals).toHaveLength(0)

    // revoked
    const revoked = new Grant({ connectionId: w.connection.id, grantorId: avery, scope: goalScope })
    revoked.revoke(day('2026-06-09'))
    expect(sharedProgress(baseInput(w, [revoked])).goals).toHaveLength(0)

    // expired yesterday (inclusive boundary: expiring TODAY is still live)
    const expired = new Grant({ connectionId: w.connection.id, grantorId: avery, scope: goalScope, expiresOn: day('2026-06-09') })
    expect(sharedProgress(baseInput(w, [expired])).goals).toHaveLength(0)
    const expiringToday = new Grant({ connectionId: w.connection.id, grantorId: avery, scope: goalScope, expiresOn: day('2026-06-10') })
    expect(sharedProgress(baseInput(w, [expiringToday])).goals).toHaveLength(1)

    // blocked connection
    w.connection.block(avery)
    expect(sharedProgress(baseInput(w, [grant])).goals).toHaveLength(0)
  })

  it('projects area summaries, metric aggregates, and the day plan under their scopes', () => {
    const w = world()
    const grants = [
      new Grant({ connectionId: w.connection.id, grantorId: avery, scope: { kind: 'area-summary', areaId: w.areas[0]!.id } }),
      new Grant({ connectionId: w.connection.id, grantorId: avery, scope: { kind: 'metric', prefix: 'activity.run' } }),
      new Grant({ connectionId: w.connection.id, grantorId: avery, scope: { kind: 'day-plan' } }),
    ]
    const view = sharedProgress(baseInput(w, grants))

    expect(view.areas).toHaveLength(1)
    expect(view.areas[0]?.name).toBe('Health')
    expect(view.areas[0]?.activityMinutes).toBe(60)

    expect(view.metrics).toHaveLength(1)
    expect(view.metrics[0]?.prefix).toBe('activity.run')
    const minuteRow = view.metrics[0]?.totals.find((t) => t.metric === 'activity.run.minutes')
    expect(minuteRow?.total).toBe(60)
    // a metric grant for one prefix never leaks another namespace
    expect(view.metrics[0]?.totals.every((t) => t.metric.startsWith('activity.run'))).toBe(true)

    expect(view.dayPlan?.day.value).toBe('2026-06-10')
    expect(view.dayPlan?.slots).toEqual([{ title: 'File taxes', kind: 'task', start: '09:00', end: '10:00' }])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/insights/shared-progress.test.ts`
Expected: FAIL — cannot resolve `./shared-progress`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/insights/shared-progress.ts
import type { Activity } from '../activity/activity'
import type { DayKey } from '../core/day-key'
import type { Id } from '../core/id'
import type { Journal } from '../core/journal'
import type { LifeArea } from '../core/life-area'
import type { MetricKey } from '../core/metric-key'
import type { Goal } from '../goal/goal'
import { periodWindowOf } from '../goal/period'
import type { Planner } from '../plan/planner'
import type { Project } from '../plan/project'
import type { Connection } from '../share/connection'
import type { Grant } from '../share/grant'
import { type AreaRollup, type GoalReview, type Review, review } from './review'
import { streak } from './streak'

export type SharedMetricSummary = { prefix: string; totals: readonly { metric: MetricKey; total: number }[] }
export type SharedDayPlan = { day: DayKey; slots: readonly { title: string; kind: string; start?: string; end?: string }[] }

/** Everything a viewer is entitled to see — derived data only, never raw entries. */
export type SharedView = {
  viewerId: Id
  asOf: DayKey
  goals: readonly GoalReview[]
  areas: readonly AreaRollup[]
  metrics: readonly SharedMetricSummary[]
  dayPlan?: SharedDayPlan
}

/**
 * THE one place cross-user visibility is decided (spec growth invariant —
 * never add a second). Default-deny: a grant projects only after its
 * connection exists, is accepted, the grantor is a member, the viewer is
 * the OTHER member, and the grant is live as of asOf; absence at any step
 * denies. Composes the read primitives (progressOn + streak, review's
 * rollup, totalsByPrefix, scheduleFor) — no re-derived read logic.
 *
 * Trusted boundary: this function must run server-side (or equivalent) —
 * a client is never handed another user's Journal to filter; it receives
 * only this projection's output.
 */
export function sharedProgress(input: {
  /** The GRANTOR's roots and catalogs — grantorId declares whose they are. */
  journal: Journal
  planner: Planner
  goals: readonly Goal[]
  connections: readonly Connection[]
  grants: readonly Grant[]
  /** The owner of the roots above. Grants from anyone else are skipped — the misattribution guard. */
  grantorId: Id
  viewerId: Id
  asOf: DayKey
  activities?: readonly Activity[]
  areas?: readonly LifeArea[]
  projects?: readonly Project[]
}): SharedView {
  const { journal, planner, goals, connections, grants, grantorId, viewerId, asOf, activities = [], areas = [], projects = [] } = input
  const connectionById = new Map(connections.map((c) => [c.id, c]))
  const week = periodWindowOf('week', asOf)

  const sharedGoals: GoalReview[] = []
  const sharedAreas: AreaRollup[] = []
  const sharedMetrics: SharedMetricSummary[] = []
  let sharedDayPlan: SharedDayPlan | undefined
  let weeklyReview: Review | undefined // computed at most once, only when an area grant projects

  for (const grant of grants) {
    if (grant.grantorId !== grantorId) continue // not this grantor's data — misattribution guard
    const connection = connectionById.get(grant.connectionId)
    if (connection === undefined) continue // absence denies
    if (connection.status !== 'accepted') continue
    if (!connection.isMember(grant.grantorId)) continue
    if (connection.otherMember(grant.grantorId) !== viewerId) continue
    if (!grant.isLiveOn(asOf)) continue

    const scope = grant.scope
    switch (scope.kind) {
      case 'goal-progress': {
        const goal = goals.find((g) => g.id === scope.goalId)
        if (goal === undefined) break // absence denies
        sharedGoals.push({
          goalId: goal.id,
          ...(goal.name !== undefined ? { name: goal.name } : {}),
          progress: goal.progressOn(journal, asOf),
          streak: streak(journal, goal, asOf),
        })
        break
      }
      case 'area-summary': {
        weeklyReview ??= review({ journal, planner, goals, activities, areas, projects, period: week })
        const rollup = weeklyReview.areas.find((a) => a.areaId === scope.areaId)
        if (rollup !== undefined) sharedAreas.push(rollup)
        break
      }
      case 'metric': {
        const totals = [...journal.totalsByPrefix(scope.prefix, week)].map(([metric, total]) => ({ metric, total }))
        sharedMetrics.push({ prefix: scope.prefix, totals })
        break
      }
      case 'day-plan': {
        sharedDayPlan = {
          day: asOf,
          slots: planner.scheduleFor(asOf).map((slot) => ({
            title: slot.plan.title,
            kind: slot.plan.kind,
            ...(slot.start !== undefined ? { start: slot.start } : {}),
            ...(slot.end !== undefined ? { end: slot.end } : {}),
          })),
        }
        break
      }
    }
  }

  return {
    viewerId,
    asOf,
    goals: sharedGoals,
    areas: sharedAreas,
    metrics: sharedMetrics,
    ...(sharedDayPlan !== undefined ? { dayPlan: sharedDayPlan } : {}),
  }
}
```

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/insights/shared-progress.test.ts` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/insights/shared-progress.ts packages/all-of-oyl/src/insights/shared-progress.test.ts
git commit -m "feat(all-of-oyl): sharedProgress — the single cross-user visibility decision"
```

---

### Task 4: Barrel + fixtures + spec amendment + gates

**Files:**
- Modify: `packages/all-of-oyl/src/index.ts`
- Modify: `packages/all-of-oyl/src/fixtures/fixture-id.ts` (doc comment)
- Modify: `packages/all-of-oyl/src/fixtures/builders.ts`
- Modify: `packages/all-of-oyl/src/fixtures/seed.ts`
- Modify: `docs/superpowers/specs/2026-06-11-all-of-oyl-domain-core-design.md` (revokedAt → revokedOn)
- Test: `packages/all-of-oyl/src/fixtures/fixtures.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

Append to `fixtures.test.ts` (extend imports: `makeConnection, makeGrant` from `./builders`; `sharedProgress` from `../index`; `Connection` from `../share/connection`; `Grant` from `../share/grant`):

```ts
  it('phase 7 builders produce valid objects with overridable fields', () => {
    expect(makeConnection().status).toBe('accepted')
    expect(makeGrant().scope.kind).toBe('goal-progress')
  })

  it('Blake sees exactly what Avery granted — and the revoked grant yields nothing', () => {
    const journal = new Journal(FIXTURE_TZ)
    for (const shape of seed.entries) journal.add(reviveEntry(shape))
    const planner = new Planner()
    for (const shape of seed.plans) planner.add(revivePlan(shape))
    planner.setDayPlan(DayPlan.fromJSON(seed.dayPlans[0]))
    const goals = seed.goals.map((shape) => Goal.fromJSON(shape))
    const areas = seed.lifeAreas.map((shape) => LifeArea.fromJSON(shape))
    const activities = seed.activities.map((shape) => Activity.fromJSON(shape))
    const projects = seed.projects.map((shape) => Project.fromJSON(shape))
    const connections = seed.connections.map((shape) => Connection.fromJSON(shape))
    const grants = seed.grants.map((shape) => Grant.fromJSON(shape))

    const view = sharedProgress({
      journal, planner, goals, connections, grants,
      grantorId: fixtureId(1), // Avery's roots
      viewerId: fixtureId(2), // Blake views
      asOf: FIXTURE_TODAY,
      activities, areas, projects,
    })

    // the run-goal grant projects progress + streak
    expect(view.goals).toHaveLength(1)
    expect(view.goals[0]?.name).toBe('Run weekly')
    expect(view.goals[0]?.streak).toBeGreaterThan(0)
    // the day-plan grant projects today's schedule
    expect(view.dayPlan?.slots.length).toBeGreaterThan(0)
    // the REVOKED area-summary grant yields nothing — revocation is total
    expect(view.areas).toHaveLength(0)
    // nothing else leaks
    expect(view.metrics).toHaveLength(0)

    // grants flow one way: Blake's reciprocal grant projects BLAKE's (empty) roots for Avery —
    // the grant works even though there's no data yet, and Avery's data never leaks through it
    const blakeView = sharedProgress({
      journal: new Journal(FIXTURE_TZ), // Blake's sparse life
      planner: new Planner(),
      goals: [],
      connections, grants,
      grantorId: fixtureId(2), // Blake's roots
      viewerId: fixtureId(1), // Avery views
      asOf: FIXTURE_TODAY,
    })
    expect(blakeView.metrics).toHaveLength(1)
    expect(blakeView.metrics[0]?.prefix).toBe('activity')
    expect(blakeView.metrics[0]?.totals).toHaveLength(0) // nothing logged yet — and nothing misattributed
    expect(blakeView.goals).toHaveLength(0)
    expect(blakeView.dayPlan).toBeUndefined()

    // serialization idempotence
    for (const shape of seed.connections) {
      expect(Connection.fromJSON(Connection.fromJSON(shape).toJSON()).toJSON()).toEqual(Connection.fromJSON(shape).toJSON())
    }
    for (const shape of seed.grants) {
      expect(Grant.fromJSON(Grant.fromJSON(shape).toJSON()).toJSON()).toEqual(Grant.fromJSON(shape).toJSON())
    }
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/fixtures/fixtures.test.ts`
Expected: FAIL — `makeConnection` not exported.

- [ ] **Step 3: Extend fixture-id doc, builders, and seed**

In `packages/all-of-oyl/src/fixtures/fixture-id.ts`, update the reservation comment line ending `2000-2999 vault · 3000+ sharing` — it already reserves 3000+ for sharing; verify and leave as-is (no change needed if so).

Append to `packages/all-of-oyl/src/fixtures/builders.ts` (extend imports: `Connection, type ConnectionStatus` from `../share/connection`; `Grant, type GrantScope` from `../share/grant`):

```ts
export function makeConnection(
  overrides: { id?: Id; requesterId?: Id; addresseeId?: Id; status?: ConnectionStatus; blockedById?: Id } = {},
): Connection {
  return new Connection({
    id: overrides.id ?? fixtureId(3000),
    requesterId: overrides.requesterId ?? fixtureId(2), // Blake asked
    addresseeId: overrides.addresseeId ?? fixtureId(1), // Avery accepted
    status: overrides.status ?? 'accepted',
    ...(overrides.blockedById !== undefined ? { blockedById: overrides.blockedById } : {}),
  })
}

export function makeGrant(
  overrides: { id?: Id; connectionId?: Id; grantorId?: Id; scope?: GrantScope; expiresOn?: DayKey; revokedOn?: DayKey } = {},
): Grant {
  return new Grant({
    id: overrides.id ?? fixtureId(3010),
    connectionId: overrides.connectionId ?? fixtureId(3000),
    grantorId: overrides.grantorId ?? fixtureId(1), // Avery shares
    scope: overrides.scope ?? { kind: 'goal-progress', goalId: fixtureId(51) },
    ...(overrides.expiresOn !== undefined ? { expiresOn: overrides.expiresOn } : {}),
    ...(overrides.revokedOn !== undefined ? { revokedOn: overrides.revokedOn } : {}),
  })
}
```

In `packages/all-of-oyl/src/fixtures/seed.ts`: extend the `Seed` type with `connections` and `grants`; extend the builders import; inside `makeSeed()` after the vault block add:

```ts
  // ── Sharing (id block 3000+) ────────────────────────────────────────────
  // Blake asked, Avery accepted; Avery shares the run goal and today's plan with Blake
  const connection = makeConnection({ id: fixtureId(3000) })
  const runGoalGrant = makeGrant({ id: fixtureId(3010), scope: { kind: 'goal-progress', goalId: fixtureId(51) } })
  const dayPlanGrant = makeGrant({ id: fixtureId(3011), scope: { kind: 'day-plan' } })
  // showcase: a revoked grant — Avery shared the Health rollup, then changed her mind
  const revokedAreaGrant = makeGrant({
    id: fixtureId(3012),
    scope: { kind: 'area-summary', areaId: fixtureId(10) },
    revokedOn: FIXTURE_TODAY.addDays(-2),
  })
  // grants flow both ways: Blake shares his activity aggregates with Avery
  const blakeActivityGrant = makeGrant({
    id: fixtureId(3013),
    grantorId: fixtureId(2),
    scope: { kind: 'metric', prefix: 'activity' },
  })
```

and extend the cached object with:

```ts
    connections: [connection.toJSON()],
    grants: [runGoalGrant.toJSON(), dayPlanGrant.toJSON(), revokedAreaGrant.toJSON(), blakeActivityGrant.toJSON()],
```

- [ ] **Step 4: Extend the barrel and amend the spec**

In `packages/all-of-oyl/src/index.ts`, add (with the other module exports):

```ts
export { Connection, type ConnectionStatus } from './share/connection'
export { Grant, type GrantScope } from './share/grant'
export { sharedProgress, type SharedView, type SharedMetricSummary, type SharedDayPlan } from './insights/shared-progress'
```

and add `makeConnection, makeGrant,` to the builders export list (alphabetical).

Spec amendments (the two from the header), both in `docs/superpowers/specs/2026-06-11-all-of-oyl-domain-core-design.md`:
1. In the Grant bullet, change `` `revokedAt` `` to `` `revokedOn` (a `DayKey` — codebase convention: `…At` for instants, `…On` for days) ``.
2. In the security model's "One projection function" bullet, change the signature fragment `` `insights/sharedProgress({ journal, planner, goals, connections, grants, viewerId, asOf, ...catalogs })` `` to `` `insights/sharedProgress({ journal, planner, goals, connections, grants, grantorId, viewerId, asOf, ...catalogs })` `` and append after "before projecting anything.": `It also requires `grantorId` — the declared owner of the roots passed in — and skips grants from anyone else, so grants from two grantors can never misattribute one grantor's data.`

- [ ] **Step 5: Run the full gates, then commit**

Run: `pnpm --filter @oyl/all-of-oyl test` → all green.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.
Run: `pnpm --filter @oyl/all-of-oyl exec tsc --noEmit` → exit 0.
Confirm `packages/all-of-oyl/package.json` dependencies unchanged.
Run: `grep -rE "^import .* from '\.\./(activity|nutrition|finance|track|user|goal|plan|vault|fixtures|insights)" packages/all-of-oyl/src/share/*.ts | grep -v test` → must output nothing (share/ imports core/ only).

```bash
git add packages/all-of-oyl/src/fixtures packages/all-of-oyl/src/index.ts docs/superpowers/specs/2026-06-11-all-of-oyl-domain-core-design.md
git commit -m "feat(all-of-oyl): phase 7 fixtures + barrel — the spec is fully built"
```

---

## Phase 7 exit criteria

- [ ] All gates green; no dependencies added.
- [ ] Import discipline: `share/` imports `core/` only (verified by grep); `sharedProgress` lives in `insights/` and is the ONLY place cross-user visibility is decided.
- [ ] Every phase-7 spec behavior tested: the full connection state machine (directional accept, either-member block, blocker-only unblock, illegal transitions, no self-connection, wire-state consistency incl. blocker-must-be-member), grant scopes (closed union — `raw-entries` deliberately rejected — prefix grammar, inclusive expiry boundary, total revocation incl. earlier asOf), and the complete default-deny matrix (no connection / not accepted / viewer not other member / grantor not member / revoked / expired / blocked all yield nothing) plus all four scope projections with leak checks.
- [ ] Both spec amendments are in: `revokedAt` → `revokedOn`, and the `grantorId` misattribution guard in the projection signature.
- [ ] Seed showcases the accepted Blake↔Avery connection, grants both ways (Avery: run goal + day plan; Blake: activity aggregates), and the revoked area grant yielding nothing.

## Explicitly NOT in phase 7 (resist the urge)

Shared *editing* of day plans, raw-entry grant scopes, and group connections (all parked in the spec's "Known future concerns"); authentication/sessions/transport (app/backend obligations, named in the spec's security section); any caching of `sharedProgress`; and a Connection/Grant reviver in the barrel (homogeneous collections, revived per-collection — the heterogeneous-reviver pattern stays at two).
