# @oyl/next-oyl

Secondary Next.js client for OYL. Next 16 (App Router) + React 19 + Tailwind 3.

## Layout

- `app/` — App Router routes: `daily/`, `login/`, `my/`, `profile/`, `user/`, plus root `layout.tsx` / `page.tsx`.
- `modules/` — feature modules: `activity`, `app`, `calendar`, `data`, `goal`, `user`.
- `components/` — shared React components organized by feature (`Activity/`, `Auth/`, `Diet/`, `Goal/`, `Nutrition/`, `User/`, `Next/`, `App/`) plus top-level providers.
- `contexts/`, `hooks/`, `utilities/` — cross-cutting helpers.

Shared domain logic lives in `@oyl/all-of-oyl` (workspace dep) — prefer adding it there if `react-oyl` would benefit too.

## Run

```bash
pnpm --filter @oyl/next-oyl dev      # http://localhost:3000
pnpm --filter @oyl/next-oyl build
pnpm --filter @oyl/next-oyl start

# Or via the root shortcut:
pnpm next dev
```

In Docker (`docker compose up next`) the app is served on host port **3041**.

## Configuration

Reads `PG_CONNECTION` from the repo-root `.env` (loaded by the compose `next` service). When running natively, export it manually or symlink the `.env`.

## Tests and checks

```bash
pnpm --filter @oyl/next-oyl lint
pnpm --filter @oyl/next-oyl exec tsc --noEmit
```

No test suite yet — feature-level coverage lives in `@oyl/e2e-oyl` and `@oyl/all-of-oyl`.
