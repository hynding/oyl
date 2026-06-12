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
  // split() never yields an empty array, so every() alone covers the empty-string case
  if (!prefix.split('.').every(isSlug)) {
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
