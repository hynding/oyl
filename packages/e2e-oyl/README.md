# @oyl/e2e-oyl

End-to-end tests using Playwright. Spins up `@oyl/strapi-oyl` and `@oyl/react-oyl` automatically before each run.

## Setup

```bash
pnpm install
pnpm --filter @oyl/e2e-oyl install:browsers
```

## Environment

- `E2E_STRAPI_PORT` (default `3337`) — port the React app expects Strapi on.
- `E2E_VITE_PORT` (default `5173`) — Vite dev port.
- `E2E_TEST_USER_EMAIL` (default `e2e-user@oyl.local`)
- `E2E_TEST_USER_PASSWORD` (default `e2e-password-123`)

If Strapi's `.env` has `PORT=1337`, set `E2E_STRAPI_PORT=1337` when running tests AND change the React app's `BASE` URL in `useDataRemote.ts` — the React app currently hardcodes `localhost:3337`.

## Run

```bash
pnpm --filter @oyl/e2e-oyl test                    # all browsers, headless
pnpm --filter @oyl/e2e-oyl test:headed             # see the browser
pnpm --filter @oyl/e2e-oyl test:ui                 # Playwright UI
pnpm --filter @oyl/e2e-oyl test --project=chromium # one browser only
```

## What's covered

- `tests/add-from-global.spec.ts` — pre-seeded global nutrition-item appears in the autocomplete and can be logged; persists across reload.
- `tests/off-search-and-cache.spec.ts` — OFF search returns intercepted results; second identical query hits the Strapi cache (no second OFF call fires).
- `tests/barcode-manual-fallback.spec.ts` — barcode scanner manual entry triggers find-or-create + log.

OFF traffic is intercepted via `page.route('**/openfoodfacts.{net,org}/api/v3/**', ...)`; tests never hit the real OFF API.
