import { describe, expect, it } from 'vitest'
import { ExtractedDocument } from './extracted-document.js'
import { DayKey } from '../core/day-key.js'
import { DomainError } from '../core/domain-error.js'
import { Money } from '../core/money.js'

const full = () =>
  new ExtractedDocument({
    docType: 'receipt',
    transactionType: 'purchase',
    date: DayKey.of('2026-07-24'),
    time: '18:34',
    merchant: { name: "Trader Joe's", address: '123 Main St', phone: '555-0100' },
    payment: { method: 'visa', accountSuffix: '1234', raw: 'VISA •1234' },
    subtotal: Money.usd(4450),
    tax: Money.usd(362),
    total: Money.usd(4812),
    lineItems: [
      { name: 'Org Bananas', quantity: 2, unitPrice: Money.usd(99), totalPrice: Money.usd(198) },
      { name: 'Oat Milk', totalPrice: Money.usd(4252) },
    ],
  })

describe('ExtractedDocument', () => {
  it('holds the extraction fields', () => {
    const d = full()
    expect(d.docType).toBe('receipt')
    expect(d.transactionType).toBe('purchase')
    expect(d.date?.value).toBe('2026-07-24')
    expect(d.time).toBe('18:34')
    expect(d.merchant?.name).toBe("Trader Joe's")
    expect(d.payment?.accountSuffix).toBe('1234')
    expect(d.total?.equals(Money.usd(4812))).toBe(true)
    expect(d.lineItems).toHaveLength(2)
  })

  it('allows a minimal document (everything optional but docType)', () => {
    const d = new ExtractedDocument({ docType: 'other' })
    expect(d.date).toBeUndefined()
    expect(d.lineItems).toEqual([])
  })

  it.each([
    [{ docType: 'menu' }, 'docType'],
    [{ docType: 'receipt', transactionType: 'barter' }, 'transactionType'],
    [{ docType: 'receipt', time: '25:99' }, 'time'],
    [{ docType: 'receipt', merchant: { name: '' } }, 'merchant name'],
    [{ docType: 'receipt', payment: { method: '' } }, 'payment method'],
    [{ docType: 'receipt', lineItems: [{ name: '' }] }, 'line item name'],
  ])('rejects invalid props %j (%s)', (props) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new ExtractedDocument(props as any)).toThrowError(DomainError)
  })

  it('round-trips through JSON preserving unknown fields', () => {
    const shape = { ...full().toJSON(), futureField: 'kept' }
    const revived = ExtractedDocument.fromJSON(shape)
    expect(revived.toJSON()).toEqual(shape)
    expect(revived.total?.minor).toBe(4812)
    expect(revived.lineItems[0]?.unitPrice?.minor).toBe(99)
  })

  it('fromJSON throws MALFORMED_JSON on junk', () => {
    for (const bad of [null, 'x', { docType: 42 }, { docType: 'receipt', date: 'not-a-day' }]) {
      try {
        ExtractedDocument.fromJSON(bad)
        expect.unreachable('should have thrown')
      } catch (e) {
        expect((e as DomainError).code).toBe('MALFORMED_JSON')
      }
    }
  })
})
