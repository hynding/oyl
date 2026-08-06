# ocari: receipt/document image parsing CLI — design

**Date:** 2026-07-28 (revised 2026-08-02: renamed scan → **ocari** "OCR mixed with AI"; configurable filename templates)
**Status:** Draft for review
**Scope:** v1 — a local CLI that turns an image of a receipt/invoice/statement into (1) a renamed copy with a structured, template-driven filename and (2) a JSON "data sheet" sidecar. No app/backend integration in v1.

## Problem

OYL has no way to capture paper/digital documents (receipts, invoices, statements). The finance model tracks `Transaction`s but every one is typed in by hand, and the source document is lost or lives unnamed in a camera roll. We want: point a tool at an image, get back a browsable filename (e.g. `2026-07-24_trader-joes_48.12.jpg`) and a complete machine-readable record of everything on the document (date, time, business, payment method, totals, line items).

## Decisions (made during brainstorming, 2026-07-24 → 2026-08-02)

1. **Engine: hybrid OCR + local LLM** (open source, fully local, no training, no per-call cost):
   - OCR grounding: `ppu-paddle-ocr` (MIT, PP-OCRv6 ONNX models, pure Node via `onnxruntime-node`; ARM64 CPU binaries verified in the npm tarball).
   - Structuring: Ollama structured outputs (`format` = JSON schema) with `qwen2.5vl:7b` (Apache-2.0) receiving the image **plus** the OCR text. OCR can't invent prices (non-autoregressive); the VLM assigns semantics and reads context (business, payment method). Arithmetic validation brackets both.
   - A Pi 5 profile (same pipeline, text-only ~4B model, minutes/receipt, async) is a designed-for follow-up, not v1.
2. **Delivery: CLI-first** — new workspace package `packages/ocari-oyl`. App/backend integration (upload, review screen) is a later sub-project.
3. **Scope: files + sidecar only** — no records are written to the OYL data model in v1. Sidecars use domain wire shapes so future import is a straight mapping.
4. **Name: "ocari"** (OCR mixed with AI) — shared domain module `all-of-oyl/src/ocari/`, CLI package `@oyl/ocari-oyl`.
5. **Output filenames are template-driven** (user-configurable variables, date format, and category prefix — see Filename templating).

Research references: Receipt Wrangler (reference architecture: OCR/vision → LLM w/ pluggable backends), paperless-ngx (filename-as-summary / DB-as-truth, naming templates), Ollama structured outputs docs, ppu-paddle-ocr, Qwen VL model family. Key negative findings: no maintained general-purpose receipt-parsing library exists (npm or PyPI); cloud receipt SaaS has no hobby tier anymore; prompted generic VLMs beat receipt-fine-tuned models (Donut/LayoutLM era superseded); Qwen2.5-VL-**3B** and Nanonets derivatives have non-commercial licenses — avoid.

(2026-08-04: model tag corrected to `qwen2.5vl:7b` — the hyphenated tag does not exist in the Ollama library.)

## Architecture

Two homes, per the single-source-of-truth rule:

### `packages/all-of-oyl/src/ocari/` (new module — stays zero-dep, DOM-free)

- **`ExtractedDocument`** domain type + codec, same immutable-class pattern as the rest of `src/`:
  - `docType`: `'receipt' | 'invoice' | 'statement' | 'other'` — the document *category*
  - `transactionType?`: `'purchase' | 'refund' | 'payment' | 'other'` — what the document records
  - `date` (`YYYY-MM-DD`), `time?` (`HH:MM`, 24h, local to the document)
  - `merchant`: `{ name: string; address?: string; phone?: string }`
  - `payment?`: `{ method: string; accountSuffix?: string; raw?: string }` — e.g. `{ method: 'visa', accountSuffix: '1234', raw: 'VISA •1234' }`, `{ method: 'cash' }`
  - `subtotal?`, `tax?`, `tip?`, `total`: `Money` (existing minor-units shape)
  - `lineItems`: `{ name: string; quantity?: number; unitPrice?: Money; totalPrice?: Money }[]`
  - `extra` bag preserving unknown fields; `toJSON()`/`fromJSON()`
- **Validators** (pure functions returning structured check results, used to gate auto-accept):
  - `lineItemsSumToSubtotal` — `Σ lineItems.totalPrice ≈ subtotal` (tolerance: ±1 minor unit per line item, covering per-line rounding)
  - `totalsAddUp` — `subtotal + tax + tip ≈ total` (tolerance: ±2 minor units)
  - `dateIsSane` — parses, not in the future (relative to an injected "today")
  - Aggregate status: `ok` when all applicable checks pass, else `needs_review` with the failing checks listed. Checks whose inputs are absent (e.g. no line items) are `skipped`, not failed.
- **Filename template renderer** (pure, shared — the app/backend reuse it in phase 2): parses a template string, substitutes variables from an `ExtractedDocument`, applies date/time formats and sanitization (see Filename templating).
- **Not** registered in `collections.ts` — nothing persists to Strapi in v1.
- Gates: `pnpm all-of test`, `typecheck:src`, `pnpm all-of build` (DOM-safety) all green.

### `packages/ocari-oyl` (new workspace package `@oyl/ocari-oyl`)

- Node CLI; `private: true`, `type: module`. Auto-registered by the `packages/*` workspace glob; root alias `"ocari": "pnpm --filter @oyl/ocari-oyl run ocari"`.
- Runtime deps: **`ppu-paddle-ocr` only** (plus its onnxruntime peer). Ollama is called with built-in `fetch` — no client library.
- Engines are injected interfaces (the `FetchFn`/`StorageLike` pattern):
  - `OcrEngine`: `(image: Buffer) → { lines: { text, box }[] }`
  - `StructuringEngine`: `(image, ocrLines, schema) → unknown` (decoded by the `ExtractedDocument` codec)
  - v1 ships `PaddleOcrEngine` and `OllamaVlmEngine`; the Pi text-only engine and any cloud engine are later drop-ins behind the same interfaces.

## CLI behavior

`pnpm ocari <image…> [flags]` — per file:

1. Read image (`.jpg`/`.jpeg`/`.png`/`.webp`; HEIC rejected with a "convert first" hint), compute sha256.
2. OCR → text lines + boxes.
3. One Ollama call: extraction prompt + image + OCR text + JSON schema (derived from the `ExtractedDocument` shape; schema also restated in the prompt because Ollama ignores schema `description`s).
4. Decode via codec; run validators → `ok` | `needs_review`.
5. Write a **copy** (default; `--rename` moves instead) named by the filename template (below); collisions append `_2`, `_3`, … before the extension.
6. Write the sidecar `<same-basename>.json` next to the copy.

Originals are never modified or deleted (except `--rename`, which moves the file to the new name). Default output dir = alongside the original; `--out <dir>` overrides. `--dry-run` prints planned names + extraction without writing. `--model` overrides the model. Batch mode continues past per-file failures and ends with a summary table (file → status → new name).

Failure modes: Ollama unreachable or model missing → actionable message (`ollama pull qwen2.5vl:7b`); OCR failure or a fundamentally non-object extraction → per-file error, batch continues. Invalid template or format config → the CLI fails fast before processing any file, listing valid variables/tokens.

(2026-08-04 revisions:)
- **Lenient optional-field decoding:** malformed OPTIONAL values from the LLM are dropped, never fatal — money strings are salvaged first (`$`/`€`/`£`/`¥`, thousands-commas, edge whitespace stripped), near-miss times normalized (`18:34:00`/`8:34` → `18:34`), invalid dates/out-of-enum `transactionType` dropped, unknown `docType` → `other`, junk currency → `USD`. A dropped date/merchant/total then fails `requiredFieldsPresent` → `unknown` filename segment + `needs_review`, instead of erroring the file.
- **Currency exponents:** minor units follow ISO 4217 (JPY/KRW-class exponent 0, KWD/BHD-class exponent 3, default 2) rather than hardcoded cents.
- **`--out` auto-creates** the directory (recursively) before processing; a same-named file fails fast (exit 2). Dry-run never creates it.
- **Template validation hardened:** the template must END with `.<ext>`, and template/prefix literals must not contain path separators (`/`, `\`).

## Filename templating

The output filename is rendered from a template string of literal text plus `<variable>` placeholders:

| Variable | Value | Example |
|---|---|---|
| `<date>` | document date, per date format | `2026-07-24` |
| `<time>` | document time, per time format | `1834` |
| `<business>` | merchant-name slug | `trader-joes` |
| `<category>` / `<CATEGORY>` | `docType`, lower/UPPER | `receipt` / `RECEIPT` |
| `<transaction_type>` | `transactionType` | `purchase` |
| `<payment_method>` | `payment.method` slug | `visa` |
| `<payment_account_suffix>` | `payment.accountSuffix` | `1234` |
| `<total>` | major-units decimal, `.` separator, no currency symbol | `48.12` |
| `<ext>` | original extension, lowercased | `jpg` |

- **Default template:** `<date>_<business>_<total>.<ext>`
- **Example (full):** `<date>_<time>_<business>_<transaction_type>_<payment_method><payment_account_suffix>_<total>.<ext>` → `2026-07-24_1834_trader-joes_purchase_visa1234_48.12.jpg`
- **Category prefix:** a separate prefix template prepended to the rendered name — either literal (`RECEIPT_`) or dynamic (`<CATEGORY>_` → `RECEIPT_2026-07-24_trader-joes_48.12.jpg`). Empty by default.
- **Date format:** token string over `YYYY`, `MM`, `DD` (default `YYYY-MM-DD`; e.g. `YYYYMMDD`). **Time format:** tokens `HH`, `mm` (default `HHmm` — no `:`, which is illegal/awkward on common filesystems).
- **Sanitization:** literal template text passes through as typed; substituted values are sanitized to filename-safe slugs (lowercase alphanumeric + hyphen; `<CATEGORY>` uppercase; `<total>` keeps its `.`). After substitution, runs of separators (`_`, `-`) left by empty variables collapse to one, and leading/trailing separators are trimmed.
- **Missing values:** if `<date>`, `<business>`, or `<total>` can't be extracted, the segment renders as `unknown` and the file is forced to `needs_review`. Other variables (`<time>`, `<transaction_type>`, payment fields) render empty when absent.
- **Unknown variables** in a template are a startup error (fail fast, list valid variables) — never silently emitted.

Config keys read from env or the untracked root `.env` (specific keys only, `deploy-pi` pattern), each with a CLI flag override:

| Env key | Flag | Default |
|---|---|---|
| `OYL_OCARI_OLLAMA_URL` | — | `http://localhost:11434` |
| `OYL_OCARI_MODEL` | `--model` | `qwen2.5vl:7b` |
| `OYL_OCARI_NAME_TEMPLATE` | `--name-template` | `<date>_<business>_<total>.<ext>` |
| `OYL_OCARI_NAME_PREFIX` | `--name-prefix` | empty |
| `OYL_OCARI_DATE_FORMAT` | `--date-format` | `YYYY-MM-DD` |
| `OYL_OCARI_TIME_FORMAT` | `--time-format` | `HHmm` |

## Sidecar ("data sheet") shape

```json
{
  "version": 1,
  "source": { "originalName": "IMG_4312.jpg", "sha256": "…", "mimeType": "image/jpeg" },
  "extraction": { /* ExtractedDocument.toJSON() — the wire shape */ },
  "ocr": { "engine": "ppu-paddle-ocr@6.x", "lines": [ { "text": "…", "box": [/* … */] } ] },
  "validation": { "status": "ok", "checks": [ { "name": "totalsAddUp", "pass": true } ] },
  "engine": { "model": "qwen2.5vl:7b", "createdAt": "2026-08-02T18:00:00Z" }
}
```

Principles: filename is a human-browsable summary; the sidecar is the source of truth (never parse the filename back — templates are lossy by design). `Money` uses the finance minor-units shape so "import sidecars as `Transaction`s" in phase 2 is a straight mapping. Full OCR lines are retained — they are the audit trail when an extraction is questioned.

## Testing (TDD)

- `all-of-oyl/src/ocari/`: vitest on type/codec/validators with fixture extractions (including a failing-arithmetic fixture and a skipped-checks fixture), plus the template renderer: default + full-variable templates, `YYYYMMDD` date format, prefix literal and `<CATEGORY>` forms, empty-variable separator collapse, `unknown` fallbacks, unknown-variable error.
- `ocari-oyl`: pipeline unit tests with fake `OcrEngine`/`StructuringEngine`; temp-dir tests for naming, collisions, `--rename`, `--dry-run`, sidecar contents; snapshot test on the prompt + JSON schema sent to the structuring engine; config precedence (flag > env > default) and fail-fast template validation.
- **No live-Ollama calls in `pnpm test`.** A separate `pnpm --filter @oyl/ocari-oyl eval` runs the real stack against a gitignored local golden set (`packages/ocari-oyl/golden/` — the owner's real receipts + expected JSON) and reports per-field accuracy. The golden set is the accuracy benchmark; there is no public US-receipt dataset.
- No UI/API change → `pnpm e2e` out of scope for this arc.

## Out of scope (phase 2+ candidates, in rough order)

1. Merchant / payment / line-items fields on finance `Transaction` (all-of-oyl + Strapi schema + parity tests) — aligns with the TODO relational-schema push.
2. Strapi upload plugin + `document` content-type; store the image + sidecar server-side.
3. Pending-transaction review screen in vanilla-oyl (image side-by-side with editable fields; confirm → `Transaction`).
4. Pi 5 engine profile (OCR text → local ~4B text model, async queue).
5. HEIC conversion; PDF input; statement multi-page handling.

## Risks

- `ppu-paddle-ocr` is a young single-vendor package with self-reported benchmarks → mitigations: engine interface makes it swappable (native-Tesseract shell-out is the fallback candidate); golden-set eval before trusting it.
- VLMs can emit schema-valid but wrong digits → arithmetic validators + `needs_review` status are the gate; sidecar keeps raw OCR for audit.
- Ollama `format` enforcement silently no-ops on MLX-engine variants → default model pinned to a GGUF variant.
- Line items are the weakest field class (~55% on dense tables at 7B) → totals are validated independently; line items are informational in v1 and never gate the filename.
- Template misconfiguration could produce colliding or empty names → fail-fast validation, `unknown` fallbacks, and collision suffixes make the worst case a `needs_review` file, never data loss.
