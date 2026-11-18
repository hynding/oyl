# apps/vanilla-oyl — legacy (frozen)

The original OYL front end: zero runtime dependencies, vanilla JS + JSDoc, hand-rolled Web
Components on the shared signals core from `@oyl/all-of-oyl/client`. It was superseded by
`apps/stencil-oyl` on 2026-10-09 (cutover: `docs/superpowers/specs/2026-10-09-stencil-oyl-deploy-design.md`
and `2026-10-09-retire-vanilla-oyl-design.md`) and is **kept for reference and learning** — the
Stencil app was designed screen by screen against it, and its specs/plans under
`docs/superpowers/` reference its files.

What "frozen" means here:

- It stays a workspace member so it keeps running: `pnpm vanilla dev` (builds + vendors
  `@oyl/all-of-oyl`'s `dist/`, serves on :8041 against the backend on :1340), `pnpm vanilla test`,
  `pnpm vanilla typecheck`. Those two gates run in CI with everything else, so a change to the
  shared library must keep this app compiling — but **no new features land here**.
- It is not deployed (the DreamHost www target is stencil-oyl), not in `pnpm dev`, docker
  compose, or the e2e suite (its specs were ported to `apps/e2e-oyl/tests/`), and the backend's
  single `APP_URL` points at stencil-oyl, so the Google sign-in round trip lands there.
- Its theme files under `styles/themes/` are copies of what is now the source of truth,
  `packages/ui-oyl/src/global/themes/`; they are allowed to drift.

Foundation spec: `docs/superpowers/specs/2026-06-12-vanilla-oyl-foundation-design.md`.
