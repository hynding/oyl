# @oyl/e2e-oyl

Browser end-to-end suite for the whole OYL stack: the real `apps/vanilla-oyl` app served
by `http-server`, driving the real `apps/strapi-oyl` backend (fresh SQLite DB per server
start). Playwright, desktop + mobile projects.

```bash
pnpm e2e                 # from the repo root — full suite, both projects
pnpm --filter @oyl/e2e-oyl e2e -- --project=desktop tests/journal.spec.ts
pnpm --filter @oyl/e2e-oyl e2e:ui     # interactive runner
pnpm --filter @oyl/e2e-oyl report     # open the last HTML report
```

`E2E_BACKEND=php pnpm e2e` runs the identical suite against the camis-generated PHP backend
(`apps/camis-php-oyl`, built with `pnpm php-app build`). It is the Strapi-compatibility gate
for that backend; `google-auth.spec.ts` is skipped there because Google OAuth stays on Strapi.

Both servers auto-start on dedicated ports (app `:8042`, backend `:1341` — never collides
with native dev on 8041/1340) and are reused across runs for fast iteration. Reuse is by port
alone, so when switching between the two backends kill whatever holds `:1341` first — Playwright
would otherwise silently run the suite against the backend you just switched away from. The backend
boot script rebuilds `strapi dist/` only when missing; after changing strapi `src/`, run
`pnpm strapi-app build` and restart (kill the process on :1341, the next run reboots it).
After changing `all-of-oyl/src`, the app webServer re-runs `vanilla build:lib` on next
cold start — or run it yourself if the server is already up.

## Conventions (read before adding tests)

- **Every new screen or feature gets a spec file here.** UI-facing changes extend the
  matching spec. This suite is part of the Definition of Done.
- **Hygiene is automatic**: an auto-fixture fails ANY test on console errors/warnings,
  uncaught page errors, failed requests, or 4xx/5xx responses. Negative-path tests must
  declare expected noise via `hygiene.allow(/pattern/)` — that's documentation, not a
  workaround. Console-message patterns match the message text plus its source URL.
- **Per-test users**: the `user` fixture registers a fresh backend account per test
  (`signIn(path)` boots the page signed-in as that user). Personal data is therefore
  isolated; the CATALOG (consumables/activities/products) is shared across tests — always
  assert with unique names, never counts.
- **Backed vs unbacked**: only notes, consumptions, accounts, transactions, budgets,
  measurements, activity-sessions, and goals are server-backed (`BACKED` in
  `packages/all-of-oyl/src/client/storage/bootstrap.ts`). Assert persistence across `page.reload()`
  ONLY for backed collections (use `awaitOutboxDrained(page)` first). Planner/vault/users
  are in-session only until they gain backends — when they do, add round-trip tests.
- **Both projects run every spec**: desktop (1280×800) and mobile (Pixel 7). Guard
  mobile-only assertions with `test.skip(!isMobile, ...)`. Playwright CSS pierces the
  app's open shadow roots — plain selectors like `oyl-journal textarea[name="text"]` work.
- Shared helpers live in `lib/actions.ts` (`navTo`, `addNote`, `inlineConfirm`,
  `awaitOutboxDrained`, `primeLocalMode`, `deepActiveElement`).
- `seed.spec.ts` covers the account demo-seed journey (Status → Load demo data, and
  `?seed`); it drains ~280 writes, so it uses `awaitOutboxDrained(page, 90_000)` and a
  raised per-test timeout. Seeded ids are re-minted per account, so it is parallel-safe.
