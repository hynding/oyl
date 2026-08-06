import { DayKey } from '../core/day-key.js'
import { DomainError } from '../core/domain-error.js'
import { Money } from '../core/money.js'
import {
  DOC_CATEGORIES,
  ExtractedDocument,
  TRANSACTION_TYPES,
  type DocCategory,
  type TransactionType,
  type LineItem,
  type Merchant,
  type Payment,
} from './extracted-document.js'

const moneyString = { type: ['string', 'null'], description: 'Decimal amount as printed, e.g. "48.12". null if absent.' }

/**
 * The wire contract for the structuring LLM (Ollama `format`). Money is decimal
 * strings + one top-level currency — models read prices as printed; minor-unit
 * conversion happens in extractionFromLlm. Keep every field nullable so the
 * model can say "absent" instead of inventing values.
 */
export const EXTRACTION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['docType', 'date', 'merchant', 'payment', 'currency', 'total', 'lineItems'],
  properties: {
    docType: { type: 'string', enum: ['receipt', 'invoice', 'statement', 'other'] },
    transactionType: { type: ['string', 'null'], enum: ['purchase', 'refund', 'payment', 'other', null] },
    date: { type: ['string', 'null'], description: 'Document date as YYYY-MM-DD. null if not printed.' },
    time: { type: ['string', 'null'], description: '24h time as HH:MM. null if not printed.' },
    merchant: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: { type: 'string' },
        address: { type: ['string', 'null'] },
        phone: { type: ['string', 'null'] },
      },
    },
    payment: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['method'],
      properties: {
        method: { type: 'string', description: 'lowercase: visa, mastercard, amex, cash, check, ...' },
        accountSuffix: { type: ['string', 'null'], description: 'Card last digits if printed, e.g. "1234".' },
        raw: { type: ['string', 'null'], description: 'Payment line as printed, e.g. "VISA •1234".' },
      },
    },
    currency: { type: 'string', description: 'ISO 4217 code, e.g. "USD".' },
    subtotal: moneyString,
    tax: moneyString,
    tip: moneyString,
    total: moneyString,
    lineItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'totalPrice'],
        properties: {
          name: { type: 'string' },
          quantity: { type: ['number', 'null'] },
          unitPrice: moneyString,
          totalPrice: moneyString,
        },
      },
    },
  },
}

const MONEY_RE = /^-?\d+(\.\d{1,4})?$/

/** ISO 4217 minor-unit exponents that differ from the default 2. */
const CURRENCY_EXPONENTS: Readonly<Record<string, number>> = {
  BHD: 3, BIF: 0, CLP: 0, DJF: 0, GNF: 0, IQD: 3, ISK: 0, JOD: 3, JPY: 0,
  KMF: 0, KRW: 0, KWD: 3, LYD: 3, OMR: 3, PYG: 0, RWF: 0, TND: 3, UGX: 0,
  VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
}

function currencyExponent(currency: string): number {
  return CURRENCY_EXPONENTS[currency] ?? 2
}

/**
 * Lenient decimal-string → Money. Salvages symbols/commas/whitespace the model
 * copied from the receipt ("$48.12", "1,234.56"); anything still malformed is
 * dropped (undefined) so one bad field can't sink the whole file — absence of
 * `total` is caught downstream by requiredFieldsPresent → needs_review.
 */
function moneyFrom(value: unknown, currency: string): Money | undefined {
  if (typeof value !== 'string') return undefined
  const cleaned = value.trim().replace(/[$€£¥]/g, '').replace(/,/g, '').trim()
  if (!MONEY_RE.test(cleaned)) return undefined
  const negative = cleaned.startsWith('-')
  const [whole = '0', frac = ''] = (negative ? cleaned.slice(1) : cleaned).split('.')

  // Half-up rounding at the currency's minor-unit boundary, integer arithmetic only.
  const exponent = currencyExponent(currency)
  const base = 10 ** exponent
  const padded = frac.padEnd(exponent + 1, '0')
  let minorFrac = exponent > 0 ? Number(padded.slice(0, exponent)) : 0
  if (Number(padded[exponent]) >= 5) minorFrac += 1
  let wholeNum = Number(whole)
  if (minorFrac >= base) {
    wholeNum += 1
    minorFrac = 0
  }
  const minor = wholeNum * base + minorFrac
  return Money.of(negative ? -minor : minor, currency, exponent)
}

/** Salvage near-miss times ("18:34:00", "8:34") to HH:MM; unparseable → dropped. */
function timeFrom(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const m = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(value.trim())
  if (!m) return undefined
  const hour = Number(m[1])
  if (hour > 23) return undefined
  return `${String(hour).padStart(2, '0')}:${m[2]}`
}

/** Invalid/unparseable dates are dropped, not fatal — absence flows into requiredFieldsPresent. */
function dateFrom(value: string | undefined): DayKey | undefined {
  if (value === undefined) return undefined
  try {
    return DayKey.of(value.trim())
  } catch {
    return undefined
  }
}

function optStr(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Decode the LLM wire shape (nullable fields, decimal-string money) into the
 * domain type. Lenient by design: malformed OPTIONAL values (bad date/time
 * formats, unsalvageable money strings, out-of-enum types) are dropped rather
 * than fatal — missing date/merchant/total then fail requiredFieldsPresent and
 * the file lands as needs_review instead of an error. Throws only when the
 * shape is not an object at all.
 */
export function extractionFromLlm(shape: unknown): ExtractedDocument {
  if (typeof shape !== 'object' || shape === null) {
    throw new DomainError('MALFORMED_JSON', 'not an LLM extraction shape')
  }
  const s = shape as Record<string, unknown>
  const currencyRaw = optStr(s['currency'])?.trim().toUpperCase()
  const currency = currencyRaw !== undefined && /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : 'USD'

  let merchant: Merchant | undefined
  const m = s['merchant'] as Record<string, unknown> | null | undefined
  const merchantName = optStr(m?.['name'])
  if (merchantName !== undefined) {
    merchant = {
      name: merchantName,
      ...(optStr(m?.['address']) !== undefined ? { address: optStr(m?.['address'])! } : {}),
      ...(optStr(m?.['phone']) !== undefined ? { phone: optStr(m?.['phone'])! } : {}),
    }
  }

  let payment: Payment | undefined
  const p = s['payment'] as Record<string, unknown> | null | undefined
  const paymentMethod = optStr(p?.['method'])
  if (paymentMethod !== undefined) {
    payment = {
      method: paymentMethod.toLowerCase(),
      ...(optStr(p?.['accountSuffix']) !== undefined ? { accountSuffix: optStr(p?.['accountSuffix'])! } : {}),
      ...(optStr(p?.['raw']) !== undefined ? { raw: optStr(p?.['raw'])! } : {}),
    }
  }

  const rawItems = Array.isArray(s['lineItems']) ? (s['lineItems'] as unknown[]) : []
  const lineItems: LineItem[] = rawItems.flatMap((raw) => {
    const i = raw as Record<string, unknown>
    const name = optStr(i['name'])
    if (name === undefined) return []
    const quantity = typeof i['quantity'] === 'number' && i['quantity'] > 0 ? i['quantity'] : undefined
    const unitPrice = moneyFrom(i['unitPrice'], currency)
    const totalPrice = moneyFrom(i['totalPrice'], currency)
    return [
      {
        name,
        ...(quantity !== undefined ? { quantity } : {}),
        ...(unitPrice !== undefined ? { unitPrice } : {}),
        ...(totalPrice !== undefined ? { totalPrice } : {}),
      },
    ]
  })

  const date = dateFrom(optStr(s['date']))
  const time = timeFrom(optStr(s['time']))
  const transactionTypeRaw = optStr(s['transactionType'])
  const transactionType =
    transactionTypeRaw !== undefined && (TRANSACTION_TYPES as readonly string[]).includes(transactionTypeRaw)
      ? (transactionTypeRaw as TransactionType)
      : undefined
  const docTypeRaw = optStr(s['docType'])
  const docType: DocCategory =
    docTypeRaw !== undefined && (DOC_CATEGORIES as readonly string[]).includes(docTypeRaw)
      ? (docTypeRaw as DocCategory)
      : 'other'
  const subtotal = moneyFrom(s['subtotal'], currency)
  const tax = moneyFrom(s['tax'], currency)
  const tip = moneyFrom(s['tip'], currency)
  const total = moneyFrom(s['total'], currency)

  return new ExtractedDocument({
    docType,
    ...(transactionType !== undefined ? { transactionType } : {}),
    ...(date !== undefined ? { date } : {}),
    ...(time !== undefined ? { time } : {}),
    ...(merchant !== undefined ? { merchant } : {}),
    ...(payment !== undefined ? { payment } : {}),
    ...(subtotal !== undefined ? { subtotal } : {}),
    ...(tax !== undefined ? { tax } : {}),
    ...(tip !== undefined ? { tip } : {}),
    ...(total !== undefined ? { total } : {}),
    lineItems,
  })
}
