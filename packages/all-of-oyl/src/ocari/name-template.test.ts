import { describe, expect, it } from 'vitest'
import { DayKey } from '../core/day-key.js'
import { Money } from '../core/money.js'
import { ExtractedDocument } from './extracted-document.js'
import { DEFAULT_NAME_CONFIG, renderFileName, validateNameConfig } from './name-template.js'

const doc = (over: Partial<ConstructorParameters<typeof ExtractedDocument>[0]> = {}) =>
  new ExtractedDocument({
    docType: 'receipt',
    transactionType: 'purchase',
    date: DayKey.of('2026-07-24'),
    time: '18:34',
    merchant: { name: "Trader Joe's" },
    payment: { method: 'visa', accountSuffix: '1234' },
    total: Money.usd(4812),
    ...over,
  })

const cfg = (over: Partial<typeof DEFAULT_NAME_CONFIG> = {}) => ({ ...DEFAULT_NAME_CONFIG, ...over })

describe('renderFileName', () => {
  it('renders the default template', () => {
    expect(renderFileName(doc(), 'jpg', cfg())).toEqual({ name: '2026-07-24_trader-joes_48.12.jpg', missing: [] })
  })

  it('renders the full template from the spec', () => {
    const template =
      '<date>_<time>_<business>_<transaction_type>_<payment_method><payment_account_suffix>_<total>.<ext>'
    expect(renderFileName(doc(), 'jpg', cfg({ template })).name).toBe(
      '2026-07-24_1834_trader-joes_purchase_visa1234_48.12.jpg',
    )
  })

  it('supports YYYYMMDD date format and HH-mm time format', () => {
    const c = cfg({ template: '<date>_<time>_<business>_<total>.<ext>', dateFormat: 'YYYYMMDD', timeFormat: 'HH-mm' })
    expect(renderFileName(doc(), 'jpg', c).name).toBe('20260724_18-34_trader-joes_48.12.jpg')
  })

  it('prepends literal and dynamic prefixes', () => {
    expect(renderFileName(doc(), 'jpg', cfg({ prefix: 'RECEIPT_' })).name).toBe('RECEIPT_2026-07-24_trader-joes_48.12.jpg')
    expect(renderFileName(doc(), 'jpg', cfg({ prefix: '<CATEGORY>_' })).name).toBe('RECEIPT_2026-07-24_trader-joes_48.12.jpg')
  })

  it('collapses separators left by absent optional variables', () => {
    const template = '<date>_<time>_<business>_<payment_method><payment_account_suffix>_<total>.<ext>'
    const noExtras = doc({ time: undefined, payment: undefined })
    expect(renderFileName(noExtras, 'jpg', cfg({ template })).name).toBe('2026-07-24_trader-joes_48.12.jpg')
  })

  it('falls back to unknown for missing date/business/total and reports them', () => {
    const bare = new ExtractedDocument({ docType: 'receipt' })
    expect(renderFileName(bare, 'png', cfg())).toEqual({
      name: 'unknown_unknown_unknown.png',
      missing: ['date', 'business', 'total'],
    })
  })

  it('lowercases the extension and sanitizes hostile merchant names', () => {
    const hostile = doc({ merchant: { name: '  ../Sketchy//Store!!  ' } })
    expect(renderFileName(hostile, 'JPG', cfg()).name).toBe('2026-07-24_sketchy-store_48.12.jpg')
  })
})

describe('validateNameConfig', () => {
  it('accepts the default config', () => {
    expect(validateNameConfig(DEFAULT_NAME_CONFIG)).toEqual([])
  })

  it('rejects unknown variables, listing valid ones', () => {
    const problems = validateNameConfig(cfg({ template: '<date>_<merchant>.<ext>' }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('<merchant>')
    expect(problems[0]).toContain('business')
  })

  it('rejects date formats missing tokens or with hostile characters', () => {
    expect(validateNameConfig(cfg({ dateFormat: 'YYYYMM' }))).toHaveLength(1)
    expect(validateNameConfig(cfg({ dateFormat: 'YYYY/MM/DD' }))).toHaveLength(1)
    expect(validateNameConfig(cfg({ timeFormat: 'HH' }))).toHaveLength(1)
  })

  it('flags a template without <ext>', () => {
    expect(validateNameConfig(cfg({ template: '<date>_<business>_<total>' }))).toHaveLength(1)
  })
})
