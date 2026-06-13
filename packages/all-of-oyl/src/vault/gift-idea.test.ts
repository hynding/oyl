import { describe, expect, it } from 'vitest'
import { GiftIdea } from './gift-idea.js'
import { Id } from '../core/id.js'
import { DomainError } from '../core/domain-error.js'

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
