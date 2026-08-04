# @oyl/ocari-oyl

ocari (OCR mixed with AI): parse a receipt/invoice/statement image into
(1) a copy named by a configurable template and (2) a JSON data-sheet sidecar.

Pipeline: ppu-paddle-ocr grounds the text (can't invent digits) → Ollama
(`qwen2.5vl:7b`) structures image+text against a JSON schema → arithmetic
validators gate `ok` vs `needs_review` → template renderer names the copy →
sidecar is the source of truth (never parse the filename back).

## Setup

1. Install [Ollama](https://ollama.com) and run `ollama serve`.
2. `ollama pull qwen2.5vl:7b` (~6GB, one-time).
3. OCR models auto-download on first run.

## Usage

    pnpm ocari photo.jpg                       # copy + sidecar next to the original
    pnpm ocari *.jpg --out ~/Receipts          # batch into a folder
    pnpm ocari photo.jpg --rename --dry-run    # preview a move without writing

## Config (flags > env > root .env > defaults)

| Env key | Flag | Default |
|---|---|---|
| `OYL_OCARI_OLLAMA_URL` | — | `http://localhost:11434` |
| `OYL_OCARI_MODEL` | `--model` | `qwen2.5vl:7b` |
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
