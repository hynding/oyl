# vanilla-oyl HTML5 History API Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace vanilla-oyl's hash routing (`/#/journal`) with HTML5 History API routing (`/journal`), at parity with today's top-level routes.

**Architecture:** Keep the route signal a `Signal<string>` route-name so `oyl-router`/`oyl-nav` contracts are unchanged. `route.js` reads `location.pathname` + `popstate` and gains a `navigate()`; a new `link-interceptor.js` captures same-origin anchor clicks (pushState fires no event). `index.html` switches to root-absolute asset paths; `http-server` gets an SPA-fallback proxy flag.

**Tech Stack:** Vanilla JS + JSDoc (checkJs), the in-repo signals reactive core, Vitest + happy-dom, http-server.

Spec: `docs/superpowers/specs/2026-06-16-vanilla-oyl-history-routing-design.md`

## Global Constraints

- Zero runtime dependencies; vanilla JS + JSDoc only. `pnpm vanilla typecheck` (tsc `--noEmit`, checkJs) must stay green.
- DOM/Web globals (`window`, `document`, `HTMLAnchorElement`, `URL`) may be used directly — this is the browser app, NOT `@oyl/all-of-oyl/src`.
- Tests assert observable behavior (shadowRoot/props/signals), never internals. happy-dom is the test env (verified to support `pushState`→`pathname`, `popstate`, `composedPath()` across shadow, `instanceof HTMLAnchorElement`).
- Definition of Done for the whole feature: `pnpm vanilla test` and `pnpm vanilla typecheck` green; manual checks (see final task).
- Git: branch off `master`; commit per task with a clear prefix; end each commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: `link-interceptor.js` — capture same-origin anchor clicks

**Files:**
- Create: `apps/vanilla-oyl/src/state/link-interceptor.js`
- Test: `apps/vanilla-oyl/src/state/link-interceptor.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `interceptLinks(win: Window, navigate: (path: string) => void) => (() => void)`. Attaches one delegated `click` listener on `win.document`; calls `navigate(pathname + search)` + `preventDefault()` for eligible links; returns a `stop()` that removes the listener.

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/state/link-interceptor.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { interceptLinks } from './link-interceptor.js'

/** A left-click MouseEvent that bubbles and crosses shadow boundaries. */
function clickEvent(init = {}) {
  return new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, button: 0, ...init })
}

describe('interceptLinks', () => {
  it('intercepts a same-origin left-click and calls navigate', () => {
    /** @type {string[]} */ const calls = []
    const stop = interceptLinks(window, (p) => calls.push(p))
    const a = document.createElement('a')
    a.href = '/journal'
    document.body.append(a)
    const e = clickEvent()
    a.dispatchEvent(e)
    expect(calls).toEqual(['/journal'])
    expect(e.defaultPrevented).toBe(true)
    a.remove()
    stop()
  })

  it('preserves the query string', () => {
    /** @type {string[]} */ const calls = []
    const stop = interceptLinks(window, (p) => calls.push(p))
    const a = document.createElement('a')
    a.href = '/journal?seed'
    document.body.append(a)
    a.dispatchEvent(clickEvent())
    expect(calls).toEqual(['/journal?seed'])
    a.remove()
    stop()
  })

  it('ignores modifier-clicks (lets the browser open a new tab)', () => {
    /** @type {string[]} */ const calls = []
    const stop = interceptLinks(window, (p) => calls.push(p))
    const a = document.createElement('a')
    a.href = '/journal'
    document.body.append(a)
    const e = clickEvent({ metaKey: true })
    a.dispatchEvent(e)
    expect(calls).toEqual([])
    expect(e.defaultPrevented).toBe(false)
    a.remove()
    stop()
  })

  it('ignores target, download, and rel="external" anchors', () => {
    /** @type {string[]} */ const calls = []
    const stop = interceptLinks(window, (p) => calls.push(p))
    /** @type {Array<(a: HTMLAnchorElement) => void>} */
    const mutations = [
      (a) => { a.target = '_blank' },
      (a) => { a.setAttribute('download', '') },
      (a) => { a.setAttribute('rel', 'external') },
    ]
    for (const mutate of mutations) {
      const a = document.createElement('a')
      a.href = '/journal'
      mutate(a)
      document.body.append(a)
      a.dispatchEvent(clickEvent())
      a.remove()
    }
    expect(calls).toEqual([])
    stop()
  })

  it('ignores cross-origin links', () => {
    /** @type {string[]} */ const calls = []
    const stop = interceptLinks(window, (p) => calls.push(p))
    const a = document.createElement('a')
    a.href = 'https://example.com/x'
    document.body.append(a)
    a.dispatchEvent(clickEvent())
    expect(calls).toEqual([])
    a.remove()
    stop()
  })

  it('finds the anchor across a shadow boundary', () => {
    /** @type {string[]} */ const calls = []
    const stop = interceptLinks(window, (p) => calls.push(p))
    const host = document.createElement('div')
    document.body.append(host)
    const root = host.attachShadow({ mode: 'open' })
    const a = document.createElement('a')
    a.href = '/vault'
    root.append(a)
    a.dispatchEvent(clickEvent())
    expect(calls).toEqual(['/vault'])
    host.remove()
    stop()
  })

  it('stop() removes the listener', () => {
    /** @type {string[]} */ const calls = []
    const stop = interceptLinks(window, (p) => calls.push(p))
    stop()
    const a = document.createElement('a')
    a.href = '/journal'
    document.body.append(a)
    a.dispatchEvent(clickEvent())
    expect(calls).toEqual([])
    a.remove()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/link-interceptor.test.js`
Expected: FAIL — `Failed to resolve import './link-interceptor.js'` (module not created yet).

- [ ] **Step 3: Write the minimal implementation**

Create `apps/vanilla-oyl/src/state/link-interceptor.js`:

```js
/**
 * Intercept same-origin left-clicks on anchors and route them client-side.
 * pushState fires no navigation event, so anchor clicks must be captured
 * manually. Attaches a single delegated click listener on `win.document`,
 * which sees clicks composed out of component shadow roots (e.g. <oyl-nav>).
 * @param {Window} win
 * @param {(path: string) => void} navigate  receives `pathname` + optional `?search`
 * @returns {() => void} stop  remove the listener
 */
export function interceptLinks(win, navigate) {
  /** @param {Event} event */
  const onClick = (event) => {
    const e = /** @type {MouseEvent} */ (event)
    if (e.defaultPrevented || e.button !== 0) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const anchor = findAnchor(e.composedPath())
    if (!anchor) return
    if (anchor.target || anchor.hasAttribute('download') || anchor.getAttribute('rel') === 'external') return
    const url = new URL(anchor.href, win.location.href)
    if (url.origin !== win.location.origin) return
    // Same-page hash link: let the browser handle native scroll.
    if (url.pathname === win.location.pathname && url.hash) return
    e.preventDefault()
    navigate(url.pathname + url.search)
  }
  win.document.addEventListener('click', onClick)
  return () => win.document.removeEventListener('click', onClick)
}

/**
 * First HTMLAnchorElement on the event's composed path (crosses shadow roots).
 * SVG `<a>` (SVGAElement) is intentionally excluded — it is not an
 * HTMLAnchorElement and its `href` is not a string.
 * @param {EventTarget[]} path
 * @returns {HTMLAnchorElement | null}
 */
function findAnchor(path) {
  for (const node of path) {
    if (node instanceof HTMLAnchorElement) return node
  }
  return null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/link-interceptor.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/state/link-interceptor.js apps/vanilla-oyl/src/state/link-interceptor.test.js
git commit -m "feat(vanilla-oyl): add same-origin link interceptor for History routing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `route.js` — History API route state

**Files:**
- Modify (full rewrite): `apps/vanilla-oyl/src/state/route.js`
- Test (rewrite): `apps/vanilla-oyl/src/state/route.test.js`

**Interfaces:**
- Consumes: `signal` from `../lib/reactive/signal.js`; `interceptLinks` from `./link-interceptor.js` (Task 1).
- Produces:
  - `parsePath(pathname: string) => string` — first path segment, default `'status'`.
  - `createRouteState(win?: Window) => { route: Signal<string>, navigate: (path: string) => void, start: () => void, stop: () => void }`. `route` and `start`/`stop` keep their existing names/shapes (main.js, oyl-nav, oyl-router already consume them); `navigate` is additive.

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `apps/vanilla-oyl/src/state/route.test.js`:

```js
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { parsePath, createRouteState } from './route.js'

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
  beforeEach(() => {
    window.history.replaceState({}, '', '/journal')
  })

  it('initializes the signal from the current pathname', () => {
    window.history.replaceState({}, '', '/planner')
    const rs = createRouteState(window)
    expect(rs.route.get()).toBe('planner')
  })

  it('navigate() pushes state and updates the signal', () => {
    const rs = createRouteState(window)
    rs.navigate('/vault')
    expect(window.location.pathname).toBe('/vault')
    expect(rs.route.get()).toBe('vault')
  })

  it('navigate() preserves the query in the URL but not the route name', () => {
    const rs = createRouteState(window)
    rs.navigate('/journal?seed')
    expect(window.location.pathname).toBe('/journal')
    expect(window.location.search).toBe('?seed')
    expect(rs.route.get()).toBe('journal')
  })

  it('navigate() to the current path does not push state', () => {
    window.history.replaceState({}, '', '/vault')
    const rs = createRouteState(window)
    const spy = vi.spyOn(window.history, 'pushState')
    rs.navigate('/vault')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('start() makes the signal track popstate', () => {
    const rs = createRouteState(window)
    rs.start()
    window.history.pushState({}, '', '/goals')
    window.dispatchEvent(new Event('popstate'))
    expect(rs.route.get()).toBe('goals')
    rs.stop()
  })

  it('start() redirects / to /status, preserving the query', () => {
    window.history.replaceState({}, '', '/?seed')
    const rs = createRouteState(window)
    rs.start()
    expect(window.location.pathname).toBe('/status')
    expect(window.location.search).toBe('?seed')
    expect(rs.route.get()).toBe('status')
    rs.stop()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/route.test.js`
Expected: FAIL — `parsePath is not a function` / `parseHash` import errors (route.js still exports the old hash API).

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `apps/vanilla-oyl/src/state/route.js`:

```js
import { signal } from '../lib/reactive/signal.js'
import { interceptLinks } from './link-interceptor.js'

/**
 * Extract the active route name from a URL pathname. Strips any query/hash and
 * a leading slash, then returns the first path segment — the seam where nested
 * routes (`/journal/:date`) slot in later — defaulting to `'status'`.
 * @param {string} pathname
 * @returns {string}
 */
export function parsePath(pathname) {
  const path = pathname.replace(/[?#].*$/, '').replace(/^\//, '')
  return path.split('/')[0] || 'status'
}

/**
 * A route signal fed by the History API. Call start() once at boot; returns the
 * signal, an imperative navigate(), and a stop() for teardown (tests).
 * @param {Window} win
 */
export function createRouteState(win = window) {
  const route = signal(parsePath(win.location.pathname))
  const onPop = () => route.set(parsePath(win.location.pathname))

  /** @param {string} path  `pathname` + optional `?search` to navigate to */
  const navigate = (path) => {
    const url = new URL(path, win.location.origin)
    // Compare the full pathname+search so a query-only change (e.g. ?seed)
    // still navigates — a pathname-only guard would no-op it and fail the
    // "preserves the query" test.
    const fullPath = url.pathname + url.search
    if (fullPath === win.location.pathname + win.location.search) return
    win.history.pushState({}, '', fullPath)
    route.set(parsePath(url.pathname))
  }

  /** @type {() => void} */
  let stopLinks = () => {}

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
      stopLinks = interceptLinks(win, navigate)
    },
    stop() {
      win.removeEventListener('popstate', onPop)
      stopLinks()
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/route.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/state/route.js apps/vanilla-oyl/src/state/route.test.js
git commit -m "feat(vanilla-oyl): route state via History API (pathname + popstate + navigate)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `oyl-nav.js` — clean-path hrefs

**Files:**
- Modify: `apps/vanilla-oyl/src/components/oyl-nav.js:43` (the `a.href` assignment)
- Test: `apps/vanilla-oyl/src/components/oyl-nav.test.js:19,35`

**Interfaces:**
- Consumes: the `routeSignal` (`Signal<string>`) — unchanged.
- Produces: anchors with `href="/${route}"` instead of `href="#/${route}"`.

- [ ] **Step 1: Update the failing test**

In `apps/vanilla-oyl/src/components/oyl-nav.test.js`, change the two href assertions:

Line 19: `expect(journalLink.getAttribute('href')).toBe('#/journal')` → `expect(journalLink.getAttribute('href')).toBe('/journal')`

Line 35: `expect(link.getAttribute('href')).toBe('#/planner')` → `expect(link.getAttribute('href')).toBe('/planner')`

Also update the `it(...)` description on line 28 from `'includes a Planner link to #/planner and marks it active'` to `'includes a Planner link to /planner and marks it active'`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-nav.test.js`
Expected: FAIL — received `'#/journal'`, expected `'/journal'` (and the planner case).

- [ ] **Step 3: Update the implementation**

In `apps/vanilla-oyl/src/components/oyl-nav.js`, change line 43:

```js
      a.href = `/${route}`
```

(Was `a.href = \`#/${route}\``.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-nav.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-nav.js apps/vanilla-oyl/src/components/oyl-nav.test.js
git commit -m "feat(vanilla-oyl): nav links use clean paths (/journal not #/journal)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `index.html` + `package.json` — absolute asset paths and SPA fallback

**Files:**
- Modify: `apps/vanilla-oyl/index.html:20-24,27,29,30,36`
- Modify: `apps/vanilla-oyl/package.json` (`dev`, `dev:watch` scripts)

**Interfaces:**
- Consumes: nothing.
- Produces: deep paths (`/journal`) load the app from a single `index.html` with root-absolute asset URLs; `http-server` serves `index.html` for unresolved paths.

This task has no unit test (static config). It is verified by `pnpm vanilla test` + `pnpm vanilla typecheck` staying green and by the manual check in Task 5's DoD.

- [ ] **Step 1: Make asset paths root-absolute in `index.html`**

Change these lines (drop the leading `.`):

- Line 20: `<link rel="stylesheet" href="/styles/reset.css" />`
- Line 21: `<link rel="stylesheet" href="/styles/tokens.css" />`
- Line 22: `<link rel="stylesheet" href="/styles/themes/classic.css" />`
- Line 23: `<link rel="stylesheet" href="/styles/themes/forest.css" />`
- Line 24: `<link rel="stylesheet" href="/styles/layout.css" />`
- Line 27 (importmap): `{ "imports": { "@oyl/all-of-oyl": "/vendor/all-of-oyl/index.js" } }`
- Line 29: `<link rel="modulepreload" href="/vendor/all-of-oyl/index.js" />`
- Line 30: `<link rel="modulepreload" href="/src/main.js" />`
- Line 36: `<script type="module" src="/src/main.js"></script>`

(The anti-FOUC inline script at the top uses no URLs — leave it untouched.)

- [ ] **Step 2: Add the SPA-fallback proxy to `package.json`**

In `apps/vanilla-oyl/package.json`, change the two scripts:

```json
    "dev": "pnpm build:lib && http-server -c-1 -p 8041 --proxy http://localhost:8041?",
    "dev:watch": "pnpm build:lib && http-server -c-1 -p 8041 --proxy http://localhost:8041?",
```

- [ ] **Step 3: Verify the app still builds and the suite is green**

Run: `pnpm vanilla test && pnpm vanilla typecheck`
Expected: all tests PASS, typecheck clean.

- [ ] **Step 4: Manually verify the SPA fallback + deep load**

Run (in one shell): `pnpm vanilla dev`
Then in another shell:

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:8041/journal
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:8041/journal/2026-06-16
```

Expected: both `200 text/html; charset=UTF-8`. Open `http://localhost:8041/journal` in a browser — the Journal screen renders (no 404, no missing-asset console errors), nav clicks change the URL without a full reload, and browser back/forward work. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/index.html apps/vanilla-oyl/package.json
git commit -m "feat(vanilla-oyl): absolute asset paths + http-server SPA fallback

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Docs and stray-reference cleanup

**Files:**
- Modify: `CLAUDE.md:16` (the `#/status` reference)
- Modify: `apps/vanilla-oyl/src/components/oyl-journal.test.js:47` (test description string)

**Interfaces:**
- Consumes: nothing.
- Produces: docs/tests free of `#/` route references.

- [ ] **Step 1: Update the CLAUDE.md Status-screen reference**

In `CLAUDE.md` line 16, change `Status screen at \`#/status\`` to `Status screen at \`/status\``.

- [ ] **Step 2: Update the journal test description string**

In `apps/vanilla-oyl/src/components/oyl-journal.test.js` line 47, change the description `'does not render transactions in the day view (they live on #/finance)'` to `'does not render transactions in the day view (they live on /finance)'`.

- [ ] **Step 3: Grep for any remaining stray references**

Run: `grep -rn "#/\|location.hash\|hashchange\|parseHash" apps/vanilla-oyl/src apps/vanilla-oyl/index.html CLAUDE.md`
Expected: no output (all references migrated). If anything remains, migrate it the same way (`#/x` → `/x`) and re-run.

- [ ] **Step 4: Final full gate**

Run: `pnpm vanilla test && pnpm vanilla typecheck`
Expected: all tests PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md apps/vanilla-oyl/src/components/oyl-journal.test.js
git commit -m "docs(vanilla-oyl): drop stray #/ route references after History migration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Definition of Done (whole feature)

- `pnpm vanilla test` and `pnpm vanilla typecheck` green.
- Manual: `/journal` deep-loads on hard refresh; nav clicks update the URL without reload; browser back/forward work; `/` redirects to `/status`; `/?seed` still seeds; an unknown path (`/nope`) shows the Not-found view.
- `grep -rn "#/" apps/vanilla-oyl/src` returns nothing.
