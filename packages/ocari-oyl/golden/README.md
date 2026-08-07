# ocari golden set

Personal receipts used to measure real extraction accuracy. Everything here
except this README is gitignored — never commit receipt images.

To add a case:
1. Drop the image here, e.g. `trader-joes-1.jpg`.
2. Run `pnpm ocari golden/trader-joes-1.jpg --out /tmp/ocari-golden` (without --dry-run).
3. Find the `.json` sidecar next to the renamed copy in `/tmp/ocari-golden` — its name comes
   from the filename template, not the original basename (e.g.
   `2026-07-24_trader-joes_48.12.json`, not `trader-joes-1.json`). Inspect/hand-correct its
   `extraction` object, then save that object as `trader-joes-1.expected.json` in this
   directory (named after the *original* image basename) — the ExtractedDocument wire shape.
4. Delete the scratch output directory: `rm -rf /tmp/ocari-golden`.
5. `pnpm --filter @oyl/ocari-oyl eval` scores every pair and prints per-field accuracy.

Grow this set before trusting engine or prompt changes; there is no public
US-receipt benchmark, so this is the project's accuracy baseline.
