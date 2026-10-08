# Extract the Client Layer into `@oyl/all-of-oyl/client` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move vanilla-oyl's DOM-light client layer (signals core, domain stores, bootstrap/outbox wiring, auth/route state, seed/backup) into `packages/all-of-oyl/src/client/` as strict TS, exported as `@oyl/all-of-oyl/client`, with zero behavior change in vanilla-oyl.

**Architecture:** Leaf-first incremental move, one commit per layer. Each task moves tests first (they fail on the missing module), then the modules (ported JSDoc→TS), extends the `client/index.ts` barrel, and re-points vanilla's imports with a codemod. Browser globals become minimal structural ports in `client/ports.ts` so the DOM-free `pnpm all-of build` gate keeps passing.

**Tech Stack:** TypeScript 5 (strict, NodeNext, `lib: ES2022`), Vitest 4 (node env in all-of-oyl, happy-dom in vanilla), pnpm workspace, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-06-extract-client-layer-design.md`

## Spec amendments (found while planning; Task 8 writes them back into the spec)

1. **`backup.js` moves whole.** The download (`URL.createObjectURL` anchor click) lives in vanilla's `main.js`, not in `storage/backup.js`, which is DOM-free. vanilla's `src/storage/` therefore ends with only `browser-ports.js` (+ test).
2. **`createDataState`'s `themeState` becomes a structural port.** `data.js` takes vanilla's `ThemeState` only to echo `themeState.settings.get()` in `readDiagnostics()`. Theme state stays in vanilla, so `data.ts` types it as `{ settings: { get(): TTheme } }` (generic `TTheme`).
3. **The `interceptLinks` option is a thunk over `navigate` only:** `interceptLinks?: (navigate: Navigate) => () => void`. Passing route's `RouteWindow` to vanilla's `interceptLinks(win: Window, …)` would fail `strictFunctionTypes`. vanilla passes `(nav) => interceptLinks(window, nav)`.
4. **Host globals `queueMicrotask` and `console`** (used by `reactive/internals`) are declared module-locally, following the existing precedent in `core/id.ts` (`declare const crypto: …`). They are ECMAScript-host APIs present in every runtime, not DOM, so they are not injected.
5. **`seed.ts`'s `remapIds` default id source becomes core `Id.create()`** (which is `crypto.randomUUID()` via `core/id.ts`). The behavior is identical, with no new global probe.

## Global Constraints

- **Behavior-preserving move.** No logic change, no export renamed, no store API reshaped, no reordering of side effects. The only intentional code changes are the seams listed in the spec's "Seams" section and the amendments above.
- **all-of-oyl `src/` rules:** `"type": "module"` + NodeNext. Every relative import has an explicit `.js` extension. `client/` NEVER imports the bare `@oyl/all-of-oyl` specifier; it imports domain symbols via `'../index.js'` (or a deeper relative path). The root `src/index.ts` does NOT re-export `client/`.
- **Strict gate:** `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`. No compiler or lint rule is loosened. Existing JSDoc `any` casts may carry over as `any`; no new `any`.
- **No DOM types in `client/` non-test code.** The build (`tsconfig.build.json`) has `lib: ["ES2022"]`, `types: []`. Fakes live in `*-fake.ts` files (excluded from build and from `typecheck:src` by existing tsconfig excludes).
- **Port recipe for every moved module:**
  1. `git mv apps/vanilla-oyl/src/<old>.js packages/all-of-oyl/src/client/<new>.ts` (history-preserving).
  2. JSDoc → TS one-for-one: `@param`/`@returns` → annotations, `@typedef` → `type`/`interface`, `/** @type {X} */ (expr)` → `expr as X`, `@template T` → `<T>`.
  3. Imports: `../lib/reactive/signal.js` → `'../reactive/signal.js'`; sibling moved modules → their new relative path; `'@oyl/all-of-oyl'` → `'../index.js'` (type-only imports use `import type`).
  4. Local storage typedefs (`AppStorage`, `ReadableStorage`) become non-exported aliases of ports (`Pick<EnumerableStorage, …>` / `StorageLike`), so the barrel has no name collisions.
  5. Keep the `...(x !== undefined ? { x } : {})` idiom for optional props.
- **Test recipe for every moved test:** `git mv` `*.test.js` → co-located `*.test.ts`, fix import paths, add types only where TS requires them. Replace happy-dom globals with fakes (`memoryStorage()`, `fakeRouteWindow()`, injected options). Assertions are never weakened or removed.
- **Re-pointing vanilla:** run `node apps/vanilla-oyl/scripts/repoint-client-imports.mjs <old paths…>` (created in Task 1) after each move. It rewrites every quoted relative specifier (in `from`, `import(…)` JSDoc types, etc.) that resolves to a moved file into `'@oyl/all-of-oyl/client'`.
- **Per-task gate (all must pass before commit):**
  ```bash
  pnpm --filter @oyl/all-of-oyl test
  pnpm all-of typecheck:src
  pnpm --filter @oyl/all-of-oyl exec tsc --noEmit
  pnpm all-of build
  pnpm vanilla test
  pnpm vanilla typecheck
  ```
- **e2e gate (Tasks 2, 5, 7):** first kill any reused app server so the new vendor build is served (`lsof -ti :8042 | xargs kill 2>/dev/null; true`), then run `pnpm e2e`. Expected: all green on desktop + mobile, with **no edits under `apps/e2e-oyl/`**.
- **Test-count baseline (recorded 2026-10-06 on master `8e3c8c2`):** all-of-oyl 75 files / 600 tests; vanilla 97 files / 526 tests; **combined 1126**. After every task, combined count ≥ 1126 + new tests added so far.
- **Commits:** prefix `refactor(client):` (or `test(client):`/`docs:`), end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `refactor/extract-client-layer` (already exists with the spec commit). Do not push.

## Review Focus

1. **A second reactive-core copy in the browser.** A vanilla file deep-importing `/vendor/all-of-oyl/client/reactive/signal.js` (or a stale local `lib/reactive/signal.js`) splits the tracking context, and screens silently stop updating. Expected: exactly one copy. Pinned by the static guard test in Task 2.
2. **The importmap specifier only resolves in the browser.** vitest/tsc resolve `@oyl/all-of-oyl/client` through `package.json` `exports`, so a missing importmap entry passes every unit test and breaks only the real app. Expected: the app boots. Pinned by Task 1's `index.html` assertion test and by e2e.
3. **Route navigation with relative or query-only paths** (`navigate('?seed')`, `navigate('journal/2026-06-16')`) must resolve exactly as `new URL(path, origin)` did. Pinned by the extra route tests in Task 6.
4. **Storage estimate rejection.** If `navigator.storage.estimate()` rejects, `refresh()` must still resolve and diagnostics report `storage: null`. Pinned in Task 5.
5. **A non-settling reactive loop must abort, not hang,** after the `queueMicrotask`/`console` declaration change. Pinned in Task 2.

## File Structure

```
packages/all-of-oyl/
  package.json                         MODIFY: exports "./client"
  src/client/
    index.ts                           barrel (grows per task)
    ports.ts                           injected-global interfaces
    storage/memory-storage-fake.ts     test fake: EnumerableStorage over a Map
    storage/memory-storage-fake.test.ts
    session/route-window-fake.ts       test fake: RouteWindow with in-memory history
    session/route-window-fake.test.ts
    reactive/{internals,signal,computed,effect}.ts (+ tests)          Task 2
    storage/{keys,clock,config,settings,schema,connectivity,lock}.ts  Task 3
    stores/{journal,planner,vault,goals,budgets,accounts,consumables,
            consumable-products,profile,google,notice}.ts            Task 4
    storage/bootstrap.ts, data.ts                                     Task 5
    session/{auth,auth-guard,route}.ts                                Task 6
    storage/{seed,backup}.ts                                          Task 7
apps/vanilla-oyl/
  index.html                           MODIFY: importmap + modulepreload for /client
  scripts/repoint-client-imports.mjs   one-off codemod (deleted in Task 8)
  test/client-entry.test.js            /client resolution, importmap, single-instance guards
  src/storage/browser-ports.js (+test) Task 5: real newId / estimateStorage / build
  src/main.js                          MODIFY: wiring (Tasks 5, 6)
```

---

### Task 1: Scaffold `@oyl/all-of-oyl/client`

**Files:**
- Modify: `packages/all-of-oyl/package.json` (exports)
- Create: `packages/all-of-oyl/src/client/index.ts`, `client/ports.ts`
- Create: `client/storage/memory-storage-fake.ts` (+ `.test.ts`), `client/session/route-window-fake.ts` (+ `.test.ts`)
- Create: `apps/vanilla-oyl/scripts/repoint-client-imports.mjs`
- Modify: `apps/vanilla-oyl/index.html` (importmap + modulepreload)
- Create: `apps/vanilla-oyl/test/client-entry.test.js`

**Interfaces:**
- Produces: the types `EnumerableStorage`, `EventTargetLike`, `LocationLike`, `HistoryLike`, `UrlCtor`, `RouteWindow`, `ConnectivityWindow`, `LockManagerLike`, `LockWindow`, `StorageEstimate`, `StorageEstimator`, and the re-exports `StorageLike`/`FetchFn`/`FetchResponse` from `client/ports.ts`; `memoryStorage(seed?)`; `fakeRouteWindow(initialPath?)`; the codemod CLI.

- [ ] **Step 1: Write the failing vanilla resolution + importmap test**

`apps/vanilla-oyl/test/client-entry.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

describe('@oyl/all-of-oyl/client entry', () => {
  it('resolves through the package exports map', async () => {
    const mod = await import('@oyl/all-of-oyl/client')
    expect(typeof mod).toBe('object')
  })

  it('is mapped in the browser importmap and preloaded (unit tests resolve via exports, the browser only via importmap)', async () => {
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
    expect(html).toContain('"@oyl/all-of-oyl/client": "/vendor/all-of-oyl/client/index.js"')
    expect(html).toContain('<link rel="modulepreload" href="/vendor/all-of-oyl/client/index.js" />')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vanilla exec vitest run test/client-entry.test.js`
Expected: FAIL (`Missing "./client" specifier in "@oyl/all-of-oyl" package` and the importmap assertion).

- [ ] **Step 3: Add the exports entry, barrel, and ports**

`packages/all-of-oyl/package.json` `exports` becomes:

```json
  "exports": {
    ".": "./src/index.ts",
    "./format": "./src/format/index.ts",
    "./client": "./src/client/index.ts",
    "./package.json": "./package.json"
  },
```

`packages/all-of-oyl/src/client/index.ts`:

```ts
// @oyl/all-of-oyl/client — the shared client state layer (signals, stores, data wiring, session).
// DOM-free: browser globals arrive through the ports in ./ports.js. Never re-exported from the root barrel.
export type * from './ports.js'
```

`packages/all-of-oyl/src/client/ports.ts`:

```ts
// Minimal structural slices of browser globals the client layer needs. The browser build has
// no DOM lib, so these are the ONLY way browser APIs reach client/. `window` satisfies the
// window-shaped ports structurally; tests pass fakes (see *-fake.ts).
import type { StorageLike } from '../core/local-storage-repository.js'

export type { StorageLike } from '../core/local-storage-repository.js'
export type { FetchFn, FetchResponse } from '../core/http-repository.js'

/** localStorage as the client layer uses it (schema inspection enumerates keys). */
export interface EnumerableStorage extends StorageLike {
  removeItem(key: string): void
  key(index: number): string | null
  readonly length: number
}

export interface EventTargetLike {
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}

export interface LocationLike {
  readonly pathname: string
  readonly search: string
  readonly hash: string
  readonly origin: string
}

export interface HistoryLike {
  pushState(data: unknown, unused: string, url: string): void
  replaceState(data: unknown, unused: string, url: string): void
  scrollRestoration?: string
}

/** The `URL` constructor slice route state needs (browsers expose it as `window.URL`). */
export type UrlCtor = new (url: string, base?: string) => { readonly pathname: string, readonly search: string }

/** What History-API route state needs from `window`. */
export interface RouteWindow extends EventTargetLike {
  readonly location: LocationLike
  readonly history: HistoryLike
  readonly URL: UrlCtor
}

/** What browser connectivity needs from `window`. */
export interface ConnectivityWindow extends EventTargetLike {
  readonly navigator: { readonly onLine: boolean }
}

export interface LockManagerLike {
  request(name: string, fn: () => Promise<void>): Promise<unknown>
}

/** What the cross-tab lock needs from `window` (Web Locks are optional). */
export interface LockWindow {
  readonly navigator: { readonly locks?: LockManagerLike }
}

export interface StorageEstimate { usage: number, quota: number }
/** Best-effort storage quota probe (navigator.storage.estimate in browsers). */
export type StorageEstimator = () => Promise<StorageEstimate | null>
```

- [ ] **Step 4: Write the failing fake tests**

`packages/all-of-oyl/src/client/storage/memory-storage-fake.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { memoryStorage } from './memory-storage-fake.js'

describe('memoryStorage', () => {
  it('behaves like localStorage for get/set/remove/key/length/clear', () => {
    const s = memoryStorage({ a: '1' })
    expect(s.getItem('a')).toBe('1')
    expect(s.getItem('missing')).toBeNull()
    s.setItem('b', '2')
    expect(s.length).toBe(2)
    expect([s.key(0), s.key(1)]).toEqual(['a', 'b'])
    expect(s.key(9)).toBeNull()
    s.removeItem('a')
    expect(s.length).toBe(1)
    s.clear()
    expect(s.length).toBe(0)
  })
})
```

`packages/all-of-oyl/src/client/session/route-window-fake.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { fakeRouteWindow } from './route-window-fake.js'

describe('fakeRouteWindow', () => {
  it('tracks pushState/replaceState in location and history length', () => {
    const win = fakeRouteWindow('/journal?x=1')
    expect(win.location.pathname).toBe('/journal')
    expect(win.location.search).toBe('?x=1')
    win.history.pushState({}, '', '/vault')
    expect(win.location.pathname).toBe('/vault')
    expect(win.history.length).toBe(2)
    win.history.replaceState({}, '', '/goals#h')
    expect(win.location.pathname).toBe('/goals')
    expect(win.location.hash).toBe('#h')
    expect(win.history.length).toBe(2)
  })

  it('dispatches registered listeners and honours removal', () => {
    const win = fakeRouteWindow()
    const fn = vi.fn()
    win.addEventListener('popstate', fn)
    win.dispatch('popstate')
    win.removeEventListener('popstate', fn)
    win.dispatch('popstate')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 5: Run them to verify they fail**

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/client`
Expected: FAIL (cannot find `./memory-storage-fake.js` / `./route-window-fake.js`).

- [ ] **Step 6: Implement the fakes**

`packages/all-of-oyl/src/client/storage/memory-storage-fake.ts`:

```ts
import type { EnumerableStorage } from '../ports.js'

/** In-memory EnumerableStorage for node-env tests (replaces happy-dom's localStorage). */
export function memoryStorage(seed: Record<string, string> = {}): EnumerableStorage & { clear(): void } {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size },
    clear: () => map.clear(),
  }
}
```

`packages/all-of-oyl/src/client/session/route-window-fake.ts`:

```ts
import type { RouteWindow } from '../ports.js'

const ORIGIN = 'http://localhost:8041'

/** RouteWindow over an in-memory history stack, for node-env route/auth tests. */
export function fakeRouteWindow(initialPath = '/') {
  const listeners = new Map<string, Set<() => void>>()
  let current = new URL(initialPath, ORIGIN)
  const entries: string[] = [href()]
  function href() { return current.pathname + current.search + current.hash }
  const location = {
    get pathname() { return current.pathname },
    get search() { return current.search },
    get hash() { return current.hash },
    get origin() { return ORIGIN },
  }
  const history = {
    scrollRestoration: 'auto',
    get length() { return entries.length },
    pushState(_d: unknown, _u: string, url: string) { current = new URL(url, current); entries.push(href()) },
    replaceState(_d: unknown, _u: string, url: string) { current = new URL(url, current); entries[entries.length - 1] = href() },
  }
  const win = {
    location,
    history,
    URL,
    addEventListener(type: string, fn: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)?.add(fn)
    },
    removeEventListener(type: string, fn: () => void) { listeners.get(type)?.delete(fn) },
    /** Fire every listener registered for `type` (e.g. simulate a back-button popstate). */
    dispatch(type: string) { for (const fn of [...(listeners.get(type) ?? [])]) fn() },
  }
  return win satisfies RouteWindow
}
```

- [ ] **Step 7: Add the importmap entry and modulepreload**

In `apps/vanilla-oyl/index.html`, the importmap becomes:

```html
        "imports": {
          "@oyl/all-of-oyl": "/vendor/all-of-oyl/index.js",
          "@oyl/all-of-oyl/format": "/vendor/all-of-oyl/format/index.js",
          "@oyl/all-of-oyl/client": "/vendor/all-of-oyl/client/index.js"
        }
```

and after the existing `<link rel="modulepreload" href="/vendor/all-of-oyl/format/index.js" />` add:

```html
    <link rel="modulepreload" href="/vendor/all-of-oyl/client/index.js" />
```

(Paths stay root-absolute per CLAUDE.md.)

- [ ] **Step 8: Create the codemod**

`apps/vanilla-oyl/scripts/repoint-client-imports.mjs`:

```js
#!/usr/bin/env node
// One-off codemod for the client-layer extraction (spec 2026-10-06-extract-client-layer).
// Rewrites every quoted relative specifier in vanilla's src/, test/, deploy/ that resolves to
// one of the given (already-moved) files into '@oyl/all-of-oyl/client'. Covers `from '…'`,
// JSDoc `import('…')` types, and dynamic imports alike. Deleted in the plan's final task.
// Usage (from repo root): node apps/vanilla-oyl/scripts/repoint-client-imports.mjs src/lib/reactive/signal.js …
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const moved = new Set(process.argv.slice(2).map((p) => resolve(root, p)))
if (moved.size === 0) {
  console.error('usage: repoint-client-imports.mjs <old path relative to apps/vanilla-oyl>…')
  process.exit(1)
}

/** @param {string} dir @returns {AsyncGenerator<string>} */
async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (/\.m?js$/.test(e.name)) yield p
  }
}

const SPEC = /(['"])(\.\.?\/[^'"\n]+?\.js)\1/g
let changed = 0
for (const dir of ['src', 'test', 'deploy']) {
  for await (const file of walk(join(root, dir))) {
    const before = await readFile(file, 'utf8')
    const after = before.replace(SPEC, (m, q, spec) =>
      moved.has(resolve(dirname(file), spec)) ? `${q}@oyl/all-of-oyl/client${q}` : m)
    if (after !== before) {
      await writeFile(file, after)
      changed++
      console.log('repointed', relative(root, file))
    }
  }
}
console.log(`${changed} file(s) changed`)
```

- [ ] **Step 9: Run the tests and the full gate**

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/client && pnpm vanilla exec vitest run test/client-entry.test.js`
Expected: PASS.
Then run the full per-task gate (Global Constraints). Also confirm the build emitted the entry: `ls packages/all-of-oyl/dist/client/index.js packages/all-of-oyl/dist/client/ports.js` (both exist), and that the fakes did NOT ship: `ls packages/all-of-oyl/dist/client/storage/memory-storage-fake.js` fails.

- [ ] **Step 10: Commit**

```bash
git add packages/all-of-oyl/package.json packages/all-of-oyl/src/client apps/vanilla-oyl/index.html apps/vanilla-oyl/scripts/repoint-client-imports.mjs apps/vanilla-oyl/test/client-entry.test.js
git commit -m "refactor(client): scaffold @oyl/all-of-oyl/client with ports, fakes and importmap entry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Move the reactive core (`signal`/`computed`/`effect`/`internals`)

**Files:**
- Move: `apps/vanilla-oyl/src/lib/reactive/{internals,signal,computed,effect}.js` → `packages/all-of-oyl/src/client/reactive/*.ts`
- Move: `apps/vanilla-oyl/src/lib/reactive/{signal,computed,effect}.test.js` → `client/reactive/*.test.ts`
- Modify: `client/index.ts`, `apps/vanilla-oyl/test/client-entry.test.js`
- Re-point (codemod): ~40 vanilla files incl. `src/lib/reactive/oyl-element.js` and `src/main.js`

**Interfaces:**
- Consumes: `client/index.ts` barrel (Task 1).
- Produces (barrel): `signal<T>(initial: T, equals?: (a: T, b: T) => boolean): Signal<T>`; `interface Signal<T> { get(): T; set(value: T): void }`; `computed<T>(fn: () => T, equals?): { get: () => T }`; `effect(fn: () => void): () => void`. `internals.ts` is NOT exported from the barrel.

The core moves as one unit because `internals.ts` holds the active-observer tracking context. Two copies means silent non-reactivity.

- [ ] **Step 1: Write the failing single-instance + static guard tests (vanilla)**

Append to `apps/vanilla-oyl/test/client-entry.test.js` (add `readdir` to the existing `node:fs/promises` import and the new imports at the top):

```js
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { OylElement } from '../src/lib/reactive/oyl-element.js'
import { signal } from '@oyl/all-of-oyl/client'

class SharedProbe extends OylElement {
  value = signal('a')
  render() {
    const span = document.createElement('span')
    this.bindText(span, () => this.value.get())
    /** @type {ShadowRoot} */ (this.shadowRoot).append(span)
  }
}
customElements.define('test-shared-probe', SharedProbe)

describe('one reactive core', () => {
  it('an OylElement re-renders from a signal created by @oyl/all-of-oyl/client', async () => {
    const el = new SharedProbe()
    document.body.append(el)
    el.value.set('b')
    await Promise.resolve()
    expect(/** @type {ShadowRoot} */ (el.shadowRoot).querySelector('span')?.textContent).toBe('b')
    el.remove()
  })

  it('vanilla keeps no local reactive core and never deep-imports client internals', async () => {
    const reactiveDir = fileURLToPath(new URL('../src/lib/reactive/', import.meta.url))
    expect((await readdir(reactiveDir)).filter((f) => !f.startsWith('oyl-element.'))).toEqual([])
    const srcDir = fileURLToPath(new URL('../src/', import.meta.url))
    /** @type {string[]} */
    const offenders = []
    for (const rel of await readdir(srcDir, { recursive: true })) {
      if (!rel.endsWith('.js')) continue
      const text = await readFile(join(srcDir, rel), 'utf8')
      if (/all-of-oyl\/client\/[\w./-]+/.test(text)) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vanilla exec vitest run test/client-entry.test.js`
Expected: FAIL. `signal` is not exported by `@oyl/all-of-oyl/client` (undefined is not a function), and the reactive dir still lists `signal.js` etc.

- [ ] **Step 3: Move the tests and add the loop-abort test**

```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
mkdir -p packages/all-of-oyl/src/client/reactive
for f in signal computed effect; do git mv apps/vanilla-oyl/src/lib/reactive/$f.test.js packages/all-of-oyl/src/client/reactive/$f.test.ts; done
```

Their sibling imports (`./signal.js`, `./effect.js`, `./computed.js`) stay valid. Add TS annotations only where `tsc` asks. Append this test inside the `describe` of `client/reactive/effect.test.ts` (import `vi` and `signal` if not already imported):

```ts
  it('aborts a non-settling update loop with console.error instead of hanging', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const a = signal(0)
      const b = signal(0)
      // Two effects ping-pong: each writes the signal the other reads, so the batch never settles.
      const stop1 = effect(() => { b.set(a.get() + 1) })
      const stop2 = effect(() => { a.set(b.get() + 1) })
      await new Promise((r) => setTimeout(r, 0))
      expect(error).toHaveBeenCalledWith(expect.stringContaining('aborting update loop'))
      stop1(); stop2()
    } finally {
      error.mockRestore()
    }
  })
```

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/client/reactive`
Expected: FAIL (modules `./signal.js` etc. not found).

- [ ] **Step 4: Move and port the modules**

```bash
for f in internals signal computed effect; do git mv apps/vanilla-oyl/src/lib/reactive/$f.js packages/all-of-oyl/src/client/reactive/$f.ts; done
```

Port each file per the recipe. The results must be:

`client/reactive/internals.ts`. Keep the existing doc comments, the `flush` body and the error text verbatim. The changes are the host-global declarations and the types:

```ts
// Host globals present in every runtime (browsers, Node, workers). Declared locally because the
// browser build has no DOM lib and `types: []` — same precedent as core/id.ts.
declare function queueMicrotask(callback: () => void): void
declare const console: { error(...data: unknown[]): void }

/** Shared reactive runtime: the active-observer stack (autotracking) and the microtask
 * effect scheduler. Kept in one module so signal/computed/effect share one graph. */
export interface Source { _subs: Set<object> }
export interface Observer { _addSource(src: Source): void }
export interface Runnable { _run(): void }

/** Hard cap on flush iterations before we abort a non-settling update loop. */
const MAX_FLUSH_ITERATIONS = 1000

let activeObserver: any = null
const pending = new Set<Runnable>()
let scheduled = false

export function getActiveObserver(): any {
  return activeObserver
}

/** Run `fn` with `observer` as the active tracking target, restoring the previous one. */
export function track<T>(observer: any, fn: () => T): T {
  const prev = activeObserver
  activeObserver = observer
  try {
    return fn()
  } finally {
    activeObserver = prev
  }
}

/** Queue an effect to run on the next microtask batch. */
export function schedule(eff: Runnable): void {
  pending.add(eff)
  if (!scheduled) {
    scheduled = true
    queueMicrotask(flush)
  }
}

function flush(): void {
  scheduled = false
  let guard = 0
  while (pending.size) {
    if (++guard > MAX_FLUSH_ITERATIONS) {
      pending.clear()
      console.error(
        'reactive: aborting update loop after ' + MAX_FLUSH_ITERATIONS +
          ' iterations — likely a cyclic signal dependency that never settles',
      )
      break
    }
    const batch = [...pending]
    pending.clear()
    for (const eff of batch) eff._run()
  }
}
```

`client/reactive/signal.ts`:

```ts
import { getActiveObserver, schedule } from './internals.js'

export interface Signal<T> {
  /** Read the value; auto-tracks if called inside an effect/computed. */
  get(): T
  /** Write the value; notifies dependents if changed. */
  set(value: T): void
}

/** Create a writable reactive value. `equals` defaults to Object.is. */
export function signal<T>(initial: T, equals: (a: T, b: T) => boolean = Object.is): Signal<T> {
  let value = initial
  const subs = new Set<any>()
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
      // Cycle detection: a write to a signal that the currently-running observer
      // also reads is a cycle. Throw synchronously before scheduling.
      const active = getActiveObserver()
      for (const sub of [...subs]) {
        if (sub === active) {
          throw new Error('reactive: cycle detected (effect wrote a signal it reads)')
        }
        if (typeof sub._markStale === 'function') sub._markStale()
        if (typeof sub._run === 'function') schedule(sub)
      }
    },
  }
}
```

`client/reactive/computed.ts`:

```ts
import { getActiveObserver, track, schedule, type Source } from './internals.js'

/**
 * A lazily-evaluated, cached derived value. Recomputes on read only when a source has
 * changed since the last computation; propagates invalidation to its own subscribers
 * (marking subscriber computeds stale and scheduling subscriber effects).
 */
export function computed<T>(fn: () => T, equals: (a: T, b: T) => boolean = Object.is): { get: () => T } {
  let value: T
  let stale = true
  const subs = new Set<any>()
  let sources = new Set<Source>()

  const node = {
    _addSource(src: Source) {
      sources.add(src)
    },
    // A source changed: become stale and propagate to our own subscribers.
    _markStale() {
      if (stale) return
      stale = true
      for (const sub of [...subs]) {
        if (typeof sub._markStale === 'function') sub._markStale()
        if (typeof sub._run === 'function') schedule(sub)
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

`client/reactive/effect.ts`:

```ts
import { track, type Source } from './internals.js'

/**
 * Run `fn` now and re-run it (batched on a microtask) whenever a signal/computed it
 * read changes. Returns a dispose function that detaches it from all sources.
 *
 * Cycle detection assumes read-before-write: an effect that reads then writes the same
 * signal throws synchronously; an effect that writes a signal before reading it is not
 * detected (it simply won't react to that write).
 */
export function effect(fn: () => void): () => void {
  let disposed = false
  let running = false
  let sources = new Set<Source>()

  const runner = {
    _addSource(src: Source) {
      sources.add(src)
    },
    _run() {
      if (disposed) return
      if (running) throw new Error('reactive: cycle detected (effect re-entered during its own run)')
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

If `tsc` reports `value` as used-before-assigned in `computed.ts`, declare it `let value!: T` (a definite-assignment assertion; runtime is identical).

Extend `client/index.ts`:

```ts
export * from './reactive/signal.js'
export * from './reactive/computed.js'
export * from './reactive/effect.js'
```

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/client/reactive`
Expected: PASS (12 moved tests + 1 new).

- [ ] **Step 5: Re-point vanilla**

```bash
node apps/vanilla-oyl/scripts/repoint-client-imports.mjs src/lib/reactive/signal.js src/lib/reactive/computed.js src/lib/reactive/effect.js src/lib/reactive/internals.js
```

Expected: about 40 files reported, including `src/lib/reactive/oyl-element.js` (its `./effect.js` import) and `src/main.js`. Then `grep -rn "reactive/\(signal\|computed\|effect\|internals\)" apps/vanilla-oyl/src apps/vanilla-oyl/test` should print nothing.

- [ ] **Step 6: Run the full per-task gate, the guard tests, and e2e**

Run the per-task gate (Global Constraints). `test/client-entry.test.js` must now PASS. Then run the e2e gate.
Expected: all green; combined unit count ≥ 1126 + 5 (Task 1: 2 vanilla entry tests + 3 fake tests) + 3 (2 guards + loop-abort) = 1134.

- [ ] **Step 7: Commit**

```bash
git add -A packages/all-of-oyl/src/client apps/vanilla-oyl
git commit -m "refactor(client): move the reactive core into @oyl/all-of-oyl/client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Move the storage leaves

**Files:**
- Move: `apps/vanilla-oyl/src/storage/{keys,clock,config,settings,schema,connectivity,lock}.js` (+ their `.test.js`) → `packages/all-of-oyl/src/client/storage/*.ts` / `*.test.ts`
- Modify: `client/index.ts`
- Re-point (codemod): ~25 vanilla files (incl. the vanilla-staying `state/theme.js`, `state/layout.js`, and the not-yet-moved stores/bootstrap/data/auth/seed/backup)

**Interfaces:**
- Consumes: `EnumerableStorage`, `StorageLike`, `ConnectivityWindow`, `LockWindow`, `LockManagerLike` (Task 1); `Connectivity` type from `'../../core/connectivity.js'`.
- Produces (barrel, names unchanged from the JS):
  - `keys.ts`: `PREFIX`, `SCHEMA_VERSION_KEY`, `SETTINGS_KEY`, `AUTH_KEY`, `API_BASE_URL_KEY`, `STORAGE_MODE_KEY`, `CACHE_PREFIX`, `OUTBOX_KEY`, `READ_CACHE_KEY`, `PROFILE_ID_KEY`, `TZ_RELOADED_KEY`, `DRIVE_BASE_URL_KEY`, `dataKey(collection: string): string`, `isOylKey(key: string): boolean`, `cacheKey(collection: string): string`
  - `clock.ts`: `now(): Date`, `defaultTimezone(): string`
  - `config.ts`: `DEFAULT_API_BASE_URL`, `defaultApiBaseUrl(hostname?: string, metaBase?: string): string`, `defaultStorageMode(_hostname?: string): 'local' | 'remote'`, `getApiBaseUrl(storage: Pick<StorageLike, 'getItem'>, hostname?: string, metaBase?: string): string`, `getStorageMode(storage: Pick<StorageLike, 'getItem'>, hostname?: string): 'local' | 'remote'`, `normalizeBaseUrl(url: string): string`, `setStorageMode(storage: Pick<EnumerableStorage, 'setItem' | 'removeItem'>, mode: 'local' | 'remote'): void`, `setApiBaseUrl(storage: Pick<EnumerableStorage, 'setItem' | 'removeItem'>, url: string): void`
  - `settings.ts`: `readRawSettings(storage: Pick<StorageLike, 'getItem'>): Record<string, unknown>`
  - `schema.ts`: `CURRENT_SCHEMA_VERSION`, `type SchemaState`, `readSchemaState(storage: Pick<EnumerableStorage, 'getItem' | 'key' | 'length'>): SchemaState`
  - `connectivity.ts`: `createBrowserConnectivity(win: ConnectivityWindow): Connectivity`
  - `lock.ts`: `type Lock = { runExclusive: (name: string, fn: () => Promise<void>) => Promise<void> }`, `createBrowserLock(win: LockWindow): Lock`

- [ ] **Step 1: Move the tests**

```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
for f in keys clock config settings schema connectivity lock; do git mv apps/vanilla-oyl/src/storage/$f.test.js packages/all-of-oyl/src/client/storage/$f.test.ts; done
```

Port per the test recipe. These tests already use local fakes (`fakeStorage()` in config/schema, `fakeWindow()` in connectivity, a fake `navigator.locks` in lock); keep them, only adding TS types. Sibling imports (`./keys.js`, …) stay valid.

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/client/storage`
Expected: FAIL. The seven modules are missing; the Task-1 fake test still passes.

- [ ] **Step 2: Move and port the modules**

```bash
for f in keys clock config settings schema connectivity lock; do git mv apps/vanilla-oyl/src/storage/$f.js packages/all-of-oyl/src/client/storage/$f.ts; done
```

Port per the recipe with the signatures above. Specifics:
- `schema.ts`: the JSDoc `ReadableStorage` typedef becomes a non-exported `type ReadableStorage = Pick<EnumerableStorage, 'getItem' | 'key' | 'length'>`; `SchemaState` becomes an exported union type, verbatim.
- `settings.ts`: non-exported `type ReadableStorage = Pick<StorageLike, 'getItem'>`.
- `connectivity.ts`: `import type { Connectivity } from '../../core/connectivity.js'` and `import type { ConnectivityWindow } from '../ports.js'`; the body is unchanged.
- `lock.ts`:

  ```ts
  import type { LockWindow } from '../ports.js'

  export type Lock = { runExclusive: (name: string, fn: () => Promise<void>) => Promise<void> }

  /**
   * Cross-tab serializing lock via the Web Locks API; degrades to a no-coordination
   * passthrough where unavailable.
   */
  export function createBrowserLock(win: LockWindow): Lock {
    const locks = win.navigator.locks
    if (!locks) return { runExclusive: (_name, fn) => fn() }
    return { runExclusive: (name, fn) => locks.request(name, fn) as Promise<void> }
  }
  ```

- `clock.ts`: `Intl`/`Date` are ECMAScript, so the body is unchanged.

Extend `client/index.ts`:

```ts
export * from './storage/keys.js'
export * from './storage/clock.js'
export * from './storage/config.js'
export * from './storage/settings.js'
export * from './storage/schema.js'
export * from './storage/connectivity.js'
export * from './storage/lock.js'
```

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/client/storage`
Expected: PASS.

- [ ] **Step 3: Re-point vanilla**

```bash
node apps/vanilla-oyl/scripts/repoint-client-imports.mjs src/storage/keys.js src/storage/clock.js src/storage/config.js src/storage/settings.js src/storage/schema.js src/storage/connectivity.js src/storage/lock.js
```

Expected: `state/theme.js`, `state/layout.js`, `main.js`, the stores, `storage/bootstrap.js`, `storage/backup.js`, and several components are reported.

- [ ] **Step 4: Run the per-task gate**

If `pnpm vanilla typecheck` rejects `window` as `LockWindow` or `ConnectivityWindow` (DOM overload shapes), widen only the port's callback parameter (e.g. `request(name: string, fn: (lock: unknown) => Promise<void>): Promise<unknown>`), not the call site. Re-run the gate until it's green.
Expected: all green; combined count unchanged from Task 2's total (tests moved, none added).

- [ ] **Step 5: Commit**

```bash
git add -A packages/all-of-oyl/src/client apps/vanilla-oyl
git commit -m "refactor(client): move storage leaves (keys, clock, config, settings, schema, connectivity, lock)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Move the domain stores

**Files:**
- Move: `apps/vanilla-oyl/src/state/{journal,planner,vault,goals,budgets,accounts,consumables,consumable-products,profile,google}-store.js` → `packages/all-of-oyl/src/client/stores/{journal,planner,vault,goals,budgets,accounts,consumables,consumable-products,profile,google}.ts`
- Move: `apps/vanilla-oyl/src/state/notice.js` → `client/stores/notice.ts`
- Move tests: every existing `<name>-store.test.js` and `notice.test.js` → `client/stores/<name>.test.ts` / `notice.test.ts` (`consumable-products-store` has no test today; none is added, since this is a move)
- Modify: `client/index.ts`

**Interfaces:**
- Consumes: `signal`/`Signal` (Task 2), `PROFILE_ID_KEY` (Task 3), `FetchFn`/`StorageLike` (Task 1), domain types via `'../../index.js'` (`Journal`, `Transaction`, `Consumption`, `sumNutrients`, `Planner`, `Vault`, `User`, `Repository`, …).
- Produces (barrel, names unchanged): `createJournalStore(reposByKind, tz: string)`, `createPlannerStore(plansRepo)`, `createVaultStore(repos)`, `createGoalsStore(goalsRepo)`, `createBudgetsStore(budgetsRepo)`, `createAccountsStore(accountsRepo)`, `createConsumablesStore(consumablesRepo)`, `createConsumableProductsStore(consumableProductsRepo)`, `resolveTimezone(profile: User | null, browserTz: string): string`, `type ProfilePatch`, `createProfileStore(repos: { users: Repository<User> }, storage: Pick<StorageLike, 'getItem' | 'setItem'>)`, `createGoogleStore(opts: { baseUrl: string, fetch: FetchFn, getToken: () => Promise<string | null> })`, `createNoticeState()`. Parameter types are the JSDoc types of each original, translated one-for-one. Return types are inferred (do not hand-write them), so they match the JS exactly.

- [ ] **Step 1: Move the tests**

```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
mkdir -p packages/all-of-oyl/src/client/stores
for f in journal planner vault goals budgets accounts consumables profile google; do git mv apps/vanilla-oyl/src/state/$f-store.test.js packages/all-of-oyl/src/client/stores/$f.test.ts; done
git mv apps/vanilla-oyl/src/state/notice.test.js packages/all-of-oyl/src/client/stores/notice.test.ts
```

Port per the test recipe. Each test's `./<name>-store.js` import becomes `./<name>.js`. `@oyl/all-of-oyl` imports become `'../../index.js'`, and `@oyl/all-of-oyl/client` imports (from the Task 2–3 codemod) become relative (`'../reactive/signal.js'`, `'../storage/keys.js'`). The one happy-dom dependency:
- `profile.test.ts` uses the global `localStorage`. Replace with `const storage = memoryStorage()` (from `'../storage/memory-storage-fake.js'`) created in `beforeEach`, pass `storage` everywhere `localStorage` was passed, and assert `storage.getItem('oyl/profile-id')`.
- `google.test.ts` already injects a fake `fetch`; type it as `FetchFn` (or keep `as any` where the JS cast it).

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/client/stores`
Expected: FAIL (store modules missing).

- [ ] **Step 2: Move and port the modules**

```bash
for f in journal planner vault goals budgets accounts consumables consumable-products profile google; do git mv apps/vanilla-oyl/src/state/$f-store.js packages/all-of-oyl/src/client/stores/$f.ts; done
git mv apps/vanilla-oyl/src/state/notice.js packages/all-of-oyl/src/client/stores/notice.ts
```

Port per the recipe. Specifics:
- `google.ts`: `fetch: typeof globalThis.fetch` → `fetch: FetchFn` (`import type { FetchFn } from '../ports.js'`). The `{ ...init, credentials: 'include', headers: … }` object is a `Record<string, unknown>`, so it fits `FetchFn`'s `init`.
- `profile.ts`: `storage` → `Pick<StorageLike, 'getItem' | 'setItem'>`; `ProfilePatch` becomes an exported type, verbatim.
- `journal.ts`: keep the `reposByKind` key set exactly (`'note' | 'consumption' | 'transaction' | 'measurement' | 'activity-session'`).

Extend `client/index.ts`:

```ts
export * from './stores/journal.js'
export * from './stores/planner.js'
export * from './stores/vault.js'
export * from './stores/goals.js'
export * from './stores/budgets.js'
export * from './stores/accounts.js'
export * from './stores/consumables.js'
export * from './stores/consumable-products.js'
export * from './stores/profile.js'
export * from './stores/google.js'
export * from './stores/notice.js'
```

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/client/stores`, then `pnpm all-of typecheck:src`
Expected: PASS. If `tsc` reports a barrel name collision (TS2308), the colliding name is a leaked local typedef. Make it non-exported per recipe rule 4; do not rename a real export.

- [ ] **Step 3: Re-point vanilla**

```bash
node apps/vanilla-oyl/scripts/repoint-client-imports.mjs src/state/journal-store.js src/state/planner-store.js src/state/vault-store.js src/state/goals-store.js src/state/budgets-store.js src/state/accounts-store.js src/state/consumables-store.js src/state/consumable-products-store.js src/state/profile-store.js src/state/google-store.js src/state/notice.js
```

- [ ] **Step 4: Run the per-task gate**

Expected: all green; combined count unchanged from Task 3's total.

- [ ] **Step 5: Commit**

```bash
git add -A packages/all-of-oyl/src/client apps/vanilla-oyl
git commit -m "refactor(client): move the domain stores, profile, google and notice state

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Move the data wiring (`bootstrap`, `data`) and wire real browser ports

**Files:**
- Move: `apps/vanilla-oyl/src/storage/bootstrap.js` (+ test) → `packages/all-of-oyl/src/client/storage/bootstrap.ts` (+ `.test.ts`)
- Move: `apps/vanilla-oyl/src/state/data.js` (+ test) → `packages/all-of-oyl/src/client/data.ts` (+ `data.test.ts`)
- Create: `packages/all-of-oyl/src/client/data-fake.ts` (`themeStub()`)
- Create: `apps/vanilla-oyl/src/storage/browser-ports.js` (+ `browser-ports.test.js`)
- Modify: `apps/vanilla-oyl/src/main.js`, `client/index.ts`

**Interfaces:**
- Consumes: stores (Task 4), `readSchemaState`/`OUTBOX_KEY`/`READ_CACHE_KEY`/`now`/`defaultTimezone` (Task 3), `signal` (Task 2), `EnumerableStorage`/`StorageEstimate`/`StorageEstimator` (Task 1).
- Produces (barrel):
  - `bootstrap.ts`: `PATH_BY_COLLECTION`, `ROW_KIND_BY_COLLECTION`, `CATALOG_BACKED`, `type CollectionName`, `type Repositories`, `type Catalogs`, `makeRepositories(storage: StorageLike, opts?: { api?: ApiClient, connectivity?: Connectivity, newId?: () => string }): { repos: Repositories, catalogs: Catalogs, outbox: WriteOutbox, flush: () => Promise<void> }`, `createFlusher(outbox, api, connectivity): () => Promise<void>`, `decodeBootstrap(payload: BootstrapPayload): Record<CollectionName, any[]>`, `collectionCounts(repos: Repositories): Promise<Record<string, number>>`, **new** `fallbackId(): string`.
  - `data.ts`: `interface DataStateOptions { api?; connectivity?; repos?; outbox?; timezone?; bootstrap?; newId?: () => string; estimateStorage?: StorageEstimator; build?: string }`, `createDataState<TTheme = unknown>(storage: Pick<EnumerableStorage, 'getItem' | 'setItem' | 'key' | 'length'>, themeState: { settings: { get(): TTheme } }, opts?: DataStateOptions)`, which returns the same object as today. `type DataState = ReturnType<typeof createDataState>`.
  - vanilla `browser-ports.js`: `browserDataPorts(g): { newId: () => string, estimateStorage: () => Promise<{ usage: number, quota: number } | null>, build: string }`.

- [ ] **Step 1: Write the failing vanilla composition test**

`apps/vanilla-oyl/src/storage/browser-ports.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { browserDataPorts } from './browser-ports.js'

describe('browserDataPorts', () => {
  it('mints outbox ids with crypto.randomUUID when available', () => {
    expect(browserDataPorts({ crypto: { randomUUID: () => 'uuid-1' } }).newId()).toBe('uuid-1')
  })

  it('falls back to the m-<time>-<rand> id without Web Crypto', () => {
    expect(browserDataPorts({}).newId()).toMatch(/^m-\d+-[a-z0-9]+$/)
  })

  it('reads navigator.storage.estimate, defaulting missing fields to 0', async () => {
    const ports = browserDataPorts({ navigator: { storage: { estimate: async () => ({ usage: 12 }) } } })
    expect(await ports.estimateStorage()).toEqual({ usage: 12, quota: 0 })
  })

  it('estimates null without the Storage API and reports the build marker', async () => {
    expect(await browserDataPorts({}).estimateStorage()).toBeNull()
    expect(browserDataPorts({}).build).toBe('dev')
    expect(browserDataPorts({ __OYL_LIB_BUILD__: 'abc' }).build).toBe('abc')
  })

  it('is what main.js wires into the data layer (guards a forgotten wire)', async () => {
    const main = await readFile(new URL('../main.js', import.meta.url), 'utf8')
    expect(main).toMatch(/browserDataPorts\(globalThis\)/)
    expect(main).toMatch(/newId: ports\.newId/)
    expect(main).toMatch(/estimateStorage: ports\.estimateStorage/)
    expect(main).toMatch(/build: ports\.build/)
  })
})
```

Run: `pnpm vanilla exec vitest run src/storage/browser-ports.test.js`
Expected: FAIL (`./browser-ports.js` not found).

- [ ] **Step 2: Move the tests and add the seam tests**

```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git mv apps/vanilla-oyl/src/storage/bootstrap.test.js packages/all-of-oyl/src/client/storage/bootstrap.test.ts
git mv apps/vanilla-oyl/src/state/data.test.js packages/all-of-oyl/src/client/data.test.ts
```

Create `packages/all-of-oyl/src/client/data-fake.ts`:

```ts
import { signal } from './reactive/signal.js'

/** Stand-in for vanilla's theme state: createDataState only echoes settings.get() in diagnostics. */
export function themeStub<T = { theme: string, mode: string }>(settings = { theme: 'classic', mode: 'system' } as T) {
  return { settings: signal(settings) }
}
```

Port per the test recipe:
- `data.test.ts`: `createThemeState(storage)` → `themeStub()` (import from `'./data-fake.js'`); drop the vanilla `./theme.js` import. If an assertion compared `readDiagnostics().theme` to the theme state's settings, compare to the stub's settings value instead.
- `data.test.ts`, test "readDiagnostics includes a storage estimate when the Storage API is available": replace the `globalThis.navigator` property stubbing with the option:

  ```ts
  it('readDiagnostics includes a storage estimate when the Storage API is available', async () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, themeStub(), { estimateStorage: async () => ({ usage: 1234, quota: 5_000_000 }) })
    await ds.refresh()
    expect(ds.readDiagnostics().storage).toEqual({ usage: 1234, quota: 5_000_000 })
  })
  ```

- `data.test.ts`, test "readDiagnostics storage is null when the Storage API is unavailable": remove any `globalThis.navigator` manipulation and construct `createDataState(storage, themeStub())` with no `estimateStorage` (the default reports `null`). Keep its assertion unchanged.

Append to `data.test.ts`:

```ts
describe('createDataState injected diagnostics ports', () => {
  it('reports the injected build marker, defaulting to dev', async () => {
    expect(createDataState(fakeStorage(), themeStub()).readDiagnostics().build).toBe('dev')
    expect(createDataState(fakeStorage(), themeStub(), { build: 'abc123' }).readDiagnostics().build).toBe('abc123')
  })

  it('a rejecting estimateStorage still refreshes and reports storage: null', async () => {
    const ds = createDataState(fakeStorage(), themeStub(), { estimateStorage: async () => { throw new Error('quota api exploded') } })
    await expect(ds.refresh()).resolves.toBeUndefined()
    expect(ds.readDiagnostics().storage).toBeNull()
  })
})
```

Append inside the main `describe` of `bootstrap.test.ts`:

```ts
  it('mints outbox mutation ids from the injected newId', async () => {
    const storage = fakeStorage()
    const { repos } = makeRepositories(storage as any, { api: fakeApi(), newId: () => 'mutation-1' })
    await repos.notes.save(new Note({ occurredAt: new Date('2026-06-10T16:00:00Z'), text: 'hi' }))
    const outbox = JSON.parse(storage.getItem(OUTBOX_KEY) as string)
    expect(outbox[0].id).toBe('mutation-1')
  })

  it('fallbackId has the m-<time>-<rand> shape', () => {
    expect(fallbackId()).toMatch(/^m-\d+-[a-z0-9]+$/)
  })
```

(Add `fallbackId` to the test's `./bootstrap.js` import.)

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/client/data.test.ts src/client/storage/bootstrap.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Move and port `bootstrap.ts`**

```bash
git mv apps/vanilla-oyl/src/storage/bootstrap.js packages/all-of-oyl/src/client/storage/bootstrap.ts
```

Port per the recipe (domain imports from `'../../index.js'`; `OUTBOX_KEY`/`READ_CACHE_KEY` from `'./keys.js'`; `now` from `'./clock.js'`). The only logic change replaces the `globalThis.crypto` probe:

```ts
/** ES-only outbox mutation id (the browser passes crypto.randomUUID via makeRepositories' `newId`). */
export function fallbackId(): string {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
```

and in `makeRepositories(storage: StorageLike, opts: { api?: ApiClient, connectivity?: Connectivity, newId?: () => string } = {})`:

```ts
  const newId = opts.newId ?? fallbackId
  const outbox = createWriteOutbox(storage, OUTBOX_KEY, now, newId, () => { void flush().catch(() => {}) })
```

Delete the old local `newId()` function. Everything else is verbatim.

- [ ] **Step 4: Move and port `data.ts`**

```bash
git mv apps/vanilla-oyl/src/state/data.js packages/all-of-oyl/src/client/data.ts
```

Port per the recipe. Stores come from `'./stores/<name>.js'`, `makeRepositories`/`collectionCounts`/`decodeBootstrap`/`Repositories` from `'./storage/bootstrap.js'`, `readSchemaState`/`SchemaState` from `'./storage/schema.js'`, and `defaultTimezone` from `'./storage/clock.js'`. Changes from the JS:

```ts
export interface DataStateOptions {
  api?: ApiClient
  connectivity?: Connectivity
  repos?: Repositories
  outbox?: WriteOutbox
  timezone?: string
  bootstrap?: () => Promise<BootstrapPayload | undefined>
  /** Outbox mutation ids when repos are built here (browser: crypto.randomUUID). */
  newId?: () => string
  /** Best-effort quota probe for Status diagnostics (browser: navigator.storage.estimate). */
  estimateStorage?: StorageEstimator
  /** Build marker echoed by readDiagnostics(). */
  build?: string
}

export function createDataState<TTheme = unknown>(
  storage: Pick<EnumerableStorage, 'getItem' | 'setItem' | 'key' | 'length'>,
  themeState: { settings: { get(): TTheme } },
  opts: DataStateOptions = {},
) {
  const built = opts.repos
    ? { repos: opts.repos, outbox: opts.outbox }
    : makeRepositories(storage, {
        ...(opts.api ? { api: opts.api } : {}),
        ...(opts.connectivity ? { connectivity: opts.connectivity } : {}),
        ...(opts.newId ? { newId: opts.newId } : {}),
      })
  const estimateStorage: StorageEstimator = opts.estimateStorage ?? (async () => null)
  // … everything between here and readDiagnostics is verbatim from data.js …
```

Inside `readDiagnostics()`, the `build:` line becomes `build: opts.build ?? 'dev',`. The module-level `readStorageEstimate()` is replaced by a closure inside `createDataState` (keeping the never-throws contract):

```ts
  /** Best-effort; a rejecting probe reports null and never fails refresh(). */
  async function readStorageEstimate(): Promise<StorageEstimate | null> {
    try {
      return await estimateStorage()
    } catch {
      return null
    }
  }
```

Add at the end of the file: `export type DataState = ReturnType<typeof createDataState>`.

Extend `client/index.ts`:

```ts
export * from './storage/bootstrap.js'
export * from './data.js'
```

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/client` and `pnpm all-of typecheck:src`
Expected: PASS.

- [ ] **Step 5: Create the vanilla browser ports and wire `main.js`**

`apps/vanilla-oyl/src/storage/browser-ports.js`:

```js
import { fallbackId } from '@oyl/all-of-oyl/client'

/**
 * Real browser implementations of the client layer's id/diagnostics seams. The
 * @oyl/all-of-oyl/client defaults are ES-only fallbacks; main.js passes these in.
 * @param {{
 *   crypto?: { randomUUID?: () => string },
 *   navigator?: { storage?: { estimate?: () => Promise<{ usage?: number, quota?: number }> } },
 *   __OYL_LIB_BUILD__?: string,
 * }} g  globalThis-shaped
 */
export function browserDataPorts(g) {
  return {
    /** @returns {string} */
    newId: () => (g.crypto?.randomUUID ? g.crypto.randomUUID() : fallbackId()),
    /** @returns {Promise<{ usage: number, quota: number } | null>} */
    estimateStorage: async () => {
      const nav = g.navigator
      if (nav?.storage?.estimate) {
        const { usage, quota } = await nav.storage.estimate()
        return { usage: usage ?? 0, quota: quota ?? 0 }
      }
      return null
    },
    build: g.__OYL_LIB_BUILD__ ?? 'dev',
  }
}
```

In `apps/vanilla-oyl/src/main.js` (after the Task 2–4 codemods, `makeRepositories`/`createDataState` already import from `'@oyl/all-of-oyl/client'` once this task's codemod runs):
- add `import { browserDataPorts } from './storage/browser-ports.js'`
- replace the two composition lines:

```js
  const ports = browserDataPorts(globalThis)
  const { repos, outbox, flush } = makeRepositories(storage, { api, connectivity, newId: ports.newId })
```

```js
  const dataState = createDataState(storage, themeState, { repos, outbox, timezone: tz, bootstrap: () => api.bootstrap(), estimateStorage: ports.estimateStorage, build: ports.build })
```

- [ ] **Step 6: Re-point vanilla and run everything**

```bash
node apps/vanilla-oyl/scripts/repoint-client-imports.mjs src/storage/bootstrap.js src/state/data.js
```

Run: `pnpm vanilla exec vitest run src/storage/browser-ports.test.js`. Expected: PASS. Then run the per-task gate, then the **e2e gate**.
Expected: all green; combined count ≥ the Task 4 total + 9 (5 browser-ports, 2 data seams, 2 bootstrap seams).

- [ ] **Step 7: Commit**

```bash
git add -A packages/all-of-oyl/src/client apps/vanilla-oyl
git commit -m "refactor(client): move bootstrap + data wiring; inject newId, estimateStorage, build

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Move the session layer (`auth`, `auth-guard`, `route`) with the route seams

**Files:**
- Move: `apps/vanilla-oyl/src/state/{auth,auth-guard,route}.js` (+ tests) → `packages/all-of-oyl/src/client/session/*.ts` (+ `.test.ts`)
- Modify: `apps/vanilla-oyl/src/main.js`, `client/index.ts`
- Unchanged (stays in vanilla): `apps/vanilla-oyl/src/state/link-interceptor.js` (+ test)

**Interfaces:**
- Consumes: `signal`/`Signal` (Task 2), `AUTH_KEY` (Task 3), `resolveTimezone` (Task 4), `RouteWindow`/`LocationLike`/`HistoryLike`/`EnumerableStorage`/`FetchFn` (Task 1), `fakeRouteWindow` (Task 1).
- Produces (barrel):
  - `auth.ts`: `type AuthUser`, `type AuthSession`, `createAuthState(storage: Pick<EnumerableStorage, 'getItem' | 'setItem' | 'removeItem'>, opts: { baseUrl: string, fetch: FetchFn })` (same returned API, incl. `adoptTokenFromHash(win: { location: Pick<LocationLike, 'hash' | 'pathname' | 'search'>, history: Pick<HistoryLike, 'replaceState'> })`), `googleErrorMessage(code: string): string`
  - `auth-guard.ts`: `shouldRedirectToLogin(mode: 'local' | 'remote', session: object | null, route: string): boolean`, `tzNeedsReload(builtTz: string, profile: User | null, browserTz: string): boolean`
  - `route.ts`: `type Navigate = (path: string, opts?: { replace?: boolean }) => void`, `interface RouteOptions { interceptLinks?: (navigate: Navigate) => () => void }`, `interface RouteState { route: Signal<string>; navigate: Navigate; start(): void; stop(): void }`, `parsePath(pathname: string): string`, `createRouteState(win: RouteWindow, opts?: RouteOptions): RouteState`

- [ ] **Step 1: Move auth + guard tests; rewrite the route test against the fake window**

```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
mkdir -p packages/all-of-oyl/src/client/session
for f in auth auth-guard route; do git mv apps/vanilla-oyl/src/state/$f.test.js packages/all-of-oyl/src/client/session/$f.test.ts; done
```

`auth.test.ts` and `auth-guard.test.ts`: port per the test recipe. They already inject fake `fetch` and fake `win` objects. Domain imports come from `'../../index.js'`.

Replace the whole of `client/session/route.test.ts` with the same 11 tests running on `fakeRouteWindow`, plus 3 seam tests:

```ts
import { describe, expect, it, vi } from 'vitest'
import { parsePath, createRouteState } from './route.js'
import { fakeRouteWindow } from './route-window-fake.js'

describe('parsePath', () => {
  it('defaults root/empty to status', () => {
    expect(parsePath('/')).toBe('status')
    expect(parsePath('')).toBe('status')
  })

  it('extracts the first path segment', () => {
    expect(parsePath('/status')).toBe('status')
    expect(parsePath('/journal')).toBe('journal')
    expect(parsePath('/journal/today')).toBe('journal')
  })

  it('handles trailing slashes and query strings', () => {
    expect(parsePath('/journal/')).toBe('journal')
    expect(parsePath('/journal?seed')).toBe('journal')
  })
})

describe('createRouteState', () => {
  it('initializes the signal from the current pathname', () => {
    const win = fakeRouteWindow('/planner')
    const rs = createRouteState(win)
    expect(rs.route.get()).toBe('planner')
  })

  it('navigate() pushes state and updates the signal', () => {
    const win = fakeRouteWindow('/journal')
    const rs = createRouteState(win)
    rs.navigate('/vault')
    expect(win.location.pathname).toBe('/vault')
    expect(rs.route.get()).toBe('vault')
  })

  it('navigate() preserves the query in the URL but not the route name', () => {
    const win = fakeRouteWindow('/journal')
    const rs = createRouteState(win)
    rs.navigate('/journal?seed')
    expect(win.location.pathname).toBe('/journal')
    expect(win.location.search).toBe('?seed')
    expect(rs.route.get()).toBe('journal')
  })

  it('navigate() to the current path does not push state', () => {
    const win = fakeRouteWindow('/vault')
    const rs = createRouteState(win)
    const spy = vi.spyOn(win.history, 'pushState')
    rs.navigate('/vault')
    expect(spy).not.toHaveBeenCalled()
  })

  it('start() makes the signal track popstate', () => {
    const win = fakeRouteWindow('/journal')
    const rs = createRouteState(win)
    rs.start()
    win.history.pushState({}, '', '/goals')
    win.dispatch('popstate')
    expect(rs.route.get()).toBe('goals')
    rs.stop()
  })

  it('start() redirects / to /status, preserving the query', () => {
    const win = fakeRouteWindow('/?seed')
    const rs = createRouteState(win)
    rs.start()
    expect(win.location.pathname).toBe('/status')
    expect(win.location.search).toBe('?seed')
    expect(rs.route.get()).toBe('status')
    rs.stop()
  })

  it('navigate(path, { replace: true }) uses replaceState and does not grow history', () => {
    const win = fakeRouteWindow('/journal')
    const rs = createRouteState(win)
    const lenBefore = win.history.length
    const pushSpy = vi.spyOn(win.history, 'pushState')
    const replaceSpy = vi.spyOn(win.history, 'replaceState')
    rs.navigate('/login', { replace: true })
    expect(win.location.pathname).toBe('/login')
    expect(rs.route.get()).toBe('login')
    expect(pushSpy).not.toHaveBeenCalled()
    expect(replaceSpy).toHaveBeenCalled()
    expect(win.history.length).toBe(lenBefore)
  })

  it('navigate(path) default still uses pushState', () => {
    const win = fakeRouteWindow('/journal')
    const rs = createRouteState(win)
    const pushSpy = vi.spyOn(win.history, 'pushState')
    rs.navigate('/vault')
    expect(pushSpy).toHaveBeenCalled()
  })
})

describe('createRouteState seams', () => {
  it('resolves paths against the origin via win.URL (relative and query-only included)', () => {
    const win = fakeRouteWindow('/journal/2026-06-16')
    const rs = createRouteState(win)
    rs.navigate('planner/today')
    expect(win.location.pathname).toBe('/planner/today')
    expect(rs.route.get()).toBe('planner')
    rs.navigate('?seed')
    expect(win.location.pathname + win.location.search).toBe('/?seed')
    expect(rs.route.get()).toBe('status')
  })

  it('start() installs the injected link interceptor with navigate; stop() disposes it', () => {
    const win = fakeRouteWindow('/journal')
    const dispose = vi.fn()
    const interceptLinks = vi.fn(() => dispose)
    const rs = createRouteState(win, { interceptLinks })
    expect(interceptLinks).not.toHaveBeenCalled()
    rs.start()
    expect(interceptLinks).toHaveBeenCalledWith(rs.navigate)
    rs.stop()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('works without an interceptor (start/stop are safe)', () => {
    const rs = createRouteState(fakeRouteWindow('/journal'))
    expect(() => { rs.start(); rs.stop() }).not.toThrow()
  })
})
```

(The relative/query-only expectations pin today's behavior: `new URL(path, win.location.origin)` resolves against the origin, not the current path.)

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/client/session`
Expected: FAIL (modules missing).

- [ ] **Step 2: Move and port the modules**

```bash
for f in auth auth-guard route; do git mv apps/vanilla-oyl/src/state/$f.js packages/all-of-oyl/src/client/session/$f.ts; done
```

- `auth.ts`: port per the recipe. `fetch: typeof globalThis.fetch` → `fetch: FetchFn`; the JSDoc `AppStorage` becomes a non-exported `type AppStorage = Pick<EnumerableStorage, 'getItem' | 'setItem' | 'removeItem'>`; the `adoptTokenFromHash` parameter uses the `Pick<LocationLike…>`/`Pick<HistoryLike…>` shape above. Bodies are verbatim.
- `auth-guard.ts`: `import { resolveTimezone } from '../stores/profile.js'`, `import type { User } from '../../index.js'`. Bodies are verbatim.
- `route.ts` (full file):

```ts
import { signal, type Signal } from '../reactive/signal.js'
import type { RouteWindow } from '../ports.js'

export type Navigate = (path: string, opts?: { replace?: boolean }) => void

export interface RouteOptions {
  /** Install app-level link interception (vanilla: delegated anchor clicks); returns its disposer. */
  interceptLinks?: (navigate: Navigate) => () => void
}

export interface RouteState {
  route: Signal<string>
  navigate: Navigate
  start(): void
  stop(): void
}

/** Route name = first path segment (the seam for future nested routes); '' and '/' → 'status'. */
export function parsePath(pathname: string): string {
  const path = pathname.replace(/[?#].*$/, '').replace(/^\//, '')
  return path.split('/')[0] || 'status'
}

/** History-API route state: a route-name signal fed by navigate() and popstate. */
export function createRouteState(win: RouteWindow, opts: RouteOptions = {}): RouteState {
  const route = signal(parsePath(win.location.pathname))
  const onPop = () => route.set(parsePath(win.location.pathname))

  /** Pass `replace: true` to use replaceState (no history growth). */
  const navigate: Navigate = (path, { replace = false } = {}) => {
    const url = new win.URL(path, win.location.origin)
    // Reconstruct the full path with search parameters
    const fullPath = url.pathname + url.search
    // Only skip if both pathname and search are identical
    if (fullPath === win.location.pathname + win.location.search) return
    if (replace) win.history.replaceState({}, '', fullPath)
    else win.history.pushState({}, '', fullPath)
    route.set(parsePath(url.pathname))
  }

  let stopLinks: () => void = () => {}

  return {
    route,
    navigate,
    start() {
      win.history.scrollRestoration = 'manual'
      // Canonical home: '/' redirects to '/status' (keep any ?seed query so
      // the dev seed flow in main.js still fires).
      if (win.location.pathname === '/') {
        win.history.replaceState({}, '', '/status' + win.location.search)
        route.set('status')
      }
      win.addEventListener('popstate', onPop)
      stopLinks = opts.interceptLinks ? opts.interceptLinks(navigate) : () => {}
    },
    stop() {
      win.removeEventListener('popstate', onPop)
      stopLinks()
    },
  }
}
```

Before deleting the JS, diff its doc comments against this file and carry over any wording that differs. Doc comments are documentation, not behavior, but they should survive the move.

Extend `client/index.ts`:

```ts
export * from './session/auth.js'
export * from './session/auth-guard.js'
export * from './session/route.js'
```

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/client/session`
Expected: PASS.

- [ ] **Step 3: Re-point vanilla and wire the interceptor**

```bash
node apps/vanilla-oyl/scripts/repoint-client-imports.mjs src/state/auth.js src/state/auth-guard.js src/state/route.js
```

In `apps/vanilla-oyl/src/main.js`:
- add `import { interceptLinks } from './state/link-interceptor.js'`
- `const routeState = createRouteState(window)` becomes:

```js
  const routeState = createRouteState(window, { interceptLinks: (navigate) => interceptLinks(window, navigate) })
```

- [ ] **Step 4: Run the per-task gate**

Expected: all green (the e2e `routing.spec.ts`/`auth.spec.ts` run in Task 7's final e2e gate); combined count ≥ the Task 5 total + 3.

- [ ] **Step 5: Commit**

```bash
git add -A packages/all-of-oyl/src/client apps/vanilla-oyl
git commit -m "refactor(client): move auth, auth-guard and route state; inject URL + link interception

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Move seed + backup, then the final e2e gate

**Files:**
- Move: `apps/vanilla-oyl/src/storage/{seed,backup}.js` (+ tests) → `packages/all-of-oyl/src/client/storage/{seed,backup}.ts` (+ `.test.ts`)
- Modify: `client/index.ts`
- Unchanged: the `download()` helper and import-file handling in `apps/vanilla-oyl/src/main.js` (they're the DOM part and stay)

**Interfaces:**
- Consumes: `DataState` (Task 5), `CURRENT_SCHEMA_VERSION` (Task 3), `SETTINGS_KEY` (Task 3), `now` (Task 3), domain `COLLECTIONS`, `makeSeed`, `DayRange`, `Id`, `DayKey` via `'../../index.js'`.
- Produces (barrel): `type Dataset`, `loadDataset(dataState: DataState, dataset: Dataset): Promise<{ added: number, skipped: number }>`, `remapIds(dataset: Dataset, newId?: () => string): Dataset` (same return as the JS), `seedAccount(dataState: DataState, today: DayKey)` (same return as the JS), `type BackupDoc`, `exportData(storage: Pick<StorageLike, 'getItem'>, dataState: DataState): BackupDoc`, `importData(dataState: DataState, json: string): Promise<{ added: number, skipped: number }>`.

- [ ] **Step 1: Move the tests**

```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
for f in seed backup; do git mv apps/vanilla-oyl/src/storage/$f.test.js packages/all-of-oyl/src/client/storage/$f.test.ts; done
```

Port per the test recipe. Wherever a test builds a theme state with vanilla's `createThemeState`, use `themeStub()` from `'../data-fake.js'`. Where it uses a global `localStorage`, use `memoryStorage()` from `'./memory-storage-fake.js'`.

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/client/storage/seed.test.ts src/client/storage/backup.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 2: Move and port the modules**

```bash
for f in seed backup; do git mv apps/vanilla-oyl/src/storage/$f.js packages/all-of-oyl/src/client/storage/$f.ts; done
```

- `seed.ts`: the `DataState` typedef becomes `import type { DataState } from '../data.js'`; `Dataset` becomes an exported type, verbatim. The only logic-adjacent change is the `remapIds` default id source: `newId: () => string = () => Id.create()` (`Id` from `'../../index.js'`). `core/id.ts`'s `Id.create()` is `crypto.randomUUID()`, so behavior is identical with no new global probe.
- `backup.ts`: `BackupDoc` becomes an exported type, verbatim; the JSDoc `AppStorage` becomes a non-exported `type AppStorage = Pick<StorageLike, 'getItem'>`; imports become `./schema.js`, `./keys.js`, `./clock.js`, `./seed.js`, `'../../index.js'`. Bodies are verbatim.

Extend `client/index.ts`:

```ts
export * from './storage/seed.js'
export * from './storage/backup.js'
```

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/client/storage`
Expected: PASS.

- [ ] **Step 3: Re-point vanilla**

```bash
node apps/vanilla-oyl/scripts/repoint-client-imports.mjs src/storage/seed.js src/storage/backup.js
```

- [ ] **Step 4: Verify the boundary matches the spec**

```bash
ls apps/vanilla-oyl/src/lib/reactive apps/vanilla-oyl/src/state apps/vanilla-oyl/src/storage
```

Expected exactly:
- `lib/reactive`: `oyl-element.js`, `oyl-element.test.js`
- `state`: `layout.js`, `layout.test.js`, `link-interceptor.js`, `link-interceptor.test.js`, `theme.js`, `theme.test.js`
- `storage`: `browser-ports.js`, `browser-ports.test.js`

- [ ] **Step 5: Run the per-task gate and the final e2e gate**

Expected: all green; the e2e suite passes with no edits under `apps/e2e-oyl/`; combined unit count ≥ 1146 (1126 + 20 new: Task 1 ×5, Task 2 ×3, Task 5 ×9, Task 6 ×3).

- [ ] **Step 6: Commit**

```bash
git add -A packages/all-of-oyl/src/client apps/vanilla-oyl
git commit -m "refactor(client): move seed and backup serialization into @oyl/all-of-oyl/client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Docs, codemod removal, final verification

**Files:**
- Delete: `apps/vanilla-oyl/scripts/repoint-client-imports.mjs`
- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-10-06-extract-client-layer-design.md`

**Interfaces:**
- Consumes: the finished branch (Tasks 1–7).
- Produces: documentation only.

- [ ] **Step 1: Delete the one-off codemod**

```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git rm apps/vanilla-oyl/scripts/repoint-client-imports.mjs
grep -rn "repoint-client-imports" --exclude-dir=node_modules --exclude-dir=.git . | grep -v "docs/superpowers"
```

Expected: the grep prints nothing.

- [ ] **Step 2: Update CLAUDE.md**

Make these edits:
1. In the `@oyl/all-of-oyl` Packages row, after the sentence about `/format`, insert: ``/client` → `src/client/` (the shared client state layer: signals core `signal`/`computed`/`effect`, domain stores, bootstrap/outbox/flusher wiring (`makeRepositories`, `createDataState`), auth/route session state, seed/backup serialization; browser globals arrive via `src/client/ports.ts`; never re-exported from the root barrel).``
2. In the `@oyl/vanilla-oyl` row, change "a signals reactive core (`src/lib/reactive/`)" to "the shared signals core from `@oyl/all-of-oyl/client` (vanilla keeps only its `OylElement` base in `src/lib/reactive/`)".
3. In "Conventions and gotchas", the first bullet's sentence about the importmap becomes: "it carries importmap entries + vendored copies for `/format` and `/client` too".
4. Add a bullet to "Conventions and gotchas":
   ```
   - **Client state lives in `@oyl/all-of-oyl/client`, never in an app.** Stores, the signals core, bootstrap/outbox wiring and session state are shared by vanilla-oyl and the upcoming stencil-oyl. App-only pieces stay app-side: vanilla's `OylElement`, `link-interceptor`, theme/layout state, and `storage/browser-ports.js` (real `crypto.randomUUID` / `navigator.storage.estimate` / build marker, passed into `makeRepositories`/`createDataState`). **Exactly one copy of the reactive core may load**: never deep-import `@oyl/all-of-oyl/client/...` or keep a local `signal.js` (two tracking contexts = screens silently stop updating; `apps/vanilla-oyl/test/client-entry.test.js` guards it).
   ```

- [ ] **Step 3: Update the spec**

In `docs/superpowers/specs/2026-10-06-extract-client-layer-design.md`:
- Change `**Status:** Approved design; not yet implemented` to `**Status:** Implemented on branch refactor/extract-client-layer (plan: docs/superpowers/plans/2026-10-06-extract-client-layer.md)`.
- Add a section `## Amendments during planning` after "Success criteria", containing the five numbered amendments from this plan's "Spec amendments" section verbatim.
- In "Success criteria", change the `apps/vanilla-oyl/src/storage/` sentence to: "`apps/vanilla-oyl/src/storage/` contains only `browser-ports.js` (+ test)."
- In the boundary "Stays in vanilla-oyl" list, delete the bullet about `storage/backup.js` being reduced to the download, and add: "the backup *download* helper in `main.js` (anchor click via `URL.createObjectURL`)."

- [ ] **Step 4: Verify the deploy/Docker risks from the spec**

```bash
grep -n "importmap\|sha256\|hash" scripts/dreamhost/publish-www.sh | head -20
```

Expected: the inline-script CSP hash is computed from `index.html` at publish time (not hard-coded), so the new importmap line needs no deploy change. If root `.env` has `OYL_DH_*` set, also run `pnpm deploy:dreamhost --dry-run --only www` and expect success. If Docker is running, run `docker compose build vanilla` and expect success. If either isn't available locally, say so in the final report instead of claiming it passed.

- [ ] **Step 5: Final full verification**

```bash
pnpm --filter @oyl/all-of-oyl test
pnpm all-of typecheck:src
pnpm --filter @oyl/all-of-oyl exec tsc --noEmit
pnpm all-of build
pnpm vanilla test
pnpm vanilla typecheck
pnpm typecheck
git diff --stat master -- apps/e2e-oyl
```

Expected: all green; combined unit count ≥ 1146; `git diff --stat master -- apps/e2e-oyl` prints nothing (no e2e spec edits). Task 7's e2e run on the same code is the e2e evidence; re-run `pnpm e2e` only if Tasks 7–8 touched anything beyond docs and the codemod deletion.

- [ ] **Step 6: Commit**

```bash
git add -A CLAUDE.md docs/superpowers/specs/2026-10-06-extract-client-layer-design.md apps/vanilla-oyl/scripts
git commit -m "docs: record the @oyl/all-of-oyl/client layer; drop the one-off codemod

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
