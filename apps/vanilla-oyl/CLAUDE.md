# vanilla-oyl — legacy, frozen

The original front end (vanilla JS + JSDoc Web Components on the shared signals core), superseded by stencil-oyl on 2026-10-09 and **kept for reference**: stencil screens were designed against it and many specs under `docs/superpowers/` cite its files. What "frozen" means: `README.md`.

- **No new features land here.** It is not deployed, not in `pnpm dev`, docker compose or the e2e suite; the backend's `APP_URL` points at stencil-oyl.
- It stays a workspace member and its gates run in CI: a change to `@oyl/all-of-oyl` must keep `pnpm vanilla test` + `pnpm vanilla typecheck` green (typecheck resolves the TS source — no build needed). `test/client-entry.test.js` guards against a second reactive core.
- Runs locally with `pnpm vanilla dev` (builds + vendors all-of-oyl `dist/` → http-server :8041 against the backend on :1340). Status is not admin-gated here.
- Its `styles/themes/` are old copies; the source of truth is `packages/ui-oyl/src/global/themes/`, and drift is allowed.

Gotchas if you must touch it:
- `index.html` asset paths **must stay root-absolute** (`/src/…`, `/vendor/…`, importmap `/vendor/all-of-oyl/index.js`) — relative `./` breaks deep links.
- The dev server's `--proxy` SPA fallback returns `200` + index.html for **any** unresolved path, so a missing asset looks like a 200 HTML response.
- `reset.css` does NOT reach shadow roots — shared shadow base rules live in `baseStyles` (`src/lib/reactive/oyl-element.js`).
