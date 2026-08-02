import { DayKey } from '../core/day-key.js'
import { DomainError } from '../core/domain-error.js'
import { Money } from '../core/money.js'
import { ExtractedDocument, type DocCategory, type TransactionType, type LineItem, type Merchant, type Payment } from './extracted-document.js'

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

function moneyFrom(value: unknown, currency: string, label: string): Money | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value !== 'string' || !MONEY_RE.test(value)) {
    throw new DomainError('MALFORMED_JSON', `${label} is not a decimal amount: ${JSON.stringify(value)}`)
  }
  const negative = value.startsWith('-')
  const [whole = '0', frac = ''] = (negative ? value.slice(1) : value).split('.')
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, '0').slice(0, 2))
  return Money.of(negative ? -minor : minor, currency, 2)
}

function optStr(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Decode the LLM wire shape (nullable fields, decimal-string money) into the domain type. */
export function extractionFromLlm(shape: unknown): ExtractedDocument {
  if (typeof shape !== 'object' || shape === null) {
    throw new DomainError('MALFORMED_JSON', 'not an LLM extraction shape')
  }
  const s = shape as Record<string, unknown>
  const currency = optStr(s['currency']) ?? 'USD'

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
    const unitPrice = moneyFrom(i['unitPrice'], currency, 'lineItem.unitPrice')
    const totalPrice = moneyFrom(i['totalPrice'], currency, 'lineItem.totalPrice')
    return [
      {
        name,
        ...(quantity !== undefined ? { quantity } : {}),
        ...(unitPrice !== undefined ? { unitPrice } : {}),
        ...(totalPrice !== undefined ? { totalPrice } : {}),
      },
    ]
  })

  const date = optStr(s['date'])
  const time = optStr(s['time'])
  const transactionType = optStr(s['transactionType'])
  const subtotal = moneyFrom(s['subtotal'], currency, 'subtotal')
  const tax = moneyFrom(s['tax'], currency, 'tax')
  const tip = moneyFrom(s['tip'], currency, 'tip')
  const total = moneyFrom(s['total'], currency, 'total')

  return new ExtractedDocument({
    docType: s['docType'] as DocCategory,
    ...(transactionType !== undefined ? { transactionType: transactionType as TransactionType } : {}),
    ...(date !== undefined ? { date: DayKey.of(date) } : {}),
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
