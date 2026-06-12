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
