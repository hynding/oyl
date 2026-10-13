# deploy/ — no longer deployed

Since cutover part 1 (`docs/superpowers/specs/2026-10-09-stencil-oyl-deploy-design.md`) the
DreamHost www target is `apps/stencil-oyl` — see `apps/stencil-oyl/deploy/README.md`. This
`htaccess.template` is kept for reference (the app is a frozen legacy member — see `../README.md`);
the shared renderer lives under `scripts/dreamhost/lib/`. Vanilla still runs locally
(`pnpm vanilla dev`) with no deploy.
