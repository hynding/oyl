# ocari Receipt/Document Image Parsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local CLI (`pnpm ocari <image…>`) that parses a receipt/invoice/statement image into a template-named copy plus a JSON data-sheet sidecar, with the domain types/validators/name-renderer shared in `@oyl/all-of-oyl`.

**Architecture:** Pure domain logic (ExtractedDocument type + codec, LLM wire-shape mapper, arithmetic validators, filename template renderer) lives in `packages/all-of-oyl/src/ocari/` — zero-dep, DOM-free, injected-interface style. The CLI package `packages/ocari-oyl` wires two injected engines — `PaddleOcrEngine` (ppu-paddle-ocr, grounded OCR) and `OllamaVlmEngine` (built-in `fetch` → Ollama structured outputs, image + OCR text + JSON schema) — around a pure pipeline, then does filesystem work (copy/rename, collision suffix, sidecar) at the edge.

**Tech Stack:** TypeScript (NodeNext, strict), vitest, `ppu-paddle-ocr` (only runtime dep), Ollama `qwen2.5-vl:7b` via HTTP, `tsx` (devDep) to run the CLI against workspace TS source.

**Spec:** `docs/superpowers/specs/2026-07-28-ocari-receipt-parsing-design.md`

## Global Constraints

- `all-of-oyl/src` is `"type": "module"` + NodeNext: **every relative import needs an explicit `.js` extension**; `noUnusedLocals`/`noUnusedParameters` enforced; no DOM/Web globals except via injected interfaces.
- Definition of Done per task: affected package tests + typecheck green; for `all-of-oyl` tasks also `pnpm all-of typecheck:src` and `pnpm all-of build` (DOM-safety gate).
- `ExtractedDocument` is **not** registered in `src/collections.ts` (nothing persists in v1).
- New exports go through the single barrel `packages/all-of-oyl/src/index.ts` only.
- CLI runtime deps: `ppu-paddle-ocr` only. Ollama is called with built-in `fetch` — no client lib.
- Config precedence: CLI flag > env var > default. Env keys: `OYL_OCARI_OLLAMA_URL`, `OYL_OCARI_MODEL`, `OYL_OCARI_NAME_TEMPLATE`, `OYL_OCARI_NAME_PREFIX`, `OYL_OCARI_DATE_FORMAT`, `OYL_OCARI_TIME_FORMAT`; each (except URL) has a flag. Defaults: `http://localhost:11434`, `qwen2.5-vl:7b`, `<date>_<business>_<total>.<ext>`, `` (empty), `YYYY-MM-DD`, `HHmm`.
- Originals are never modified or deleted (`--rename` moves; default copies). No live-Ollama calls in `pnpm test`.
- Commits: behavior-scoped, prefixed (`feat`/`fix`/`refactor`/`chore`/`docs`), ending with the trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- One deliberate deviation from the spec text (spec's missing-value rules require it): `date`, `merchant`, and `total` are **optional** on `ExtractedDocument` — extraction is best-effort; the `requiredFieldsPresent` validator + `unknown` filename fallback enforce presence downstream.

## File Structure

```
packages/all-of-oyl/src/ocari/
  extracted-document.ts        # ExtractedDocument + Merchant/Payment/LineItem types + codec
  extracted-document.test.ts
  extraction-schema.ts         # EXTRACTION_JSON_SCHEMA (Ollama format=) + extractionFromLlm mapper
  extraction-schema.test.ts
  validators.ts                # arithmetic/date/presence checks → ValidationReport
  validators.test.ts
  name-template.ts             # validateNameConfig + renderFileName (+ toNameSlug, date/time formats)
  name-template.test.ts
packages/all-of-oyl/src/index.ts   # barrel exports (modify)
packages/ocari-oyl/
  package.json                 # @oyl/ocari-oyl
  tsconfig.json
  README.md                    # setup (ollama pull), usage, config table
  src/config.ts                # loadConfig (flags/env/.env/defaults, fail-fast validation)
  src/config.test.ts
  src/ollama-engine.ts         # OllamaVlmEngine (StructuringEngine via injected fetch)
  src/ollama-engine.test.ts
  src/paddle-ocr-engine.ts     # PaddleOcrEngine (OcrEngine adapter over ppu-paddle-ocr)
  src/pipeline.ts              # processDocument: bytes → extraction/validation/name/sidecar (pure-ish, engines injected)
  src/pipeline.test.ts
  src/output.ts                # planOutputs/writeOutputs: collision suffix, copy|rename, sidecar
  src/output.test.ts
  src/cli.ts                   # parseCliArgs + main(): batch loop, summary table
  src/cli.test.ts
  scripts/eval.ts              # golden-set accuracy report (live engines, NOT in pnpm test)
  golden/README.md             # how to add receipts + expected JSON (images/expected gitignored)
package.json                   # root: add "ocari" filter alias (modify)
.gitignore                     # golden-set images/expected (modify)
CLAUDE.md                      # package table + dev workflow rows (modify)
```

Shared interface vocabulary (defined in Task 1/2, used everywhere):

```ts
// all-of-oyl/src/ocari/extracted-document.ts
export type DocCategory = 'receipt' | 'invoice' | 'statement' | 'other'
export type TransactionType = 'purchase' | 'refund' | 'payment' | 'other'
export interface Merchant { name: string; address?: string; phone?: string }
export interface Payment { method: string; accountSuffix?: string; raw?: string }
export interface LineItem { name: string; quantity?: number; unitPrice?: Money; totalPrice?: Money }

// ocari-oyl/src/pipeline.ts
export interface OcrLine { text: string; box?: number[] }
export interface OcrEngine { recognize(image: Uint8Array): Promise<OcrLine[]>; readonly name: string }
export interface StructuringEngine { extract(image: Uint8Array, ocrLines: OcrLine[]): Promise<unknown>; readonly model: string }
```

---

### Task 1: `ExtractedDocument` domain type + codec

**Files:**
- Create: `packages/all-of-oyl/src/ocari/extracted-document.ts`
- Test: `packages/all-of-oyl/src/ocari/extracted-document.test.ts`
- Modify: `packages/all-of-oyl/src/index.ts` (add exports after the vault block)

**Interfaces:**
- Consumes: `DomainError`, `DayKey`, `Money` from `../core/*.js`.
- Produces: `ExtractedDocument` class (constructor `new ExtractedDocument(props, extra?)`, `toJSON(): Record<string, unknown>`, `static fromJSON(shape: unknown): ExtractedDocument`), types `DocCategory`, `TransactionType`, `Merchant`, `Payment`, `LineItem`. Props: `{ docType: DocCategory; transactionType?: TransactionType; date?: DayKey; time?: string; merchant?: Merchant; payment?: Payment; subtotal?: Money; tax?: Money; tip?: Money; total?: Money; lineItems?: LineItem[] }` (lineItems defaults to `[]`).

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/ocari/extracted-document.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/ocari/extracted-document.test.ts`
Expected: FAIL — cannot resolve `./extracted-document.js`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/ocari/extracted-document.ts
import { DayKey } from '../core/day-key.js'
import { DomainError } from '../core/domain-error.js'
import { Money } from '../core/money.js'

export type DocCategory = 'receipt' | 'invoice' | 'statement' | 'other'
export type TransactionType = 'purchase' | 'refund' | 'payment' | 'other'

export interface Merchant { name: string; address?: string; phone?: string }
export interface Payment { method: string; accountSuffix?: string; raw?: string }
export interface LineItem { name: string; quantity?: number; unitPrice?: Money; totalPrice?: Money }

const DOC_CATEGORIES: readonly DocCategory[] = ['receipt', 'invoice', 'statement', 'other']
const TRANSACTION_TYPES: readonly TransactionType[] = ['purchase', 'refund', 'payment', 'other']
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
```

- [ ] **Step 4: Export from the barrel**

In `packages/all-of-oyl/src/index.ts`, after the vault export block (`export { Vault, ... }`), add:

```ts
export {
  ExtractedDocument,
  type ExtractedDocumentProps,
  type DocCategory,
  type TransactionType,
  type Merchant,
  type Payment,
  type LineItem,
} from './ocari/extracted-document.js'
```

- [ ] **Step 5: Run tests and gates**

Run: `pnpm all-of test && pnpm all-of typecheck:src && pnpm all-of build`
Expected: all green (build regenerates `dist/` and the bare-import guard passes).

- [ ] **Step 6: Commit**

```bash
git add packages/all-of-oyl/src/ocari/ packages/all-of-oyl/src/index.ts
git commit -m "feat: add ocari ExtractedDocument domain type + codec

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: LLM extraction schema + wire mapper

**Files:**
- Create: `packages/all-of-oyl/src/ocari/extraction-schema.ts`
- Test: `packages/all-of-oyl/src/ocari/extraction-schema.test.ts`
- Modify: `packages/all-of-oyl/src/index.ts`

**Interfaces:**
- Consumes: `ExtractedDocument` (Task 1), `Money`, `DayKey`, `DomainError`.
- Produces: `EXTRACTION_JSON_SCHEMA: Record<string, unknown>` (JSON Schema sent as Ollama `format`) and `extractionFromLlm(shape: unknown): ExtractedDocument`. The LLM wire shape uses **decimal strings** for money (`"48.12"`) + one top-level `currency` (ISO code, default `"USD"`) — never minor units; the mapper converts to `Money` (exponent 2).

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/ocari/extraction-schema.test.ts
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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/ocari/extraction-schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/ocari/extraction-schema.ts
import { DayKey } from '../core/day-key.js'
import { DomainError } from '../core/domain-error.js'
import { Money } from '../core/money.js'
import { ExtractedDocument, type LineItem, type Merchant, type Payment } from './extracted-document.js'

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
    docType: s['docType'] as ExtractedDocument['docType'],
    ...(transactionType !== undefined ? { transactionType: transactionType as ExtractedDocument['transactionType'] } : {}),
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
```

Note: constructor/`DayKey.of` failures surface as `DomainError` — the test for `2026-02-30` passes because `DayKey.of` rejects impossible dates. If the `INVALID_DAY` code (not `MALFORMED_JSON`) matters to a test, assert on `DomainError` only, as written.

- [ ] **Step 4: Export from the barrel**

Add to `packages/all-of-oyl/src/index.ts` next to the Task 1 exports:

```ts
export { EXTRACTION_JSON_SCHEMA, extractionFromLlm } from './ocari/extraction-schema.js'
```

- [ ] **Step 5: Run tests and gates**

Run: `pnpm all-of test && pnpm all-of typecheck:src && pnpm all-of build`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/all-of-oyl/src/ocari/extraction-schema.ts packages/all-of-oyl/src/ocari/extraction-schema.test.ts packages/all-of-oyl/src/index.ts
git commit -m "feat: add ocari LLM extraction schema + wire mapper

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Validators

**Files:**
- Create: `packages/all-of-oyl/src/ocari/validators.ts`
- Test: `packages/all-of-oyl/src/ocari/validators.test.ts`
- Modify: `packages/all-of-oyl/src/index.ts`

**Interfaces:**
- Consumes: `ExtractedDocument`, `DayKey`, `Money`.
- Produces:

```ts
export type CheckStatus = 'pass' | 'fail' | 'skipped'
export interface ValidationCheck { name: string; status: CheckStatus; detail?: string }
export interface ValidationReport { status: 'ok' | 'needs_review'; checks: ValidationCheck[] }
export function validateExtraction(doc: ExtractedDocument, opts: { today: DayKey }): ValidationReport
```

Checks (spec §validators): `requiredFieldsPresent` (date+merchant+total), `lineItemsSumToSubtotal` (±1 minor unit **per line item**), `totalsAddUp` (subtotal+tax+tip ≈ total, ±2 minor units), `dateIsSane` (not after `today`). A check whose inputs are absent is `skipped`. Any `fail` ⇒ `needs_review`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/ocari/validators.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/ocari/validators.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/ocari/validators.ts
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
```

- [ ] **Step 4: Export from the barrel**

```ts
export { validateExtraction, type ValidationCheck, type ValidationReport, type CheckStatus } from './ocari/validators.js'
```

- [ ] **Step 5: Run tests and gates**

Run: `pnpm all-of test && pnpm all-of typecheck:src && pnpm all-of build`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/all-of-oyl/src/ocari/validators.ts packages/all-of-oyl/src/ocari/validators.test.ts packages/all-of-oyl/src/index.ts
git commit -m "feat: add ocari extraction validators (arithmetic + presence + date gates)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Filename template renderer

**Files:**
- Create: `packages/all-of-oyl/src/ocari/name-template.ts`
- Test: `packages/all-of-oyl/src/ocari/name-template.test.ts`
- Modify: `packages/all-of-oyl/src/index.ts`

**Interfaces:**
- Consumes: `ExtractedDocument`, `Money`, `DayKey`.
- Produces:

```ts
export interface NameConfig { template: string; prefix: string; dateFormat: string; timeFormat: string }
export const DEFAULT_NAME_CONFIG: NameConfig // template '<date>_<business>_<total>.<ext>', prefix '', 'YYYY-MM-DD', 'HHmm'
export function validateNameConfig(config: NameConfig): string[] // human-readable problems; [] = valid
export function renderFileName(doc: ExtractedDocument, ext: string, config: NameConfig): { name: string; missing: string[] }
```

Rules (spec §Filename templating): variables `date`, `time`, `business`, `category`, `CATEGORY`, `transaction_type`, `payment_method`, `payment_account_suffix`, `total`, `ext`; prefix is itself a template; date format = string over tokens `YYYY`/`MM`/`DD` (all three required, other chars limited to `-`, `_`, `.`); time format over `HH`/`mm` (both required); substituted values sanitized to hyphen slugs (lowercase alnum + `-`); `<CATEGORY>` uppercased; `<total>` keeps its `.`; missing `date`/`business`/`total` render `unknown` and are reported in `missing`; other absent vars render empty; separator runs collapse to their first character; leading/trailing separators (incl. before the extension dot) are trimmed; unknown variables are a `validateNameConfig` error.

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/ocari/name-template.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/ocari/name-template.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/ocari/name-template.ts
import type { ExtractedDocument } from './extracted-document.js'

export interface NameConfig {
  template: string
  prefix: string
  dateFormat: string
  timeFormat: string
}

export const DEFAULT_NAME_CONFIG: NameConfig = {
  template: '<date>_<business>_<total>.<ext>',
  prefix: '',
  dateFormat: 'YYYY-MM-DD',
  timeFormat: 'HHmm',
}

const VARIABLES = [
  'date',
  'time',
  'business',
  'category',
  'CATEGORY',
  'transaction_type',
  'payment_method',
  'payment_account_suffix',
  'total',
  'ext',
] as const
type Variable = (typeof VARIABLES)[number]
/** date/business/total render as "unknown" when absent (and force needs_review); others render empty. */
const REQUIRED: readonly Variable[] = ['date', 'business', 'total']

const VAR_RE = /<([^<>]+)>/g

/** Filename-safe hyphen slug (distinct from core toSlug, which is underscore-based for metric keys). */
function toNameSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Human-readable config problems; [] means valid. CLI fails fast on non-empty. */
export function validateNameConfig(config: NameConfig): string[] {
  const problems: string[] = []
  for (const source of [config.template, config.prefix]) {
    for (const match of source.matchAll(VAR_RE)) {
      if (!(VARIABLES as readonly string[]).includes(match[1]!)) {
        problems.push(`unknown variable <${match[1]}> — valid: ${VARIABLES.map((v) => `<${v}>`).join(', ')}`)
      }
    }
  }
  if (!config.template.includes('<ext>')) {
    problems.push('template must end with the file extension: include <ext>')
  }
  if (!/^(?=.*YYYY)(?=.*MM)(?=.*DD)[YMD\-_.]+$/.test(config.dateFormat)) {
    problems.push(`date format must use YYYY, MM and DD with only -_. separators, got "${config.dateFormat}"`)
  }
  if (!/^(?=.*HH)(?=.*mm)[Hm\-_.]+$/.test(config.timeFormat)) {
    problems.push(`time format must use HH and mm with only -_. separators, got "${config.timeFormat}"`)
  }
  return problems
}

function formatDate(value: string, format: string): string {
  const [y = '', m = '', d = ''] = value.split('-')
  return format.replace('YYYY', y).replace('MM', m).replace('DD', d)
}

function formatTime(value: string, format: string): string {
  const [h = '', m = ''] = value.split(':')
  return format.replace('HH', h).replace('mm', m)
}

function moneyToDecimal(minor: number, exponent: number): string {
  const negative = minor < 0
  const abs = Math.abs(minor).toString().padStart(exponent + 1, '0')
  const cut = abs.length - exponent
  return `${negative ? '-' : ''}${abs.slice(0, cut)}${exponent > 0 ? `.${abs.slice(cut)}` : ''}`
}

/**
 * Render the configured filename for an extraction. Assumes validateNameConfig
 * passed. Returns the rendered name plus which required variables fell back to
 * "unknown" (callers force needs_review when non-empty).
 */
export function renderFileName(
  doc: ExtractedDocument,
  ext: string,
  config: NameConfig,
): { name: string; missing: string[] } {
  const missing = new Set<string>()

  const valueOf = (variable: Variable): string => {
    switch (variable) {
      case 'date':
        return doc.date !== undefined ? formatDate(doc.date.value, config.dateFormat) : fallback('date')
      case 'time':
        return doc.time !== undefined ? formatTime(doc.time, config.timeFormat) : ''
      case 'business':
        return doc.merchant !== undefined ? toNameSlug(doc.merchant.name) : fallback('business')
      case 'category':
        return doc.docType
      case 'CATEGORY':
        return doc.docType.toUpperCase()
      case 'transaction_type':
        return doc.transactionType ?? ''
      case 'payment_method':
        return doc.payment !== undefined ? toNameSlug(doc.payment.method) : ''
      case 'payment_account_suffix':
        return doc.payment?.accountSuffix !== undefined ? doc.payment.accountSuffix.replace(/[^0-9a-z]/gi, '') : ''
      case 'total':
        return doc.total !== undefined ? moneyToDecimal(doc.total.minor, doc.total.exponent) : fallback('total')
      case 'ext':
        return ext.toLowerCase().replace(/^\.+/, '')
    }
  }

  function fallback(name: string): string {
    missing.add(name)
    return 'unknown'
  }

  const rendered = (config.prefix + config.template).replace(VAR_RE, (_, v: string) => valueOf(v as Variable))
  const name = rendered
    .replace(/[_-]{2,}/g, (run) => run[0]!) // collapse separator runs left by empty variables
    .replace(/[_-]+(?=\.)/g, '') // no dangling separator before the extension dot
    .replace(/^[_-]+/, '')
  return { name, missing: [...missing] }
}
```

- [ ] **Step 4: Export from the barrel**

```ts
export { DEFAULT_NAME_CONFIG, renderFileName, validateNameConfig, type NameConfig } from './ocari/name-template.js'
```

- [ ] **Step 5: Run tests and gates**

Run: `pnpm all-of test && pnpm all-of typecheck:src && pnpm all-of build`
Expected: green. Also run `pnpm --filter @oyl/all-of-oyl exec tsc --noEmit` (full typecheck incl. tests).

- [ ] **Step 6: Commit**

```bash
git add packages/all-of-oyl/src/ocari/name-template.ts packages/all-of-oyl/src/ocari/name-template.test.ts packages/all-of-oyl/src/index.ts
git commit -m "feat: add ocari filename template renderer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: `@oyl/ocari-oyl` package scaffold + config loader

**Files:**
- Create: `packages/ocari-oyl/package.json`, `packages/ocari-oyl/tsconfig.json`, `packages/ocari-oyl/src/config.ts`
- Test: `packages/ocari-oyl/src/config.test.ts`
- Modify: root `package.json` (add `"ocari"` alias)

**Interfaces:**
- Consumes: `DEFAULT_NAME_CONFIG`, `validateNameConfig`, `type NameConfig` from `@oyl/all-of-oyl`.
- Produces:

```ts
export interface OcariConfig { ollamaUrl: string; model: string; name: NameConfig; out?: string; rename: boolean; dryRun: boolean }
export class ConfigError extends Error {}
export function loadConfig(args: {
  flags: Partial<{ model: string; out: string; rename: boolean; 'dry-run': boolean; 'name-template': string; 'name-prefix': string; 'date-format': string; 'time-format': string }>
  env: Record<string, string | undefined>
  dotenv: string // raw contents of the untracked root .env ('' if absent)
}): OcariConfig // throws ConfigError with all problems joined when name config is invalid
```

- [ ] **Step 1: Create the package manifest and tsconfig**

```json
// packages/ocari-oyl/package.json
{
  "name": "@oyl/ocari-oyl",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "ocari (OCR mixed with AI) — receipt/document image parsing CLI",
  "scripts": {
    "ocari": "tsx src/cli.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "eval": "tsx scripts/eval.ts"
  },
  "dependencies": {
    "@oyl/all-of-oyl": "workspace:*",
    "ppu-paddle-ocr": "^6.2.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "tsx": "^4.19.0",
    "typescript": "^5",
    "vitest": "^4.1.8"
  }
}
```

```json
// packages/ocari-oyl/tsconfig.json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "lib": ["ES2022"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src", "scripts"]
}
```

In root `package.json` `scripts`, after `"e2e"`, add:

```json
"ocari": "pnpm --filter @oyl/ocari-oyl ocari",
```

Then run `pnpm install` (registers the workspace package, fetches `ppu-paddle-ocr` + `tsx`).
Note: if `pnpm install` fails on the `ppu-paddle-ocr` version, check the available version with `pnpm view ppu-paddle-ocr versions` and pin the latest 6.x.

- [ ] **Step 2: Write the failing config test**

```ts
// packages/ocari-oyl/src/config.test.ts
import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from './config.js'

const empty = { flags: {}, env: {}, dotenv: '' }

describe('loadConfig', () => {
  it('applies defaults', () => {
    const c = loadConfig(empty)
    expect(c.ollamaUrl).toBe('http://localhost:11434')
    expect(c.model).toBe('qwen2.5-vl:7b')
    expect(c.name.template).toBe('<date>_<business>_<total>.<ext>')
    expect(c.name.prefix).toBe('')
    expect(c.name.dateFormat).toBe('YYYY-MM-DD')
    expect(c.name.timeFormat).toBe('HHmm')
    expect(c.rename).toBe(false)
    expect(c.dryRun).toBe(false)
  })

  it('reads OYL_OCARI_* keys from the .env contents without sourcing it wholesale', () => {
    const dotenv = [
      'OYL_PI_HOST=pi.local # unrelated key ignored',
      'OYL_OCARI_MODEL=llava:13b',
      'OYL_OCARI_DATE_FORMAT=YYYYMMDD',
      'OYL_OCARI_NAME_PREFIX="<CATEGORY>_"',
    ].join('\n')
    const c = loadConfig({ ...empty, dotenv })
    expect(c.model).toBe('llava:13b')
    expect(c.name.dateFormat).toBe('YYYYMMDD')
    expect(c.name.prefix).toBe('<CATEGORY>_') // surrounding quotes stripped
  })

  it('precedence: flag > env > .env > default', () => {
    const c = loadConfig({
      flags: { model: 'from-flag' },
      env: { OYL_OCARI_MODEL: 'from-env', OYL_OCARI_TIME_FORMAT: 'HH-mm' },
      dotenv: 'OYL_OCARI_MODEL=from-dotenv\nOYL_OCARI_TIME_FORMAT=HHmm',
    })
    expect(c.model).toBe('from-flag')
    expect(c.name.timeFormat).toBe('HH-mm')
  })

  it('fails fast on an invalid template, listing valid variables', () => {
    expect(() => loadConfig({ ...empty, flags: { 'name-template': '<merchant>.<ext>' } })).toThrowError(ConfigError)
    try {
      loadConfig({ ...empty, flags: { 'name-template': '<merchant>.<ext>' } })
    } catch (e) {
      expect((e as Error).message).toContain('<merchant>')
      expect((e as Error).message).toContain('business')
    }
  })

  it('fails fast on an invalid date format', () => {
    expect(() => loadConfig({ ...empty, env: { OYL_OCARI_DATE_FORMAT: 'YY' } })).toThrowError(ConfigError)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @oyl/ocari-oyl test`
Expected: FAIL — `./config.js` not found.

- [ ] **Step 4: Write the implementation**

```ts
// packages/ocari-oyl/src/config.ts
import { DEFAULT_NAME_CONFIG, validateNameConfig, type NameConfig } from '@oyl/all-of-oyl'

export interface OcariConfig {
  ollamaUrl: string
  model: string
  name: NameConfig
  out?: string
  rename: boolean
  dryRun: boolean
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export interface ConfigInputs {
  flags: Partial<{
    model: string
    out: string
    rename: boolean
    'dry-run': boolean
    'name-template': string
    'name-prefix': string
    'date-format': string
    'time-format': string
  }>
  env: Record<string, string | undefined>
  /** Raw contents of the untracked root .env; '' when absent. Parsed per-key, never sourced. */
  dotenv: string
}

/** Extract one KEY=value from .env text (deploy-pi pattern): last wins, CR and one layer of matching quotes stripped. */
function dotenvKey(dotenv: string, key: string): string | undefined {
  let found: string | undefined
  for (const line of dotenv.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(?:#.*)?$/.exec(line.replace(/\r$/, ''))
    if (m && m[1] === key) found = m[2]!.replace(/^(["'])(.*)\1$/, '$2')
  }
  return found
}

export function loadConfig(inputs: ConfigInputs): OcariConfig {
  const setting = (flag: string | undefined, envKey: string, fallback: string): string =>
    flag ?? inputs.env[envKey] ?? dotenvKey(inputs.dotenv, envKey) ?? fallback

  const name: NameConfig = {
    template: setting(inputs.flags['name-template'], 'OYL_OCARI_NAME_TEMPLATE', DEFAULT_NAME_CONFIG.template),
    prefix: setting(inputs.flags['name-prefix'], 'OYL_OCARI_NAME_PREFIX', DEFAULT_NAME_CONFIG.prefix),
    dateFormat: setting(inputs.flags['date-format'], 'OYL_OCARI_DATE_FORMAT', DEFAULT_NAME_CONFIG.dateFormat),
    timeFormat: setting(inputs.flags['time-format'], 'OYL_OCARI_TIME_FORMAT', DEFAULT_NAME_CONFIG.timeFormat),
  }
  const problems = validateNameConfig(name)
  if (problems.length > 0) throw new ConfigError(problems.join('\n'))

  return {
    ollamaUrl: setting(undefined, 'OYL_OCARI_OLLAMA_URL', 'http://localhost:11434'),
    model: setting(inputs.flags.model, 'OYL_OCARI_MODEL', 'qwen2.5-vl:7b'),
    name,
    ...(inputs.flags.out !== undefined ? { out: inputs.flags.out } : {}),
    rename: inputs.flags.rename ?? false,
    dryRun: inputs.flags['dry-run'] ?? false,
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @oyl/ocari-oyl test && pnpm --filter @oyl/ocari-oyl typecheck`
Expected: green. Also `pnpm typecheck` at root still green (new package joins the aggregate).

- [ ] **Step 6: Commit**

```bash
git add packages/ocari-oyl/package.json packages/ocari-oyl/tsconfig.json packages/ocari-oyl/src/config.ts packages/ocari-oyl/src/config.test.ts package.json pnpm-lock.yaml
git commit -m "feat: scaffold @oyl/ocari-oyl package with config loader

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Ollama structuring engine

**Files:**
- Create: `packages/ocari-oyl/src/ollama-engine.ts`
- Test: `packages/ocari-oyl/src/ollama-engine.test.ts`

**Interfaces:**
- Consumes: `EXTRACTION_JSON_SCHEMA`, `type FetchFn` from `@oyl/all-of-oyl`; `OcrLine` (defined here, re-exported by pipeline in Task 7 — keep the definition HERE to avoid a cycle).
- Produces:

```ts
export interface OcrLine { text: string; box?: number[] }
export class OllamaError extends Error {} // message is user-actionable
export function createOllamaEngine(opts: { url: string; model: string; fetchFn: FetchFn }): {
  readonly model: string
  extract(image: Uint8Array, ocrLines: OcrLine[]): Promise<unknown>
}
```

Request contract (spec §engine): `POST {url}/api/chat`, body `{ model, stream: false, options: { temperature: 0 }, format: EXTRACTION_JSON_SCHEMA, messages: [{ role: 'user', content: prompt, images: [base64] }] }`. The prompt restates the schema fields (Ollama drops schema `description`s) and embeds the OCR text. Response: `{ message: { content: string } }` → `JSON.parse(content)` returned raw (`unknown`); the pipeline decodes it.

- [ ] **Step 1: Write the failing test**

```ts
// packages/ocari-oyl/src/ollama-engine.test.ts
import { describe, expect, it } from 'vitest'
import type { FetchFn } from '@oyl/all-of-oyl'
import { OllamaError, createOllamaEngine } from './ollama-engine.js'

function fakeFetch(status: number, body: unknown): { calls: { url: string; init: Parameters<FetchFn>[1] }[]; fetchFn: FetchFn } {
  const calls: { url: string; init: Parameters<FetchFn>[1] }[] = []
  const fetchFn: FetchFn = async (url, init) => {
    calls.push({ url: String(url), init })
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Awaited<ReturnType<FetchFn>>
  }
  return { calls, fetchFn }
}

const image = new Uint8Array([1, 2, 3])
const lines = [{ text: 'TRADER JOES' }, { text: 'TOTAL 48.12' }]

describe('createOllamaEngine', () => {
  it('POSTs the structured-output request', async () => {
    const { calls, fetchFn } = fakeFetch(200, { message: { content: '{"docType":"receipt"}' } })
    const engine = createOllamaEngine({ url: 'http://localhost:11434', model: 'qwen2.5-vl:7b', fetchFn })
    const result = await engine.extract(image, lines)
    expect(result).toEqual({ docType: 'receipt' })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('http://localhost:11434/api/chat')
    const sent = JSON.parse(String(calls[0]!.init?.body))
    expect(sent.model).toBe('qwen2.5-vl:7b')
    expect(sent.stream).toBe(false)
    expect(sent.options).toEqual({ temperature: 0 })
    expect(sent.format.type).toBe('object') // EXTRACTION_JSON_SCHEMA passed through
    expect(sent.messages).toHaveLength(1)
    expect(sent.messages[0].images).toEqual([Buffer.from(image).toString('base64')])
    expect(sent.messages[0].content).toContain('TOTAL 48.12') // OCR text embedded
    expect(sent.messages[0].content).toContain('docType') // schema restated in prompt
  })

  it('maps connection refusal to an actionable error', async () => {
    const fetchFn: FetchFn = async () => {
      throw new TypeError('fetch failed')
    }
    const engine = createOllamaEngine({ url: 'http://localhost:11434', model: 'qwen2.5-vl:7b', fetchFn })
    await expect(engine.extract(image, lines)).rejects.toThrowError(OllamaError)
    await expect(engine.extract(image, lines)).rejects.toThrowError(/ollama serve|not reachable/i)
  })

  it('maps 404 to a pull hint', async () => {
    const { fetchFn } = fakeFetch(404, { error: 'model not found' })
    const engine = createOllamaEngine({ url: 'http://localhost:11434', model: 'qwen2.5-vl:7b', fetchFn })
    await expect(engine.extract(image, lines)).rejects.toThrowError(/ollama pull qwen2\.5-vl:7b/)
  })

  it('rejects unparseable content', async () => {
    const { fetchFn } = fakeFetch(200, { message: { content: 'not json' } })
    const engine = createOllamaEngine({ url: 'http://localhost:11434', model: 'qwen2.5-vl:7b', fetchFn })
    await expect(engine.extract(image, lines)).rejects.toThrowError(OllamaError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/ocari-oyl exec vitest run src/ollama-engine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// packages/ocari-oyl/src/ollama-engine.ts
import { Buffer } from 'node:buffer'
import { EXTRACTION_JSON_SCHEMA, type FetchFn } from '@oyl/all-of-oyl'

export interface OcrLine {
  text: string
  box?: number[]
}

/** Failures the user can act on (start ollama, pull the model). */
export class OllamaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OllamaError'
  }
}

function buildPrompt(ocrLines: OcrLine[]): string {
  const fields = Object.keys(EXTRACTION_JSON_SCHEMA['properties'] as Record<string, unknown>).join(', ')
  const ocrText = ocrLines.map((l) => l.text).join('\n')
  return [
    'You are reading ONE retail receipt, invoice, or statement image.',
    `Extract exactly these fields as JSON: ${fields}.`,
    'Amounts are decimal strings exactly as printed (e.g. "48.12"). Use null when a value is not printed — never guess.',
    'docType is one of receipt|invoice|statement|other; transactionType one of purchase|refund|payment|other.',
    'The date is YYYY-MM-DD; the time is 24h HH:MM local to the document.',
    '',
    'OCR text of the same image (ground truth for digits and spelling):',
    ocrText,
  ].join('\n')
}

export function createOllamaEngine(opts: { url: string; model: string; fetchFn: FetchFn }) {
  const { url, model, fetchFn } = opts
  return {
    model,
    async extract(image: Uint8Array, ocrLines: OcrLine[]): Promise<unknown> {
      let response: Awaited<ReturnType<FetchFn>>
      try {
        response = await fetchFn(`${url}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            options: { temperature: 0 },
            format: EXTRACTION_JSON_SCHEMA,
            messages: [
              { role: 'user', content: buildPrompt(ocrLines), images: [Buffer.from(image).toString('base64')] },
            ],
          }),
        })
      } catch {
        throw new OllamaError(`Ollama not reachable at ${url} — is it running? Start it with: ollama serve`)
      }
      if (response.status === 404) {
        throw new OllamaError(`Model "${model}" not found on the Ollama server — fetch it with: ollama pull ${model}`)
      }
      if (!response.ok) {
        throw new OllamaError(`Ollama returned ${response.status}: ${await response.text()}`)
      }
      const payload = (await response.json()) as { message?: { content?: unknown } }
      const content = payload?.message?.content
      if (typeof content !== 'string') throw new OllamaError('Ollama response had no message content')
      try {
        return JSON.parse(content)
      } catch {
        throw new OllamaError(`Ollama returned unparseable JSON despite format enforcement: ${content.slice(0, 200)}`)
      }
    },
  }
}
```

Note: if `FetchFn`'s response type in `@oyl/all-of-oyl` lacks `text()`, check `core/http-repository.ts` (`FetchResponse`) and use only the members it declares (`ok`, `status`, `json`) — replace the `text()` call with `JSON.stringify(await response.json())` in the error path and adjust the test's fake accordingly.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @oyl/ocari-oyl test && pnpm --filter @oyl/ocari-oyl typecheck`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add packages/ocari-oyl/src/ollama-engine.ts packages/ocari-oyl/src/ollama-engine.test.ts
git commit -m "feat: add ocari Ollama structured-output engine

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Pipeline (bytes → extraction, validation, name, sidecar)

**Files:**
- Create: `packages/ocari-oyl/src/pipeline.ts`
- Test: `packages/ocari-oyl/src/pipeline.test.ts`

**Interfaces:**
- Consumes: `extractionFromLlm`, `validateExtraction`, `renderFileName`, `DayKey`, `type NameConfig`, `ExtractedDocument` from `@oyl/all-of-oyl`; `OcrLine` from `./ollama-engine.js`.
- Produces:

```ts
export interface OcrEngine { readonly name: string; recognize(image: Uint8Array): Promise<OcrLine[]> }
export interface StructuringEngine { readonly model: string; extract(image: Uint8Array, ocrLines: OcrLine[]): Promise<unknown> }
export interface DocInput { bytes: Uint8Array; originalName: string; ext: string; mimeType: string }
export interface DocResult {
  extraction: ExtractedDocument
  validation: ValidationReport   // status already forced to needs_review when name vars were missing
  fileName: string               // rendered, before collision suffixing
  sidecar: Record<string, unknown>
}
export function processDocument(input: DocInput, deps: {
  ocr: OcrEngine; structurer: StructuringEngine; today: DayKey; name: NameConfig; now: () => string
}): Promise<DocResult>
```

Sidecar assembled exactly per spec §Sidecar: `version: 1`, `source {originalName, sha256, mimeType}`, `extraction` (toJSON), `ocr {engine, lines}`, `validation`, `engine {model, createdAt: now()}`. sha256 via `node:crypto`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/ocari-oyl/src/pipeline.test.ts
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { DayKey, DEFAULT_NAME_CONFIG } from '@oyl/all-of-oyl'
import { processDocument, type OcrEngine, type StructuringEngine } from './pipeline.js'

const llmResult = {
  docType: 'receipt',
  date: '2026-07-24',
  merchant: { name: "Trader Joe's" },
  currency: 'USD',
  subtotal: '44.50',
  tax: '3.62',
  total: '48.12',
  lineItems: [{ name: 'a', totalPrice: '44.50' }],
}

const fakeOcr: OcrEngine = {
  name: 'fake-ocr@1',
  recognize: async () => [{ text: 'TRADER JOES', box: [0, 0, 10, 10] }, { text: 'TOTAL 48.12' }],
}
const fakeStructurer = (result: unknown): StructuringEngine => ({ model: 'fake-model', extract: async () => result })

const input = { bytes: new Uint8Array([9, 9, 9]), originalName: 'IMG_1.jpg', ext: 'jpg', mimeType: 'image/jpeg' }
const deps = (structured: unknown) => ({
  ocr: fakeOcr,
  structurer: fakeStructurer(structured),
  today: DayKey.of('2026-08-02'),
  name: DEFAULT_NAME_CONFIG,
  now: () => '2026-08-02T12:00:00.000Z',
})

describe('processDocument', () => {
  it('produces extraction, ok validation, rendered name, and a complete sidecar', async () => {
    const r = await processDocument(input, deps(llmResult))
    expect(r.validation.status).toBe('ok')
    expect(r.fileName).toBe('2026-07-24_trader-joes_48.12.jpg')
    expect(r.sidecar['version']).toBe(1)
    expect(r.sidecar['source']).toEqual({
      originalName: 'IMG_1.jpg',
      sha256: createHash('sha256').update(input.bytes).digest('hex'),
      mimeType: 'image/jpeg',
    })
    expect(r.sidecar['extraction']).toEqual(r.extraction.toJSON())
    expect(r.sidecar['ocr']).toEqual({ engine: 'fake-ocr@1', lines: await fakeOcr.recognize(input.bytes) })
    expect(r.sidecar['validation']).toEqual(r.validation)
    expect(r.sidecar['engine']).toEqual({ model: 'fake-model', createdAt: '2026-08-02T12:00:00.000Z' })
  })

  it('forces needs_review when filename variables are missing', async () => {
    const r = await processDocument(input, deps({ docType: 'receipt', total: null, lineItems: [] }))
    expect(r.fileName).toBe('unknown_unknown_unknown.jpg')
    expect(r.validation.status).toBe('needs_review')
    const names = r.validation.checks.map((c) => c.name)
    expect(names).toContain('requiredFieldsPresent')
  })

  it('propagates arithmetic failures as needs_review', async () => {
    const r = await processDocument(input, deps({ ...llmResult, total: '99.99' }))
    expect(r.validation.status).toBe('needs_review')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/ocari-oyl exec vitest run src/pipeline.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// packages/ocari-oyl/src/pipeline.ts
import { createHash } from 'node:crypto'
import {
  DayKey,
  ExtractedDocument,
  extractionFromLlm,
  renderFileName,
  validateExtraction,
  type NameConfig,
  type ValidationReport,
} from '@oyl/all-of-oyl'
import type { OcrLine } from './ollama-engine.js'

export interface OcrEngine {
  readonly name: string
  recognize(image: Uint8Array): Promise<OcrLine[]>
}

export interface StructuringEngine {
  readonly model: string
  extract(image: Uint8Array, ocrLines: OcrLine[]): Promise<unknown>
}

export interface DocInput {
  bytes: Uint8Array
  originalName: string
  ext: string
  mimeType: string
}

export interface DocResult {
  extraction: ExtractedDocument
  validation: ValidationReport
  /** Rendered name before collision suffixing (output layer's job). */
  fileName: string
  sidecar: Record<string, unknown>
}

export interface PipelineDeps {
  ocr: OcrEngine
  structurer: StructuringEngine
  today: DayKey
  name: NameConfig
  /** Injected clock (ISO string) so sidecars are testable. */
  now: () => string
}

export async function processDocument(input: DocInput, deps: PipelineDeps): Promise<DocResult> {
  const ocrLines = await deps.ocr.recognize(input.bytes)
  const raw = await deps.structurer.extract(input.bytes, ocrLines)
  const extraction = extractionFromLlm(raw)

  const report = validateExtraction(extraction, { today: deps.today })
  const { name: fileName, missing } = renderFileName(extraction, input.ext, deps.name)
  const validation: ValidationReport =
    missing.length > 0 && report.status === 'ok' ? { ...report, status: 'needs_review' } : report

  const sidecar: Record<string, unknown> = {
    version: 1,
    source: {
      originalName: input.originalName,
      sha256: createHash('sha256').update(input.bytes).digest('hex'),
      mimeType: input.mimeType,
    },
    extraction: extraction.toJSON(),
    ocr: { engine: deps.ocr.name, lines: ocrLines },
    validation,
    engine: { model: deps.structurer.model, createdAt: deps.now() },
  }

  return { extraction, validation, fileName, sidecar }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @oyl/ocari-oyl test && pnpm --filter @oyl/ocari-oyl typecheck`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add packages/ocari-oyl/src/pipeline.ts packages/ocari-oyl/src/pipeline.test.ts
git commit -m "feat: add ocari document pipeline (ocr -> structure -> validate -> name -> sidecar)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Output writer (copy/rename, collisions, sidecar, dry-run)

**Files:**
- Create: `packages/ocari-oyl/src/output.ts`
- Test: `packages/ocari-oyl/src/output.test.ts`

**Interfaces:**
- Consumes: `DocResult` (Task 7) — only `fileName` and `sidecar`.
- Produces:

```ts
export interface OutputPlan { imagePath: string; sidecarPath: string }
/** Resolve collision-free paths in dir for the rendered name (suffix _2, _3 … before the extension). */
export function planOutputs(dir: string, fileName: string, exists: (p: string) => boolean): OutputPlan
/** Copy (or move when rename=true) source → plan.imagePath and write the sidecar JSON (2-space, trailing newline). */
export function writeOutputs(args: { sourcePath: string; plan: OutputPlan; sidecar: Record<string, unknown>; rename: boolean }): void
```

Collision rule: the image and its sidecar must share a basename; the suffix probe checks **both** paths. Uses `node:fs` (`copyFileSync` with `COPYFILE_EXCL`, `renameSync`, `writeFileSync` with flag `wx`) — exclusive flags so a race never overwrites.

- [ ] **Step 1: Write the failing test**

```ts
// packages/ocari-oyl/src/output.test.ts
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { planOutputs, writeOutputs } from './output.js'

const NAME = '2026-07-24_store_9.99.jpg'

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'ocari-test-'))
}

describe('planOutputs', () => {
  it('uses the rendered name when free', () => {
    expect(planOutputs('/out', NAME, () => false)).toEqual({
      imagePath: join('/out', NAME),
      sidecarPath: join('/out', '2026-07-24_store_9.99.json'),
    })
  })

  it('suffixes _2, _3 before the extension until both paths are free', () => {
    const taken = new Set([join('/out', NAME), join('/out', '2026-07-24_store_9.99_2.json')])
    expect(planOutputs('/out', NAME, (p) => taken.has(p)).imagePath).toBe(join('/out', '2026-07-24_store_9.99_3.jpg'))
  })
})

describe('writeOutputs', () => {
  it('copies by default, leaving the original in place, and writes the sidecar', () => {
    const dir = tempDir()
    const source = join(dir, 'IMG_1.jpg')
    writeFileSync(source, 'imagebytes')
    const plan = planOutputs(dir, NAME, existsSync)
    writeOutputs({ sourcePath: source, plan, sidecar: { version: 1 }, rename: false })
    expect(existsSync(source)).toBe(true)
    expect(readFileSync(plan.imagePath, 'utf8')).toBe('imagebytes')
    expect(JSON.parse(readFileSync(plan.sidecarPath, 'utf8'))).toEqual({ version: 1 })
    expect(readFileSync(plan.sidecarPath, 'utf8').endsWith('\n')).toBe(true)
  })

  it('moves the original when rename=true', () => {
    const dir = tempDir()
    const source = join(dir, 'IMG_2.jpg')
    writeFileSync(source, 'x')
    const plan = planOutputs(dir, NAME, existsSync)
    writeOutputs({ sourcePath: source, plan, sidecar: {}, rename: true })
    expect(existsSync(source)).toBe(false)
    expect(existsSync(plan.imagePath)).toBe(true)
  })

  it('never overwrites an existing target', () => {
    const dir = tempDir()
    const source = join(dir, 'IMG_3.jpg')
    writeFileSync(source, 'new')
    writeFileSync(join(dir, NAME), 'old')
    // stale exists() said the name was free — the exclusive flag must still refuse
    const plan = { imagePath: join(dir, NAME), sidecarPath: join(dir, '2026-07-24_store_9.99.json') }
    expect(() => writeOutputs({ sourcePath: source, plan, sidecar: {}, rename: false })).toThrow()
    expect(readFileSync(join(dir, NAME), 'utf8')).toBe('old')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/ocari-oyl exec vitest run src/output.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// packages/ocari-oyl/src/output.ts
import { constants, copyFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface OutputPlan {
  imagePath: string
  sidecarPath: string
}

function splitExt(fileName: string): { base: string; ext: string } {
  const dot = fileName.lastIndexOf('.')
  return dot <= 0 ? { base: fileName, ext: '' } : { base: fileName.slice(0, dot), ext: fileName.slice(dot) }
}

/** Find collision-free image+sidecar paths sharing one basename; suffix _2, _3, … before the extension. */
export function planOutputs(dir: string, fileName: string, exists: (path: string) => boolean): OutputPlan {
  const { base, ext } = splitExt(fileName)
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}_${n}`
    const imagePath = join(dir, `${candidate}${ext}`)
    const sidecarPath = join(dir, `${candidate}.json`)
    if (!exists(imagePath) && !exists(sidecarPath)) return { imagePath, sidecarPath }
  }
}

/** Copy (default) or move the source to its planned name and write the sidecar. Exclusive flags: never overwrites. */
export function writeOutputs(args: {
  sourcePath: string
  plan: OutputPlan
  sidecar: Record<string, unknown>
  rename: boolean
}): void {
  if (args.rename) {
    // renameSync would clobber an existing target; probe with the sidecar's exclusive write first.
    writeFileSync(args.plan.sidecarPath, `${JSON.stringify(args.sidecar, null, 2)}\n`, { flag: 'wx' })
    renameSync(args.sourcePath, args.plan.imagePath)
  } else {
    copyFileSync(args.sourcePath, args.plan.imagePath, constants.COPYFILE_EXCL)
    writeFileSync(args.plan.sidecarPath, `${JSON.stringify(args.sidecar, null, 2)}\n`, { flag: 'wx' })
  }
}
```

Overwrite-safety note: in the copy branch, `copyFileSync` + `COPYFILE_EXCL` throws before the sidecar write (this is what the "never overwrites" test exercises). The rename branch orders the sidecar's exclusive write first as a guard, but `renameSync` would still clobber an existing image target whose sidecar is absent — so before `renameSync`, add an explicit guard:

```ts
    import { existsSync } from 'node:fs'   // add to the fs import list
    // inside the rename branch, before renameSync:
    if (existsSync(args.plan.imagePath)) throw new Error(`target exists: ${args.plan.imagePath}`)
```

Include that guard in the final implementation (and it's fine that `planOutputs` normally prevents this — the guard covers races and caller bugs).

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @oyl/ocari-oyl test && pnpm --filter @oyl/ocari-oyl typecheck`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add packages/ocari-oyl/src/output.ts packages/ocari-oyl/src/output.test.ts
git commit -m "feat: add ocari output writer (collision-safe copy/rename + sidecar)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: ppu-paddle-ocr adapter

**Files:**
- Create: `packages/ocari-oyl/src/paddle-ocr-engine.ts`

**Interfaces:**
- Consumes: `ppu-paddle-ocr` package; `OcrEngine`/`OcrLine` shapes (Tasks 6–7).
- Produces: `export async function createPaddleOcrEngine(): Promise<OcrEngine>` — `name` = `ppu-paddle-ocr@<version from its package.json>`.

This is the one task whose exact code depends on a third-party API. The adapter is deliberately thin (mapping only); its correctness is covered by the eval script (Task 11), not unit tests — do NOT download OCR models inside `pnpm test`.

- [ ] **Step 1: Inspect the installed API**

Run: `cat node_modules/ppu-paddle-ocr/package.json | head -30` and open its `.d.ts` (path from the `types` field). Identify: the class/factory export, the recognize call accepting a `Buffer`/`Uint8Array`, and the result shape (expected per its README: a detection+recognition result with per-line `text` and box points).

- [ ] **Step 2: Write the adapter against the real API**

Expected shape (adjust names to the installed `.d.ts` — that is part of this step, not optional):

```ts
// packages/ocari-oyl/src/paddle-ocr-engine.ts
import { createRequire } from 'node:module'
import PaddleOcr from 'ppu-paddle-ocr' // adjust: default vs named export per the installed .d.ts
import type { OcrEngine } from './pipeline.js'
import type { OcrLine } from './ollama-engine.js'

const require = createRequire(import.meta.url)
const { version } = require('ppu-paddle-ocr/package.json') as { version: string }

/** Thin adapter: ppu-paddle-ocr detection+recognition → OcrLine[]. Correctness is covered by `pnpm --filter @oyl/ocari-oyl eval`. */
export async function createPaddleOcrEngine(): Promise<OcrEngine> {
  const ocr = new PaddleOcr() // model files auto-download on first use per its README
  return {
    name: `ppu-paddle-ocr@${version}`,
    async recognize(image: Uint8Array): Promise<OcrLine[]> {
      const result = await ocr.recognize(Buffer.from(image)) // adjust method name per .d.ts
      // Map the library's line entries to { text, box } — keep box as a flat number[] if provided.
      return result.lines.map((l: { text: string; box?: number[] }) => ({
        text: l.text,
        ...(l.box !== undefined ? { box: l.box } : {}),
      }))
    },
  }
}
```

- [ ] **Step 3: Verify it typechecks and smoke-run it once**

Run: `pnpm --filter @oyl/ocari-oyl typecheck`
Then a one-off manual smoke (any photo with text, downloads models on first run):

```bash
cd packages/ocari-oyl && pnpm exec tsx -e "
import { createPaddleOcrEngine } from './src/paddle-ocr-engine.js'
import { readFileSync } from 'node:fs'
const engine = await createPaddleOcrEngine()
console.log(await engine.recognize(readFileSync(process.argv[1] ?? 'golden/sample.jpg')))
" /path/to/any/receipt.jpg
```

Expected: an array of `{ text, box }` lines printed. If the API differs from the sketch, fix the adapter here — the `OcrEngine` seam means nothing else changes.

- [ ] **Step 4: Commit**

```bash
git add packages/ocari-oyl/src/paddle-ocr-engine.ts
git commit -m "feat: add ppu-paddle-ocr engine adapter

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: CLI entry (args, batch loop, summary)

**Files:**
- Create: `packages/ocari-oyl/src/cli.ts`
- Test: `packages/ocari-oyl/src/cli.test.ts`

**Interfaces:**
- Consumes: everything above. `parseCliArgs` is exported for testing; `main()` runs when executed directly.
- Produces:

```ts
export function parseCliArgs(argv: string[]): { files: string[]; flags: ConfigInputs['flags']; help: boolean }
export async function main(argv: string[]): Promise<number> // exit code: 0 all ok, 1 any needs_review/failed, 2 config/usage error
```

Behavior: no files or `--help` → print usage (variables table, env keys, examples) and return 2 (0 for `--help`). Per file: read bytes; reject unsupported extensions (`.heic` gets the convert hint, anything not jpg/jpeg/png/webp is "unsupported"); run pipeline; `--dry-run` prints planned name + validation without writing; otherwise `planOutputs`+`writeOutputs` into `--out` dir or the source's dir. Errors are caught per file; the batch continues. Ends with an aligned summary table `file → status → new name (or error)`.

- [ ] **Step 1: Write the failing test for parseCliArgs**

```ts
// packages/ocari-oyl/src/cli.test.ts
import { describe, expect, it } from 'vitest'
import { parseCliArgs } from './cli.js'

describe('parseCliArgs', () => {
  it('separates positionals from flags', () => {
    const parsed = parseCliArgs([
      'a.jpg', 'b.png',
      '--rename', '--dry-run',
      '--out', '/tmp/receipts',
      '--model', 'llava:13b',
      '--name-template', '<date>_<total>.<ext>',
      '--name-prefix', 'RECEIPT_',
      '--date-format', 'YYYYMMDD',
      '--time-format', 'HH-mm',
    ])
    expect(parsed.files).toEqual(['a.jpg', 'b.png'])
    expect(parsed.help).toBe(false)
    expect(parsed.flags).toEqual({
      rename: true,
      'dry-run': true,
      out: '/tmp/receipts',
      model: 'llava:13b',
      'name-template': '<date>_<total>.<ext>',
      'name-prefix': 'RECEIPT_',
      'date-format': 'YYYYMMDD',
      'time-format': 'HH-mm',
    })
  })

  it('defaults to no flags and flags help', () => {
    expect(parseCliArgs([])).toEqual({ files: [], flags: {}, help: false })
    expect(parseCliArgs(['--help']).help).toBe(true)
  })

  it('throws a usage error on unknown flags', () => {
    expect(() => parseCliArgs(['x.jpg', '--bogus'])).toThrow(/bogus/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/ocari-oyl exec vitest run src/cli.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// packages/ocari-oyl/src/cli.ts
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { DayKey, DEFAULT_NAME_CONFIG, validateNameConfig } from '@oyl/all-of-oyl'
import { ConfigError, loadConfig, type ConfigInputs } from './config.js'
import { createOllamaEngine } from './ollama-engine.js'
import { createPaddleOcrEngine } from './paddle-ocr-engine.js'
import { processDocument } from './pipeline.js'
import { planOutputs, writeOutputs } from './output.js'

const SUPPORTED = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

export function parseCliArgs(argv: string[]): { files: string[]; flags: ConfigInputs['flags']; help: boolean } {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: 'boolean', default: false },
      rename: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      out: { type: 'string' },
      model: { type: 'string' },
      'name-template': { type: 'string' },
      'name-prefix': { type: 'string' },
      'date-format': { type: 'string' },
      'time-format': { type: 'string' },
    },
  })
  const { help, ...rest } = values
  const flags = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as ConfigInputs['flags']
  return { files: positionals, flags, help: help === true }
}

const USAGE = `ocari — parse receipt/invoice/statement images into named copies + JSON data sheets

Usage: pnpm ocari <image...> [--out <dir>] [--rename] [--dry-run] [--model <name>]
                  [--name-template <t>] [--name-prefix <p>] [--date-format <f>] [--time-format <f>]

Template variables: <date> <time> <business> <category> <CATEGORY> <transaction_type>
                    <payment_method> <payment_account_suffix> <total> <ext>
Defaults: template ${DEFAULT_NAME_CONFIG.template} · date ${DEFAULT_NAME_CONFIG.dateFormat} · time ${DEFAULT_NAME_CONFIG.timeFormat}
Env (root .env): OYL_OCARI_OLLAMA_URL OYL_OCARI_MODEL OYL_OCARI_NAME_TEMPLATE OYL_OCARI_NAME_PREFIX OYL_OCARI_DATE_FORMAT OYL_OCARI_TIME_FORMAT

Requires a running Ollama (ollama serve) with the model pulled (ollama pull qwen2.5-vl:7b).`

function repoDotenv(): string {
  // repo root = two dirs up from packages/ocari-oyl/src
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  const path = join(root, '.env')
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

export async function main(argv: string[]): Promise<number> {
  let parsed: ReturnType<typeof parseCliArgs>
  try {
    parsed = parseCliArgs(argv)
  } catch (e) {
    console.error((e as Error).message)
    console.error(USAGE)
    return 2
  }
  if (parsed.help) {
    console.log(USAGE)
    return 0
  }
  if (parsed.files.length === 0) {
    console.error(USAGE)
    return 2
  }

  let config
  try {
    config = loadConfig({ flags: parsed.flags, env: process.env, dotenv: repoDotenv() })
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(`Configuration error:\n${e.message}`)
      return 2
    }
    throw e
  }

  const ocr = await createPaddleOcrEngine()
  const structurer = createOllamaEngine({ url: config.ollamaUrl, model: config.model, fetchFn: fetch })
  const today = DayKey.from(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone)

  const rows: { file: string; status: string; detail: string }[] = []
  for (const file of parsed.files) {
    try {
      const ext = extname(file).toLowerCase()
      if (ext === '.heic') throw new Error('HEIC is not supported — convert first (e.g. `sips -s format jpeg`)')
      if (!SUPPORTED.has(ext)) throw new Error(`unsupported extension "${ext}" (jpg/jpeg/png/webp)`)
      const bytes = readFileSync(file)
      const result = await processDocument(
        { bytes, originalName: basename(file), ext: ext.slice(1), mimeType: MIME[ext]! },
        { ocr, structurer, today, name: config.name, now: () => new Date().toISOString() },
      )
      const dir = config.out ?? dirname(resolve(file))
      const plan = planOutputs(dir, result.fileName, existsSync)
      if (config.dryRun) {
        rows.push({ file, status: `${result.validation.status} (dry-run)`, detail: plan.imagePath })
      } else {
        writeOutputs({ sourcePath: file, plan, sidecar: result.sidecar, rename: config.rename })
        rows.push({ file, status: result.validation.status, detail: plan.imagePath })
      }
    } catch (e) {
      rows.push({ file, status: 'error', detail: (e as Error).message })
    }
  }

  const width = Math.max(...rows.map((r) => r.file.length))
  for (const r of rows) console.log(`${r.file.padEnd(width)}  ${r.status.padEnd(14)}  ${r.detail}`)
  return rows.every((r) => r.status === 'ok' || r.status.startsWith('ok ')) ? 0 : 1
}

const isDirectRun = process.argv[1] !== undefined && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href
if (isDirectRun) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @oyl/ocari-oyl test && pnpm --filter @oyl/ocari-oyl typecheck`
Expected: green.

- [ ] **Step 5: Manual smoke of usage/config paths (no Ollama needed)**

```bash
pnpm ocari                           # → usage, exit 2
pnpm ocari --help                    # → usage, exit 0
pnpm ocari x.jpg --name-template '<merchant>.<ext>'   # → config error listing valid variables, exit 2
```

Expected outputs as annotated.

- [ ] **Step 6: Commit**

```bash
git add packages/ocari-oyl/src/cli.ts packages/ocari-oyl/src/cli.test.ts
git commit -m "feat: add ocari CLI (batch processing, dry-run, summary table)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Golden-set eval script

**Files:**
- Create: `packages/ocari-oyl/scripts/eval.ts`, `packages/ocari-oyl/golden/README.md`
- Modify: `.gitignore` (root)

**Interfaces:**
- Consumes: real `createPaddleOcrEngine` + `createOllamaEngine`, `processDocument`, `ExtractedDocument.fromJSON`.
- Produces: `pnpm --filter @oyl/ocari-oyl eval` — runs every `golden/*.{jpg,jpeg,png,webp}` with a matching `golden/<base>.expected.json` (the `extraction` wire shape), compares field-by-field, prints per-field accuracy.

- [ ] **Step 1: Gitignore the golden set (images + expectations are personal data)**

Append to root `.gitignore`:

```
# ocari golden set (personal receipts — never committed)
packages/ocari-oyl/golden/*
!packages/ocari-oyl/golden/README.md
```

- [ ] **Step 2: Write `golden/README.md`**

```markdown
# ocari golden set

Personal receipts used to measure real extraction accuracy. Everything here
except this README is gitignored — never commit receipt images.

To add a case:
1. Drop the image here, e.g. `trader-joes-1.jpg`.
2. Run `pnpm ocari golden/trader-joes-1.jpg --dry-run` and inspect the output.
3. Save the CORRECT extraction (fix any model mistakes by hand) as
   `trader-joes-1.expected.json` — the `extraction` object from the sidecar,
   i.e. the ExtractedDocument wire shape.
4. `pnpm --filter @oyl/ocari-oyl eval` scores every pair and prints per-field accuracy.

Grow this set before trusting engine or prompt changes; there is no public
US-receipt benchmark, so this is the project's accuracy baseline.
```

- [ ] **Step 3: Write the eval script**

```ts
// packages/ocari-oyl/scripts/eval.ts
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DayKey, DEFAULT_NAME_CONFIG, ExtractedDocument } from '@oyl/all-of-oyl'
import { createOllamaEngine } from '../src/ollama-engine.js'
import { createPaddleOcrEngine } from '../src/paddle-ocr-engine.js'
import { loadConfig } from '../src/config.js'
import { processDocument } from '../src/pipeline.js'

const GOLDEN = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'golden')
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

/** Fields scored 1/0 per document by strict equality of their JSON projections. */
const FIELDS = ['docType', 'transactionType', 'date', 'time', 'merchant.name', 'payment.method', 'payment.accountSuffix', 'subtotal', 'tax', 'total'] as const

function project(doc: ExtractedDocument, field: string): unknown {
  const json = doc.toJSON() as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  return field.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], json)
}

const config = loadConfig({ flags: {}, env: process.env, dotenv: '' })
const ocr = await createPaddleOcrEngine()
const structurer = createOllamaEngine({ url: config.ollamaUrl, model: config.model, fetchFn: fetch })
const today = DayKey.from(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone)

const cases = readdirSync(GOLDEN).filter((f) => IMAGE_EXTS.has(extname(f).toLowerCase()))
if (cases.length === 0) {
  console.log(`No golden cases in ${GOLDEN} — see golden/README.md`)
  process.exit(0)
}

const hits = new Map<string, number>(FIELDS.map((f) => [f, 0]))
let scored = 0
let lineItemCountHits = 0

for (const image of cases) {
  const ext = extname(image).toLowerCase()
  const expectedPath = join(GOLDEN, `${basename(image, ext)}.expected.json`)
  if (!existsSync(expectedPath)) {
    console.warn(`skip ${image}: no ${basename(expectedPath)}`)
    continue
  }
  const expected = ExtractedDocument.fromJSON(JSON.parse(readFileSync(expectedPath, 'utf8')))
  const bytes = readFileSync(join(GOLDEN, image))
  const result = await processDocument(
    { bytes, originalName: image, ext: ext.slice(1), mimeType: MIME[ext]! },
    { ocr, structurer, today, name: DEFAULT_NAME_CONFIG, now: () => new Date().toISOString() },
  )
  scored++
  for (const field of FIELDS) {
    if (JSON.stringify(project(result.extraction, field)) === JSON.stringify(project(expected, field))) {
      hits.set(field, hits.get(field)! + 1)
    }
  }
  if (result.extraction.lineItems.length === expected.lineItems.length) lineItemCountHits++
  console.log(`${image}: validation=${result.validation.status}`)
}

console.log(`\nScored ${scored} document(s) with model ${config.model}:`)
for (const field of FIELDS) {
  console.log(`  ${field.padEnd(24)} ${hits.get(field)}/${scored}`)
}
console.log(`  ${'lineItems.count'.padEnd(24)} ${lineItemCountHits}/${scored}`)
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @oyl/ocari-oyl typecheck` (script is in tsconfig `include`).
Run: `pnpm --filter @oyl/ocari-oyl eval`
Expected without golden images: `No golden cases … — see golden/README.md`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/ocari-oyl/scripts/eval.ts packages/ocari-oyl/golden/README.md .gitignore
git commit -m "feat: add ocari golden-set eval script

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: End-to-end smoke, package README, CLAUDE.md

**Files:**
- Create: `packages/ocari-oyl/README.md`
- Modify: `CLAUDE.md` (package table row + dev-workflow command + tests table row)

- [ ] **Step 1: Live end-to-end smoke (the `verify` gate for this arc)**

Prereqs: `ollama serve` running locally; `ollama pull qwen2.5-vl:7b` completed (~6GB, one-time). Then with a real receipt photo:

```bash
pnpm ocari /path/to/receipt.jpg --dry-run     # inspect extraction + planned name
pnpm ocari /path/to/receipt.jpg --out /tmp/ocari-smoke
ls /tmp/ocari-smoke                            # named image copy + .json sidecar
cat /tmp/ocari-smoke/*.json                    # sidecar: version/source/extraction/ocr/validation/engine
pnpm ocari /path/to/receipt.jpg --out /tmp/ocari-smoke   # again → _2 collision suffix
pnpm ocari /path/to/receipt.jpg --out /tmp/ocari-smoke --name-prefix '<CATEGORY>_' --date-format YYYYMMDD
```

Expected: names match the configured template; original file untouched; second run suffixes `_2`; validation status printed per file. Fix anything observed before proceeding.

- [ ] **Step 2: Write `packages/ocari-oyl/README.md`**

```markdown
# @oyl/ocari-oyl

ocari (OCR mixed with AI): parse a receipt/invoice/statement image into
(1) a copy named by a configurable template and (2) a JSON data-sheet sidecar.

Pipeline: ppu-paddle-ocr grounds the text (can't invent digits) → Ollama
(`qwen2.5-vl:7b`) structures image+text against a JSON schema → arithmetic
validators gate `ok` vs `needs_review` → template renderer names the copy →
sidecar is the source of truth (never parse the filename back).

## Setup

1. Install [Ollama](https://ollama.com) and run `ollama serve`.
2. `ollama pull qwen2.5-vl:7b` (~6GB, one-time).
3. OCR models auto-download on first run.

## Usage

    pnpm ocari photo.jpg                       # copy + sidecar next to the original
    pnpm ocari *.jpg --out ~/Receipts          # batch into a folder
    pnpm ocari photo.jpg --rename --dry-run    # preview a move without writing

## Config (flags > env > root .env > defaults)

| Env key | Flag | Default |
|---|---|---|
| `OYL_OCARI_OLLAMA_URL` | — | `http://localhost:11434` |
| `OYL_OCARI_MODEL` | `--model` | `qwen2.5-vl:7b` |
| `OYL_OCARI_NAME_TEMPLATE` | `--name-template` | `<date>_<business>_<total>.<ext>` |
| `OYL_OCARI_NAME_PREFIX` | `--name-prefix` | (empty) |
| `OYL_OCARI_DATE_FORMAT` | `--date-format` | `YYYY-MM-DD` |
| `OYL_OCARI_TIME_FORMAT` | `--time-format` | `HHmm` |

Template variables: `<date> <time> <business> <category> <CATEGORY>
<transaction_type> <payment_method> <payment_account_suffix> <total> <ext>`.
Example: prefix `<CATEGORY>_` + default template →
`RECEIPT_2026-07-24_trader-joes_48.12.jpg`.

Domain types, validators, and the name renderer live in
`@oyl/all-of-oyl/src/ocari/`. Accuracy is measured against a personal golden
set — see `golden/README.md`. Spec:
`docs/superpowers/specs/2026-07-28-ocari-receipt-parsing-design.md`.
```

- [ ] **Step 3: Update CLAUDE.md**

- Packages table, new row after `@oyl/e2e-oyl`:

```markdown
| `@oyl/ocari-oyl` | **Receipt/document image parsing CLI at `packages/ocari-oyl`** ("OCR mixed with AI"). `pnpm ocari <image…>` → template-named copy + JSON data-sheet sidecar. Hybrid engine: `ppu-paddle-ocr` grounds text, local Ollama (`qwen2.5-vl:7b`, structured outputs) assigns semantics; arithmetic validators gate `ok`/`needs_review`. Domain types/validators/name renderer live in `all-of-oyl/src/ocari/` (NOT in `collections.ts` — nothing persists in v1). Config `OYL_OCARI_*` in untracked root `.env`; golden-set eval `pnpm --filter @oyl/ocari-oyl eval` (gitignored personal receipts). No e2e impact (no UI/API surface). | TS, vitest, tsx, Ollama |
```

- Dev workflows code block, after `pnpm deploy:pi`:

```bash
pnpm ocari <image…>      # parse receipt/document images → named copy + JSON sidecar (needs local Ollama)
```

- Tests table, new row:

```markdown
| `ocari-oyl` | `pnpm --filter @oyl/ocari-oyl test` (vitest; no live Ollama — engines faked). Live accuracy: `pnpm --filter @oyl/ocari-oyl eval` against `golden/` | `pnpm --filter @oyl/ocari-oyl typecheck` |
```

- [ ] **Step 4: Final full gates**

Run: `pnpm test && pnpm typecheck && pnpm all-of build`
Expected: all packages green (including the two new ocari surfaces).

- [ ] **Step 5: Commit**

```bash
git add packages/ocari-oyl/README.md CLAUDE.md
git commit -m "docs: document ocari package (README, CLAUDE.md rows)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** ExtractedDocument fields incl. `transactionType` + split `payment` (T1); LLM schema + decimal-money mapper (T2); all four validators with spec tolerances (T3); template variables/date-time formats/prefix/sanitization/`unknown` fallback/fail-fast (T4); config precedence + `.env` keys (T5); Ollama contract with schema-restated prompt + actionable errors (T6); sidecar shape exactly per spec (T7); copy-default/rename/collision/never-overwrite (T8); OCR adapter (T9); batch CLI + HEIC hint + summary (T10); gitignored golden eval (T11); docs + live smoke (T12). Out-of-scope items from the spec are not implemented anywhere — correct.
- **Known judgment calls:** `date`/`merchant`/`total` optional on the type with `requiredFieldsPresent` enforcing presence (spec deviation noted in Global Constraints); currency fixed to exponent-2 in the LLM mapper (v1: receipts in USD-class currencies); `<time>`/`<transaction_type>`/payment vars render empty rather than `unknown` per spec's missing-value rule.
- **Type consistency:** `OcrLine` is defined once in `ollama-engine.ts` and imported by `pipeline.ts`; `NameConfig`/`ValidationReport`/`ExtractedDocument` flow from `@oyl/all-of-oyl` only; `ConfigInputs['flags']` is the single flags shape shared by `parseCliArgs` and `loadConfig`.
