# OYL — Organize Your Life

A personal productivity stack for tracking daily activities, goals, and nutrition. pnpm workspace monorepo.

## Members

- **`@oyl/all-of-oyl`** (`packages/all-of-oyl`) — shared zero-dependency TypeScript domain core (`src/`: journal, planner, vault, goals, insights, sharing, plus the offline-first sync engine). The single source of truth.
- **`@oyl/ui-oyl`** (`packages/ui-oyl`) — domain-agnostic Stencil component library: design tokens, the eight themes and the `ui-*` primitives.
- **`@oyl/stencil-oyl`** (`apps/stencil-oyl`) — the web app: a Stencil shell + screens composed from `ui-oyl` and the shared client layer; online-first, account-required; deployed to DreamHost.
- **`@oyl/strapi-oyl-app`** (`apps/strapi-oyl`) — backend-agnostic Strapi 5 reference backend for the OYL sync protocol (`docs/oyl-sync-protocol-v1.md`).
- **`@oyl/camis-php-oyl`** (`apps/camis-php-oyl`) — the same API as `strapi-oyl`, generated as a Laravel app by [camis](https://github.com/hynding/camis) for PHP shared hosting.
- **`@oyl/e2e-oyl`** (`apps/e2e-oyl`) — Playwright browser suite driving the real app against the real backend.
- **`@oyl/ocari-oyl`** (`packages/ocari-oyl`) — receipt/document image parsing CLI (OCR + local LLM).

> The earlier React/Next/Storybook/Strapi/Playwright stack was removed on 2026-06-16 and is preserved on branch `legacy/2026-06-16`. The vanilla-JS app (`apps/vanilla-oyl`) that preceded `stencil-oyl` was retired on 2026-10-09 and is preserved at tag `vanilla-oyl/retired-2026-10-09`.

## Quick start

```bash
pnpm install

# Run the full stack natively: backend on :1340 + app on :3344 (health-gated, one Ctrl-C)
pnpm dev
#   app         http://localhost:3344   (register an account at /register)
#   api         http://localhost:1340/api

# Or in Docker (postgres + backend + app)
docker compose up -d --build postgres strapi-app stencil
#   stencil     http://localhost:3344
#   strapi-app  http://localhost:3340

# Individual pieces
pnpm strapi-app develop   # backend alone, http://localhost:1340
pnpm stencil dev          # app alone (builds all-of-oyl + ui-oyl first), http://localhost:3344
pnpm all-of test          # shared lib tests
pnpm e2e                  # Playwright browser suite (servers auto-start)
```

Natively the app boots against `http://localhost:1340/api` with no configuration. In Docker the backend is published on 3340, so go to **Status → Connection**, set `http://localhost:3340/api`, **Apply & reload**, then sign in.

See [`CLAUDE.md`](CLAUDE.md) for the full port map, per-package test/typecheck commands, and project conventions, and [`CONTRIBUTING.md`](CONTRIBUTING.md) for development practices (Definition of Done, testing, workflow, git).

## License

See [`LICENSE.md`](LICENSE.md).
