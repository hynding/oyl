# Contributing to OYL

Thanks for working on OYL. This guide is the human-facing companion to
[`CLAUDE.md`](CLAUDE.md) — which is the canonical, machine-loaded source of project
conventions (read by AI coding sessions every time). When the two overlap, `CLAUDE.md`
wins; keep them in sync.

## The shape of the repo

A pnpm workspace monorepo with three members:

- **`@oyl/all-of-oyl`** (`packages/all-of-oyl/src`) — the zero-dependency TypeScript
  domain core. The **single source of truth** for all shared logic.
- **`@oyl/vanilla-oyl`** (`apps/vanilla-oyl`) — the flagship app: zero runtime deps,
  vanilla JS + Web Components, local-first with an offline-first Remote mode.
- **`@oyl/strapi-oyl-app`** (`apps/strapi-oyl`) — a backend-agnostic Strapi reference
  backend for the OYL sync protocol (`docs/oyl-sync-protocol-v1.md`).

(The earlier React/Next/Storybook/Strapi/Playwright stack was removed on 2026-06-16 and
lives on branch `legacy/2026-06-16`.)

## Setup

```bash
pnpm install          # Node per package.json "engines"; pnpm via corepack
pnpm all-of test      # sanity-check the shared lib
```

Common dev loops (see `CLAUDE.md` → Dev workflows for the full list and port map):

```bash
pnpm all-of test        # Vitest on the shared lib (src/)
pnpm vanilla dev        # build the lib → vendor it → serve the app on :8041
pnpm vanilla test       # Vitest (happy-dom) on the app
pnpm strapi-app develop # Strapi backend on :1340
```

## Definition of Done

A change is done when, for every package it touches:

- **Tests pass.** `pnpm --filter <pkg> test`.
- **Typecheck passes.** `pnpm --filter <pkg> exec tsc --noEmit` (or the package's
  `typecheck` script).
- **For `all-of-oyl`:** also `pnpm all-of build` (the DOM-safety gate — the browser
  build has no DOM lib) and, when touching `src/`, the strict `pnpm all-of typecheck:src`.
- **For `strapi-oyl-app`:** `pnpm --filter @oyl/strapi-oyl-app build` then `test`
  (the booted conformance + smoke suite — the boot harness runs from `dist/`, so build first).

**Never commit on a red gate.** The root aggregates everything: `pnpm test`,
`pnpm lint`, `pnpm typecheck` (across `packages/*` and `apps/*`, `--if-present`).

## Testing

- **TDD:** write the failing test first, then the minimal code to pass, then commit.
- **Assert behavior, not internals.** For Web Components, assert via the component's
  own `shadowRoot`/props — not a parent's `textContent` (it won't pierce nested shadow
  roots).
- **No shortcuts to green.** Don't weaken a type or lint rule, and don't add throwaway
  markup (e.g. duplicate `sr-only` text) just to satisfy a test. Fix the cause.
- The backend is verified against the **shared executable contract**
  (`httpProtocolContract`) — the same spec that certifies the in-memory fake. Any
  backend is conformant iff it passes it.

## Architecture rules

- **Shared logic lives only in `@oyl/all-of-oyl/src`** — never duplicated into an app.
- When you add a persistable type, **register it in `src/collections.ts`** so every app
  and the backend pick it up.
- `src/` is `"type": "module"` + NodeNext → all relative imports use explicit `.js`
  extensions. **Anything touching Web/DOM globals is injected via a minimal interface**
  (see `src/core/http-repository.ts`), never referenced directly — the browser build
  has no DOM lib and `pnpm all-of build` enforces it.
- **Stay backend-agnostic.** The sync protocol and `@oyl/all-of-oyl` never assume Strapi.
- Keep files small and single-responsibility.

## Workflow for non-trivial work

Brainstorm → write a **spec** (`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`) →
write a **plan** (`docs/superpowers/plans/`) → implement with TDD → review → merge.
Specs and plans are the archive of *why* and are kept even after merge.

## Git & commits

- **Branch off `master`** for changes; the default branch stays releasable.
- Make **small, frequent, behavior-scoped commits**.
- Use a clear prefix: `feat` / `fix` / `refactor` / `chore` / `docs` / `test`.
- End AI-assisted commit messages with the `Co-Authored-By: Claude …` trailer.
- Don't push or open PRs unless that's the agreed step.

## Where things live

- `CLAUDE.md` — canonical project conventions + port map + per-package gates.
- `docs/oyl-sync-protocol-v1.md` — the backend-agnostic sync protocol.
- `docs/superpowers/{specs,plans}/` — design and implementation history.
- `TODO.md` — the working roadmap.
