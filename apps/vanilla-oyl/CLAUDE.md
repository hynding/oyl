# vanilla-oyl — previous front end (not deployed)

Zero runtime deps: vanilla JS + JSDoc (checkJs), Web Components (shadow DOM + design tokens), shared signals core from `@oyl/all-of-oyl/client` (only the `OylElement` base stays in `src/lib/reactive/`), themes via `light-dark()`/`oklch()`. Cutover part 1 moved DreamHost www to stencil-oyl; part 2 retires this app. Still runs locally (`pnpm vanilla dev`, tests, e2e `desktop`/`mobile` projects). Spec: `docs/superpowers/specs/2026-06-12-vanilla-oyl-foundation-design.md`.

On sign-in it builds one `ApiClient` + `WriteOutbox` + `ReadCache`; personal writes enqueue via `ServerPersonalRepository`, catalog writes via `CatalogClient`; `createFlusher` drains the outbox when online. `/status` is the diagnostics surface (Connection, Account) — not admin-gated here.

App-only pieces: `OylElement`, `src/state/link-interceptor.js` (one delegated `document` click listener captures same-origin anchor clicks across the shadow boundary via `composedPath()`), theme/layout state, `storage/browser-ports.js` (real `crypto.randomUUID` / `navigator.storage.estimate` / build marker). Header `oyl-account-menu`: Profile link always; Log out / Sign in by session.

## Tests

- `pnpm vanilla test` (vitest, happy-dom). `pnpm vanilla typecheck` (resolves `@oyl/all-of-oyl` to TS source — no prior build needed).
- `test/client-entry.test.js` guards against a second reactive core (never keep a local `signal.js`).

## Gotchas

- `index.html` asset paths **must stay root-absolute** (`/src/…`, `/vendor/…`, `/styles/…`, importmap `/vendor/all-of-oyl/index.js`) — relative `./` breaks deep links (`/journal/2026-06-16`).
- `pnpm vanilla dev` runs `http-server … --proxy http://localhost:8041?` for SPA fallback: it returns `200` + index.html for **any** unresolved path, so a typo'd asset shows as a 200 HTML response, not a 404.
- Consumes `all-of-oyl` `dist/` via importmap + vendored copy in `vendor/` (incl. `/format`, `/client`). After `all-of-oyl/src` changes with a running server: `pnpm vanilla build:lib`.
- `reset.css` does NOT reach shadow roots — shared shadow base rules (border-box, focus ring) live in `baseStyles` in `src/lib/reactive/oyl-element.js`.
- On ≤640px `oyl-nav` docks as a fixed bottom tab bar; `oyl-shell`'s `:host` must NOT have `container-type` (traps `position: fixed`); `oyl-shell` reserves matching `.page` bottom padding.
- Theme files here are the source for ui-oyl's byte-copies — change themes here first.

## Docker (vanilla + strapi + postgres)

`docker compose up -d --build postgres strapi-app vanilla` → `http://localhost:8041` → Status → Connection: backend `http://localhost:3340/api`, mode Remote, Apply & reload, sign in. Uses Postgres DB `oyl_app` (old `database-data-oyl` volume → `docker compose down -v` once). Don't run native `pnpm vanilla dev` alongside (both bind 8041). Both services share image `oyl-app:dev` (`Dockerfile.app`).
