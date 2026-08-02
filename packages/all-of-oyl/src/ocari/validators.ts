import { DayKey } from '../core/day-key.js'
import { Money } from '../core/money.js'
import type { ExtractedDocument } from './extracted-document.js'

export type CheckStatus = 'pass' | 'fail' | 'skipped'
export interface ValidationCheck { name: string; status: CheckStatus; detail?: string }
export interface ValidationReport { status: 'ok' | 'needs_review'; checks: ValidationCheck[] }

function sum(moneys: Money[]): Money | 'mismatch' {
  try {
    return moneys.reduce((acc, m) => acc.add(m))
  } catch {
    return 'mismatch'
  }
}

/** Deterministic gate for auto-accept: any failing check ⇒ needs_review. Absent inputs skip, never fail. */
export function validateExtraction(doc: ExtractedDocument, opts: { today: DayKey }): ValidationReport {
  const checks: ValidationCheck[] = []

  const missing = [
    ...(doc.date === undefined ? ['date'] : []),
    ...(doc.merchant === undefined ? ['merchant'] : []),
    ...(doc.total === undefined ? ['total'] : []),
  ]
  checks.push(
    missing.length === 0
      ? { name: 'requiredFieldsPresent', status: 'pass' }
      : { name: 'requiredFieldsPresent', status: 'fail', detail: `missing: ${missing.join(', ')}` },
  )

  const priced = doc.lineItems.filter((i) => i.totalPrice !== undefined)
  if (doc.subtotal === undefined || priced.length === 0 || priced.length !== doc.lineItems.length) {
    checks.push({ name: 'lineItemsSumToSubtotal', status: 'skipped' })
  } else {
    const total = sum(priced.map((i) => i.totalPrice!))
    const tolerance = priced.length // ±1 minor unit per line item
    if (total === 'mismatch') {
      checks.push({ name: 'lineItemsSumToSubtotal', status: 'fail', detail: 'currency mismatch across line items' })
    } else {
      const off = Math.abs(total.minor - doc.subtotal.minor)
      checks.push(
        total.currency === doc.subtotal.currency && off <= tolerance
          ? { name: 'lineItemsSumToSubtotal', status: 'pass' }
          : { name: 'lineItemsSumToSubtotal', status: 'fail', detail: `line items sum ${total.minor} vs subtotal ${doc.subtotal.minor} (tolerance ${tolerance})` },
      )
    }
  }

  if (doc.subtotal === undefined || doc.total === undefined) {
    checks.push({ name: 'totalsAddUp', status: 'skipped' })
  } else {
    const parts = [doc.subtotal, ...(doc.tax ? [doc.tax] : []), ...(doc.tip ? [doc.tip] : [])]
    const expected = sum(parts)
    if (expected === 'mismatch' || expected.currency !== doc.total.currency) {
      checks.push({ name: 'totalsAddUp', status: 'fail', detail: 'currency mismatch in totals' })
    } else {
      const off = Math.abs(expected.minor - doc.total.minor)
      checks.push(
        off <= 2
          ? { name: 'totalsAddUp', status: 'pass' }
          : { name: 'totalsAddUp', status: 'fail', detail: `subtotal+tax+tip ${expected.minor} vs total ${doc.total.minor} (tolerance 2)` },
      )
    }
  }

  if (doc.date === undefined) {
    checks.push({ name: 'dateIsSane', status: 'skipped' })
  } else {
    checks.push(
      doc.date.value <= opts.today.value
        ? { name: 'dateIsSane', status: 'pass' }
        : { name: 'dateIsSane', status: 'fail', detail: `date ${doc.date.value} is after today ${opts.today.value}` },
    )
  }

  return { status: checks.some((c) => c.status === 'fail') ? 'needs_review' : 'ok', checks }
}
