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

  it.each(['4 8', 'twelve', '1.2.3'])('drops unsalvageable money string %j instead of failing the file', (bad) => {
    const d = extractionFromLlm({ docType: 'receipt', total: bad, lineItems: [] })
    expect(d.total).toBeUndefined()
    expect(d.docType).toBe('receipt')
  })

  it.each([
    ['$48.12', 4812],
    ['1,234.56', 123456],
    [' 48.12 ', 4812],
    ['-$5.00', -500],
  ])('salvages money string %j printed with symbols/commas → %i minor', (raw, minor) => {
    const d = extractionFromLlm({ docType: 'receipt', total: raw, lineItems: [] })
    expect(d.total?.minor).toBe(minor)
  })

  it('drops a hallucinated date instead of failing the file', () => {
    const d = extractionFromLlm({ ...llmShape(), date: '2026-02-30' })
    expect(d.date).toBeUndefined()
    expect(d.total?.minor).toBe(4812) // rest of the extraction survives
  })

  it('drops a wrong-format date instead of failing the file', () => {
    const d = extractionFromLlm({ ...llmShape(), date: '07/24/2026' })
    expect(d.date).toBeUndefined()
  })

  it.each([
    ['18:34:00', '18:34'],
    ['8:34', '08:34'],
  ])('salvages near-miss time %j → %j', (raw, expected) => {
    const d = extractionFromLlm({ ...llmShape(), time: raw })
    expect(d.time).toBe(expected)
  })

  it('drops an unparseable time instead of failing the file', () => {
    const d = extractionFromLlm({ ...llmShape(), time: 'evening' })
    expect(d.time).toBeUndefined()
    expect(d.total?.minor).toBe(4812)
  })

  it('drops an out-of-enum transactionType and falls back docType to other', () => {
    const d = extractionFromLlm({ ...llmShape(), docType: 'menu', transactionType: 'sale' })
    expect(d.docType).toBe('other')
    expect(d.transactionType).toBeUndefined()
  })

  it('uppercases lowercase currency codes and falls back to USD on junk', () => {
    expect(extractionFromLlm({ docType: 'receipt', currency: 'usd', total: '1.00', lineItems: [] }).total?.currency).toBe('USD')
    expect(extractionFromLlm({ docType: 'receipt', currency: 'US Dollars', total: '1.00', lineItems: [] }).total?.currency).toBe('USD')
  })

  it('still rejects a fundamentally non-object shape', () => {
    expect(() => extractionFromLlm('not an object')).toThrowError(DomainError)
  })

  describe('currency exponents', () => {
    it('parses zero-exponent currencies in whole units', () => {
      const d = extractionFromLlm({ docType: 'receipt', currency: 'JPY', total: '500', lineItems: [] })
      expect(d.total?.minor).toBe(500)
      expect(d.total?.exponent).toBe(0)
      expect(d.total?.currency).toBe('JPY')
    })

    it('rounds half-up at the whole-unit boundary for exponent-0', () => {
      const d = extractionFromLlm({ docType: 'receipt', currency: 'JPY', total: '500.5', lineItems: [] })
      expect(d.total?.minor).toBe(501)
    })

    it('parses three-exponent currencies in mils', () => {
      const d = extractionFromLlm({ docType: 'receipt', currency: 'KWD', total: '1.234', lineItems: [] })
      expect(d.total?.minor).toBe(1234)
      expect(d.total?.exponent).toBe(3)
    })

    it('rounds the 4th decimal half-up for exponent-3 currencies', () => {
      const d = extractionFromLlm({ docType: 'receipt', currency: 'KWD', total: '1.2345', lineItems: [] })
      expect(d.total?.minor).toBe(1235)
    })

    it('defaults unknown codes to exponent 2', () => {
      const d = extractionFromLlm({ docType: 'receipt', currency: 'CAD', total: '9.99', lineItems: [] })
      expect(d.total?.minor).toBe(999)
      expect(d.total?.exponent).toBe(2)
    })
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

describe('line-item quantity lenience', () => {
  it.each([[-2], [0], [Number.NaN]])('drops invalid quantity %p but keeps the item', (bad) => {
    const d = extractionFromLlm({
      docType: 'receipt',
      total: '1.00',
      lineItems: [{ name: 'a', quantity: bad, totalPrice: '1.00' }],
    })
    expect(d.lineItems).toHaveLength(1)
    expect(d.lineItems[0]?.quantity).toBeUndefined()
    expect(d.lineItems[0]?.totalPrice?.minor).toBe(100)
  })
})
