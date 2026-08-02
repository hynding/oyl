import { describe, expect, it } from 'vitest'
import { EXTRACTION_JSON_SCHEMA, extractionFromLlm } from './extraction-schema.js'
import { DomainError } from '../core/domain-error.js'

const llmShape = () => ({
  docType: 'receipt',
  transactionType: 'purchase',
  date: '2026-07-24',
  time: '18:34',
  merchant: { name: "Trader Joe's", address: null, phone: null },
  payment: { method: 'visa', accountSuffix: '1234', raw: 'VISA •1234' },
  currency: 'USD',
  subtotal: '44.50',
  tax: '3.62',
  tip: null,
  total: '48.12',
  lineItems: [{ name: 'Org Bananas', quantity: 2, unitPrice: '0.99', totalPrice: '1.98' }],
})

describe('EXTRACTION_JSON_SCHEMA', () => {
  it('is a closed object schema requiring docType and total', () => {
    expect(EXTRACTION_JSON_SCHEMA['type']).toBe('object')
    expect(EXTRACTION_JSON_SCHEMA['additionalProperties']).toBe(false)
    expect(EXTRACTION_JSON_SCHEMA['required']).toEqual(expect.arrayContaining(['docType', 'total', 'lineItems']))
  })
})

describe('extractionFromLlm', () => {
  it('maps the wire shape into an ExtractedDocument with minor-unit Money', () => {
    const d = extractionFromLlm(llmShape())
    expect(d.date?.value).toBe('2026-07-24')
    expect(d.subtotal?.minor).toBe(4450)
    expect(d.total?.minor).toBe(4812)
    expect(d.total?.currency).toBe('USD')
    expect(d.lineItems[0]?.unitPrice?.minor).toBe(99)
    expect(d.merchant).toEqual({ name: "Trader Joe's" }) // nulls dropped
  })

  it('defaults currency to USD and tolerates missing optionals', () => {
    const d = extractionFromLlm({ docType: 'receipt', total: '5.00', lineItems: [] })
    expect(d.total?.currency).toBe('USD')
    expect(d.merchant).toBeUndefined()
  })

  it('treats null/empty required-by-schema values as absent', () => {
    const d = extractionFromLlm({ docType: 'receipt', date: null, total: null, lineItems: [] })
    expect(d.date).toBeUndefined()
    expect(d.total).toBeUndefined()
  })

  it.each(['4 8', 'twelve', '1.2.3', ''])('rejects malformed money string %j', (bad) => {
    expect(() => extractionFromLlm({ docType: 'receipt', total: bad, lineItems: [] })).toThrowError(DomainError)
  })

  it('rejects a hallucinated date rather than passing it through', () => {
    expect(() => extractionFromLlm({ ...llmShape(), date: '2026-02-30' })).toThrowError(DomainError)
  })

  it('rounds up 3-decimal amounts >= 0.005 to the nearest cent', () => {
    const d = extractionFromLlm({ docType: 'receipt', total: '3.499', lineItems: [] })
    expect(d.total?.minor).toBe(350) // 3.499 rounds to 3.50
  })

  it('rounds down 3-decimal amounts < 0.005 to the nearest cent', () => {
    const d = extractionFromLlm({ docType: 'receipt', total: '1.114', lineItems: [] })
    expect(d.total?.minor).toBe(111) // 1.114 rounds to 1.11
  })

  it('preserves negative amounts during rounding and conversion', () => {
    const d = extractionFromLlm({ docType: 'receipt', total: '-5.00', lineItems: [] })
    expect(d.total?.minor).toBe(-500)
  })
})
