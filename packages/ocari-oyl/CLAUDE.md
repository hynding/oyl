# ocari-oyl — receipt/document parsing CLI

`pnpm ocari <image…>` → template-named copy + JSON data-sheet sidecar. Hybrid engine: `ppu-paddle-ocr` grounds text, local Ollama (`qwen2.5vl:7b`, structured outputs) assigns semantics; arithmetic validators gate `ok`/`needs_review`. Domain types/validators/name renderer live in `all-of-oyl/src/ocari/` (NOT in `collections.ts` — nothing persists in v1). Config `OYL_OCARI_*` in untracked root `.env`. No UI/API surface → no e2e impact. Details: `README.md`.

- `pnpm --filter @oyl/ocari-oyl test` (engines faked, no live Ollama); `pnpm --filter @oyl/ocari-oyl typecheck`.
- Live accuracy: `pnpm --filter @oyl/ocari-oyl eval` against `golden/` (gitignored personal receipts).
