import { describe, expect, it } from 'vitest'
import { DayKey } from '../core/day-key.js'
import { Money } from '../core/money.js'
import { ExtractedDocument } from './extracted-document.js'
import { validateExtraction } from './validators.js'

const TODAY = DayKey.of('2026-08-02')
const usd = Money.usd

const doc = (over: Partial<ConstructorParameters<typeof ExtractedDocument>[0]> = {}) =>
  new ExtractedDocument({
    docType: 'receipt',
    date: DayKey.of('2026-07-24'),
    merchant: { name: 'Store' },
    subtotal: usd(4450),
    tax: usd(362),
    total: usd(4812),
    lineItems: [
      { name: 'a', totalPrice: usd(1000) },
      { name: 'b', totalPrice: usd(3450) },
    ],
    ...over,
  })

function check(report: ReturnType<typeof validateExtraction>, name: string) {
  const found = report.checks.find((c) => c.name === name)
  expect(found, `check ${name} present`).toBeDefined()
  return found!
}

describe('validateExtraction', () => {
  it('passes a consistent receipt', () => {
    const r = validateExtraction(doc(), { today: TODAY })
    expect(r.status).toBe('ok')
    expect(r.checks.every((c) => c.status !== 'fail')).toBe(true)
  })

  it('tolerates per-line rounding: ±1 minor unit per line item', () => {
    const r = validateExtraction(doc({ subtotal: usd(4452) }), { today: TODAY }) // off by 2 with 2 items
    expect(check(r, 'lineItemsSumToSubtotal').status).toBe('pass')
    const worse = validateExtraction(doc({ subtotal: usd(4453) }), { today: TODAY }) // off by 3
    expect(check(worse, 'lineItemsSumToSubtotal').status).toBe('fail')
    expect(worse.status).toBe('needs_review')
  })

  it('totalsAddUp with ±2 minor units, counting tip', () => {
    const withTip = doc({ tip: usd(500), total: usd(5312) })
    expect(check(validateExtraction(withTip, { today: TODAY }), 'totalsAddUp').status).toBe('pass')
    const off = doc({ total: usd(4815) }) // 3 off
    const r = validateExtraction(off, { today: TODAY })
    expect(check(r, 'totalsAddUp').status).toBe('fail')
    expect(r.status).toBe('needs_review')
  })

  it('skips arithmetic checks when inputs are absent', () => {
    const bare = new ExtractedDocument({ docType: 'receipt', date: DayKey.of('2026-07-24'), merchant: { name: 'S' }, total: usd(100) })
    const r = validateExtraction(bare, { today: TODAY })
    expect(check(r, 'lineItemsSumToSubtotal').status).toBe('skipped')
    expect(check(r, 'totalsAddUp').status).toBe('skipped')
    expect(r.status).toBe('ok')
  })

  it('fails dateIsSane for a future date', () => {
    const r = validateExtraction(doc({ date: DayKey.of('2027-01-01') }), { today: TODAY })
    expect(check(r, 'dateIsSane').status).toBe('fail')
    expect(r.status).toBe('needs_review')
  })

  it('fails requiredFieldsPresent when date/merchant/total are missing', () => {
    const r = validateExtraction(new ExtractedDocument({ docType: 'receipt' }), { today: TODAY })
    const c = check(r, 'requiredFieldsPresent')
    expect(c.status).toBe('fail')
    expect(c.detail).toContain('date')
    expect(c.detail).toContain('merchant')
    expect(c.detail).toContain('total')
    expect(r.status).toBe('needs_review')
  })

  it('currency mismatch inside arithmetic marks fail, not a throw', () => {
    const r = validateExtraction(doc({ tax: Money.of(362, 'EUR') }), { today: TODAY })
    expect(check(r, 'totalsAddUp').status).toBe('fail')
  })
})
