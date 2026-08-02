# ocari golden set

Personal receipts used to measure real extraction accuracy. Everything here
except this README is gitignored — never commit receipt images.

To add a case:
1. Drop the image here, e.g. `trader-joes-1.jpg`.
2. Run `pnpm ocari golden/trader-joes-1.jpg --out /tmp/ocari-golden` (without --dry-run).
3. Inspect the sidecar JSON at `/tmp/ocari-golden/trader-joes-1.expected.json`.
4. Hand-correct any model mistakes in the sidecar, then copy its `extraction` object as
   `trader-joes-1.expected.json` in this directory — the ExtractedDocument wire shape.
5. Delete the scratch output directory: `rm -rf /tmp/ocari-golden`.
6. `pnpm --filter @oyl/ocari-oyl eval` scores every pair and prints per-field accuracy.

Grow this set before trusting engine or prompt changes; there is no public
US-receipt benchmark, so this is the project's accuracy baseline.
