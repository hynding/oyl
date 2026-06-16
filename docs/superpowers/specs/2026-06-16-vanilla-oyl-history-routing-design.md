# vanilla-oyl: HTML5 History API routing

**Date:** 2026-06-16
**Status:** Approved — ready for planning
**Package:** `apps/vanilla-oyl`

## Goal

Replace the app's hash-based routing (`/#/journal`) with HTML5 History API
routing (`/journal`). Motivations, all in scope as drivers (not all as
deliverables — see Out of scope): clean shareable URLs, deep-linking to items,
readiness for a future SSR/pre-render backend, and SEO/analytics.

This change reaches parity with today's top-level routes over clean paths and
lays the seam for nested sub-routes later — it does **not** build nesting now.

## Current state

- `src/state/route.js` — a `Signal<string>` route-name fed by `hashchange`;
  `parseHash(hash)` strips `#/` and returns the first segment (default
  `status`). `createRouteState(win)` exposes `{ route, start(), stop() }`.
- `src/components/oyl-nav.js` — renders `<a href="#/${route}">` anchors; hash
  clicks navigate natively. `aria-current` is keyed on the route name.
- `src/components/oyl-router.js` — consumes the route-name signal, swaps views
  into an outlet, with View Transitions + an `aria-live` announcement and
  heading focus. **No contract change needed.**
- `src/main.js` — wires `createRouteState(window)` + `routeState.start()`;
  passes `routeState.route` to `oyl-nav` and `oyl-router`.
- `index.html` — uses **relative** asset paths (`./src/main.js`,
  `./styles/...`, `./vendor/...`) and an importmap with `./vendor/...`.
- Served as static files by `http-server -c-1 -p 8041 .` in **both** native dev
  and docker (`pnpm vanilla dev`). No separate production server.

## Key constraints (why this is more than a string swap)

1. **No SPA fallback.** `http-server` returns 404 for `/journal` (no such
   file). Hash routing never hit this because `/#/journal` is just `/` to the
   server.
2. **`pushState` fires no event.** Programmatic navigation must update the
   route signal manually, and `<a>` clicks must be intercepted.
3. **Relative asset paths break on deep links.** At `/journal/2026-06-16`,
   `./src/main.js` resolves to `/journal/src/main.js` (404).

## Design

### Approach (chosen)

**Minimal, seam-preserving migration.** The route signal stays a
`Signal<string>` route-name, so `oyl-router` and `oyl-nav` keep their current
contracts. `parsePath` splits *all* path segments but returns the first as the
name — that first/rest split is the seam where `/journal/:date` nesting slots
in later without churning consumers.

Rejected: (B) a structured `{ name, segments, params }` route object now —
churns consumers for deferred capability; (C) per-component click handlers —
too narrow, won't route arbitrary in-content deep-link anchors.

### 1. `src/state/route.js` (rewrite)

- `parsePath(pathname)` — strip any `?query`/`#hash`, strip a leading `/`,
  split on `/`, return the first segment or `'status'`. Replaces `parseHash`.
  Handles trailing slashes (`/journal/` → `journal`), root (`/` → `status`),
  and defensively a full path with a query (`/journal?seed` → `journal`). The
  query strip is **F1**: the interceptor passes `pathname+search` to
  `navigate`, so the signal derivation must not see the query.
- `createRouteState(win)`:
  - `route` signal initialized from `parsePath(win.location.pathname)`.
  - `start()` — binds `popstate` (updates the signal from
    `win.location.pathname`); installs link interception (see §2); and
    normalizes the canonical home: if `win.location.pathname === '/'`,
    `win.history.replaceState({}, '', '/status' + win.location.search)` and set
    the signal to `status`. **Preserving `search` is F2** — `main.js` reads
    `location.search` for `?seed` *after* `start()`, so the redirect must not
    drop the query. Also sets `win.history.scrollRestoration = 'manual'`
    (heading focus in `oyl-router` handles viewport movement; default
    restoration is unreliable against swapped content).
  - `stop()` — unbinds `popstate` and the link interceptor (teardown for tests).
  - `navigate(path)` — parse `const url = new URL(path, win.location.origin)`.
    If `url.pathname` equals the current `pathname`, no-op (no duplicate
    history entry); otherwise `win.history.pushState({}, '',
    url.pathname + url.search)` then `route.set(parsePath(url.pathname))`.
    (Implementation note: the merged code compares the full `pathname + search`
    in the no-op guard, so a query-only change — e.g. `/journal` → `/journal?seed`
    — still navigates. This supersedes the original `pathname`-only guard, which
    would have failed the "preserves the query" test below.)

### 2. `src/state/link-interceptor.js` (new)

`interceptLinks(win, navigate) → stop()`. A single document-level `click`
listener (delegation) so arbitrary in-content anchors route client-side, not
just the nav. Extracted into its own unit per the repo's
single-responsibility convention; independently testable.

Handle (call `navigate(url.pathname + url.search)` + `preventDefault()`) only
when **all** hold:

- `event.button === 0` and no `ctrl`/`meta`/`shift`/`alt` modifier.
- `event.defaultPrevented` is false.
- The composed path (`event.composedPath()`, which crosses the `oyl-nav`
  shadow boundary) contains an `HTMLAnchorElement` with an `href` — walk the
  path to the nearest one. (Skip SVG `<a>`, whose `href` is not a string.)
- The anchor has no `target`, no `download`, and `rel` is not `external`.
- `new URL(anchor.href, win.location.href).origin === win.location.origin`
  (excludes cross-origin, `mailto:`, `tel:`).
- It is not a same-page hash link (same `pathname`, differing `hash`) — those
  fall through to native scroll.

`preventDefault()` fires for every intercepted same-origin app link **even
when `navigate` no-ops** (clicking the active link must not full-reload).

### 3. `src/components/oyl-nav.js`

Change `a.href = '#/${route}'` → `a.href = '/${route}'`. `aria-current` logic
unchanged (still compares `dataset.route` to the active name). At `/status`
(post-normalization) the Status link is correctly highlighted.

### 4. `src/components/oyl-router.js`

Unchanged. Still consumes the string route-name signal; view-swap, View
Transitions, `aria-live`, and heading focus all intact. **F3:** unknown clean
paths are now reachable (`/nonsense` → proxy serves `index.html` → `parsePath`
→ `nonsense` → existing `_notFound` view). This is correct SPA behavior — a
`200` + Not-found view, never a real HTTP 404. `_notFound` already builds DOM
via `textContent` (the untrusted name), so no escaping change is needed.

### 5. `index.html`

Make the asset paths **root-absolute** (chosen over `<base href="/">`, which
rewrites every relative URL incl. the importmap and must be ordered first in
`<head>`):

- `<script type="module" src="/src/main.js">`
- `<link rel="modulepreload" href="/src/main.js">`,
  `href="/vendor/all-of-oyl/index.js"`
- stylesheet `<link>`s → `/styles/...`
- importmap → `{ "@oyl/all-of-oyl": "/vendor/all-of-oyl/index.js" }`

The anti-FOUC inline script uses no URLs and is unaffected.

### 6. `apps/vanilla-oyl/package.json`

Append the SPA fallback to both http-server scripts:

```
"dev":       "pnpm build:lib && http-server -c-1 -p 8041 --proxy http://localhost:8041?",
"dev:watch": "pnpm build:lib && http-server -c-1 -p 8041 --proxy http://localhost:8041?"
```

The `--proxy …?` trick: an unresolved path (`/journal`) is proxied to
`http://localhost:8041?/journal`, whose path is `/` (the rest is query string),
serving `index.html`. Docker inherits this via `pnpm vanilla dev`.

### 7. Docs

Update CLAUDE.md's `#/status` reference (the Status-screen note) to `/status`;
it is a living doc. Leave the historical foundation spec
(`2026-06-12-vanilla-oyl-foundation-design.md`) as-is — the archive records
what was true then; this spec supersedes it. Re-grep `apps/vanilla-oyl` for
stray `#/` / `location.hash` at implementation time to catch anything the
initial survey missed.

## Testing (TDD, happy-dom)

- **`src/state/route.test.js`** — replace `parseHash` tests with `parsePath`:
  `/` → `status`, `/journal` → `journal`, `/journal/today` → `journal`,
  `/journal/` → `journal` (trailing slash). Add: `navigate(path)` calls
  `pushState` and updates the signal; `navigate` to the current path no-ops;
  `popstate` makes the signal track `location.pathname`; `start()` normalizes
  `/` → `/status` via `replaceState`. Use the injected `win` (happy-dom —
  confirmed sufficient, see Test-infra de-risking; no stub needed).
- **`src/state/link-interceptor.test.js`** (new) — left-click on a `/journal`
  anchor → `navigate` called + default prevented; ignored (native, not
  prevented) for: modifier/middle click, `target="_blank"`, `download`,
  `rel="external"`, cross-origin href, `defaultPrevented`, same-page hash
  link. Anchor inside a shadow root is found via `composedPath()`.
- **`src/components/oyl-nav.test.js`** — update expected hrefs `#/journal` →
  `/journal`, `#/planner` → `/planner`.
- **`src/components/oyl-journal.test.js:47`** — update the test description
  string mentioning `#/finance` → `/finance` (cosmetic).
- Add a `parsePath('/journal?seed')` → `journal` case (F1 regression) and a
  `start()`-preserves-`?seed` case (F2 regression).

### Test-infra de-risking (verified 2026-06-16)

Probed empirically before planning:

- **happy-dom (`^20`)** — `pushState` updates `location.pathname` and fires no
  spurious `popstate`; `history.scrollRestoration` is settable;
  `event.composedPath()` crosses a shadow boundary and includes the anchor;
  `new URL(a.href, location.href).origin` matches. The test plan needs no
  history/location stub.
- **`http-server --proxy "http://localhost:8049?"`** — `/journal` and
  `/journal/2026-06-16` both return `200 text/html` (index.html); real files
  still serve. A missing asset (`/vendor/does-not-exist.js`) also returns `200`
  + index.html — **the 404-masking caveat below is confirmed**, and absolute
  asset paths are confirmed mandatory (the deep path *does* serve index.html).

## Out of scope (deferred)

- Nested sub-route param parsing and route-level data loading (the `parsePath`
  first/rest split is the seam).
- A future SSR / pre-render backend. Clean URLs are **necessary but not
  sufficient** for SEO — a client-rendered SPA still isn't crawlable without
  prerender. This change only unblocks that later work.
- Legacy `#/route` → `/route` redirect (decision: drop support for old hash
  bookmarks; they land on the default view).

## Notes / caveats

- **Dev caveat:** the `--proxy …?` fallback returns `index.html` (`200
  text/html`) for *any* unresolved path, including genuinely-missing assets
  (e.g. a typo'd `/vendor/foo.js`). This can mask 404s during dev.
- A future real SSR backend would 404 unknown routes properly; the dev/docker
  proxy is the stand-in.

## Definition of Done

- `pnpm vanilla test` and `pnpm vanilla typecheck` green.
- Manual: `/journal` deep-loads (hard refresh), nav clicks update the URL
  without reload, browser back/forward work, `/` redirects to `/status`,
  `/?seed` still seeds (F2), an unknown path shows Not-found (F3).
- CLAUDE.md `#/status` reference updated; no stray `#/` left in
  `apps/vanilla-oyl`.
