# OYL — Organize Your Life

A personal productivity stack for tracking daily activities, goals, and nutrition. pnpm workspace monorepo.

## Members

- **`@oyl/all-of-oyl`** (`packages/all-of-oyl`) — shared zero-dependency TypeScript domain core (`src/`: journal, planner, vault, goals, insights, sharing, plus the offline-first sync engine). The single source of truth.
- **`@oyl/vanilla-oyl`** (`apps/vanilla-oyl`) — flagship web app: zero runtime deps, vanilla JS + Web Components, local-first with an offline-first Remote mode.
- **`@oyl/strapi-oyl-app`** (`apps/strapi-oyl`) — backend-agnostic Strapi 5 reference backend for the OYL sync protocol (`docs/oyl-sync-protocol-v1.md`).

> The earlier React/Next/Storybook/Strapi/Playwright stack was removed on 2026-06-16 and is preserved on branch `legacy/2026-06-16`.

## Quick start

```bash
pnpm install

# Run the full app stack in Docker (postgres + backend + app)
docker compose up -d --build postgres strapi-app vanilla
#   vanilla     http://localhost:8041
#   strapi-app  http://localhost:3340

# Or run individual pieces natively
pnpm strapi-app develop   # backend, http://localhost:1340
pnpm vanilla dev          # app, http://localhost:8041
pnpm all-of test          # shared lib tests
```

In the app, go to **Status → Connection** to point at the backend (`http://localhost:3340/api` in Docker, `http://localhost:1340/api` native), switch to **Remote**, **Apply & reload**, then sign in under **Account**.

See [`CLAUDE.md`](CLAUDE.md) for the full port map, per-package test/typecheck commands, and project conventions, and [`CONTRIBUTING.md`](CONTRIBUTING.md) for development practices (Definition of Done, testing, workflow, git).

## License

See [`LICENSE.md`](LICENSE.md).
