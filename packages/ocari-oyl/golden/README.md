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
