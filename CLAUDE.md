# CLAUDE.md

Operator notes for working in this repo. Keep terse; update when something changes.

## What this is

OYL ("Organize Your Life") — a personal productivity stack covering daily activities, goals, and nutrition tracking. pnpm workspace monorepo. Strapi backend, two frontend apps (Next.js + Vite/React), shared TS lib, Storybook, Playwright e2e.

## Packages

| Package | Role | Stack |
|---|---|---|
| `@oyl/all-of-oyl` | Shared lib consumed by `next-oyl` and `react-oyl`. Modules: `activity`, `calendar`, `data`, `goal`, `nutrition`, `user`. Vendors `open-food-facts`. | TS, Vitest |
| `@oyl/strapi-oyl` | CMS / API backend. SQLite for e2e, Postgres in compose. | Strapi 5 |
| `@oyl/react-oyl` | Primary web client. Talks to Strapi via `VITE_STRAPI_API_BASE_URL`. | Vite, React 19, Tailwind 4, react-router 7, Vitest |
| `@oyl/next-oyl` | Secondary Next.js client. | Next 16, React 19, Tailwind 3 |
| `@oyl/storybook-oyl` | Shared component stories. | Storybook 10, Vite, React 19 |
| `@oyl/e2e-oyl` | End-to-end tests. Spins up Strapi + React itself. See `packages/e2e-oyl/README.md` — it is up to date. | Playwright |
| `@oyl/vanilla-oyl` | Vanilla JS testbed. Static preview only. | http-server |

## Port map (docker compose)

| Service | Host port | Container port |
|---|---|---|
| strapi | 3337 | 1337 |
| next | 3041 | 3000 |
| react | 5041 | 5173 |
| storybook | 6041 | 6006 |
| postgres | 5441 | 5432 |
| vanilla (manual) | 8041 | — |

Native dev (`pnpm <pkg> dev` outside docker) uses each tool's default port (1337, 3000, 5173, 6006). The e2e harness uses native ports by default; override via `E2E_STRAPI_PORT` / `E2E_VITE_PORT`.

## Dev workflows

Root has filter shortcut scripts. From the repo root:

```bash
pnpm strapi develop      # Strapi dev (port 1337 native, 3337 in docker)
pnpm react dev           # Vite dev server
pnpm next dev            # Next.js dev server
pnpm storybook storybook # Storybook dev
pnpm e2e test            # Playwright e2e (spins up its own strapi + react)
pnpm all-of test         # Vitest on the shared lib
pnpm vanilla preview     # http-server on 8041
```

Docker alternative — bring up the whole stack:

```bash
docker compose up postgres strapi react -d
```

The compose `react` service injects `VITE_STRAPI_API_BASE_URL=http://localhost:3337/api` so the browser hits the host-mapped Strapi port.

## Tests and checks per package

| Package | Test | Lint | Typecheck |
|---|---|---|---|
| `all-of-oyl` | `pnpm --filter @oyl/all-of-oyl test` (vitest) | — | `pnpm --filter @oyl/all-of-oyl exec tsc --noEmit` |
| `react-oyl` | `pnpm --filter @oyl/react-oyl test` | `pnpm --filter @oyl/react-oyl lint` | `pnpm --filter @oyl/react-oyl exec tsc -b --noEmit` |
| `next-oyl` | — | `pnpm --filter @oyl/next-oyl lint` | `pnpm --filter @oyl/next-oyl exec tsc --noEmit` |
| `strapi-oyl` | — | — | `pnpm --filter @oyl/strapi-oyl exec tsc --noEmit` |
| `storybook-oyl` | — (uses addon-vitest) | `pnpm --filter @oyl/storybook-oyl lint` | `pnpm --filter @oyl/storybook-oyl exec tsc -b --noEmit` |
| `e2e-oyl` | `pnpm --filter @oyl/e2e-oyl test` | — | — |

There are no workspace-wide aggregator scripts yet — adding `pnpm -r typecheck` / `pnpm -r test` at the root would be a worthwhile follow-up.

## Conventions and gotchas

- Strapi runs on host port **3337** (compose maps 3337→1337). The default Strapi port (1337) only applies when running it natively without docker.
- `@oyl/all-of-oyl` exports from `modules/*` — depend on it from `next-oyl` / `react-oyl` as `@oyl/all-of-oyl` (workspace protocol).
- `rrule` quirk: it ships as a CJS default-export. Import as `import rrule from 'rrule'; rrule.rrulestr(...)` (the named `rrulestr` is undefined on some resolvers).
- `.env` at the repo root holds `PG_CONNECTION`, `TEST_USER`, `TEST_PASSWORD`. Both `strapi` and `next` compose services load it via `env_file`.
- `TODO.md` at the root is the active roadmap. `.remember/` is session-continuity scratch (see `.remember/remember.md`).
- Most permission allowlist entries in `.claude/settings.local.json` are file-specific; running `/fewer-permission-prompts` would collapse them into patterns.
- Stale boilerplate: `packages/next-oyl/README.md` and `packages/react-oyl/README.md` are still the framework-template defaults — ignore them.
