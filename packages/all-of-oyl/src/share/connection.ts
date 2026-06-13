// packages/all-of-oyl/src/share/connection.ts
import { DomainError } from '../core/domain-error.js'
import { Id } from '../core/id.js'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta.js'

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
