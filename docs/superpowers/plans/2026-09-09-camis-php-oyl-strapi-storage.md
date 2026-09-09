# camis-php-oyl on the Strapi storage layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `apps/camis-php-oyl` serve the OYL sync API from the **same database as `apps/strapi-oyl`** (Strapi owns the schema; sessions minted by either backend work on the other), provable by `E2E_BACKEND=php pnpm e2e` green against a Strapi-seeded database, and deployable to DreamHost with the schema check as the gate.

**Architecture:** camis Phase 17 (merged at camis `master` b8a698a) added `storageLayout: "strapi"` to the filament target: models map onto Strapi's tables (`_lnk` link tables, `_cmps` component tables, `up_users`/`up_roles`), Strapi-compatible HS256 JWTs replace Sanctum, no migrations/Filament/Spatie are emitted, and a regenerated `camis:strapi-schema-check` artisan command verifies the tables Strapi must have created. On the oyl side this is a config flip plus the seams around it: the scaffold gains the two Composer packages the layout needs, the `/bootstrap` overlay route switches to the JWT guard and preloads components, the e2e PHP gate boots Strapi first so the database exists and holds the roles, the deploy script replaces migrate/seed with the schema check, and the docs describe the one-time Strapi sync against DreamHost MySQL.

**Tech Stack:** camis CLI (`apiStyle: "strapi"` + `storageLayout: "strapi"`; `camis scaffold filament <dir> --storage strapi`), Laravel 12 + `firebase/php-jwt` + `visus/cuid2`, PHP 8.3/8.4, Composer, SQLite (dev/e2e, Strapi-created) and MySQL (DreamHost, Strapi-created), Strapi 5 (`apps/strapi-oyl`), tsx + vitest, Playwright e2e, bash + rsync + ssh.

**Spec:** `docs/superpowers/specs/2026-09-08-strapi-storage-layout-design.md`, section "oyl side" (plus "Data flow", "Error handling", "Sequencing"). Also read camis's follow-ups for the oyl items: `../camis/docs/superpowers/plans/2026-09-08-strapi-storage-layout-followups.md` ("For the oyl side").

## Global Constraints

- Zero per-content-type code in the PHP app: every content type reaches the PHP backend through `camis import` + `camis build`. The only hand-written PHP stays `overlay/routes/api-custom.php` and `overlay/app/Http/Controllers/Api/ConsumableProductApiController.php`.
- camis is reached as `"@camis/cli": "link:../../../camis/packages/cli"` (sibling checkout, `pnpm install` run there, at or after camis `master` b8a698a).
- `apps/camis-php-oyl/laravel/` is git-ignored and disposable; `pnpm php-app build` recreates it.
- `camis.json` and `roles.json` stay generated and committed; the existing drift tests keep passing unchanged. The one role is `authenticated`, which equals Strapi's `up_roles.type` (a hard requirement of the layout: role names must equal `up_roles.type`).
- **Strapi owns the schema.** The PHP app never runs `php artisan migrate` or a seeder in this layout; a database is created and its roles seeded by booting `apps/strapi-oyl` against it (sqlite locally, MySQL on DreamHost). The PHP side verifies with `php artisan camis:strapi-schema-check` (exit 0 required) before serving or deploying.
- `JWT_SECRET` must be identical on both backends and **at least 32 bytes** (`firebase/php-jwt` refuses shorter HS256 keys). The e2e value is `e2e-test-jwt-secret-shared-by-strapi-and-php` (44 bytes), set by the PHP gate for both processes.
- No Laravel-owned tables in the shared database: every PHP environment sets `CACHE_STORE=file`, `SESSION_DRIVER=array`, `QUEUE_CONNECTION=sync` (the API is stateless; the auth throttle uses the file cache).
- `CAMIS_EMAIL_CONFIRMATION=false` (Strapi's advanced setting is off in OYL; new accounts are confirmed).
- Deviation from the spec, deliberate: the spec says the existing `laravel/` scaffold "needs no re-scaffold". It does — the layout requires `firebase/php-jwt` and `visus/cuid2`, which the Phase 16 scaffold lacks, and the Filament panel provider left by `filament:install` would serve a broken `/admin`. Since `laravel/` is disposable, `build.mjs` re-scaffolds with `--storage strapi` when it detects the old scaffold.
- Deviation from the spec, deliberate: `E2E_BACKEND=php` always boots Strapi first (no `E2E_STORAGE` flag). The spec kept the Laravel-owned SQLite path "until the shared layout becomes the default"; with one `camis.config.json` the flip is the default the moment it lands, and the generated app has no migrations to run anyway.
- Wire compatibility is proven by the existing e2e suite: `E2E_BACKEND=php pnpm e2e` green on desktop + mobile (hygiene fixture fails on any 4xx/5xx or console error). `google-auth.spec.ts` stays skipped under the PHP backend.
- Ports: dev PHP on 1340; e2e backend on 1341 (Strapi during the seed step, then PHP); e2e polls `/api/_health`.
- Deploy: config from `OYL_DH_SSH`, `OYL_DH_APP_ROOT`, `OYL_DH_SITE_URL` in the untracked root `.env`; `--dry-run`; committed HEAD only; never hard-code hosts.
- Repo conventions (`CLAUDE.md`): TDD; commit prefixes `feat/fix/refactor/chore/docs/test`; commits end with the `Co-Authored-By: Claude …` trailer; Definition of Done for API-facing changes includes `pnpm e2e` green. Never read or commit real `.env` values; scripts may load `apps/strapi-oyl/.env` at runtime (the app itself does), but nothing in this plan prints them.
- Defects in generated PHP are fixed in camis (tests first, on a camis branch merged to camis `master`), never by editing `laravel/`; the `link:` makes the fix live here immediately.

---

## File structure

**Modified**

- `apps/camis-php-oyl/camis.config.json` — the target gains `"storageLayout": "strapi"`.
- `apps/camis-php-oyl/scripts/build.mjs` — scaffold with `--storage strapi`; re-scaffold when `laravel/composer.json` lacks `firebase/php-jwt`.
- `apps/camis-php-oyl/scripts/dev.mjs` — serve on the Strapi dev SQLite (`apps/strapi-oyl/.tmp/data.db`) with Strapi's `JWT_SECRET`; schema check instead of migrate/seed.
- `apps/camis-php-oyl/overlay/routes/api-custom.php` — `/bootstrap` guarded by `StrapiJwtGuard`, components preloaded per collection.
- `apps/camis-php-oyl/.env.example` — `JWT_SECRET`, `CAMIS_EMAIL_CONFIRMATION`, file/array/sync drivers; `SANCTUM_TOKEN_EXPIRATION` removed.
- `apps/e2e-oyl/scripts/start-php-backend.mjs` — boot Strapi (fresh `.tmp/e2e.db` + roles), stop it, schema-check, serve PHP on that file.
- `scripts/deploy-dreamhost.sh` — remote `camis:strapi-schema-check` replaces migrate + seed.
- `apps/camis-php-oyl/README.md`, `CLAUDE.md`, `docs/superpowers/plans/2026-09-08-camis-php-oyl-followups.md` — docs.
- Tests: `apps/camis-php-oyl/test/cli.test.ts`, `test/overlay.test.ts`, `test/deploy-script.test.ts`.

**Created**

- `apps/camis-php-oyl/test/scripts.test.ts` — drift guards for `build.mjs`, `dev.mjs`, the e2e starter, and `.env.example` (the same substring style as `deploy-script.test.ts`).

---

### Task 1: Config flip, scaffold refresh, dev script

**Files:**

- Modify: `apps/camis-php-oyl/camis.config.json`, `apps/camis-php-oyl/scripts/build.mjs`, `apps/camis-php-oyl/scripts/dev.mjs`
- Test: `apps/camis-php-oyl/test/cli.test.ts`, `apps/camis-php-oyl/test/scripts.test.ts` (new)

**Interfaces:**

- Produces: `laravel/` scaffolded by `camis scaffold filament ./laravel --storage strapi` (Laravel 12 + `firebase/php-jwt` + `visus/cuid2`; `routes/api.php` registered in `bootstrap/app.php`; no Filament/Spatie/Sanctum) and built with the storage layout: `app/Models/*.php` on Strapi tables (incl. `User`, `UpRole`), `app/Support/Strapi*.php`, `app/Casts/StrapiDateTime.php`, `app/Http/Middleware/StrapiJwtGuard.php`, `app/Console/Commands/CamisStrapiSchemaCheck.php`, JWT `AuthController`, no `database/migrations/*` from camis, no seeder. Later tasks rely on `App\Http\Middleware\StrapiJwtGuard`, `App\Support\StrapiComponents::load(Collection $rows, array $map)`, every model's `public const COMPONENT_MAP`, and `php artisan camis:strapi-schema-check`.

- [ ] **Step 1: Write the failing config test**

In `apps/camis-php-oyl/test/cli.test.ts`, change the target expectation to include the layout:

```ts
expect(cfg.targets).toEqual([
  {
    target: "filament",
    out: "./laravel",
    apiStyle: "strapi",
    storageLayout: "strapi",
    projectName: "oyl",
  },
])
```

and widen the `targets` type in the same test with `storageLayout?: string`.

- [ ] **Step 2: Write the failing scripts test**

Create `apps/camis-php-oyl/test/scripts.test.ts`:

```ts
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const read = (rel: string): string => readFileSync(resolve(PKG, rel), "utf8")

describe("build.mjs", () => {
  const src = read("scripts/build.mjs")
  it("parses", () => {
    expect(() =>
      execFileSync("node", ["--check", resolve(PKG, "scripts/build.mjs")]),
    ).not.toThrow()
  })
  it("scaffolds for the Strapi storage layout", () => {
    expect(src).toContain('"--storage", "strapi"')
  })
  it("re-scaffolds a laravel/ that predates the layout (no firebase/php-jwt)", () => {
    expect(src).toContain('"firebase/php-jwt"')
    expect(src).toContain("rmSync(LARAVEL")
  })
})

describe("dev.mjs", () => {
  const src = read("scripts/dev.mjs")
  it("parses", () => {
    expect(() =>
      execFileSync("node", ["--check", resolve(PKG, "scripts/dev.mjs")]),
    ).not.toThrow()
  })
  it("serves on the Strapi dev database and never migrates or seeds", () => {
    expect(src).toContain('"strapi-oyl", ".tmp", "data.db"')
    expect(src).toContain("camis:strapi-schema-check")
    expect(src).not.toContain("migrate")
    expect(src).not.toContain("RolePermissionSeeder")
  })
  it("keeps Laravel-owned state out of the shared database", () => {
    expect(src).toContain('CACHE_STORE: "file"')
    expect(src).toContain('SESSION_DRIVER: "array"')
    expect(src).toContain('QUEUE_CONNECTION: "sync"')
  })
  it("takes JWT_SECRET from the Strapi app's .env and refuses a short one", () => {
    expect(src).toContain('"strapi-oyl", ".env"')
    expect(src).toContain("length < 32")
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm php-app test`
Expected: FAIL — `cli.test.ts` (no `storageLayout`), `scripts.test.ts` (build.mjs lacks `--storage`; dev.mjs still migrates).

- [ ] **Step 4: Flip the config**

`apps/camis-php-oyl/camis.config.json`:

```json
{
  "ir": "./camis.json",
  "roles": "./roles.json",
  "protected": "./overlay",
  "targets": [
    {
      "target": "filament",
      "out": "./laravel",
      "apiStyle": "strapi",
      "storageLayout": "strapi",
      "projectName": "oyl"
    }
  ]
}
```

- [ ] **Step 5: Rewrite `scripts/build.mjs`**

```js
#!/usr/bin/env node
/**
 * pnpm php-app build — scaffold laravel/ once for the Strapi storage layout (composer
 * create-project + firebase/php-jwt + visus/cuid2, via camis), then camis build + overlay.
 * Safe to re-run: camis build is idempotent and the overlay is mirrored every time. A laravel/
 * scaffolded before the layout switch (Filament/Sanctum, no firebase/php-jwt) is removed and
 * re-scaffolded — it is disposable and git-ignored.
 */
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, rmSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const LARAVEL = resolve(PKG, "laravel")
const COMPOSER_JSON = resolve(LARAVEL, "composer.json")

const run = (args, opts = {}) => {
  const res = spawnSync("pnpm", ["exec", "camis", ...args], {
    cwd: PKG,
    stdio: "inherit",
    ...opts,
  })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

const isStorageScaffold = () =>
  existsSync(COMPOSER_JSON) &&
  readFileSync(COMPOSER_JSON, "utf8").includes('"firebase/php-jwt"')

if (existsSync(COMPOSER_JSON) && !isStorageScaffold()) {
  console.log(
    "[php-app] laravel/ was scaffolded for the Laravel storage layout (no firebase/php-jwt) — removing it and re-scaffolding for the Strapi layout",
  )
  rmSync(LARAVEL, { recursive: true, force: true })
}
if (!existsSync(COMPOSER_JSON)) {
  console.log(
    "[php-app] laravel/ missing — scaffolding (composer create-project; takes a few minutes)",
  )
  run(["scaffold", "filament", "./laravel", "--storage", "strapi"])
}
run(["build"])
console.log("[php-app] built laravel/ (generated + overlay)")
```

- [ ] **Step 6: Rewrite `scripts/dev.mjs`**

```js
#!/usr/bin/env node
/**
 * pnpm php-app dev — serve the generated app on :1340 (the client's DEFAULT_API_BASE_URL)
 * against the Strapi dev database (apps/strapi-oyl/.tmp/data.db). Strapi owns the schema: run
 * `pnpm strapi-app develop` once (it creates the file, the tables and the roles), stop it, then
 * run this. Never run both on :1340 at once. JWT_SECRET is read from apps/strapi-oyl/.env so a
 * session minted by either backend works on the other.
 */
import { spawn, spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const LARAVEL = resolve(PKG, "laravel")
const STRAPI = resolve(PKG, "..", "strapi-oyl")
const DB = resolve(STRAPI, ".tmp", "data.db")
const PORT = 1340

const strapiEnv = (name) => {
  const file = resolve(STRAPI, ".env")
  if (!existsSync(file)) return undefined
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${name}=`))
  return line
    ?.slice(name.length + 1)
    .trim()
    .replace(/^["']|["']$/g, "")
}

if (!existsSync(resolve(LARAVEL, "artisan"))) {
  console.error("[php-app] laravel/ not built — run `pnpm php-app build` first")
  process.exit(1)
}
if (!existsSync(DB)) {
  console.error(
    "[php-app] apps/strapi-oyl/.tmp/data.db missing — run `pnpm strapi-app develop` once (Strapi creates the schema and roles), stop it, then retry",
  )
  process.exit(1)
}
const jwtSecret = strapiEnv("JWT_SECRET") ?? ""
if (jwtSecret.length < 32) {
  console.error(
    "[php-app] apps/strapi-oyl/.env needs JWT_SECRET of at least 32 bytes (shared with this app; firebase/php-jwt refuses shorter HS256 keys)",
  )
  process.exit(1)
}

const env = {
  ...process.env,
  APP_ENV: "local",
  DB_CONNECTION: "sqlite",
  DB_DATABASE: DB,
  JWT_SECRET: jwtSecret,
  CAMIS_EMAIL_CONFIRMATION: "false",
  CACHE_STORE: "file",
  SESSION_DRIVER: "array",
  QUEUE_CONNECTION: "sync",
}

const check = spawnSync("php", ["artisan", "camis:strapi-schema-check"], {
  cwd: LARAVEL,
  env,
  stdio: "inherit",
})
if (check.status !== 0) {
  console.error(
    "[php-app] schema check failed — the Strapi dev database is missing tables; run `pnpm strapi-app develop` once after any schema change",
  )
  process.exit(check.status ?? 1)
}

console.log(
  `[php-app] http://localhost:${PORT}/api  (db: apps/strapi-oyl/.tmp/data.db)`,
)
const server = spawn(
  "php",
  ["artisan", "serve", "--host=127.0.0.1", `--port=${PORT}`],
  { cwd: LARAVEL, env, stdio: "inherit" },
)
process.on("SIGINT", () => server.kill("SIGINT"))
server.on("exit", (code) => process.exit(code ?? 0))
```

- [ ] **Step 7: Run the unit tests**

Run: `pnpm php-app test`
Expected: PASS (cli, scripts, ir, roles, overlay, deploy-script).

- [ ] **Step 8: Rebuild `laravel/` for the layout**

Run from the oyl root: `pnpm php-app build`
Expected: the "removing it and re-scaffolding" line, `composer create-project` + `composer require firebase/php-jwt visus/cuid2`, then `camis build` reporting 74 files and exactly one gap (`adminPanelNotEmitted`). Then confirm the shape:

```bash
ls apps/camis-php-oyl/laravel/app/Support apps/camis-php-oyl/laravel/app/Console/Commands
ls apps/camis-php-oyl/laravel/database/migrations   # only Laravel's own 0001_01_01_* files, no camis migrations
grep -c "storageLayout" apps/camis-php-oyl/laravel/DEPLOY.md || true
cd apps/camis-php-oyl/laravel && php artisan list | grep camis:strapi-schema-check
```

Expected: `StrapiComponentAttributes.php StrapiComponents.php StrapiRows.php` and `CamisStrapiSchemaCheck.php` exist; the artisan command is listed. (Do not run it yet — there is no Strapi-created database in this task.)

- [ ] **Step 9: Commit**

```bash
git add apps/camis-php-oyl/camis.config.json apps/camis-php-oyl/scripts/build.mjs apps/camis-php-oyl/scripts/dev.mjs apps/camis-php-oyl/test/cli.test.ts apps/camis-php-oyl/test/scripts.test.ts
git commit -m "feat(camis-php-oyl): switch to the Strapi storage layout

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BHLYezHrNAvQTovWe98HVC"
```

---

### Task 2: Overlay — JWT guard on `/bootstrap`, component preload

**Files:**

- Modify: `apps/camis-php-oyl/overlay/routes/api-custom.php`
- Test: `apps/camis-php-oyl/test/overlay.test.ts`

**Interfaces:**

- Consumes: `App\Http\Middleware\StrapiJwtGuard` (Task 1's build), `App\Support\StrapiComponents::load(\Illuminate\Support\Collection $rows, array $map): void`, `<Model>::COMPONENT_MAP` (a `public const` on every generated model, `[]` when the type has no components), `scopeForUser` on every model.
- Produces: the `/bootstrap` route the e2e suite calls under the JWT guard; `/google/config` unchanged.

- [ ] **Step 1: Write the failing test**

In `apps/camis-php-oyl/test/overlay.test.ts`, replace the assertion `expect(src).toContain("Route::middleware('auth:sanctum')->get('/bootstrap'")` with:

```ts
expect(src).toContain(
  "Route::middleware(StrapiJwtGuard::class)->get('/bootstrap'",
)
expect(src).not.toContain("auth:sanctum")
expect(src).toContain("use App\\Http\\Middleware\\StrapiJwtGuard;")
expect(src).toContain("StrapiComponents::load($rows, $model::COMPONENT_MAP);")
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm php-app test -- overlay`
Expected: FAIL on the four new assertions.

- [ ] **Step 3: Update the route**

In `apps/camis-php-oyl/overlay/routes/api-custom.php`, add two imports (keep the `use` block sorted):

```php
use App\Http\Middleware\StrapiJwtGuard;
use App\Support\StrapiComponents;
```

Replace the route head and the loop body:

```php
Route::middleware(StrapiJwtGuard::class)->get('/bootstrap', function (Request $request) {
```

```php
    $data = [];
    foreach ($collections as $path => $model) {
        $serializer = $serializers[$model];
        $rows = $model::query()->forUser($user)->get();
        // Components live in Strapi's _cmps/component tables; the model trait loads them lazily
        // per row, so preload the whole page here (one query per component table per collection).
        StrapiComponents::load($rows, $model::COMPONENT_MAP);
        $data[$path] = $rows
            ->filter(fn (Model $m) => $user->can('view', $m))
            ->map(fn (Model $m) => $serializer::toWire($m))
            ->values()
            ->all();
    }
```

Update the docblock's last sentences: the rows go through the same `forUser` scope, `can('view')` check and serializer as `index()`, and are guarded by the same `StrapiJwtGuard` as the generated routes.

- [ ] **Step 4: Run the tests and mirror the overlay**

Run: `pnpm php-app test` then `pnpm php-app build`
Expected: PASS (the overlay test also `php -l`s the file); the build mirrors `overlay/` into `laravel/`.

- [ ] **Step 5: Commit**

```bash
git add apps/camis-php-oyl/overlay/routes/api-custom.php apps/camis-php-oyl/test/overlay.test.ts
git commit -m "fix(camis-php-oyl): guard /bootstrap with the Strapi JWT and preload components

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BHLYezHrNAvQTovWe98HVC"
```

---

### Task 3: e2e — boot the PHP backend on the Strapi-seeded database

**Files:**

- Modify: `apps/e2e-oyl/scripts/start-php-backend.mjs`
- Test: `apps/camis-php-oyl/test/scripts.test.ts` (drift guard), then the gate `E2E_BACKEND=php pnpm e2e`

**Interfaces:**

- Consumes: `apps/e2e-oyl/scripts/start-backend.mjs` (deletes and recreates `apps/strapi-oyl/.tmp/e2e.db`, boots Strapi on `E2E_BACKEND_PORT` (1341), seeds the `authenticated`/`public` grants in its bootstrap, health `GET /_health` → 204; honors an already-set `JWT_SECRET` via `??=`); `php artisan camis:strapi-schema-check`.
- Produces: the PHP backend on 1341 serving `apps/strapi-oyl/.tmp/e2e.db` with `JWT_SECRET=e2e-test-jwt-secret-shared-by-strapi-and-php`; Playwright's health check `GET /api/_health` → 204 unchanged.

- [ ] **Step 1: Write the failing drift guard**

Append to `apps/camis-php-oyl/test/scripts.test.ts`:

```ts
describe("e2e start-php-backend.mjs", () => {
  const file = resolve(PKG, "..", "e2e-oyl", "scripts", "start-php-backend.mjs")
  const src = readFileSync(file, "utf8")
  it("parses", () => {
    expect(() => execFileSync("node", ["--check", file])).not.toThrow()
  })
  it("boots Strapi first so it owns the schema, then serves PHP on that file", () => {
    expect(src).toContain("start-backend.mjs")
    expect(src).toContain("'/_health'")
    expect(src).toContain("'.tmp', 'e2e.db'")
    expect(src).toContain("camis:strapi-schema-check")
    expect(src).not.toContain("migrate")
    expect(src).not.toContain("RolePermissionSeeder")
  })
  it("shares a JWT secret of at least 32 bytes with Strapi", () => {
    const m = src.match(/const JWT_SECRET = '([^']+)'/)
    expect(m).not.toBeNull()
    expect(m![1].length).toBeGreaterThanOrEqual(32)
  })
  it("keeps Laravel-owned state out of the shared database", () => {
    expect(src).toContain("CACHE_STORE: 'file'")
    expect(src).toContain("SESSION_DRIVER: 'array'")
    expect(src).toContain("QUEUE_CONNECTION: 'sync'")
    expect(src).not.toContain("SANCTUM_TOKEN_EXPIRATION")
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm php-app test -- scripts`
Expected: FAIL (the starter still migrates/seeds and has no `JWT_SECRET` constant).

- [ ] **Step 3: Rewrite `apps/e2e-oyl/scripts/start-php-backend.mjs`**

```js
/**
 * Boot the camis-generated PHP backend (apps/camis-php-oyl/laravel) for e2e runs on the
 * dedicated port, on the SAME database file the Strapi backend uses. Strapi owns the schema, so:
 *   1. run start-backend.mjs as a child (it deletes/recreates apps/strapi-oyl/.tmp/e2e.db, boots
 *      Strapi on the e2e port and seeds the roles through its bootstrap), wait for /_health, stop it;
 *   2. verify the tables with `php artisan camis:strapi-schema-check`;
 *   3. serve PHP on that file with the same JWT_SECRET, so a Strapi-minted session would be
 *      accepted here and vice versa.
 * Selected by E2E_BACKEND=php in playwright.config.ts; Playwright's webServer manages the
 * process (health check: GET /api/_health). Playwright keeps polling while Strapi holds the
 * port because Strapi answers 404 on /api/_health.
 */
import { spawn, spawnSync } from "node:child_process"
import { once } from "node:events"
import { existsSync } from "node:fs"
import path from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LARAVEL = path.resolve(__dirname, "..", "..", "camis-php-oyl", "laravel")
const STRAPI = path.resolve(__dirname, "..", "..", "strapi-oyl")
const DB = path.join(STRAPI, ".tmp", "e2e.db")
const PORT = Number(process.env.E2E_BACKEND_PORT ?? 1341)
// Shared with Strapi (start-backend.mjs keeps an already-set value). At least 32 bytes:
// firebase/php-jwt refuses shorter HS256 keys.
const JWT_SECRET = "e2e-test-jwt-secret-shared-by-strapi-and-php"

if (!existsSync(path.join(LARAVEL, "artisan"))) {
  console.error(
    "[e2e] apps/camis-php-oyl/laravel is not built — run `pnpm php-app build` first",
  )
  process.exit(1)
}

const waitFor = async (url, status, timeoutMs) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.status === status) return
    } catch {
      // not up yet
    }
    await sleep(500)
  }
  throw new Error(`[e2e] ${url} did not answer ${status} within ${timeoutMs}ms`)
}

// 1. Strapi creates the schema and the roles.
const strapiEnv = { ...process.env, JWT_SECRET }
const strapi = spawn(
  process.execPath,
  [path.join(__dirname, "start-backend.mjs")],
  {
    env: strapiEnv,
    stdio: "inherit",
  },
)
const stopStrapi = () => {
  if (strapi.exitCode === null) strapi.kill("SIGTERM")
}
process.on("exit", stopStrapi)
try {
  await waitFor(`http://localhost:${PORT}/_health`, 204, 120_000)
} catch (err) {
  console.error(String(err))
  stopStrapi()
  process.exit(1)
}
stopStrapi()
await once(strapi, "exit")
console.log(
  "[e2e] strapi created the e2e database and stopped; starting php on it",
)

// 2 + 3. PHP on the same file.
const env = {
  ...process.env,
  APP_ENV: "testing",
  DB_CONNECTION: "sqlite",
  DB_DATABASE: DB,
  JWT_SECRET,
  CAMIS_EMAIL_CONFIRMATION: "false",
  // No Laravel-owned tables in the shared database.
  CACHE_STORE: "file",
  SESSION_DRIVER: "array",
  QUEUE_CONNECTION: "sync",
  // The suite registers a fresh account per test from one address; the production rate
  // (10/min per client) would 429 everything after the tenth. Strapi throttles neither
  // route this way, so lifting it here keeps the two backends comparable.
  CAMIS_AUTH_THROTTLE_PER_MINUTE: "100000",
}

const check = spawnSync("php", ["artisan", "camis:strapi-schema-check"], {
  cwd: LARAVEL,
  env,
  stdio: "inherit",
})
if (check.status !== 0) {
  console.error(
    "[e2e] camis:strapi-schema-check failed — the Strapi boot did not create the tables the PHP app expects",
  )
  process.exit(1)
}

const server = spawn(
  "php",
  ["artisan", "serve", "--host=127.0.0.1", `--port=${PORT}`],
  {
    cwd: LARAVEL,
    env,
    stdio: "inherit",
  },
)
process.on("SIGTERM", () => server.kill("SIGTERM"))
process.on("SIGINT", () => server.kill("SIGINT"))
server.on("exit", (code) => process.exit(code ?? 0))
console.log(
  `[e2e] php backend starting on http://localhost:${PORT} (db: apps/strapi-oyl/.tmp/e2e.db)`,
)
```

- [ ] **Step 4: Run the drift guard**

Run: `pnpm php-app test`
Expected: PASS.

- [ ] **Step 5: Run the gate**

Run from the oyl root: `E2E_BACKEND=php pnpm e2e`
Expected: the backend webServer log shows Strapi ready → stopped → `strapi schema ok` → PHP starting; every spec passes on desktop and mobile (google-auth skipped). If the backend takes longer than 180 s to answer `/api/_health`, raise that webServer entry's `timeout` in `apps/e2e-oyl/playwright.config.ts` to `300_000` and say so in the commit body.

Triage any failure by where the defect lives:

- overlay (`/bootstrap`, UPC override) → fix here with a test in `test/overlay.test.ts`;
- generated PHP (models, runtime, controllers, auth, serializers) → fix in camis on a branch, TDD (failing golden/unit test first), merge to camis `master`, then re-run here (the `link:` picks it up; `pnpm php-app build` regenerates);
- e2e wiring (ports, timing, env) → fix in the starter with the drift guard updated.
  Record each divergence and its fix in the commit body.

- [ ] **Step 6: Commit**

```bash
git add apps/e2e-oyl/scripts/start-php-backend.mjs apps/camis-php-oyl/test/scripts.test.ts apps/e2e-oyl/playwright.config.ts
git commit -m "feat(e2e-oyl): boot the PHP backend on the Strapi-seeded e2e database

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BHLYezHrNAvQTovWe98HVC"
```

---

### Task 4: Deploy script and `.env.example`

**Files:**

- Modify: `scripts/deploy-dreamhost.sh`, `apps/camis-php-oyl/.env.example`
- Test: `apps/camis-php-oyl/test/deploy-script.test.ts`, `apps/camis-php-oyl/test/scripts.test.ts`

**Interfaces:**

- Consumes: `php artisan camis:strapi-schema-check` (exit non-zero lists every missing table/column).
- Produces: a deploy that fails fast when Strapi has not been synced against the DreamHost database; a `.env.example` a deployer copies to `laravel/.env` on the host.

- [ ] **Step 1: Write the failing tests**

Append to `apps/camis-php-oyl/test/deploy-script.test.ts` (inside the existing `describe`):

```ts
it("verifies the Strapi-owned schema remotely instead of migrating or seeding", () => {
  const src = readFileSync(SCRIPT, "utf8")
  expect(src).toContain("php artisan camis:strapi-schema-check")
  expect(src).not.toContain("php artisan migrate")
  expect(src).not.toContain("RolePermissionSeeder")
})
```

(`readFileSync` from `node:fs`; `SCRIPT` is the constant the file already defines.)

Append to `apps/camis-php-oyl/test/scripts.test.ts`:

```ts
describe(".env.example", () => {
  const src = read(".env.example")
  it("carries the shared-database settings and no Sanctum leftovers", () => {
    expect(src).toContain("JWT_SECRET=")
    expect(src).toContain("CAMIS_EMAIL_CONFIRMATION=false")
    expect(src).toContain("CACHE_STORE=file")
    expect(src).toContain("SESSION_DRIVER=array")
    expect(src).toContain("QUEUE_CONNECTION=sync")
    expect(src).toContain("CAMIS_AUTH_THROTTLE_PER_MINUTE=")
    expect(src).not.toContain("SANCTUM")
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm php-app test -- deploy-script scripts`
Expected: FAIL (script still migrates/seeds; `.env.example` still has Sanctum and no `JWT_SECRET`).

- [ ] **Step 3: Edit the remote block of `scripts/deploy-dreamhost.sh`**

Replace the `echo "==> Remote composer + migrate + seed + cache"` line and the three artisan lines so the block reads:

```bash
echo "==> Remote composer + schema check + cache"
ssh "$DH_SSH" "APP_ROOT=$(printf %q "$APP_ROOT") bash -l -s" <<'REMOTE'
set -euo pipefail
cd "$APP_ROOT/laravel"
[ -f .env ] || { echo "remote: laravel/.env missing — create it from apps/camis-php-oyl/.env.example first"; exit 1; }
composer install --no-dev --optimize-autoloader --no-interaction
# Strapi owns the schema: this fails (listing every missing table/column) until strapi-oyl has
# been booted against this MySQL database — see apps/camis-php-oyl/README.md "Schema sync".
php artisan camis:strapi-schema-check
php artisan config:cache
cat DEPLOYED
REMOTE
```

- [ ] **Step 4: Rewrite `apps/camis-php-oyl/.env.example`**

```dotenv
APP_NAME=oyl
APP_KEY=
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.example.com

# DreamHost: the MySQL database strapi-oyl was synced against (see README "Schema sync").
# Local/e2e use the Strapi sqlite files (see scripts/).
DB_CONNECTION=mysql
DB_HOST=mysql.example.com
DB_PORT=3306
DB_DATABASE=oyl
DB_USERNAME=oyl
DB_PASSWORD=change-me

# The HS256 secret shared with the Strapi instance that owns this database (its JWT_SECRET), so a
# session minted by either backend is accepted by the other. At least 32 bytes: firebase/php-jwt
# refuses shorter keys, and the app refuses to mint tokens with a shorter one.
JWT_SECRET=change-me-to-the-strapi-jwt-secret-32-bytes-minimum

# Mirrors Strapi's "email confirmation" advanced setting; false = new accounts are confirmed.
CAMIS_EMAIL_CONFIRMATION=false

# No Laravel-owned tables in the shared database (Strapi's schema sync never creates them):
# cache on disk, no sessions (the API is stateless), no queue.
CACHE_STORE=file
SESSION_DRIVER=array
QUEUE_CONNECTION=sync

# Login/register rate limit per IP per minute (login and register share one bucket). Baked by
# config:cache — re-run it after changing.
CAMIS_AUTH_THROTTLE_PER_MINUTE=10
```

- [ ] **Step 5: Run the tests**

Run: `pnpm php-app test` (the deploy test also runs `bash -n` on the script)
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/deploy-dreamhost.sh apps/camis-php-oyl/.env.example apps/camis-php-oyl/test/deploy-script.test.ts apps/camis-php-oyl/test/scripts.test.ts
git commit -m "feat(camis-php-oyl): deploy verifies the Strapi-owned schema; env for the shared database

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BHLYezHrNAvQTovWe98HVC"
```

---

### Task 5: Docs

**Files:**

- Modify: `apps/camis-php-oyl/README.md`, `CLAUDE.md`, `docs/superpowers/plans/2026-09-08-camis-php-oyl-followups.md`

**Interfaces:** none (docs only; no code changes in this task).

- [ ] **Step 1: `apps/camis-php-oyl/README.md`**

- Intro: add one sentence — the app reads and writes **the same database as `apps/strapi-oyl`** (camis `storageLayout: "strapi"`): Strapi owns the schema and the roles; either backend can serve the data and the sessions at any time.
- Prerequisites: drop "Filament wants `intl`" and the `COMPOSER_IGNORE_PLATFORM_REQ=ext-intl` paragraph (no Filament in this layout); keep `php` 8.3+ with `pdo_sqlite`, `pdo_mysql`, `mbstring`, `openssl`.
- Commands: `pnpm php-app dev` now says "serve on :1340 against `apps/strapi-oyl/.tmp/data.db` (run `pnpm strapi-app develop` once first; never both at once)"; `E2E_BACKEND=php pnpm e2e` says "boots strapi-oyl to create the e2e database, then the PHP backend on it".
- "What is committed": `camis.config.json` row mentions `storageLayout: "strapi"`; `.env.example` row lists `JWT_SECRET` (shared with Strapi, ≥ 32 bytes), `CAMIS_EMAIL_CONFIRMATION`, the file/array/sync drivers, `CAMIS_AUTH_THROTTLE_PER_MINUTE` (delete the Sanctum sentences).
- New section **"Schema sync (one-time, and after every schema change)"** before "DreamHost one-time setup":

````markdown
## Schema sync (one-time, and after every schema change)

Strapi owns the tables. Before the first deploy, and after any change under
`apps/strapi-oyl/src/api/**` or `src/components/**`, boot strapi-oyl against the DreamHost
MySQL database until it reports the server started, then stop it (Ctrl-C). Strapi creates or
alters the tables, records them in `strapi_database_schema`, and seeds the `authenticated`
and `public` role grants through its bootstrap. Nothing else ever alters this schema.

```bash
cd apps/strapi-oyl
DATABASE_CLIENT=mysql DATABASE_HOST=mysql.example.com DATABASE_PORT=3306 \
DATABASE_NAME=oyl DATABASE_USERNAME=oyl DATABASE_PASSWORD='…' DATABASE_SSL=false \
JWT_SECRET='<the same value as laravel/.env on the host>' pnpm develop
```

DreamHost only accepts remote MySQL connections from hosts allowed in the panel (Databases →
the database's "Allowable Hosts"); add your IP for the sync or run the command from a host
inside DreamHost. `pnpm deploy:dreamhost` then runs `php artisan camis:strapi-schema-check` on
the host and stops with the list of missing tables if the sync was skipped.
````

- "DreamHost one-time setup": step 1 adds "set `JWT_SECRET` to the same value the Strapi sync used"; step 3 drops `intl`; replace step 5 (the `username` migration) with "Run the schema sync above before the first `pnpm deploy:dreamhost`."

- [ ] **Step 2: `CLAUDE.md`**

- Package row for `@oyl/camis-php-oyl`: after "A Laravel 12 app that serves the same Strapi-shaped API as `strapi-oyl`" add "**on the same database** (camis `storageLayout: "strapi"`; Strapi owns the schema and roles, JWTs are shared)". Replace "Acceptance: `E2E_BACKEND=php pnpm e2e`." with "Acceptance: `E2E_BACKEND=php pnpm e2e` (boots strapi-oyl to create the database, then PHP on it)."
- Test row for `camis-php-oyl`: "vitest: IR + roles drift guards, overlay `php -l`, deploy + build/dev/e2e script guards".
- "Adding a content type" bullet: append "**Schema change ⇒ Strapi sync before PHP deploy**: boot strapi-oyl against the target database (locally `pnpm strapi-app develop`; DreamHost per the package README "Schema sync") before `pnpm deploy:dreamhost` — the deploy's `camis:strapi-schema-check` fails otherwise."

- [ ] **Step 3: Follow-ups doc `docs/superpowers/plans/2026-09-08-camis-php-oyl-followups.md`**

- Strike (with ~~strikethrough~~ and a "moot since the Strapi storage layout" note) the two `SANCTUM_TOKEN_EXPIRATION` items and the `username` migration item under "Before the first real deploy" and "camis-side".
- Under "Before the first real deploy": add "Run the Strapi schema sync against the DreamHost MySQL (README "Schema sync") before `pnpm deploy:dreamhost`; `JWT_SECRET` on the host must equal Strapi's and be ≥ 32 bytes."
- Under "Overlay": strike the `/bootstrap` "per-row child lazy-loads" item (components are now preloaded with `StrapiComponents::load` per collection); the 11 unpaginated queries remain.
- Under "camis-side": add "The generated `DEPLOY.md` for the strapi layout does not mention `CACHE_STORE=file` / `SESSION_DRIVER=array` / `QUEUE_CONNECTION=sync`, which every deployment of this layout needs (no Laravel-owned tables); this package's `.env.example` carries them."

- [ ] **Step 4: Format and commit**

Run: `pnpm exec prettier --check apps/camis-php-oyl/README.md CLAUDE.md docs/superpowers/plans/2026-09-08-camis-php-oyl-followups.md` (fix with `--write` if needed), then

```bash
git add apps/camis-php-oyl/README.md CLAUDE.md docs/superpowers/plans/2026-09-08-camis-php-oyl-followups.md
git commit -m "docs(camis-php-oyl): shared Strapi database — schema sync, deploy, env

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BHLYezHrNAvQTovWe98HVC"
```

---

## Self-review

**Spec coverage ("oyl side"):** config flip + regenerate → Task 1 (with the documented re-scaffold deviation); overlay (`/bootstrap` chain, optional preload) → Task 2 (the guard switch is required, not optional — the route hard-codes the middleware); e2e Strapi-first boot on the shared file with a shared `JWT_SECRET` → Task 3 (the flag deviation is documented; the secret is ≥ 32 bytes per the camis finding); deploy schema check + `.env.example` → Task 4; DreamHost schema init + docs (CLAUDE.md row, README, checklist) → Task 5. Sequencing step 3 (the first shared-database deploy) is an operator action after this plan, described in the README.

**Placeholder scan:** every code step is a full file or an exact replacement; the only `…` characters are inside quoted example secrets in docs.

**Type consistency:** `JWT_SECRET` constant name and value are identical in Task 3's script and its drift guard; the `camis:strapi-schema-check` command name matches camis's `CamisStrapiSchemaCheck` signature; `StrapiComponents::load($rows, $model::COMPONENT_MAP)` matches the runtime signature `load(Collection $rows, array $map)` and the models' `public const COMPONENT_MAP`; `StrapiJwtGuard` is `App\Http\Middleware\StrapiJwtGuard` in the generated routes.
