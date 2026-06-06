# @oyl/react-oyl

Primary web client for OYL. Vite + React 19 + Tailwind 4, talks to `@oyl/strapi-oyl` over HTTP.

## Layout

- `src/` — Vite entry (`main.tsx`, `App.tsx`), global styles, test setup.
- `modules/` — feature modules: `activity`, `auth`, `calendar`, `data`, `goal`, `nutrition`, `user`, `app`.
- `lib/` — cross-feature utilities (`navigation.ts`, `useAsync.ts`).
- `public/` — static assets.

Shared domain logic lives in `@oyl/all-of-oyl` (workspace dep) — prefer adding it there if `next-oyl` would benefit too.

## Run

```bash
pnpm --filter @oyl/react-oyl dev     # http://localhost:5173
pnpm --filter @oyl/react-oyl build
pnpm --filter @oyl/react-oyl preview

# Or via the root shortcut:
pnpm react dev
```

In Docker (`docker compose up react`) the app is served on host port **5041** and points at Strapi on **3337**.

## Configuration

- `VITE_STRAPI_API_BASE_URL` — Strapi API root. Defaults to `http://localhost:3337/api` to match the compose mapping. Override when running Strapi natively (`http://localhost:1337/api`) or when the e2e harness assigns a different port.

## Tests and checks

```bash
pnpm --filter @oyl/react-oyl test         # Vitest
pnpm --filter @oyl/react-oyl test:watch
pnpm --filter @oyl/react-oyl lint
pnpm --filter @oyl/react-oyl exec tsc -b --noEmit
```

Uses TS project references — typecheck with `tsc -b`, not plain `tsc`.
