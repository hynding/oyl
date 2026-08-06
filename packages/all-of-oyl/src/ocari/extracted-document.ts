import { DayKey } from '../core/day-key.js'
import { DomainError } from '../core/domain-error.js'
import { Money } from '../core/money.js'

export type DocCategory = 'receipt' | 'invoice' | 'statement' | 'other'
export type TransactionType = 'purchase' | 'refund' | 'payment' | 'other'

export interface Merchant {
  name: string
  address?: string
  phone?: string
}
export interface Payment {
  method: string
  accountSuffix?: string
  raw?: string
}
export interface LineItem {
  name: string
  quantity?: number
  unitPrice?: Money
  totalPrice?: Money
}

export const DOC_CATEGORIES: readonly DocCategory[] = ['receipt', 'invoice', 'statement', 'other']
export const TRANSACTION_TYPES: readonly TransactionType[] = ['purchase', 'refund', 'payment', 'other']
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export interface ExtractedDocumentProps {
  docType: DocCategory
  transactionType?: TransactionType
  date?: DayKey
  /** 24h local wall-clock as printed, "HH:MM". */
  time?: string
  merchant?: Merchant
  payment?: Payment
  subtotal?: Money
  tax?: Money
  tip?: Money
  total?: Money
  lineItems?: LineItem[]
}

/** Best-effort structured read of one document image. Presence of date/merchant/total is enforced by validators, not the type. */
export class ExtractedDocument {
  readonly docType: DocCategory
  readonly transactionType?: TransactionType
  readonly date?: DayKey
  readonly time?: string
  readonly merchant?: Merchant
  readonly payment?: Payment
  readonly subtotal?: Money
  readonly tax?: Money
  readonly tip?: Money
  readonly total?: Money
  readonly lineItems: readonly LineItem[]
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals. */
  private readonly extra: Record<string, unknown>

  constructor(props: ExtractedDocumentProps, extra: Record<string, unknown> = {}) {
    if (!DOC_CATEGORIES.includes(props.docType)) {
      throw new DomainError('INVALID_QUANTITY', `not a doc category: "${props.docType}"`)
    }
    if (props.transactionType !== undefined && !TRANSACTION_TYPES.includes(props.transactionType)) {
      throw new DomainError('INVALID_QUANTITY', `not a transaction type: "${props.transactionType}"`)
    }
    if (props.time !== undefined && !TIME_RE.test(props.time)) {
      throw new DomainError('INVALID_QUANTITY', `not an HH:MM time: "${props.time}"`)
    }
    if (props.merchant !== undefined && props.merchant.name.length === 0) {
      throw new DomainError('INVALID_QUANTITY', 'merchant name must be non-empty')
    }
    if (props.payment !== undefined && props.payment.method.length === 0) {
      throw new DomainError('INVALID_QUANTITY', 'payment method must be non-empty')
    }
    for (const item of props.lineItems ?? []) {
      if (item.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'line item name must be non-empty')
      if (item.quantity !== undefined && !(Number.isFinite(item.quantity) && item.quantity > 0)) {
        throw new DomainError('INVALID_QUANTITY', `line item quantity must be > 0, got ${item.quantity}`)
      }
    }
    this.docType = props.docType
    if (props.transactionType !== undefined) this.transactionType = props.transactionType
    if (props.date !== undefined) this.date = props.date
    if (props.time !== undefined) this.time = props.time
    if (props.merchant !== undefined) this.merchant = { ...props.merchant }
    if (props.payment !== undefined) this.payment = { ...props.payment }
    if (props.subtotal !== undefined) this.subtotal = props.subtotal
    if (props.tax !== undefined) this.tax = props.tax
    if (props.tip !== undefined) this.tip = props.tip
    if (props.total !== undefined) this.total = props.total
    this.lineItems = (props.lineItems ?? []).map((i) => ({ ...i }))
    this.extra = extra
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      docType: this.docType,
      ...(this.transactionType !== undefined ? { transactionType: this.transactionType } : {}),
      ...(this.date !== undefined ? { date: this.date.value } : {}),
      ...(this.time !== undefined ? { time: this.time } : {}),
      ...(this.merchant !== undefined ? { merchant: { ...this.merchant } } : {}),
      ...(this.payment !== undefined ? { payment: { ...this.payment } } : {}),
      ...(this.subtotal !== undefined ? { subtotal: this.subtotal.toJSON() } : {}),
      ...(this.tax !== undefined ? { tax: this.tax.toJSON() } : {}),
      ...(this.tip !== undefined ? { tip: this.tip.toJSON() } : {}),
      ...(this.total !== undefined ? { total: this.total.toJSON() } : {}),
      lineItems: this.lineItems.map((i) => ({
        name: i.name,
        ...(i.quantity !== undefined ? { quantity: i.quantity } : {}),
        ...(i.unitPrice !== undefined ? { unitPrice: i.unitPrice.toJSON() } : {}),
        ...(i.totalPrice !== undefined ? { totalPrice: i.totalPrice.toJSON() } : {}),
      })),
    }
  }

  static fromJSON(shape: unknown): ExtractedDocument {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not an ExtractedDocument shape')
    }
    const { docType, transactionType, date, time, merchant, payment, subtotal, tax, tip, total, lineItems, ...extra } =
      shape as Record<string, unknown>
    try {
      const items = lineItems === undefined ? [] : (lineItems as unknown[])
      if (!Array.isArray(items)) throw new DomainError('MALFORMED_JSON', 'lineItems must be an array')
      return new ExtractedDocument(
        {
          docType: docType as DocCategory,
          ...(transactionType !== undefined ? { transactionType: transactionType as TransactionType } : {}),
          ...(date !== undefined ? { date: DayKey.of(str(date, 'date')) } : {}),
          ...(time !== undefined ? { time: str(time, 'time') } : {}),
          ...(merchant !== undefined ? { merchant: merchantFromJSON(merchant) } : {}),
          ...(payment !== undefined ? { payment: paymentFromJSON(payment) } : {}),
          ...(subtotal !== undefined ? { subtotal: Money.fromJSON(subtotal) } : {}),
          ...(tax !== undefined ? { tax: Money.fromJSON(tax) } : {}),
          ...(tip !== undefined ? { tip: Money.fromJSON(tip) } : {}),
          ...(total !== undefined ? { total: Money.fromJSON(total) } : {}),
          lineItems: items.map(lineItemFromJSON),
        },
        extra,
      )
    } catch (e) {
      if (e instanceof DomainError && e.code !== 'MALFORMED_JSON') {
        throw new DomainError('MALFORMED_JSON', 'not an ExtractedDocument shape')
      }
      throw e
    }
  }
}

function str(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new DomainError('MALFORMED_JSON', `${label} must be a string`)
  return value
}

function merchantFromJSON(shape: unknown): Merchant {
  const s = shape as { name?: unknown; address?: unknown; phone?: unknown }
  return {
    name: str(s?.name, 'merchant.name'),
    ...(s.address !== undefined ? { address: str(s.address, 'merchant.address') } : {}),
    ...(s.phone !== undefined ? { phone: str(s.phone, 'merchant.phone') } : {}),
  }
}

function paymentFromJSON(shape: unknown): Payment {
  const s = shape as { method?: unknown; accountSuffix?: unknown; raw?: unknown }
  return {
    method: str(s?.method, 'payment.method'),
    ...(s.accountSuffix !== undefined ? { accountSuffix: str(s.accountSuffix, 'payment.accountSuffix') } : {}),
    ...(s.raw !== undefined ? { raw: str(s.raw, 'payment.raw') } : {}),
  }
}

function lineItemFromJSON(shape: unknown): LineItem {
  const s = shape as { name?: unknown; quantity?: unknown; unitPrice?: unknown; totalPrice?: unknown }
  if (s?.quantity !== undefined && typeof s.quantity !== 'number') {
    throw new DomainError('MALFORMED_JSON', 'lineItem.quantity must be a number')
  }
  return {
    name: str(s?.name, 'lineItem.name'),
    ...(s.quantity !== undefined ? { quantity: s.quantity as number } : {}),
    ...(s.unitPrice !== undefined ? { unitPrice: Money.fromJSON(s.unitPrice) } : {}),
    ...(s.totalPrice !== undefined ? { totalPrice: Money.fromJSON(s.totalPrice) } : {}),
  }
}
