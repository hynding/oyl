# OYL — Organize Your Life

A personal productivity stack for tracking daily activities, goals, and nutrition. pnpm workspace monorepo.

## Packages

- **`@oyl/all-of-oyl`** — shared TypeScript library (activity, calendar, goal, nutrition, user modules; Open Food Facts vendor).
- **`@oyl/strapi-oyl`** — Strapi 5 CMS / API backend.
- **`@oyl/react-oyl`** — Vite + React 19 web client (primary).
- **`@oyl/next-oyl`** — Next.js 16 web client (secondary).
- **`@oyl/storybook-oyl`** — Storybook for shared components.
- **`@oyl/e2e-oyl`** — Playwright end-to-end tests. See [`packages/e2e-oyl/README.md`](packages/e2e-oyl/README.md).
- **`@oyl/vanilla-oyl`** — vanilla JS testbed.

## Quick start

```bash
pnpm install

# Run the full stack in Docker
docker compose up postgres strapi react -d
#   strapi    http://localhost:3337
#   react     http://localhost:5041

# Or run individual services natively
pnpm strapi develop   # http://localhost:1337
pnpm react dev        # http://localhost:5173
pnpm next dev         # http://localhost:3000
pnpm storybook storybook
```

See [`CLAUDE.md`](CLAUDE.md) for the full port map, per-package test/lint/typecheck commands, and project conventions.

## License

See [`LICENSE.md`](LICENSE.md).
