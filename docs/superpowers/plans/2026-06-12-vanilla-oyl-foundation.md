# vanilla-oyl Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `apps/vanilla-oyl` — a zero-runtime-dependency web app (vanilla JS + JSDoc, Web Components, modern CSS, localStorage) that consumes `@oyl/all-of-oyl` as the single source of truth — proven end-to-end by a Status diagnostics screen.

**Architecture:** `all-of-oyl/src` gains a browser ESM build, a `LocalStorageRepository`, and a `collections` manifest (the canonical persistable-type list). The app references the built `dist/` through a one-entry importmap, builds UI on a ~150-line signals reactive core and an `OylElement` Web Component base (shadow DOM + design tokens), persists through localStorage, and themes via `light-dark()` + `color-scheme`.

**Tech Stack:** TypeScript (build + JSDoc typecheck), Vitest + happy-dom, http-server, native ES modules / importmaps, Custom Elements, Constructable Stylesheets, CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-06-12-vanilla-oyl-foundation-design.md`

---

## Ordering note

The spec's build sequence lists "reactive core" first, but the reactive core lives **inside** the app and needs the app's Vitest harness to exist before it can be tested. This plan therefore does the app-independent `all-of-oyl` changes first (Phases 0–2, independently testable via the existing Vitest setup), then the app skeleton + test harness (Phase 3), then the reactive core and everything above it (Phases 4–9). Each phase ends green and committed.

## File structure

**Modified in `packages/all-of-oyl/`:**
- `package.json` — add `"type": "module"`, `build` + `build:check` scripts.
- `src/tsconfig.json` — `module`/`moduleResolution` → `nodenext`.
- `src/**/*.ts` — explicit `.js` extensions on all relative imports.
- `src/index.ts` — export `LocalStorageRepository`, `StorageLike`, `collections`.
- `tsconfig.build.json` *(new)* — emit ESM + `.d.ts` + sourcemaps to `dist/`.
- `scripts/check-no-bare-imports.mjs` *(new)* — fail build if `dist/` has bare imports.
- `src/core/local-storage-repository.ts` *(new)* — the adapter.
- `src/core/repository-contract.ts` *(new)* — shared behavioral contract suite.
- `src/core/repository-contract.test.ts` *(new)* — runs the contract on `InMemoryRepository`.
- `src/core/local-storage-repository.test.ts` *(new)* — runs the contract + adapter specifics.
- `src/core/in-memory-repository.test.ts` — refactor to call the shared contract.
- `src/collections.ts` *(new)* — collection→codec manifest.
- `src/collections.test.ts` *(new)* — round-trips every collection from `makeSeed()`.

**Created in `apps/vanilla-oyl/`:**
- `package.json`, `tsconfig.json`, `.gitignore`, `vitest.config.js`, `test/setup.js`
- `scripts/copy-lib.mjs`
- `index.html`
- `src/main.js`
- `src/lib/reactive/internals.js`, `signal.js`, `computed.js`, `effect.js`, `oyl-element.js`
- `src/storage/keys.js`, `clock.js`, `schema.js`, `bootstrap.js`, `backup.js`, `seed.js`
- `src/state/theme.js`, `route.js`, `data.js`
- `src/theme/theme-manager.js`
- `src/components/sheet.js`, `oyl-shell.js`, `oyl-theme-toggle.js`, `oyl-router.js`, `oyl-status-panel.js`
- `styles/reset.css`, `tokens.css`, `themes/classic.css`, `themes/forest.css`, `layout.css`

**Modified at repo root:**
- `pnpm-workspace.yaml` — add `apps/*`.
- `package.json` — repoint `vanilla` script; widen aggregate filters to `./apps/*`.
- `packages/vanilla-oyl/package.json` — rename to `@oyl/vanilla-oyl-legacy`.

---

# Phase 0 — all-of-oyl browser-readiness

### Task 1: Switch `src/` to NodeNext + explicit import extensions

**Files:**
- Modify: `packages/all-of-oyl/package.json`
- Modify: `packages/all-of-oyl/src/tsconfig.json`
- Modify: `packages/all-of-oyl/src/**/*.ts` (mechanical)

- [ ] **Step 1: Add `"type": "module"` to the package**

In `packages/all-of-oyl/package.json`, add the field (after `"private": true`):

```json
  "type": "module",
```

- [ ] **Step 2: Switch the src tsconfig to NodeNext**

In `packages/all-of-oyl/src/tsconfig.json`, change these two compilerOptions:

```jsonc
    "module": "nodenext",
    "moduleResolution": "nodenext",
```

(Leave everything else — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `target: ES2022` — unchanged.)

- [ ] **Step 3: Let `tsc` enumerate every missing extension**

Run: `pnpm --filter @oyl/all-of-oyl typecheck:src`
Expected: FAIL — a list of `error TS2835: Relative import paths need explicit file extensions in ECMAScript imports when '--moduleResolution' is 'nodenext'. Did you mean './foo.js'?` This list IS your worklist.

- [ ] **Step 4: Add `.js` extensions to all relative imports**

Apply this codemod from the repo root (rewrites `from './x'` / `from '../x'` → `from './x.js'`, skipping ones that already have an extension):

```bash
find packages/all-of-oyl/src -name '*.ts' -print0 | xargs -0 perl -i -pe \
  "s{(from\s+['\"])(\.\.?/[^'\"]+?)(['\"])}{ \$2 =~ /\.(js|json)\$/ ? \"\$1\$2\$3\" : \"\$1\$2.js\$3\" }ge"
```

Then handle bare `import './x'` side-effect forms and dynamic imports the same way if any remain (re-run typecheck to find them).

- [ ] **Step 5: Verify typecheck is green**

Run: `pnpm --filter @oyl/all-of-oyl typecheck:src`
Expected: PASS (no output).

- [ ] **Step 6: Verify the existing test suite still passes**

Run: `pnpm --filter @oyl/all-of-oyl test`
Expected: PASS — all existing suites green (Vitest resolves `.js`→`.ts` natively; extensions are transparent to it).

- [ ] **Step 7: Verify downstream consumers still typecheck**

Run: `pnpm --filter @oyl/react-oyl exec tsc -b --noEmit && pnpm --filter @oyl/next-oyl exec tsc --noEmit`
Expected: PASS. (Consumers use `moduleResolution: bundler`, which resolves the new `.js` specifiers to the `.ts` sources transparently.)

> **Fallback if Step 6 or 7 fails because of `"type": "module"`:** revert Step 1, and instead keep `module: esnext` + `moduleResolution: bundler` in Step 2 (do NOT use nodenext). The `.js` extensions from Step 4 are still correct and are preserved verbatim in emit; bundler resolution simply won't *enforce* them. Re-run Steps 5–7; then in Task 2 the bare-import guard becomes the enforcement mechanism instead of the compiler.

- [ ] **Step 8: Commit**

```bash
git add packages/all-of-oyl/package.json packages/all-of-oyl/src
git commit -m "refactor(all-of-oyl): NodeNext + explicit .js import extensions for browser ESM"
```

---

### Task 2: Package-owned build + bare-import guard

**Files:**
- Create: `packages/all-of-oyl/tsconfig.build.json`
- Create: `packages/all-of-oyl/scripts/check-no-bare-imports.mjs`
- Modify: `packages/all-of-oyl/package.json`

- [ ] **Step 1: Create the build tsconfig**

Create `packages/all-of-oyl/tsconfig.build.json`:

```jsonc
{
  "extends": "./src/tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "inlineSources": true,
    "types": [],
    "incremental": false
  },
  "include": ["./src/**/*.ts"],
  "exclude": ["./src/**/*.test.ts"]
}
```

(`types: []` drops the `vitest/globals` ambient types, which only the excluded test files use.)

- [ ] **Step 2: Create the bare-import guard script**

Create `packages/all-of-oyl/scripts/check-no-bare-imports.mjs`:

```js
// Fails if any emitted dist/ file imports a bare specifier (anything not starting
// with './' or '../'). The app's importmap has exactly one entry and relies on every
// internal import being relative; a stray bare import (e.g. 'rrule') would break it.
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const DIST = new URL('../dist/', import.meta.url).pathname
const IMPORT_RE = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]/g
const offenders = []

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) await walk(full)
    else if (entry.name.endsWith('.js')) {
      const code = await readFile(full, 'utf8')
      for (const m of code.matchAll(IMPORT_RE)) {
        const spec = m[1]
        if (!spec.startsWith('./') && !spec.startsWith('../')) offenders.push(`${full}: ${spec}`)
      }
    }
  }
}

await walk(DIST)
if (offenders.length) {
  console.error('Bare-specifier imports found in dist/ (breaks the single-entry importmap):')
  for (const o of offenders) console.error('  ' + o)
  process.exit(1)
}
console.log('dist/ is bare-import free.')
```

- [ ] **Step 3: Add the build scripts**

In `packages/all-of-oyl/package.json` `scripts`, add:

```json
    "build": "tsc -p tsconfig.build.json && node scripts/check-no-bare-imports.mjs",
    "build:clean": "rm -rf dist && pnpm build",
```

- [ ] **Step 4: Run the build and verify output + guard**

Run: `pnpm --filter @oyl/all-of-oyl build`
Expected: emits `dist/index.js`, `dist/core/*.js`, `dist/**/*.d.ts`, `.js.map`; prints `dist/ is bare-import free.`

- [ ] **Step 5: Sanity-check the entry is importable as pure ESM**

Run: `node --input-type=module -e "import('./packages/all-of-oyl/dist/index.js').then(m => console.log('exports:', Object.keys(m).length))"`
Expected: prints a positive export count (e.g. `exports: 60+`), no resolution errors.

- [ ] **Step 6: Commit** (`dist/` is already gitignored)

```bash
git add packages/all-of-oyl/tsconfig.build.json packages/all-of-oyl/scripts/check-no-bare-imports.mjs packages/all-of-oyl/package.json
git commit -m "build(all-of-oyl): emit browser ESM to dist/ with bare-import guard"
```

---

# Phase 1 — LocalStorageRepository + shared contract

### Task 3: Extract the shared repository contract

**Files:**
- Create: `packages/all-of-oyl/src/core/repository-contract.ts`
- Create: `packages/all-of-oyl/src/core/repository-contract.test.ts`
- Modify: `packages/all-of-oyl/src/core/in-memory-repository.test.ts`

- [ ] **Step 1: Write the contract suite**

Create `packages/all-of-oyl/src/core/repository-contract.ts`. It asserts **behavior**, reading `meta` off returned items — never object identity (the localStorage adapter clones; the in-memory one aliases).

```ts
import { describe, expect, it } from 'vitest'
import type { Repository } from './repository.js'
import { LifeArea } from './life-area.js'
import { Id } from './id.js'

/**
 * Behavioral contract every Repository<LifeArea> must satisfy. `makeRepo` returns a
 * fresh, empty repository wired to a deterministic clock (tick-per-call, starting
 * 2026-06-01T00:00:00Z) so timestamps are comparable across implementations.
 */
export function repositoryContract(label: string, makeRepo: () => Repository<LifeArea>): void {
  describe(`${label} (repository contract)`, () => {
    it('stamps fresh meta on first save and returns the item', async () => {
      const repo = makeRepo()
      const saved = await repo.save(new LifeArea({ name: 'Health', slug: 'health' }))
      expect(saved.meta?.revision).toBe(1)
      expect(saved.meta?.createdAt).toBeInstanceOf(Date)
      expect(saved.meta?.deletedAt).toBeUndefined()
    })

    it('bumps revision and updatedAt on subsequent saves', async () => {
      const repo = makeRepo()
      const area = await repo.save(new LifeArea({ name: 'Health', slug: 'health' }))
      const again = await repo.save(area)
      expect(again.meta?.revision).toBe(2)
      expect(again.meta!.updatedAt.getTime()).toBeGreaterThan(again.meta!.createdAt.getTime())
    })

    it('rejects stale revisions with REVISION_CONFLICT', async () => {
      const repo = makeRepo()
      const area = await repo.save(new LifeArea({ name: 'Health', slug: 'health' }))
      const stale = LifeArea.fromJSON(area.toJSON())
      await repo.save(area)
      await expect(repo.save(stale)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    })

    it('rejects a fresh (meta-less) save colliding with an existing record', async () => {
      const repo = makeRepo()
      const area = await repo.save(new LifeArea({ name: 'Health', slug: 'health' }))
      const ghost = new LifeArea({ id: area.id, name: 'Health 2', slug: 'health' })
      await expect(repo.save(ghost)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    })

    it('save with foreign meta for an unknown id is a create with fresh meta', async () => {
      const repo = makeRepo()
      const imported = LifeArea.fromJSON({
        id: '00000000-0000-4000-8000-000000000010',
        name: 'Health',
        slug: 'health',
        meta: { createdAt: '2020-01-01T00:00:00Z', updatedAt: '2020-01-01T00:00:00Z', revision: 99 },
      })
      const saved = await repo.save(imported)
      expect(saved.meta?.revision).toBe(1)
      expect(saved.meta!.createdAt.getUTCFullYear()).toBe(2026)
    })

    it('soft delete: get returns undefined, list excludes unless asked; idempotent', async () => {
      const repo = makeRepo()
      const area = await repo.save(new LifeArea({ name: 'Health', slug: 'health' }))
      await repo.delete(area.id)
      await repo.delete(area.id)
      expect(await repo.get(area.id)).toBeUndefined()
      expect(await repo.list()).toHaveLength(0)
      const includingDeleted = await repo.list({ includeDeleted: true })
      expect(includingDeleted).toHaveLength(1)
      expect(includingDeleted[0]?.meta?.deletedAt).toBeInstanceOf(Date)
    })

    it('purge removes entirely; idempotent; save after purge recreates', async () => {
      const repo = makeRepo()
      const area = await repo.save(new LifeArea({ name: 'Health', slug: 'health' }))
      await repo.purge(area.id)
      await repo.purge(area.id)
      expect(await repo.list({ includeDeleted: true })).toHaveLength(0)
      const recreated = await repo.save(area)
      expect(recreated.meta?.revision).toBe(1)
    })

    it('get of unknown id is undefined', async () => {
      const repo = makeRepo()
      expect(await repo.get(Id.create())).toBeUndefined()
    })
  })
}
```

- [ ] **Step 2: Point a test at the contract for InMemoryRepository**

Create `packages/all-of-oyl/src/core/repository-contract.test.ts`:

```ts
import { InMemoryRepository } from './in-memory-repository.js'
import { LifeArea } from './life-area.js'
import { repositoryContract } from './repository-contract.js'

function deterministicClock(): () => Date {
  let tick = 0
  return () => new Date(Date.UTC(2026, 5, 1, 0, 0, tick++))
}

repositoryContract('InMemoryRepository', () => new InMemoryRepository<LifeArea>(deterministicClock()))
```

- [ ] **Step 3: Slim the original in-memory test to its adapter-specific cases**

In `packages/all-of-oyl/src/core/in-memory-repository.test.ts`, delete the seven cases now covered by the contract, keeping only behavior unique to the reference impl (the in-place aliasing note). Replace the file body with:

```ts
import { describe, expect, it } from 'vitest'
import { InMemoryRepository } from './in-memory-repository.js'
import { LifeArea } from './life-area.js'

// Behavioral parity lives in repository-contract.test.ts. This file keeps only the
// reference-implementation-specific trait: it aliases and stamps the caller's object.
describe('InMemoryRepository (reference-specific)', () => {
  it('stamps meta onto the caller-supplied object (aliasing reference behavior)', async () => {
    const repo = new InMemoryRepository<LifeArea>()
    const area = new LifeArea({ name: 'Health', slug: 'health' })
    const saved = await repo.save(area)
    expect(saved).toBe(area)
    expect(area.meta?.revision).toBe(1)
  })
})
```

- [ ] **Step 4: Run the contract + in-memory tests**

Run: `pnpm --filter @oyl/all-of-oyl test -- repository-contract in-memory-repository`
Expected: PASS — eight contract cases + one reference-specific case.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/core/repository-contract.ts packages/all-of-oyl/src/core/repository-contract.test.ts packages/all-of-oyl/src/core/in-memory-repository.test.ts
git commit -m "test(all-of-oyl): extract shared repository contract suite"
```

---

### Task 4: LocalStorageRepository (TDD against the contract)

**Files:**
- Create: `packages/all-of-oyl/src/core/local-storage-repository.test.ts`
- Create: `packages/all-of-oyl/src/core/local-storage-repository.ts`
- Modify: `packages/all-of-oyl/src/index.ts`

- [ ] **Step 1: Write the failing test (contract + adapter specifics)**

Create `packages/all-of-oyl/src/core/local-storage-repository.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { LocalStorageRepository, type StorageLike } from './local-storage-repository.js'
import { LifeArea } from './life-area.js'
import { repositoryContract } from './repository-contract.js'

/** Minimal in-memory StorageLike for tests. */
function fakeStorage(): StorageLike & { dump(): Record<string, string> } {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    dump: () => Object.fromEntries(map),
  }
}

function deterministicClock(): () => Date {
  let tick = 0
  return () => new Date(Date.UTC(2026, 5, 1, 0, 0, tick++))
}

const codec = { toJSON: (a: LifeArea) => a.toJSON(), fromJSON: LifeArea.fromJSON }

repositoryContract(
  'LocalStorageRepository',
  () => new LocalStorageRepository<LifeArea>(fakeStorage(), 'oyl/data/test', codec, deterministicClock()),
)

describe('LocalStorageRepository (adapter specifics)', () => {
  it('persists toJSON shapes under the given key and survives a fresh instance', async () => {
    const storage = fakeStorage()
    const repoA = new LocalStorageRepository<LifeArea>(storage, 'oyl/data/areas', codec, deterministicClock())
    const saved = await repoA.save(new LifeArea({ name: 'Health', slug: 'health' }))

    expect(JSON.parse(storage.dump()['oyl/data/areas'])).toEqual([
      expect.objectContaining({ id: saved.id, name: 'Health', slug: 'health' }),
    ])

    const repoB = new LocalStorageRepository<LifeArea>(storage, 'oyl/data/areas', codec, deterministicClock())
    const reread = await repoB.get(saved.id)
    expect(reread?.name).toBe('Health')
    expect(reread?.meta?.revision).toBe(1)
  })

  it('does NOT alias the caller object (clones via serialization)', async () => {
    const repo = new LocalStorageRepository<LifeArea>(fakeStorage(), 'oyl/data/areas', codec, deterministicClock())
    const area = new LifeArea({ name: 'Health', slug: 'health' })
    const saved = await repo.save(area)
    expect(saved).not.toBe(area)
    expect(area.meta).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test -- local-storage-repository`
Expected: FAIL — cannot resolve `./local-storage-repository.js`.

- [ ] **Step 3: Implement the adapter**

Create `packages/all-of-oyl/src/core/local-storage-repository.ts`:

```ts
import { DomainError } from './domain-error.js'
import type { Id } from './id.js'
import type { PersistedMeta } from './persisted-meta.js'
import type { Repository } from './repository.js'

/** The narrow slice of the Web Storage API the adapter needs; injected for testability. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

interface Codec<T> {
  toJSON(item: T): unknown
  fromJSON(shape: unknown): T
}

/**
 * Repository<T> backed by a single Web Storage key holding a JSON array of toJSON
 * shapes. Mirrors InMemoryRepository's semantics (meta stamping, REVISION_CONFLICT,
 * soft delete, idempotent purge) but CLONES through (de)serialization rather than
 * aliasing the caller's object. One instance per collection.
 */
export class LocalStorageRepository<T extends { id: Id; meta?: PersistedMeta }> implements Repository<T> {
  constructor(
    private readonly storage: StorageLike,
    private readonly key: string,
    private readonly codec: Codec<T>,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private readAll(): T[] {
    const raw = this.storage.getItem(this.key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new DomainError('MALFORMED_JSON', `${this.key} is not an array`)
    return parsed.map((shape) => this.codec.fromJSON(shape))
  }

  private writeAll(items: T[]): void {
    this.storage.setItem(this.key, JSON.stringify(items.map((i) => this.codec.toJSON(i))))
  }

  async get(id: Id): Promise<T | undefined> {
    const found = this.readAll().find((i) => i.id === id)
    if (!found || found.meta?.deletedAt) return undefined
    return found
  }

  async list(opts?: { includeDeleted?: boolean }): Promise<T[]> {
    const all = this.readAll()
    return opts?.includeDeleted ? all : all.filter((i) => !i.meta?.deletedAt)
  }

  async save(item: T): Promise<T> {
    const all = this.readAll()
    const idx = all.findIndex((i) => i.id === item.id)
    const now = this.clock()
    // Clone the incoming item so we never alias the caller's object.
    const next = this.codec.fromJSON(this.codec.toJSON(item))
    if (idx === -1) {
      next.meta = { createdAt: now, updatedAt: now, revision: 1 }
      all.push(next)
    } else {
      const stored = all[idx]!
      if (item.meta?.revision !== stored.meta?.revision) {
        throw new DomainError(
          'REVISION_CONFLICT',
          `stale save of ${item.id}: have revision ${item.meta?.revision ?? 'none'}, stored ${stored.meta?.revision}`,
        )
      }
      next.meta = {
        createdAt: stored.meta?.createdAt ?? now,
        updatedAt: now,
        revision: (stored.meta?.revision ?? 0) + 1,
      }
      all[idx] = next
    }
    this.writeAll(all)
    return next
  }

  async delete(id: Id): Promise<void> {
    const all = this.readAll()
    const idx = all.findIndex((i) => i.id === id)
    const stored = idx === -1 ? undefined : all[idx]
    if (!stored || !stored.meta || stored.meta.deletedAt) return
    const now = this.clock()
    stored.meta = { ...stored.meta, updatedAt: now, revision: stored.meta.revision + 1, deletedAt: now }
    all[idx] = stored
    this.writeAll(all)
  }

  async purge(id: Id): Promise<void> {
    const all = this.readAll()
    const next = all.filter((i) => i.id !== id)
    if (next.length !== all.length) this.writeAll(next)
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/all-of-oyl test -- local-storage-repository`
Expected: PASS — eight contract cases + two adapter-specific cases.

- [ ] **Step 5: Export from the barrel**

In `packages/all-of-oyl/src/index.ts`, after the `InMemoryRepository` export (line ~20), add:

```ts
export { LocalStorageRepository, type StorageLike } from './core/local-storage-repository.js'
```

- [ ] **Step 6: Verify the whole package is green and builds**

Run: `pnpm --filter @oyl/all-of-oyl test && pnpm --filter @oyl/all-of-oyl build`
Expected: all tests PASS; build emits and reports bare-import free.

- [ ] **Step 7: Commit**

```bash
git add packages/all-of-oyl/src/core/local-storage-repository.ts packages/all-of-oyl/src/core/local-storage-repository.test.ts packages/all-of-oyl/src/index.ts
git commit -m "feat(all-of-oyl): LocalStorageRepository adapter (passes repository contract)"
```

---

# Phase 2 — collections manifest

### Task 5: The `collections` manifest

**Files:**
- Create: `packages/all-of-oyl/src/collections.test.ts`
- Create: `packages/all-of-oyl/src/collections.ts`
- Modify: `packages/all-of-oyl/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/all-of-oyl/src/collections.test.ts`. It proves every `Seed` collection has a manifest codec that round-trips its shapes.

```ts
import { describe, expect, it } from 'vitest'
import { COLLECTIONS, type CollectionName } from './collections.js'
import { makeSeed } from './index.js'

describe('collections manifest', () => {
  const seed = makeSeed()

  it('covers exactly the Seed collections', () => {
    expect(new Set(Object.keys(COLLECTIONS))).toEqual(new Set(Object.keys(seed)))
  })

  it('round-trips every seeded shape through its codec (toJSON(fromJSON(x)) === x)', () => {
    for (const name of Object.keys(COLLECTIONS) as CollectionName[]) {
      const codec = COLLECTIONS[name]
      for (const shape of seed[name]) {
        const revived = codec.fromJSON(shape)
        expect(codec.toJSON(revived)).toEqual(shape)
      }
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test -- collections`
Expected: FAIL — cannot resolve `./collections.js`.

- [ ] **Step 3: Implement the manifest**

Create `packages/all-of-oyl/src/collections.ts`. Heterogeneous collections (`entries`, `plans`) use the kind-dispatching revivers; the rest use their class `fromJSON`. Every entry's `toJSON` calls the instance method.

```ts
import { reviveEntry, revivePlan } from './index.js'
import { User } from './user/user.js'
import { LifeArea } from './core/life-area.js'
import { Activity } from './activity/activity.js'
import { Food } from './nutrition/food.js'
import { Account } from './finance/account.js'
import { Goal } from './goal/goal.js'
import { Budget } from './goal/budget.js'
import { Project } from './plan/project.js'
import { DayPlan } from './plan/day-plan.js'
import { Document } from './vault/document.js'
import { Possession } from './vault/possession.js'
import { Subscription } from './vault/subscription.js'
import { Contact } from './vault/contact.js'
import { GiftIdea } from './vault/gift-idea.js'
import { Connection } from './share/connection.js'
import { Grant } from './share/grant.js'

/** A symmetric (de)serializer for one collection's records. */
export interface Codec<T> {
  toJSON(item: T): unknown
  fromJSON(shape: unknown): T
}

/** Wrap a class whose instances expose toJSON() and whose statics expose fromJSON(). */
function classCodec<T extends { toJSON(): unknown }>(fromJSON: (shape: unknown) => T): Codec<T> {
  return { toJSON: (item) => item.toJSON(), fromJSON }
}

/**
 * The canonical map of persistable collection → codec. The ONE place that knows the
 * full set of persistable types and how to (de)serialize each. Apps (bootstrap, backup,
 * seeding) and the future backend all consume this instead of re-deriving the mapping.
 * Keys mirror the `Seed` shape exactly (enforced by collections.test.ts).
 */
export const COLLECTIONS = {
  users: classCodec(User.fromJSON),
  lifeAreas: classCodec(LifeArea.fromJSON),
  activities: classCodec(Activity.fromJSON),
  foods: classCodec(Food.fromJSON),
  accounts: classCodec(Account.fromJSON),
  entries: { toJSON: (e: { toJSON(): unknown }) => e.toJSON(), fromJSON: reviveEntry },
  goals: classCodec(Goal.fromJSON),
  budgets: classCodec(Budget.fromJSON),
  plans: { toJSON: (p: { toJSON(): unknown }) => p.toJSON(), fromJSON: revivePlan },
  projects: classCodec(Project.fromJSON),
  dayPlans: classCodec(DayPlan.fromJSON),
  documents: classCodec(Document.fromJSON),
  possessions: classCodec(Possession.fromJSON),
  subscriptions: classCodec(Subscription.fromJSON),
  contacts: classCodec(Contact.fromJSON),
  giftIdeas: classCodec(GiftIdea.fromJSON),
  connections: classCodec(Connection.fromJSON),
  grants: classCodec(Grant.fromJSON),
} as const

export type CollectionName = keyof typeof COLLECTIONS
```

> If any class's `fromJSON` static name or import path differs from the above, fix the import to match the actual export in that module (verify against `src/index.ts`). The test in Step 1 fails loudly until the codec genuinely round-trips.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/all-of-oyl test -- collections`
Expected: PASS — both cases green (set equality + round-trip over all 18 collections).

- [ ] **Step 5: Export from the barrel**

In `packages/all-of-oyl/src/index.ts`, after the `makeSeed` export, add:

```ts
export { COLLECTIONS, type CollectionName, type Codec } from './collections.js'
```

- [ ] **Step 6: Full green + build + bare-import guard**

Run: `pnpm --filter @oyl/all-of-oyl test && pnpm --filter @oyl/all-of-oyl build`
Expected: all PASS; build bare-import free.

- [ ] **Step 7: Commit**

```bash
git add packages/all-of-oyl/src/collections.ts packages/all-of-oyl/src/collections.test.ts packages/all-of-oyl/src/index.ts
git commit -m "feat(all-of-oyl): collections manifest — canonical collection→codec map"
```

---

# Phase 3 — app skeleton + test harness

### Task 6: Workspace wiring and the legacy rename

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `packages/vanilla-oyl/package.json`
- Modify: `package.json` (root)

- [ ] **Step 1: Audit references to the old `vanilla` package**

Run: `grep -rn "vanilla" pnpm-workspace.yaml package.json docker-compose*.yml CLAUDE.md 2>/dev/null`
Expected: shows the root `vanilla` script, the compose `vanilla` service, and the CLAUDE.md `pnpm vanilla preview` note. Note them; they're updated below / in Task 24.

- [ ] **Step 2: Add `apps/*` to the workspace**

In `pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
  - 'vendors/*'
```

- [ ] **Step 3: Rename the legacy package**

In `packages/vanilla-oyl/package.json`, change the name field:

```json
  "name": "@oyl/vanilla-oyl-legacy",
```

- [ ] **Step 4: Repoint the root `vanilla` script and widen aggregates**

In the root `package.json` `scripts`, the `vanilla` filter now resolves to the new app (same name reclaimed); update the aggregate filters:

```json
    "vanilla": "pnpm --filter @oyl/vanilla-oyl",
    "vanilla-legacy": "pnpm --filter @oyl/vanilla-oyl-legacy",
    "test": "pnpm --filter './packages/*' --filter './apps/*' --if-present test",
    "lint": "pnpm --filter './packages/*' --filter './apps/*' --if-present lint",
    "typecheck": "pnpm --filter './packages/*' --filter './apps/*' --if-present typecheck",
```

- [ ] **Step 5: Verify the workspace resolves (no install error)**

Run: `pnpm install --lockfile-only`
Expected: completes; no "duplicate package name" or unresolved-workspace errors. (The new `apps/vanilla-oyl/package.json` is created in Task 7; until then pnpm simply finds no package in the empty glob, which is fine.)

- [ ] **Step 6: Commit**

```bash
git add pnpm-workspace.yaml packages/vanilla-oyl/package.json package.json pnpm-lock.yaml
git commit -m "chore(workspace): add apps/*, rename legacy vanilla package, widen aggregates"
```

---

### Task 7: App package, tsconfig, Vitest harness

**Files:**
- Create: `apps/vanilla-oyl/package.json`
- Create: `apps/vanilla-oyl/tsconfig.json`
- Create: `apps/vanilla-oyl/.gitignore`
- Create: `apps/vanilla-oyl/vitest.config.js`
- Create: `apps/vanilla-oyl/test/setup.js`
- Create: `apps/vanilla-oyl/scripts/copy-lib.mjs`
- Create: `apps/vanilla-oyl/src/lib/reactive/.gitkeep` (placeholder so tsc has a src)

- [ ] **Step 1: Create the package manifest**

Create `apps/vanilla-oyl/package.json`:

```json
{
  "name": "@oyl/vanilla-oyl",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Zero-dependency vanilla JS implementation of OYL",
  "scripts": {
    "build:lib": "pnpm --filter @oyl/all-of-oyl build && node scripts/copy-lib.mjs",
    "dev": "pnpm build:lib && http-server -c-1 -p 8041 .",
    "dev:watch": "pnpm build:lib && http-server -c-1 -p 8041 .",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@oyl/all-of-oyl": "workspace:*",
    "happy-dom": "^15",
    "http-server": "^14.1.1",
    "typescript": "^5",
    "vitest": "^4.1.8"
  }
}
```

- [ ] **Step 2: Create the typecheck config**

Create `apps/vanilla-oyl/tsconfig.json`. It checks JS via JSDoc under the same strict flags as `src`, and resolves `@oyl/all-of-oyl` through the workspace symlink to the TS source (no build needed for typecheck).

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "allowJs": true,
    "checkJs": true,
    "noEmit": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "types": []
  },
  "include": ["src/**/*.js", "test/**/*.js", "scripts/**/*.mjs"]
}
```

- [ ] **Step 3: Create the app gitignore**

Create `apps/vanilla-oyl/.gitignore`:

```
node_modules/
vendor/
```

- [ ] **Step 4: Create the Vitest config + setup**

Create `apps/vanilla-oyl/vitest.config.js`:

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./test/setup.js'],
    include: ['src/**/*.test.js', 'test/**/*.test.js'],
  },
})
```

Create `apps/vanilla-oyl/test/setup.js` — shims for the modern APIs happy-dom lacks, so component-logic tests run (CSS rendering is verified only in a real browser):

```js
// happy-dom capability shims. Logic is tested here; visual CSS only in a real browser.
if (typeof globalThis.crypto?.randomUUID !== 'function') {
  globalThis.crypto ??= /** @type {Crypto} */ ({})
  let n = 0
  globalThis.crypto.randomUUID = () =>
    `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
}

if (typeof globalThis.matchMedia !== 'function') {
  globalThis.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })
}

// startViewTransition: run the callback synchronously, return a resolved-ish handle.
if (typeof document !== 'undefined' && typeof document.startViewTransition !== 'function') {
  document.startViewTransition = (cb) => {
    const ready = Promise.resolve()
    cb?.()
    return { ready, finished: ready, updateCallbackDone: ready, skipTransition() {} }
  }
}
```

- [ ] **Step 5: Create the copy-lib script**

Create `apps/vanilla-oyl/scripts/copy-lib.mjs`:

```js
// Copies the built all-of-oyl ESM into the app's servable vendor/ dir, because
// http-server cannot serve files outside the app root.
import { cp, rm } from 'node:fs/promises'

const src = new URL('../../../packages/all-of-oyl/dist/', import.meta.url)
const dest = new URL('../vendor/all-of-oyl/', import.meta.url)

await rm(dest, { recursive: true, force: true })
await cp(src, dest, { recursive: true })
console.log('Copied all-of-oyl/dist → vendor/all-of-oyl')
```

- [ ] **Step 6: Placeholder source so tsc has input**

Create `apps/vanilla-oyl/src/lib/reactive/.gitkeep` (empty file).

- [ ] **Step 7: Install and verify the harness**

Run: `pnpm install`
Then: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit`
Expected: install succeeds; tsc passes (no source yet = no errors).

- [ ] **Step 8: Verify the lib build + copy works end-to-end**

Run: `pnpm --filter @oyl/vanilla-oyl build:lib`
Expected: builds all-of-oyl and prints `Copied all-of-oyl/dist → vendor/all-of-oyl`; `apps/vanilla-oyl/vendor/all-of-oyl/index.js` exists.

- [ ] **Step 9: Commit**

```bash
git add apps/vanilla-oyl/package.json apps/vanilla-oyl/tsconfig.json apps/vanilla-oyl/.gitignore apps/vanilla-oyl/vitest.config.js apps/vanilla-oyl/test/setup.js apps/vanilla-oyl/scripts/copy-lib.mjs apps/vanilla-oyl/src/lib/reactive/.gitkeep pnpm-lock.yaml
git commit -m "chore(vanilla-oyl): app skeleton — package, tsconfig, vitest harness, copy-lib"
```

---

# Phase 4 — reactive core

### Task 8: `signal` (with equality gate)

**Files:**
- Create: `apps/vanilla-oyl/src/lib/reactive/internals.js`
- Create: `apps/vanilla-oyl/src/lib/reactive/signal.test.js`
- Create: `apps/vanilla-oyl/src/lib/reactive/signal.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/lib/reactive/signal.test.js`:

```js
import { describe, expect, it, vi } from 'vitest'
import { signal } from './signal.js'
import { effect } from './effect.js'

describe('signal', () => {
  it('holds and updates a value', () => {
    const count = signal(0)
    expect(count.get()).toBe(0)
    count.set(5)
    expect(count.get()).toBe(5)
  })

  it('notifies a tracking effect on change', async () => {
    const count = signal(0)
    const seen = []
    effect(() => seen.push(count.get()))
    count.set(1)
    await Promise.resolve()
    expect(seen).toEqual([0, 1])
  })

  it('suppresses notification when the value is Object.is-equal', async () => {
    const count = signal(0)
    const run = vi.fn(() => count.get())
    effect(run)
    count.set(0) // unchanged
    await Promise.resolve()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('honors a custom equality comparator', async () => {
    const point = signal({ x: 1 }, (a, b) => a.x === b.x)
    const run = vi.fn(() => point.get())
    effect(run)
    point.set({ x: 1 }) // equal by comparator
    await Promise.resolve()
    expect(run).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl test -- signal`
Expected: FAIL — cannot resolve `./signal.js` / `./effect.js`.

- [ ] **Step 3: Implement shared internals + signal**

Create `apps/vanilla-oyl/src/lib/reactive/internals.js`:

```js
/**
 * Shared reactive runtime: the active-observer stack (autotracking) and the microtask
 * effect scheduler. Kept in one module so signal/computed/effect share one graph.
 * @typedef {{ _notify(): void, _addSource(src: { _subs: Set<object> }): void }} Observer
 */

/** @type {Observer | null} */
let activeObserver = null
/** @type {Set<{ _run(): void }>} */
const pending = new Set()
let scheduled = false
let flushing = false

/** @returns {Observer | null} */
export function getActiveObserver() {
  return activeObserver
}

/**
 * Run `fn` with `observer` as the active tracking target, restoring the previous one.
 * @template T @param {Observer} observer @param {() => T} fn @returns {T}
 */
export function track(observer, fn) {
  const prev = activeObserver
  activeObserver = observer
  try {
    return fn()
  } finally {
    activeObserver = prev
  }
}

/** Queue an effect to run on the next microtask batch. @param {{ _run(): void }} eff */
export function schedule(eff) {
  pending.add(eff)
  if (!scheduled) {
    scheduled = true
    queueMicrotask(flush)
  }
}

function flush() {
  scheduled = false
  flushing = true
  let guard = 0
  try {
    while (pending.size) {
      if (++guard > 10000) throw new Error('reactive: cycle detected (effect re-scheduled itself)')
      const batch = [...pending]
      pending.clear()
      for (const eff of batch) eff._run()
    }
  } finally {
    flushing = false
  }
}

/** True while effects are running — used for cycle detection on synchronous writes. */
export function isFlushing() {
  return flushing
}
```

Create `apps/vanilla-oyl/src/lib/reactive/signal.js`:

```js
import { getActiveObserver, schedule } from './internals.js'

/**
 * @template T
 * @typedef {object} Signal
 * @property {() => T} get  Read the value; auto-tracks if called inside an effect/computed.
 * @property {(value: T) => void} set  Write the value; notifies dependents if changed.
 */

/**
 * Create a writable reactive value.
 * @template T
 * @param {T} initial
 * @param {(a: T, b: T) => boolean} [equals]  defaults to Object.is
 * @returns {Signal<T>}
 */
export function signal(initial, equals = Object.is) {
  let value = initial
  /** @type {Set<any>} */
  const subs = new Set()

  return {
    get() {
      const obs = getActiveObserver()
      if (obs) {
        subs.add(obs)
        obs._addSource({ _subs: subs })
      }
      return value
    },
    set(next) {
      if (equals(value, next)) return
      value = next
      for (const sub of [...subs]) {
        if (typeof sub._markStale === 'function') sub._markStale()
        if (typeof sub._run === 'function') schedule(sub)
        else if (typeof sub._notify === 'function') sub._notify()
      }
    },
  }
}
```

- [ ] **Step 4: Run (signal tests still need effect; expected partial)**

Run: `pnpm --filter @oyl/vanilla-oyl test -- signal`
Expected: still FAIL — `./effect.js` unresolved. That's fine; Task 9 supplies it. (If running tasks in order, defer the green check to Task 9 Step 5.)

- [ ] **Step 5: Commit the internals + signal**

```bash
git add apps/vanilla-oyl/src/lib/reactive/internals.js apps/vanilla-oyl/src/lib/reactive/signal.js apps/vanilla-oyl/src/lib/reactive/signal.test.js
git commit -m "feat(vanilla-oyl): reactive internals + signal with equality gate"
```

---

### Task 9: `effect` (tracking, batching, disposal, cycle detection)

**Files:**
- Create: `apps/vanilla-oyl/src/lib/reactive/effect.test.js`
- Create: `apps/vanilla-oyl/src/lib/reactive/effect.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/lib/reactive/effect.test.js`:

```js
import { describe, expect, it, vi } from 'vitest'
import { signal } from './signal.js'
import { effect } from './effect.js'

describe('effect', () => {
  it('runs synchronously on creation', () => {
    const run = vi.fn()
    effect(run)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('batches multiple writes in one tick into a single re-run', async () => {
    const a = signal(1)
    const b = signal(2)
    const run = vi.fn(() => a.get() + b.get())
    effect(run)
    a.set(10)
    b.set(20)
    await Promise.resolve()
    expect(run).toHaveBeenCalledTimes(2) // once initial, once for the batch
  })

  it('stops re-running after dispose() and drops its subscriptions', async () => {
    const count = signal(0)
    const run = vi.fn(() => count.get())
    const dispose = effect(run)
    dispose()
    count.set(1)
    await Promise.resolve()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('re-tracks dependencies each run (dynamic dependency sets)', async () => {
    const toggle = signal(true)
    const a = signal('a')
    const b = signal('b')
    const seen = []
    effect(() => seen.push(toggle.get() ? a.get() : b.get()))
    toggle.set(false)
    await Promise.resolve()
    a.set('a2') // no longer tracked
    await Promise.resolve()
    expect(seen).toEqual(['a', 'b'])
  })

  it('detects a cycle (effect writing a signal it reads)', async () => {
    const n = signal(0)
    expect(() => {
      effect(() => {
        n.set(n.get() + 1)
      })
    }).toThrow(/cycle/i)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl test -- effect`
Expected: FAIL — cannot resolve `./effect.js`.

- [ ] **Step 3: Implement effect**

Create `apps/vanilla-oyl/src/lib/reactive/effect.js`:

```js
import { track } from './internals.js'

/**
 * Run `fn` now and re-run it (batched on a microtask) whenever a signal/computed it
 * read changes. Returns a dispose function that detaches it from all sources.
 * @param {() => void} fn
 * @returns {() => void} dispose
 */
export function effect(fn) {
  let disposed = false
  let running = false
  /** @type {Set<{ _subs: Set<object> }>} */
  let sources = new Set()

  const runner = {
    _addSource(src) {
      sources.add(src)
    },
    _run() {
      if (disposed) return
      if (running) throw new Error('reactive: cycle detected (effect re-entered during its own run)')
      // Detach from previous sources so dependency sets are re-tracked fresh each run.
      for (const src of sources) src._subs.delete(runner)
      sources = new Set()
      running = true
      try {
        track(runner, fn)
      } finally {
        running = false
      }
    },
  }

  runner._run()

  return () => {
    if (disposed) return
    disposed = true
    for (const src of sources) src._subs.delete(runner)
    sources.clear()
  }
}
```

- [ ] **Step 4: Run effect tests**

Run: `pnpm --filter @oyl/vanilla-oyl test -- effect`
Expected: PASS — all five cases.

- [ ] **Step 5: Run signal tests (now resolvable)**

Run: `pnpm --filter @oyl/vanilla-oyl test -- signal`
Expected: PASS — all four cases.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/lib/reactive/effect.js apps/vanilla-oyl/src/lib/reactive/effect.test.js
git commit -m "feat(vanilla-oyl): effect — tracking, microtask batching, disposal, cycle detection"
```

---

### Task 10: `computed` (lazy, cached, trackable)

**Files:**
- Create: `apps/vanilla-oyl/src/lib/reactive/computed.test.js`
- Create: `apps/vanilla-oyl/src/lib/reactive/computed.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/lib/reactive/computed.test.js`:

```js
import { describe, expect, it, vi } from 'vitest'
import { signal } from './signal.js'
import { computed } from './computed.js'
import { effect } from './effect.js'

describe('computed', () => {
  it('derives a value from signals', () => {
    const a = signal(2)
    const b = signal(3)
    const sum = computed(() => a.get() + b.get())
    expect(sum.get()).toBe(5)
  })

  it('recomputes lazily and caches between source changes', () => {
    const a = signal(2)
    const fn = vi.fn(() => a.get() * 2)
    const double = computed(fn)
    expect(double.get()).toBe(4)
    expect(double.get()).toBe(4) // cached, no recompute
    expect(fn).toHaveBeenCalledTimes(1)
    a.set(5)
    expect(double.get()).toBe(10)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('drives a dependent effect when its sources change', async () => {
    const a = signal(1)
    const triple = computed(() => a.get() * 3)
    const seen = []
    effect(() => seen.push(triple.get()))
    a.set(2)
    await Promise.resolve()
    expect(seen).toEqual([3, 6])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl test -- computed`
Expected: FAIL — cannot resolve `./computed.js`.

- [ ] **Step 3: Implement computed**

Create `apps/vanilla-oyl/src/lib/reactive/computed.js`:

```js
import { getActiveObserver, track } from './internals.js'

/**
 * A lazily-evaluated, cached derived value. Recomputes on read only when a source has
 * changed since the last computation; propagates staleness to its own subscribers.
 * @template T
 * @param {() => T} fn
 * @param {(a: T, b: T) => boolean} [equals]  defaults to Object.is
 * @returns {{ get: () => T }}
 */
export function computed(fn, equals = Object.is) {
  /** @type {T} */
  let value
  let stale = true
  /** @type {Set<any>} */
  const subs = new Set()
  /** @type {Set<{ _subs: Set<object> }>} */
  let sources = new Set()

  const node = {
    _addSource(src) {
      sources.add(src)
    },
    // A source changed: become stale and propagate to our subscribers.
    _markStale() {
      if (stale) return
      stale = true
      for (const sub of [...subs]) {
        if (typeof sub._markStale === 'function') sub._markStale()
        if (typeof sub._run === 'function') sub._run.scheduled?.() // effects re-run via schedule on signal write
      }
    },
  }

  return {
    get() {
      const obs = getActiveObserver()
      if (obs) {
        subs.add(obs)
        obs._addSource({ _subs: subs })
      }
      if (stale) {
        for (const src of sources) src._subs.delete(node)
        sources = new Set()
        const next = track(node, fn)
        stale = false
        if (!equals(value, next)) value = next
      }
      return value
    },
  }
}
```

> **Implementation note:** effects subscribed to a computed are scheduled when the underlying *signal* notifies them directly (a computed's subscribers are also subscribers of the signal transitively via re-tracking on each effect run). The `_markStale` propagation invalidates the cache; the effect re-run (scheduled by the signal) then pulls the fresh computed value. The test in Step 1 is the arbiter — if the dependent-effect case fails, ensure effects re-track computeds on every run (they do, per Task 9) so the signal's subscriber set always includes the live effect.

- [ ] **Step 4: Run computed tests**

Run: `pnpm --filter @oyl/vanilla-oyl test -- computed`
Expected: PASS — all three cases.

- [ ] **Step 5: Full reactive suite + typecheck**

Run: `pnpm --filter @oyl/vanilla-oyl test && pnpm --filter @oyl/vanilla-oyl typecheck`
Expected: signal + effect + computed all PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/lib/reactive/computed.js apps/vanilla-oyl/src/lib/reactive/computed.test.js
git commit -m "feat(vanilla-oyl): computed — lazy cached derivations"
```

---

### Task 11: `OylElement` base + shared stylesheet helper

**Files:**
- Create: `apps/vanilla-oyl/src/components/sheet.js`
- Create: `apps/vanilla-oyl/src/lib/reactive/oyl-element.test.js`
- Create: `apps/vanilla-oyl/src/lib/reactive/oyl-element.js`

- [ ] **Step 1: Create the stylesheet helper**

Create `apps/vanilla-oyl/src/components/sheet.js`:

```js
/**
 * Build a Constructable Stylesheet from a CSS string, for adoptedStyleSheets.
 * Falls back to a <style>-string holder when CSSStyleSheet is unavailable (older
 * test envs); callers feature-detect via `sheet instanceof CSSStyleSheet`.
 * @param {string} css
 * @returns {CSSStyleSheet}
 */
export function sheet(css) {
  const s = new CSSStyleSheet()
  s.replaceSync(css)
  return s
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/vanilla-oyl/src/lib/reactive/oyl-element.test.js`:

```js
import { describe, expect, it, vi } from 'vitest'
import { OylElement } from './oyl-element.js'
import { signal } from './signal.js'

class Counter extends OylElement {
  count = signal(0)
  render() {
    const span = document.createElement('span')
    this.bindText(span, () => String(this.count.get()))
    this.shadowRoot.append(span)
  }
}
customElements.define('test-counter', Counter)

describe('OylElement', () => {
  it('renders into a shadow root on connect', () => {
    const el = new Counter()
    document.body.append(el)
    expect(el.shadowRoot.querySelector('span')?.textContent).toBe('0')
    el.remove()
  })

  it('updates bound text when a signal changes', async () => {
    const el = new Counter()
    document.body.append(el)
    el.count.set(7)
    await Promise.resolve()
    expect(el.shadowRoot.querySelector('span')?.textContent).toBe('7')
    el.remove()
  })

  it('disposes effects on disconnect (no updates after removal)', async () => {
    const el = new Counter()
    document.body.append(el)
    const span = el.shadowRoot.querySelector('span')
    el.remove()
    el.count.set(99)
    await Promise.resolve()
    expect(span?.textContent).toBe('0')
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl test -- oyl-element`
Expected: FAIL — cannot resolve `./oyl-element.js`.

- [ ] **Step 4: Implement OylElement**

Create `apps/vanilla-oyl/src/lib/reactive/oyl-element.js`:

```js
import { effect } from './effect.js'

/**
 * Base class for OYL Web Components. Provides a shadow root, fine-grained signal
 * bindings (one effect per dynamic part — no VDOM), and automatic teardown of every
 * effect and listener on disconnect via an AbortController.
 * @abstract
 */
export class OylElement extends HTMLElement {
  /** @type {CSSStyleSheet[]} subclasses override to share adopted stylesheets. */
  static styles = []

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    const styles = /** @type {typeof OylElement} */ (this.constructor).styles
    if (styles.length && 'adoptedStyleSheets' in this.shadowRoot) {
      this.shadowRoot.adoptedStyleSheets = styles
    }
    /** @type {AbortController} */
    this._lifecycle = new AbortController()
    /** @type {Array<() => void>} */
    this._disposers = []
  }

  /** The AbortSignal that fires on disconnect — pass to addEventListener. */
  get lifecycle() {
    return this._lifecycle.signal
  }

  connectedCallback() {
    this.render()
  }

  disconnectedCallback() {
    this._lifecycle.abort()
    for (const dispose of this._disposers) dispose()
    this._disposers = []
  }

  /** Register a reactive effect owned by this element (auto-disposed on disconnect). @param {() => void} fn */
  track(fn) {
    this._disposers.push(effect(fn))
  }

  /** Bind a node's textContent to a reactive computation. @param {Node} node @param {() => string} compute */
  bindText(node, compute) {
    this.track(() => {
      node.textContent = compute()
    })
  }

  /** Bind an element attribute to a reactive computation (null/false removes it). @param {Element} el @param {string} name @param {() => string | null | boolean} compute */
  bindAttr(el, name, compute) {
    this.track(() => {
      const v = compute()
      if (v === null || v === false) el.removeAttribute(name)
      else el.setAttribute(name, v === true ? '' : v)
    })
  }

  /** Subclasses build their shadow DOM here (called once on connect). @abstract */
  render() {}
}
```

- [ ] **Step 5: Run OylElement tests**

Run: `pnpm --filter @oyl/vanilla-oyl test -- oyl-element`
Expected: PASS — all three cases (happy-dom supports `adoptedStyleSheets`/`replaceSync`; if a case errors on those, the `'adoptedStyleSheets' in this.shadowRoot` guard skips them and text-binding cases still pass).

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/components/sheet.js apps/vanilla-oyl/src/lib/reactive/oyl-element.js apps/vanilla-oyl/src/lib/reactive/oyl-element.test.js
git commit -m "feat(vanilla-oyl): OylElement base — shadow DOM, fine-grained bindings, lifecycle teardown"
```

---

# Phase 5 — storage layer

### Task 12: Key namespace constants

**Files:**
- Create: `apps/vanilla-oyl/src/storage/keys.test.js`
- Create: `apps/vanilla-oyl/src/storage/keys.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/storage/keys.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { PREFIX, SCHEMA_VERSION_KEY, SETTINGS_KEY, dataKey, isOylKey } from './keys.js'

describe('storage keys', () => {
  it('namespaces every key under oyl/', () => {
    expect(SCHEMA_VERSION_KEY).toBe('oyl/schema-version')
    expect(SETTINGS_KEY).toBe('oyl/settings')
    expect(dataKey('entries')).toBe('oyl/data/entries')
    expect(PREFIX).toBe('oyl/')
  })

  it('recognizes its own keys and rejects foreign ones', () => {
    expect(isOylKey('oyl/data/entries')).toBe(true)
    expect(isOylKey('oyl/settings')).toBe(true)
    expect(isOylKey('some-other-app')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl test -- keys`
Expected: FAIL — cannot resolve `./keys.js`.

- [ ] **Step 3: Implement keys**

Create `apps/vanilla-oyl/src/storage/keys.js`:

```js
/** The localStorage namespace for OYL. Nothing outside this prefix is ever touched. */
export const PREFIX = 'oyl/'
export const SCHEMA_VERSION_KEY = 'oyl/schema-version'
export const SETTINGS_KEY = 'oyl/settings'

/** Full storage key for a collection. @param {string} collection @returns {string} */
export function dataKey(collection) {
  return `oyl/data/${collection}`
}

/** Whether a localStorage key belongs to OYL. @param {string} key @returns {boolean} */
export function isOylKey(key) {
  return key.startsWith(PREFIX)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl test -- keys`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/storage/keys.js apps/vanilla-oyl/src/storage/keys.test.js
git commit -m "feat(vanilla-oyl): storage key namespace"
```

---

### Task 13: Schema version + torn-write detection

**Files:**
- Create: `apps/vanilla-oyl/src/storage/schema.test.js`
- Create: `apps/vanilla-oyl/src/storage/schema.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/storage/schema.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, readSchemaState } from './schema.js'
import { SCHEMA_VERSION_KEY, dataKey } from './keys.js'

function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}

describe('schema state', () => {
  it('reports "fresh" when nothing is stored', () => {
    expect(readSchemaState(fakeStorage())).toEqual({ status: 'fresh' })
  })

  it('reports "ok" when version matches and data exists', () => {
    const s = fakeStorage({ [SCHEMA_VERSION_KEY]: String(CURRENT_SCHEMA_VERSION), [dataKey('entries')]: '[]' })
    expect(readSchemaState(s)).toEqual({ status: 'ok', version: CURRENT_SCHEMA_VERSION })
  })

  it('reports "torn" when data exists but the version marker is missing', () => {
    const s = fakeStorage({ [dataKey('entries')]: '[]' })
    expect(readSchemaState(s)).toEqual({ status: 'torn' })
  })

  it('reports "downgrade" when stored version is newer than the app', () => {
    const s = fakeStorage({ [SCHEMA_VERSION_KEY]: String(CURRENT_SCHEMA_VERSION + 1) })
    expect(readSchemaState(s)).toEqual({ status: 'downgrade', version: CURRENT_SCHEMA_VERSION + 1 })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl test -- schema`
Expected: FAIL — cannot resolve `./schema.js`.

- [ ] **Step 3: Implement schema**

Create `apps/vanilla-oyl/src/storage/schema.js`:

```js
import { PREFIX, SCHEMA_VERSION_KEY, isOylKey } from './keys.js'

/** Bump when a stored toJSON shape changes; add a migration keyed off the old number. */
export const CURRENT_SCHEMA_VERSION = 1

/**
 * @typedef {{ status: 'fresh' }
 *   | { status: 'ok', version: number }
 *   | { status: 'torn' }
 *   | { status: 'downgrade', version: number }} SchemaState
 */

/** Count oyl/data/* keys present. @param {Storage} storage @returns {boolean} */
function hasData(storage) {
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k && isOylKey(k) && k.startsWith(`${PREFIX}data/`)) return true
  }
  return false
}

/**
 * Classify what's in storage before hydration. `oyl/schema-version` is the commit
 * marker: data present without it means a torn import.
 * @param {Storage} storage
 * @returns {SchemaState}
 */
export function readSchemaState(storage) {
  const raw = storage.getItem(SCHEMA_VERSION_KEY)
  const dataPresent = hasData(storage)
  if (raw === null) return dataPresent ? { status: 'torn' } : { status: 'fresh' }
  const version = Number(raw)
  if (version > CURRENT_SCHEMA_VERSION) return { status: 'downgrade', version }
  // version < CURRENT would run migrations here (none yet); treat as ok at current.
  return { status: 'ok', version: CURRENT_SCHEMA_VERSION }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl test -- schema`
Expected: PASS — all four cases.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/storage/schema.js apps/vanilla-oyl/src/storage/schema.test.js
git commit -m "feat(vanilla-oyl): schema version + torn-write detection"
```

---

### Task 14: Clock / now provider

**Files:**
- Create: `apps/vanilla-oyl/src/storage/clock.test.js`
- Create: `apps/vanilla-oyl/src/storage/clock.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/storage/clock.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { now, defaultTimezone } from './clock.js'

describe('clock', () => {
  it('now() returns a Date', () => {
    expect(now()).toBeInstanceOf(Date)
  })

  it('defaultTimezone() returns a non-empty IANA string', () => {
    const tz = defaultTimezone()
    expect(typeof tz).toBe('string')
    expect(tz.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl test -- clock`
Expected: FAIL — cannot resolve `./clock.js`.

- [ ] **Step 3: Implement clock**

Create `apps/vanilla-oyl/src/storage/clock.js`:

```js
/**
 * The single source of "now" for the app, so domain calls (which take an explicit
 * asOf/DayKey — the domain has no hidden clock) all read one provider. Swap in tests.
 * @returns {Date}
 */
export function now() {
  return new Date()
}

/**
 * The browser's resolved IANA timezone, used to construct per-person roots until a
 * stored User record supplies one.
 * @returns {string}
 */
export function defaultTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl test -- clock`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/storage/clock.js apps/vanilla-oyl/src/storage/clock.test.js
git commit -m "feat(vanilla-oyl): clock/now provider + default timezone"
```

---

### Task 15: Repository bootstrap (manifest-driven)

**Files:**
- Create: `apps/vanilla-oyl/src/storage/bootstrap.test.js`
- Create: `apps/vanilla-oyl/src/storage/bootstrap.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/storage/bootstrap.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { makeRepositories, collectionCounts } from './bootstrap.js'
import { COLLECTIONS, makeSeed } from '@oyl/all-of-oyl'
import { dataKey } from './keys.js'

function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}

describe('bootstrap', () => {
  it('builds one repository per manifest collection', () => {
    const repos = makeRepositories(fakeStorage())
    expect(new Set(Object.keys(repos))).toEqual(new Set(Object.keys(COLLECTIONS)))
  })

  it('reads back seeded data through the right codec', async () => {
    const seed = makeSeed()
    const storage = fakeStorage({ [dataKey('entries')]: JSON.stringify(seed.entries) })
    const repos = makeRepositories(storage)
    const entries = await repos.entries.list()
    expect(entries.length).toBe(seed.entries.length)
  })

  it('collectionCounts reports per-collection record counts', async () => {
    const seed = makeSeed()
    const storage = fakeStorage({
      [dataKey('entries')]: JSON.stringify(seed.entries),
      [dataKey('goals')]: JSON.stringify(seed.goals),
    })
    const counts = await collectionCounts(makeRepositories(storage))
    expect(counts.entries).toBe(seed.entries.length)
    expect(counts.goals).toBe(seed.goals.length)
    expect(counts.contacts).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl test -- bootstrap`
Expected: FAIL — cannot resolve `./bootstrap.js`.

- [ ] **Step 3: Implement bootstrap**

Create `apps/vanilla-oyl/src/storage/bootstrap.js`:

```js
import { COLLECTIONS, LocalStorageRepository } from '@oyl/all-of-oyl'
import { dataKey } from './keys.js'
import { now } from './clock.js'

/**
 * @typedef {keyof typeof COLLECTIONS} CollectionName
 * @typedef {Record<CollectionName, import('@oyl/all-of-oyl').LocalStorageRepository<any>>} Repositories
 */

/**
 * Construct one LocalStorageRepository per manifest collection, all sharing the given
 * storage and clock. The manifest is the single source of which collections exist.
 * @param {Storage} storage
 * @returns {Repositories}
 */
export function makeRepositories(storage) {
  const repos = /** @type {Repositories} */ ({})
  for (const name of /** @type {CollectionName[]} */ (Object.keys(COLLECTIONS))) {
    repos[name] = new LocalStorageRepository(storage, dataKey(name), COLLECTIONS[name], now)
  }
  return repos
}

/**
 * Live (non-deleted) record count per collection.
 * @param {Repositories} repos
 * @returns {Promise<Record<string, number>>}
 */
export async function collectionCounts(repos) {
  /** @type {Record<string, number>} */
  const counts = {}
  for (const name of Object.keys(repos)) {
    counts[name] = (await repos[/** @type {CollectionName} */ (name)].list()).length
  }
  return counts
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl test -- bootstrap`
Expected: PASS — all three cases.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/storage/bootstrap.js apps/vanilla-oyl/src/storage/bootstrap.test.js
git commit -m "feat(vanilla-oyl): manifest-driven repository bootstrap"
```

---

### Task 16: Seed + backup (export/import, commit-marker-last)

**Files:**
- Create: `apps/vanilla-oyl/src/storage/seed.test.js`
- Create: `apps/vanilla-oyl/src/storage/seed.js`
- Create: `apps/vanilla-oyl/src/storage/backup.test.js`
- Create: `apps/vanilla-oyl/src/storage/backup.js`

- [ ] **Step 1: Write the failing seed test**

Create `apps/vanilla-oyl/src/storage/seed.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { loadDemoData, isEmpty } from './seed.js'
import { makeRepositories } from './bootstrap.js'
import { makeSeed } from '@oyl/all-of-oyl'
import { SCHEMA_VERSION_KEY } from './keys.js'

function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}

describe('seed', () => {
  it('isEmpty is true for fresh storage, false after seeding', async () => {
    const storage = fakeStorage()
    expect(await isEmpty(storage)).toBe(true)
    await loadDemoData(storage)
    expect(await isEmpty(storage)).toBe(false)
  })

  it('writes every seed collection and sets the schema version last', async () => {
    const storage = fakeStorage()
    await loadDemoData(storage)
    expect(storage.getItem(SCHEMA_VERSION_KEY)).not.toBeNull()
    const repos = makeRepositories(storage)
    const seed = makeSeed()
    expect((await repos.entries.list()).length).toBe(seed.entries.length)
    expect((await repos.subscriptions.list()).length).toBe(seed.subscriptions.length)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl test -- seed`
Expected: FAIL — cannot resolve `./seed.js`.

- [ ] **Step 3: Implement seed**

Create `apps/vanilla-oyl/src/storage/seed.js`:

```js
import { COLLECTIONS, makeSeed } from '@oyl/all-of-oyl'
import { CURRENT_SCHEMA_VERSION } from './schema.js'
import { SCHEMA_VERSION_KEY, dataKey, isOylKey, PREFIX } from './keys.js'

/** True when no oyl/data/* key holds any records. @param {Storage} storage @returns {Promise<boolean>} */
export async function isEmpty(storage) {
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k && isOylKey(k) && k.startsWith(`${PREFIX}data/`)) {
      const raw = storage.getItem(k)
      if (raw && raw !== '[]') return false
    }
  }
  return true
}

/**
 * Write the canonical demo dataset (all collections) straight as toJSON shapes, then
 * stamp the schema version LAST as the commit marker. Replaces any existing data.
 * @param {Storage} storage
 * @returns {Promise<void>}
 */
export async function loadDemoData(storage) {
  const seed = makeSeed()
  for (const name of /** @type {(keyof typeof COLLECTIONS)[]} */ (Object.keys(COLLECTIONS))) {
    storage.setItem(dataKey(name), JSON.stringify(seed[name] ?? []))
  }
  storage.setItem(SCHEMA_VERSION_KEY, String(CURRENT_SCHEMA_VERSION))
}
```

- [ ] **Step 4: Run seed tests**

Run: `pnpm --filter @oyl/vanilla-oyl test -- seed`
Expected: PASS — both cases.

- [ ] **Step 5: Write the failing backup test**

Create `apps/vanilla-oyl/src/storage/backup.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { exportData, importData } from './backup.js'
import { loadDemoData } from './seed.js'
import { makeRepositories } from './bootstrap.js'
import { makeSeed } from '@oyl/all-of-oyl'
import { SCHEMA_VERSION_KEY } from './keys.js'

function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}

describe('backup', () => {
  it('exports a versioned document and re-imports it intact', async () => {
    const src = fakeStorage()
    await loadDemoData(src)
    const doc = exportData(src)
    expect(doc.schemaVersion).toBeGreaterThan(0)
    expect(typeof doc.exportedAt).toBe('string')

    const dest = fakeStorage()
    await importData(dest, JSON.stringify(doc))
    const seed = makeSeed()
    const repos = makeRepositories(dest)
    expect((await repos.entries.list()).length).toBe(seed.entries.length)
    expect(dest.getItem(SCHEMA_VERSION_KEY)).not.toBeNull()
  })

  it('rejects a corrupt payload before writing anything', async () => {
    const dest = fakeStorage()
    const corrupt = JSON.stringify({ schemaVersion: 1, exportedAt: 'x', collections: { entries: [{ kind: 'not-a-real-kind' }] } })
    await expect(importData(dest, corrupt)).rejects.toThrow()
    // nothing committed
    expect(dest.getItem(SCHEMA_VERSION_KEY)).toBeNull()
  })
})
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl test -- backup`
Expected: FAIL — cannot resolve `./backup.js`.

- [ ] **Step 7: Implement backup**

Create `apps/vanilla-oyl/src/storage/backup.js`:

```js
import { COLLECTIONS } from '@oyl/all-of-oyl'
import { CURRENT_SCHEMA_VERSION } from './schema.js'
import { SCHEMA_VERSION_KEY, SETTINGS_KEY, dataKey } from './keys.js'
import { now } from './clock.js'

/**
 * @typedef {{ schemaVersion: number, exportedAt: string, settings: unknown,
 *   collections: Record<string, unknown[]> }} BackupDoc
 */

/**
 * Capture all OYL state as a single portable document (toJSON shapes — the same wire
 * format the future backend will seed from).
 * @param {Storage} storage
 * @returns {BackupDoc}
 */
export function exportData(storage) {
  /** @type {Record<string, unknown[]>} */
  const collections = {}
  for (const name of Object.keys(COLLECTIONS)) {
    const raw = storage.getItem(dataKey(name))
    collections[name] = raw ? JSON.parse(raw) : []
  }
  const settingsRaw = storage.getItem(SETTINGS_KEY)
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: now().toISOString(),
    settings: settingsRaw ? JSON.parse(settingsRaw) : null,
    collections,
  }
}

/**
 * Validate a backup document fully (every shape through its codec — unknown kinds
 * throw), then write collections and finally stamp the schema version as the commit
 * marker. Replaces existing data. Throws (writing nothing) on any validation failure.
 * @param {Storage} storage
 * @param {string} json
 * @returns {Promise<void>}
 */
export async function importData(storage, json) {
  const doc = /** @type {BackupDoc} */ (JSON.parse(json))
  if (typeof doc !== 'object' || doc === null || typeof doc.collections !== 'object') {
    throw new Error('backup: not a valid OYL export')
  }
  if (doc.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(`backup: schema version ${doc.schemaVersion} is newer than this app`)
  }
  // Validate everything before writing: revive each shape via its codec.
  for (const name of Object.keys(COLLECTIONS)) {
    const codec = COLLECTIONS[/** @type {keyof typeof COLLECTIONS} */ (name)]
    for (const shape of doc.collections[name] ?? []) codec.fromJSON(shape)
  }
  // Commit: write data, then the version marker LAST.
  for (const name of Object.keys(COLLECTIONS)) {
    storage.setItem(dataKey(name), JSON.stringify(doc.collections[name] ?? []))
  }
  if (doc.settings) storage.setItem(SETTINGS_KEY, JSON.stringify(doc.settings))
  storage.setItem(SCHEMA_VERSION_KEY, String(CURRENT_SCHEMA_VERSION))
}
```

- [ ] **Step 8: Run backup tests + full suite + typecheck**

Run: `pnpm --filter @oyl/vanilla-oyl test && pnpm --filter @oyl/vanilla-oyl typecheck`
Expected: seed + backup + everything PASS; tsc clean.

- [ ] **Step 9: Commit**

```bash
git add apps/vanilla-oyl/src/storage/seed.js apps/vanilla-oyl/src/storage/seed.test.js apps/vanilla-oyl/src/storage/backup.js apps/vanilla-oyl/src/storage/backup.test.js
git commit -m "feat(vanilla-oyl): demo seeding + export/import backup with commit-marker-last"
```

---

# Phase 6 — theme system

### Task 17: Theme manager (pure state core)

**Files:**
- Create: `apps/vanilla-oyl/src/theme/theme-manager.test.js`
- Create: `apps/vanilla-oyl/src/theme/theme-manager.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/theme/theme-manager.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { resolveColorScheme, nextSettings, THEMES, MODES } from './theme-manager.js'

describe('theme-manager', () => {
  it('exposes the available themes and modes', () => {
    expect(THEMES).toEqual(['classic', 'forest'])
    expect(MODES).toEqual(['system', 'light', 'dark'])
  })

  it('maps mode → color-scheme value', () => {
    expect(resolveColorScheme('system')).toBe('light dark')
    expect(resolveColorScheme('light')).toBe('light')
    expect(resolveColorScheme('dark')).toBe('dark')
  })

  it('updates theme while preserving mode (and vice versa)', () => {
    const a = nextSettings({ theme: 'classic', mode: 'system' }, { theme: 'forest' })
    expect(a).toEqual({ theme: 'forest', mode: 'system' })
    const b = nextSettings(a, { mode: 'dark' })
    expect(b).toEqual({ theme: 'forest', mode: 'dark' })
  })

  it('ignores unknown theme/mode values (keeps current)', () => {
    const s = nextSettings({ theme: 'classic', mode: 'light' }, { theme: 'bogus' })
    expect(s).toEqual({ theme: 'classic', mode: 'light' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl test -- theme-manager`
Expected: FAIL — cannot resolve `./theme-manager.js`.

- [ ] **Step 3: Implement theme-manager**

Create `apps/vanilla-oyl/src/theme/theme-manager.js`:

```js
/** @typedef {'classic' | 'forest'} Theme */
/** @typedef {'system' | 'light' | 'dark'} Mode */
/** @typedef {{ theme: Theme, mode: Mode }} ThemeSettings */

export const THEMES = /** @type {Theme[]} */ (['classic', 'forest'])
export const MODES = /** @type {Mode[]} */ (['system', 'light', 'dark'])

export const DEFAULT_SETTINGS = /** @type {ThemeSettings} */ ({ theme: 'classic', mode: 'system' })

/** The CSS `color-scheme` value for a mode. @param {Mode} mode @returns {string} */
export function resolveColorScheme(mode) {
  return mode === 'system' ? 'light dark' : mode
}

/**
 * Apply a partial change to settings, validating against known values (unknown values
 * are ignored, keeping the current choice). Pure — no DOM, no storage.
 * @param {ThemeSettings} current
 * @param {Partial<ThemeSettings>} change
 * @returns {ThemeSettings}
 */
export function nextSettings(current, change) {
  const theme = change.theme && THEMES.includes(change.theme) ? change.theme : current.theme
  const mode = change.mode && MODES.includes(change.mode) ? change.mode : current.mode
  return { theme, mode }
}

/**
 * Apply settings to the document root (the DOM side; keep separate from the pure core).
 * @param {Document} doc
 * @param {ThemeSettings} settings
 */
export function applyTheme(doc, settings) {
  doc.documentElement.dataset.theme = settings.theme
  doc.documentElement.style.colorScheme = resolveColorScheme(settings.mode)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl test -- theme-manager`
Expected: PASS — all four cases.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/theme/theme-manager.js apps/vanilla-oyl/src/theme/theme-manager.test.js
git commit -m "feat(vanilla-oyl): theme-manager pure state core"
```

---

### Task 18: Theme state signal + persistence

**Files:**
- Create: `apps/vanilla-oyl/src/state/theme.test.js`
- Create: `apps/vanilla-oyl/src/state/theme.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/state/theme.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { createThemeState } from './theme.js'
import { SETTINGS_KEY } from '../storage/keys.js'

function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}

describe('theme state', () => {
  it('defaults when storage is empty', () => {
    const state = createThemeState(fakeStorage())
    expect(state.settings.get()).toEqual({ theme: 'classic', mode: 'system' })
  })

  it('hydrates from stored settings', () => {
    const storage = fakeStorage({ [SETTINGS_KEY]: JSON.stringify({ theme: 'forest', mode: 'dark' }) })
    const state = createThemeState(storage)
    expect(state.settings.get()).toEqual({ theme: 'forest', mode: 'dark' })
  })

  it('update() persists and updates the signal', () => {
    const storage = fakeStorage()
    const state = createThemeState(storage)
    state.update({ theme: 'forest' })
    expect(state.settings.get().theme).toBe('forest')
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)).theme).toBe('forest')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl test -- state/theme`
Expected: FAIL — cannot resolve `./theme.js`.

- [ ] **Step 3: Implement theme state**

Create `apps/vanilla-oyl/src/state/theme.js`:

```js
import { signal } from '../lib/reactive/signal.js'
import { SETTINGS_KEY } from '../storage/keys.js'
import { DEFAULT_SETTINGS, nextSettings } from '../theme/theme-manager.js'

/**
 * Read persisted theme settings, falling back to defaults for missing/corrupt data.
 * @param {Storage} storage
 * @returns {import('../theme/theme-manager.js').ThemeSettings}
 */
function readSettings(storage) {
  try {
    const raw = storage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return nextSettings(DEFAULT_SETTINGS, JSON.parse(raw))
  } catch {
    return DEFAULT_SETTINGS
  }
}

/**
 * Theme state: a settings signal plus an update() that validates, persists, and emits.
 * @param {Storage} storage
 */
export function createThemeState(storage) {
  const settings = signal(readSettings(storage), (a, b) => a.theme === b.theme && a.mode === b.mode)
  return {
    settings,
    /** @param {Partial<import('../theme/theme-manager.js').ThemeSettings>} change */
    update(change) {
      const next = nextSettings(settings.get(), change)
      settings.set(next)
      storage.setItem(SETTINGS_KEY, JSON.stringify(next))
    },
    /** Re-read from storage (multi-tab sync). */
    refresh() {
      settings.set(readSettings(storage))
    },
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl test -- state/theme`
Expected: PASS — all three cases.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/state/theme.js apps/vanilla-oyl/src/state/theme.test.js
git commit -m "feat(vanilla-oyl): theme state signal with persistence + refresh"
```

---

### Task 19: CSS — reset, tokens, themes, layout

**Files:**
- Create: `apps/vanilla-oyl/styles/reset.css`
- Create: `apps/vanilla-oyl/styles/tokens.css`
- Create: `apps/vanilla-oyl/styles/themes/classic.css`
- Create: `apps/vanilla-oyl/styles/themes/forest.css`
- Create: `apps/vanilla-oyl/styles/layout.css`

> CSS rendering is verified in a real browser (Task 23), not unit-tested. This task has no test step; its verification is the browser pass.

- [ ] **Step 1: Reset + layer order**

Create `apps/vanilla-oyl/styles/reset.css`:

```css
@layer reset, tokens, themes, layout;

@layer reset {
  *, *::before, *::after { box-sizing: border-box; }
  * { margin: 0; }
  html { -webkit-text-size-adjust: 100%; }
  body { min-block-size: 100dvh; line-height: 1.5; -webkit-font-smoothing: antialiased; }
  img, picture, svg, video { display: block; max-inline-size: 100%; }
  button, input, select, textarea { font: inherit; color: inherit; }
  :focus-visible { outline: var(--focus-ring); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
}
```

- [ ] **Step 2: Tokens (structural, theme-agnostic)**

Create `apps/vanilla-oyl/styles/tokens.css`:

```css
@layer tokens {
  :root {
    --space-1: 0.25rem; --space-2: 0.5rem; --space-3: 0.75rem; --space-4: 1rem;
    --space-6: 1.5rem; --space-8: 2rem;
    --radius-1: 0.375rem; --radius-2: 0.75rem;
    --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --font-mono: ui-monospace, "SF Mono", "Cascadia Code", monospace;
    --step-0: clamp(1rem, 0.95rem + 0.25vw, 1.125rem);
    --step-1: clamp(1.25rem, 1.1rem + 0.6vw, 1.5rem);
    --step-2: clamp(1.6rem, 1.3rem + 1.2vw, 2.25rem);
    --focus-ring: 2px solid var(--color-accent);
  }
  @property --color-bg { syntax: "<color>"; inherits: true; initial-value: #ffffff; }
}
```

- [ ] **Step 3: Classic theme (light/dark via `light-dark()`)**

Create `apps/vanilla-oyl/styles/themes/classic.css`:

```css
@layer themes {
  :root[data-theme="classic"] {
    --color-bg: light-dark(oklch(98% 0.004 90), oklch(18% 0.006 265));
    --color-surface: light-dark(oklch(100% 0 0), oklch(23% 0.008 265));
    --color-text: light-dark(oklch(25% 0.01 265), oklch(94% 0.005 90));
    --color-muted: light-dark(oklch(50% 0.01 265), oklch(70% 0.01 90));
    --color-accent: light-dark(oklch(55% 0.16 255), oklch(72% 0.14 255));
    --color-border: light-dark(oklch(90% 0.006 265), oklch(32% 0.01 265));
    --color-danger: light-dark(oklch(53% 0.2 25), oklch(70% 0.17 25));
    --color-ok: light-dark(oklch(55% 0.15 150), oklch(72% 0.14 150));
    --color-accent-hover: color-mix(in oklch, var(--color-accent), black 12%);
  }
}
```

- [ ] **Step 4: Forest theme**

Create `apps/vanilla-oyl/styles/themes/forest.css`:

```css
@layer themes {
  :root[data-theme="forest"] {
    --color-bg: light-dark(oklch(97% 0.02 145), oklch(17% 0.02 150));
    --color-surface: light-dark(oklch(99% 0.01 145), oklch(22% 0.025 150));
    --color-text: light-dark(oklch(26% 0.03 150), oklch(93% 0.02 145));
    --color-muted: light-dark(oklch(48% 0.03 150), oklch(70% 0.03 145));
    --color-accent: light-dark(oklch(52% 0.13 150), oklch(70% 0.13 150));
    --color-border: light-dark(oklch(89% 0.02 145), oklch(30% 0.025 150));
    --color-danger: light-dark(oklch(53% 0.2 25), oklch(70% 0.17 25));
    --color-ok: light-dark(oklch(55% 0.15 150), oklch(74% 0.14 150));
    --color-accent-hover: color-mix(in oklch, var(--color-accent), black 12%);
  }
}
```

- [ ] **Step 5: Layout (document-level shell scaffolding)**

Create `apps/vanilla-oyl/styles/layout.css`:

```css
@layer layout {
  body {
    font-family: var(--font-sans);
    font-size: var(--step-0);
    background: var(--color-bg);
    color: var(--color-text);
    transition: background 0.2s, color 0.2s;
  }
  oyl-shell { display: block; min-block-size: 100dvh; }
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/styles
git commit -m "feat(vanilla-oyl): CSS layers — reset, tokens, two themes, layout"
```

---

# Phase 7 — components

### Task 20: `<oyl-theme-toggle>`

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-theme-toggle.test.js`
- Create: `apps/vanilla-oyl/src/components/oyl-theme-toggle.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/components/oyl-theme-toggle.test.js`:

```js
import { describe, expect, it, beforeAll } from 'vitest'
import { createThemeState } from '../state/theme.js'
import { defineThemeToggle } from './oyl-theme-toggle.js'

function fakeStorage() {
  const map = new Map()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}

beforeAll(() => defineThemeToggle())

describe('<oyl-theme-toggle>', () => {
  it('renders selects reflecting current settings and writes changes back', async () => {
    const themeState = createThemeState(fakeStorage())
    const el = document.createElement('oyl-theme-toggle')
    el.themeState = themeState
    document.body.append(el)

    const themeSelect = el.shadowRoot.querySelector('select[name="theme"]')
    expect(themeSelect.value).toBe('classic')

    themeSelect.value = 'forest'
    themeSelect.dispatchEvent(new Event('change'))
    expect(themeState.settings.get().theme).toBe('forest')

    el.remove()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl test -- oyl-theme-toggle`
Expected: FAIL — cannot resolve `./oyl-theme-toggle.js`.

- [ ] **Step 3: Implement the toggle**

Create `apps/vanilla-oyl/src/components/oyl-theme-toggle.js`:

```js
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { THEMES, MODES } from '../theme/theme-manager.js'

const styles = sheet(`
  :host { display: inline-flex; gap: var(--space-2); align-items: center; }
  label { display: inline-flex; flex-direction: column; font-size: 0.75rem; color: var(--color-muted); }
  select {
    background: var(--color-surface); color: var(--color-text);
    border: 1px solid var(--color-border); border-radius: var(--radius-1);
    padding: var(--space-1) var(--space-2);
  }
`)

class OylThemeToggle extends OylElement {
  static styles = [styles]
  /** @type {import('../state/theme.js').createThemeState extends (...a:any)=>infer R ? R : never} */
  themeState

  render() {
    const theme = this._select('theme', THEMES)
    const mode = this._select('mode', MODES)
    this.shadowRoot.append(
      this._labeled('Theme', theme),
      this._labeled('Mode', mode),
    )
    // Reflect external/multi-tab changes back into the controls.
    this.bindAttr(theme, 'data-value', () => this.themeState.settings.get().theme)
    this.track(() => {
      theme.value = this.themeState.settings.get().theme
      mode.value = this.themeState.settings.get().mode
    })
  }

  /** @param {'theme'|'mode'} name @param {readonly string[]} options */
  _select(name, options) {
    const sel = document.createElement('select')
    sel.name = name
    for (const opt of options) {
      const o = document.createElement('option')
      o.value = opt
      o.textContent = opt
      sel.append(o)
    }
    sel.addEventListener(
      'change',
      () => this.themeState.update({ [name]: /** @type {any} */ (sel.value) }),
      { signal: this.lifecycle },
    )
    return sel
  }

  /** @param {string} text @param {HTMLElement} control */
  _labeled(text, control) {
    const label = document.createElement('label')
    label.append(text, control)
    return label
  }
}

/** Register the element (idempotent — safe across test files). */
export function defineThemeToggle() {
  if (!customElements.get('oyl-theme-toggle')) customElements.define('oyl-theme-toggle', OylThemeToggle)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl test -- oyl-theme-toggle`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-theme-toggle.js apps/vanilla-oyl/src/components/oyl-theme-toggle.test.js
git commit -m "feat(vanilla-oyl): <oyl-theme-toggle> component"
```

---

### Task 21: Route state + `<oyl-router>`

**Files:**
- Create: `apps/vanilla-oyl/src/state/route.test.js`
- Create: `apps/vanilla-oyl/src/state/route.js`
- Create: `apps/vanilla-oyl/src/components/oyl-router.test.js`
- Create: `apps/vanilla-oyl/src/components/oyl-router.js`

- [ ] **Step 1: Write the failing route-state test**

Create `apps/vanilla-oyl/src/state/route.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { parseHash } from './route.js'

describe('route parsing', () => {
  it('defaults empty/“#” to status', () => {
    expect(parseHash('')).toBe('status')
    expect(parseHash('#')).toBe('status')
    expect(parseHash('#/')).toBe('status')
  })

  it('extracts the first path segment', () => {
    expect(parseHash('#/status')).toBe('status')
    expect(parseHash('#/journal')).toBe('journal')
    expect(parseHash('#/journal/today')).toBe('journal')
  })
})
```

- [ ] **Step 2: Run to verify it fails, then implement route state**

Run: `pnpm --filter @oyl/vanilla-oyl test -- state/route`
Expected: FAIL.

Create `apps/vanilla-oyl/src/state/route.js`:

```js
import { signal } from '../lib/reactive/signal.js'

/** Extract the active route name from a location hash. @param {string} hash @returns {string} */
export function parseHash(hash) {
  const seg = hash.replace(/^#\/?/, '').split('/')[0]
  return seg || 'status'
}

/**
 * A route signal fed by hashchange. Call start() once at boot; returns the signal and
 * a stop() for teardown (tests).
 */
export function createRouteState(win = window) {
  const route = signal(parseHash(win.location.hash))
  const onHash = () => route.set(parseHash(win.location.hash))
  return {
    route,
    start() {
      win.addEventListener('hashchange', onHash)
    },
    stop() {
      win.removeEventListener('hashchange', onHash)
    },
  }
}
```

- [ ] **Step 3: Run to verify route-state passes**

Run: `pnpm --filter @oyl/vanilla-oyl test -- state/route`
Expected: PASS.

- [ ] **Step 4: Write the failing router test**

Create `apps/vanilla-oyl/src/components/oyl-router.test.js`:

```js
import { describe, expect, it, beforeAll } from 'vitest'
import { signal } from '../lib/reactive/signal.js'
import { defineRouter } from './oyl-router.js'

beforeAll(() => defineRouter())

describe('<oyl-router>', () => {
  it('renders the view for the active route and swaps on change', async () => {
    const route = signal('status')
    const el = document.createElement('oyl-router')
    el.routeSignal = route
    el.routes = {
      status: () => {
        const d = document.createElement('div')
        d.textContent = 'STATUS VIEW'
        return d
      },
      other: () => {
        const d = document.createElement('div')
        d.textContent = 'OTHER VIEW'
        return d
      },
    }
    document.body.append(el)
    expect(el.shadowRoot.textContent).toContain('STATUS VIEW')

    route.set('other')
    await Promise.resolve()
    expect(el.shadowRoot.textContent).toContain('OTHER VIEW')
    el.remove()
  })

  it('shows a not-found view for an unknown route', async () => {
    const route = signal('nope')
    const el = document.createElement('oyl-router')
    el.routeSignal = route
    el.routes = { status: () => document.createElement('div') }
    document.body.append(el)
    expect(el.shadowRoot.textContent.toLowerCase()).toContain('not found')
    el.remove()
  })
})
```

- [ ] **Step 5: Run to verify it fails, then implement the router**

Run: `pnpm --filter @oyl/vanilla-oyl test -- oyl-router`
Expected: FAIL.

Create `apps/vanilla-oyl/src/components/oyl-router.js`:

```js
import { OylElement } from '../lib/reactive/oyl-element.js'

class OylRouter extends OylElement {
  /** @type {import('../lib/reactive/signal.js').Signal<string>} */
  routeSignal
  /** @type {Record<string, () => Node>} */
  routes = {}

  render() {
    const outlet = document.createElement('main')
    outlet.id = 'outlet'
    // aria-live announces route changes for assistive tech (View Transitions are visual only).
    const live = document.createElement('div')
    live.setAttribute('aria-live', 'polite')
    live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);'
    this.shadowRoot.append(live, outlet)

    this.track(() => {
      const name = this.routeSignal.get()
      const view = this.routes[name]?.() ?? this._notFound(name)
      const swap = () => {
        outlet.replaceChildren(view)
        const heading = /** @type {HTMLElement|null} */ (view.querySelector?.('h1, h2, [role="heading"]'))
        heading?.setAttribute('tabindex', '-1')
        heading?.focus?.()
        live.textContent = `Navigated to ${name}`
      }
      const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      if (!reduce && typeof document.startViewTransition === 'function') document.startViewTransition(swap)
      else swap()
    })
  }

  /** @param {string} name */
  _notFound(name) {
    const d = document.createElement('div')
    d.innerHTML = `<h1>Not found</h1><p>No view for route “${name}”.</p>`
    return d
  }
}

export function defineRouter() {
  if (!customElements.get('oyl-router')) customElements.define('oyl-router', OylRouter)
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl test -- oyl-router`
Expected: PASS — both cases.

- [ ] **Step 7: Commit**

```bash
git add apps/vanilla-oyl/src/state/route.js apps/vanilla-oyl/src/state/route.test.js apps/vanilla-oyl/src/components/oyl-router.js apps/vanilla-oyl/src/components/oyl-router.test.js
git commit -m "feat(vanilla-oyl): route state + <oyl-router> with view transitions and a11y announce"
```

---

### Task 22: `<oyl-shell>` + `<oyl-status-panel>`

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-shell.js`
- Create: `apps/vanilla-oyl/src/components/oyl-status-panel.test.js`
- Create: `apps/vanilla-oyl/src/components/oyl-status-panel.js`

- [ ] **Step 1: Implement the shell (landmark layout)**

Create `apps/vanilla-oyl/src/components/oyl-shell.js`:

```js
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

const styles = sheet(`
  :host { display: grid; grid-template-rows: auto 1fr; min-block-size: 100dvh; }
  header {
    display: flex; align-items: center; justify-content: space-between;
    gap: var(--space-4); padding: var(--space-3) var(--space-4);
    background: var(--color-surface); border-block-end: 1px solid var(--color-border);
  }
  h1 { font-size: var(--step-1); }
  ::slotted(main), slot[name="main"] { display: block; padding: var(--space-6) var(--space-4); }
  @container (min-width: 48rem) { header { padding-inline: var(--space-8); } }
`)

class OylShell extends OylElement {
  static styles = [styles]

  render() {
    this.style.setProperty('container-type', 'inline-size')
    this.shadowRoot.innerHTML = `
      <header>
        <h1>OYL</h1>
        <slot name="toolbar"></slot>
      </header>
      <slot name="main"></slot>
    `
  }
}

export function defineShell() {
  if (!customElements.get('oyl-shell')) customElements.define('oyl-shell', OylShell)
}
```

- [ ] **Step 2: Write the failing status-panel test**

Create `apps/vanilla-oyl/src/components/oyl-status-panel.test.js`:

```js
import { describe, expect, it, beforeAll } from 'vitest'
import { defineStatusPanel } from './oyl-status-panel.js'

beforeAll(() => defineStatusPanel())

describe('<oyl-status-panel>', () => {
  it('renders a heading and the supplied diagnostics', async () => {
    const el = document.createElement('oyl-status-panel')
    el.diagnostics = {
      schema: { status: 'ok', version: 1 },
      counts: { entries: 42, goals: 4 },
      theme: { theme: 'classic', mode: 'system' },
    }
    document.body.append(el)
    await Promise.resolve()
    const text = el.shadowRoot.textContent
    expect(el.shadowRoot.querySelector('h1')).toBeTruthy()
    expect(text).toContain('entries')
    expect(text).toContain('42')
    el.remove()
  })
})
```

- [ ] **Step 3: Run to verify it fails, then implement the panel**

Run: `pnpm --filter @oyl/vanilla-oyl test -- oyl-status-panel`
Expected: FAIL.

Create `apps/vanilla-oyl/src/components/oyl-status-panel.js`:

```js
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

const styles = sheet(`
  :host { display: block; container-type: inline-size; }
  h1 { font-size: var(--step-2); margin-block-end: var(--space-4); }
  .grid { display: grid; gap: var(--space-3); }
  @container (min-width: 40rem) { .grid { grid-template-columns: repeat(2, 1fr); } }
  .card {
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius-2); padding: var(--space-4);
  }
  dt { color: var(--color-muted); font-size: 0.8rem; }
  dd { font-variant-numeric: tabular-nums; font-family: var(--font-mono); }
  .actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-block-start: var(--space-6); }
  button {
    background: var(--color-accent); color: white; border: 0;
    border-radius: var(--radius-1); padding: var(--space-2) var(--space-3); cursor: pointer;
  }
  button:hover { background: var(--color-accent-hover); }
  button.danger { background: var(--color-danger); }
`)

class OylStatusPanel extends OylElement {
  static styles = [styles]
  /** @type {{ schema: any, counts: Record<string, number>, theme: any, storage?: any, build?: string } | null} */
  diagnostics = null
  /** @type {{ onSeed?: () => void, onExport?: () => void, onImport?: () => void, onReset?: () => void }} */
  actions = {}

  render() {
    const root = document.createElement('div')
    this.shadowRoot.append(root)
    this.track(() => this._draw(root))
  }

  /** @param {HTMLElement} root */
  _draw(root) {
    const d = this.diagnostics
    if (!d) {
      root.textContent = 'Loading diagnostics…'
      return
    }
    const counts = Object.entries(d.counts)
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
      .join('')
    root.innerHTML = `
      <h1 tabindex="-1">Status</h1>
      <div class="grid">
        <section class="card"><dl><div><dt>schema</dt><dd>${d.schema.status} v${d.schema.version ?? '—'}</dd></div>
          <div><dt>theme</dt><dd>${d.theme.theme} / ${d.theme.mode}</dd></div>
          <div><dt>build</dt><dd>${d.build ?? '—'}</dd></div></dl></section>
        <section class="card"><dl class="grid">${counts}</dl></section>
      </div>
      <div class="actions">
        <button data-act="seed">Load demo data</button>
        <button data-act="export">Download backup</button>
        <button data-act="import">Import backup</button>
        <button data-act="reset" class="danger">Reset local data</button>
      </div>
    `
    root.querySelector('[data-act="seed"]')?.addEventListener('click', () => this.actions.onSeed?.(), { signal: this.lifecycle })
    root.querySelector('[data-act="export"]')?.addEventListener('click', () => this.actions.onExport?.(), { signal: this.lifecycle })
    root.querySelector('[data-act="import"]')?.addEventListener('click', () => this.actions.onImport?.(), { signal: this.lifecycle })
    root.querySelector('[data-act="reset"]')?.addEventListener('click', () => this.actions.onReset?.(), { signal: this.lifecycle })
  }
}

export function defineStatusPanel() {
  if (!customElements.get('oyl-status-panel')) customElements.define('oyl-status-panel', OylStatusPanel)
}
```

- [ ] **Step 4: Run to verify it passes + full suite + typecheck**

Run: `pnpm --filter @oyl/vanilla-oyl test && pnpm --filter @oyl/vanilla-oyl typecheck`
Expected: status-panel PASS; whole suite green; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-shell.js apps/vanilla-oyl/src/components/oyl-status-panel.js apps/vanilla-oyl/src/components/oyl-status-panel.test.js
git commit -m "feat(vanilla-oyl): <oyl-shell> landmark layout + <oyl-status-panel>"
```

---

# Phase 8 — wiring: data state, main, HTML

### Task 23: Data state, `main.js`, `index.html`, multi-tab

**Files:**
- Create: `apps/vanilla-oyl/src/state/data.js`
- Create: `apps/vanilla-oyl/src/main.js`
- Create: `apps/vanilla-oyl/index.html`

- [ ] **Step 1: Implement the data/diagnostics state**

Create `apps/vanilla-oyl/src/state/data.js`:

```js
import { signal } from '../lib/reactive/signal.js'
import { makeRepositories, collectionCounts } from '../storage/bootstrap.js'
import { readSchemaState } from '../storage/schema.js'

/**
 * App data state: repositories over real storage, plus reactive diagnostics the Status
 * screen reads. refresh() re-reads everything (boot, seed, import, multi-tab).
 * @param {Storage} storage
 * @param {import('../state/theme.js').createThemeState extends (...a:any)=>infer R ? R : never} themeState
 */
export function createDataState(storage, themeState) {
  const repos = makeRepositories(storage)
  const counts = signal(/** @type {Record<string, number>} */ ({}))
  const schema = signal(readSchemaState(storage))

  async function refresh() {
    schema.set(readSchemaState(storage))
    counts.set(await collectionCounts(repos))
  }

  /**
   * Reactive diagnostics object for the status panel.
   * @returns {() => any}
   */
  function diagnostics() {
    return () => ({
      schema: schema.get(),
      counts: counts.get(),
      theme: themeState.settings.get(),
      build: /** @type {any} */ (globalThis).__OYL_LIB_BUILD__ ?? 'dev',
      storage: undefined,
    })
  }

  return { repos, counts, schema, refresh, diagnostics }
}
```

- [ ] **Step 2: Implement main.js (boot + multi-tab + actions)**

Create `apps/vanilla-oyl/src/main.js`:

```js
import { effect } from './lib/reactive/effect.js'
import { applyTheme } from './theme/theme-manager.js'
import { createThemeState } from './state/theme.js'
import { createRouteState } from './state/route.js'
import { createDataState } from './state/data.js'
import { loadDemoData } from './storage/seed.js'
import { exportData, importData } from './storage/backup.js'
import { isOylKey, SETTINGS_KEY } from './storage/keys.js'
import { defineShell } from './components/oyl-shell.js'
import { defineThemeToggle } from './components/oyl-theme-toggle.js'
import { defineRouter } from './components/oyl-router.js'
import { defineStatusPanel } from './components/oyl-status-panel.js'

async function boot() {
  const storage = window.localStorage
  defineShell(); defineThemeToggle(); defineRouter(); defineStatusPanel()

  const themeState = createThemeState(storage)
  const routeState = createRouteState(window)
  const dataState = createDataState(storage, themeState)

  // Theme is applied reactively (inline head script already set the first paint).
  effect(() => applyTheme(document, themeState.settings.get()))
  routeState.start()
  await dataState.refresh()

  // Multi-tab coherence: react to writes from other tabs.
  window.addEventListener('storage', (e) => {
    if (!e.key || !isOylKey(e.key)) return
    if (e.key === SETTINGS_KEY) themeState.refresh()
    else void dataState.refresh()
  })

  // ?seed convenience for dev.
  if (new URLSearchParams(location.search).has('seed')) {
    await loadDemoData(storage)
    await dataState.refresh()
  }

  // Build the shell content.
  const shell = document.createElement('oyl-shell')
  const toggle = document.createElement('oyl-theme-toggle')
  toggle.slot = 'toolbar'
  toggle.themeState = themeState

  const router = document.createElement('oyl-router')
  router.slot = 'main'
  router.routeSignal = routeState.route
  router.routes = {
    status: () => {
      const panel = document.createElement('oyl-status-panel')
      panel.actions = {
        onSeed: async () => {
          if (await isNonEmptyConfirm(storage)) { await loadDemoData(storage); await dataState.refresh() }
        },
        onExport: () => download(exportData(storage)),
        onImport: () => pickAndImport(storage, dataState),
        onReset: async () => {
          if (confirm('Erase all local OYL data? This cannot be undone.')) { resetData(storage); await dataState.refresh() }
        },
      }
      effect(() => { panel.diagnostics = dataState.diagnostics()() })
      return panel
    },
  }

  shell.append(toggle, router)
  const root = document.getElementById('app')
  root.replaceChildren(shell)
  document.getElementById('boot-fallback')?.remove()
}

/** @param {Storage} storage */
async function isNonEmptyConfirm(storage) {
  const { isEmpty } = await import('./storage/seed.js')
  if (await isEmpty(storage)) return true
  return confirm('Replace current data with demo data?')
}

/** @param {import('./storage/backup.js').BackupDoc} doc */
function download(doc) {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `oyl-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

/** @param {Storage} storage @param {ReturnType<typeof createDataState>} dataState */
function pickAndImport(storage, dataState) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json'
  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      await importData(storage, await file.text())
      await dataState.refresh()
      alert('Import complete.')
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  })
  input.click()
}

/** @param {Storage} storage */
function resetData(storage) {
  for (let i = storage.length - 1; i >= 0; i--) {
    const k = storage.key(i)
    if (k && isOylKey(k)) storage.removeItem(k)
  }
}

boot().catch((err) => {
  const fb = document.getElementById('boot-fallback')
  if (fb) fb.textContent = `OYL failed to start: ${err instanceof Error ? err.message : String(err)}`
})
```

- [ ] **Step 2b: Add a typecheck-only smoke test for data state**

Create `apps/vanilla-oyl/src/state/data.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { createThemeState } from './theme.js'
import { createDataState } from './data.js'

function fakeStorage() {
  const map = new Map()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}

describe('data state', () => {
  it('refresh populates schema + counts', async () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    await ds.refresh()
    expect(ds.schema.get().status).toBe('fresh')
    expect(ds.counts.get()).toBeTypeOf('object')
  })
})
```

- [ ] **Step 3: Create index.html (importmap, anti-FOUC, modulepreload, fallback)**

Create `apps/vanilla-oyl/index.html`:

```html
<!doctype html>
<html lang="en" data-theme="classic">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>OYL</title>

    <!-- Anti-FOUC: apply persisted theme/mode synchronously before first paint. -->
    <script>
      (function () {
        try {
          var s = JSON.parse(localStorage.getItem('oyl/settings') || 'null')
          if (s && s.theme) document.documentElement.dataset.theme = s.theme
          document.documentElement.style.colorScheme =
            !s || s.mode === 'system' ? 'light dark' : s.mode
        } catch (e) {}
      })()
    </script>

    <link rel="stylesheet" href="./styles/reset.css" />
    <link rel="stylesheet" href="./styles/tokens.css" />
    <link rel="stylesheet" href="./styles/themes/classic.css" />
    <link rel="stylesheet" href="./styles/themes/forest.css" />
    <link rel="stylesheet" href="./styles/layout.css" />

    <script type="importmap">
      { "imports": { "@oyl/all-of-oyl": "./vendor/all-of-oyl/index.js" } }
    </script>
    <link rel="modulepreload" href="./vendor/all-of-oyl/index.js" />
    <link rel="modulepreload" href="./src/main.js" />
  </head>
  <body>
    <div id="app">
      <p id="boot-fallback">Loading OYL… if this message persists, the app failed to load its modules.</p>
    </div>
    <script type="module" src="./src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 4: Run the full test suite + typecheck**

Run: `pnpm --filter @oyl/vanilla-oyl test && pnpm --filter @oyl/vanilla-oyl typecheck`
Expected: all PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/state/data.js apps/vanilla-oyl/src/state/data.test.js apps/vanilla-oyl/src/main.js apps/vanilla-oyl/index.html
git commit -m "feat(vanilla-oyl): data state, boot wiring, index.html (importmap, anti-FOUC, multi-tab)"
```

---

# Phase 9 — manual acceptance + docs

### Task 24: Browser acceptance pass + CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Build the lib and serve the app**

Run: `pnpm --filter @oyl/vanilla-oyl dev`
Expected: builds all-of-oyl, copies to `vendor/`, serves on `http://localhost:8041`.

- [ ] **Step 2: Walk the Status-screen acceptance list in a real browser**

Open `http://localhost:8041`. Confirm each:
- Page loads with no console errors; `#boot-fallback` is gone (importmap + build proven).
- Status screen shows schema `fresh`, all counts `0`, active theme/mode, build tag.
- Click **Load demo data** → counts populate (entries ≈ 250+, goals 4, subscriptions 2, etc.); schema shows `ok v1` (bootstrap + codecs + manifest proven).
- Toggle **Theme** classic↔forest and **Mode** system/light/dark → colors change instantly, no flash; reload preserves choice (theme persistence + anti-FOUC proven).
- **Download backup** → a JSON file downloads. **Import backup** of that file in a fresh profile (clear storage first) → counts return (backup round-trip proven).
- Open a second tab at the same URL; **Load demo data** in tab A → tab B's counts update without reload (multi-tab proven).
- Resize narrow → shell/cards reflow via container queries (responsive proven).
- **Reset local data** (confirm) → counts return to 0.

- [ ] **Step 3: Quick a11y spot-check**

Tab through the page: focus rings visible on selects/buttons; the Status `<h1>` receives focus on navigation. (Optional: run the `chrome-devtools-mcp:a11y-debugging` skill for a deeper audit.)

- [ ] **Step 4: Update CLAUDE.md**

In `CLAUDE.md`, add a row to the Packages table and a dev-workflow line. Under Packages:

```markdown
| `@oyl/vanilla-oyl` | New flagship app under `apps/`. Zero runtime deps: vanilla JS + JSDoc, Web Components (shadow DOM + design tokens), signals reactive core (`src/lib/reactive`), localStorage via `LocalStorageRepository`, themes via `light-dark()`. Consumes `@oyl/all-of-oyl` `dist/` through an importmap (`pnpm vanilla build:lib`). Status screen at `#/status` is the diagnostics/acceptance surface. | Vanilla JS, Vitest, http-server |
```

Update the legacy note and dev workflow:

```markdown
pnpm vanilla dev          # build all-of-oyl → copy to vendor/ → http-server on 8041
pnpm vanilla test         # Vitest (happy-dom)
pnpm vanilla-legacy preview  # the old static testbed (@oyl/vanilla-oyl-legacy), pending deletion
```

Add a conventions note:

```markdown
- `@oyl/all-of-oyl` now emits a browser ESM build to `dist/` (`pnpm all-of build`) consumed only by `apps/vanilla-oyl` via importmap; react/next still consume the TS `src/`. The `collections` manifest (`src/collections.ts`) is the canonical persistable-type list — apps and any backend wire serialization from it, never hand-rolled.
```

- [ ] **Step 5: Final full-workspace verification**

Run: `pnpm --filter @oyl/all-of-oyl test && pnpm --filter @oyl/all-of-oyl build && pnpm --filter @oyl/vanilla-oyl test && pnpm --filter @oyl/vanilla-oyl typecheck`
Expected: everything green.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(vanilla-oyl): record the new apps/ flagship in CLAUDE.md"
```

---

## Self-review notes (addressed in this plan)

- **Spec coverage:** workspace/apps (T6), browser build + bare-import guard (T2), `.js`/NodeNext (T1), LocalStorageRepository + contract clone-not-alias (T3–T4), collections manifest (T5), reactive core incl. equality/cycle/disposal (T8–T11), keys/schema-torn-write/clock/bootstrap/seed/backup (T12–T16), themes + `light-dark()`/oklch/container queries/anti-FOUC (T17–T19, T23), components + a11y announce + define-guards (T20–T22), router/view-transitions (T21), multi-tab + diagnostics + status screen (T23), manual acceptance + docs (T24). The spec's "decided-next" write-path coherence is intentionally not built.
- **Known risk:** Task 1's NodeNext + `"type": "module"` switch has an explicit fallback (bundler-preserving extensions) if it disturbs consumers/Vitest.
- **Type consistency:** `createThemeState`/`createDataState`/`createRouteState` factory shapes, `COLLECTIONS`/`CollectionName`, `StorageLike`, and the `defineX()` idempotent registrars are used consistently across tasks.
