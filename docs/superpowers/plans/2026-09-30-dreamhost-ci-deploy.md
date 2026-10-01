# DreamHost CI Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On every push to `master`, GitHub Actions gates on tests + typecheck and then deploys `apps/vanilla-oyl` and `apps/camis-php-oyl` to DreamHost shared hosting over SSH, replacing the Raspberry Pi deployment.

**Architecture:** Two shell publish scripts under `scripts/dreamhost/` do all the deploying and are called by both the workflow and a thin local wrapper (`scripts/deploy-dreamhost.sh`). The static app gets its API base URL injected at publish time through a `<meta name="oyl-api-base">` seam and ships with a rendered `.htaccess` (scoped SPA fallback, CSP with inline-script hashes). The PHP app is rebuilt from committed inputs on the runner (camis cloned at a pinned SHA) and finished on the host by composer + artisan, exactly as today's script does.

**Tech Stack:** bash (`set -euo pipefail`), GitHub Actions (`ubuntu-latest`, Node 22, PHP 8.3), rsync over ssh, Node ESM for the `.htaccess` renderer, vitest for every guard.

**Spec:** `docs/superpowers/specs/2026-09-29-dreamhost-ci-deploy-design.md` — read it first; this plan argues from it.

## Global Constraints

- No hostname, username, account path, IP or credential in any tracked file. Placeholders only (`<app-domain>`, `user@host`, `domains/<…>/www`). Real values: untracked root `.env` (`OYL_DH_*`) and GitHub secrets/variables.
- Every `ssh` and `rsync -e ssh` carries `-o BatchMode=yes`; never `StrictHostKeyChecking=no`.
- Preflight and remote body both run under a login shell (`bash -l`).
- Node pin: root `package.json#engines.node` = `"22.x"`, workflow `node-version: '22'`.
- `src/` of `apps/vanilla-oyl` ships without `*.test.js`; the shipped roots are exactly `index.html`, `src/`, `styles/`, `vendor/`, plus generated `.htaccess` and `DEPLOYED`.
- The workflow never migrates the database; `php artisan camis:strapi-schema-check` on the host is the only schema step.
- `apps/vanilla-oyl` typechecks with `types: []` (no `@types/node`): nothing under `deploy/` may import `node:*`.
- Commit messages: `feat`/`fix`/`refactor`/`chore`/`docs`/`test` prefix, end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Never commit on red.
- Definition of Done per task: that package's tests + typecheck green. Final task runs `pnpm test`, `pnpm typecheck`, `pnpm all-of build`, `pnpm e2e`.

## Review Focus

Inputs the spec implies but no task's tests would otherwise exercise; each has a pinned test in the owning task:

1. A `DH_API_BASE` with a trailing slash or path (`https://api.example.test/api/`) — the meta must carry the normalized base and `connect-src` the bare origin. (Task 5: publish-www test; Task 3: `renderHtaccess` rejects an origin with a path.)
2. `DH_CSP_HEADER` set to the empty string by an unset GitHub variable — must default to `Content-Security-Policy`, not emit `Header always set  "…"`. (Task 5.)
3. `index.html` without the meta tag (someone "tidies" it away) — publish must fail loudly, not ship an app that silently falls back to same-origin `/api`. (Task 5.)
4. Whitespace-only meta `content` — must fall through to hostname rules, never yield an empty API base. (Task 1.)
5. A `CAMIS_REF` that is a branch name or short SHA — the workflow test must reject anything but 40 hex chars, because `git fetch origin <short>` is not allowed by GitHub. (Task 7.)

---

### Task 1: API base meta seam in the frontend

**Files:**
- Modify: `apps/vanilla-oyl/src/storage/config.js`
- Modify: `apps/vanilla-oyl/src/storage/config.test.js`
- Modify: `apps/vanilla-oyl/index.html` (line 39, after the importmap script)
- Modify: `apps/vanilla-oyl/src/main.js:65-66,70,82,142,257-258,370-371`

**Interfaces:**
- Produces: `defaultApiBaseUrl(hostname?: string, metaBase?: string): string` and `getApiBaseUrl(storage, hostname?: string, metaBase?: string): string` — both accept an optional third/second `metaBase` that wins when non-empty after `normalizeBaseUrl`.
- Produces: the DOM contract `<meta name="oyl-api-base" content="" />` in `index.html`, which Task 5's publish script fills.

- [ ] **Step 1: Write the failing tests**

Append to `apps/vanilla-oyl/src/storage/config.test.js`, inside the `host-derived defaults` describe (before its closing `})`):

```js
  it('a deploy-injected meta base wins over every hostname rule', () => {
    expect(defaultApiBaseUrl('example.com', 'https://api.example.test/api')).toBe('https://api.example.test/api')
    expect(defaultApiBaseUrl('app.example.com', 'https://api.example.test/api')).toBe('https://api.example.test/api')
    expect(defaultApiBaseUrl('localhost', 'https://api.example.test/api')).toBe('https://api.example.test/api')
  })

  it('normalizes the meta base (trailing slash, whitespace)', () => {
    expect(defaultApiBaseUrl('example.com', ' https://api.example.test/api/ ')).toBe('https://api.example.test/api')
  })

  it('an empty or whitespace-only meta base falls through to the hostname rules', () => {
    expect(defaultApiBaseUrl('example.com', '')).toBe('https://example.com/api')
    expect(defaultApiBaseUrl('example.com', '   ')).toBe('https://example.com/api')
    expect(defaultApiBaseUrl('localhost', undefined)).toBe(DEFAULT_API_BASE_URL)
  })

  it('a stored override still beats the meta base', () => {
    const storage = fakeStorage()
    expect(getApiBaseUrl(storage, 'example.com', 'https://api.example.test/api')).toBe('https://api.example.test/api')
    setApiBaseUrl(storage, 'http://x/api')
    expect(getApiBaseUrl(storage, 'example.com', 'https://api.example.test/api')).toBe('http://x/api')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/storage/config.test.js`
Expected: FAIL — 4 new tests, `defaultApiBaseUrl('example.com', 'https://api.example.test/api')` returns `'https://example.com/api'`.

- [ ] **Step 3: Implement the seam in `config.js`**

Replace the `defaultApiBaseUrl` docstring + function and the `getApiBaseUrl` function with:

```js
/**
 * Default API base URL. Precedence: a deploy-injected `metaBase` (the `content` of
 * `<meta name="oyl-api-base">` in index.html, filled by scripts/dreamhost/publish-www.sh) wins
 * when non-empty; otherwise the app's own hostname decides: a local host uses the dev backend,
 * an `app.<domain>` host swaps the label for `api.` on the same https origin, and any other host
 * falls back to same-origin `/api`. Always overridable via Status → Connection.
 * @param {string} [hostname] @param {string} [metaBase] @returns {string}
 */
export function defaultApiBaseUrl(hostname, metaBase) {
  const meta = normalizeBaseUrl(metaBase ?? '')
  if (meta) return meta
  if (isLocalHost(hostname)) return DEFAULT_API_BASE_URL
  const host = /** @type {string} */ (hostname)
  const apiHost = host.startsWith('app.') ? 'api.' + host.slice(4) : host
  return `https://${apiHost}/api`
}
```

```js
/** Backend base URL: stored override, else the host/meta default. @param {{ getItem(k: string): string | null }} storage @param {string} [hostname] @param {string} [metaBase] @returns {string} */
export function getApiBaseUrl(storage, hostname, metaBase) {
  return storage.getItem(API_BASE_URL_KEY) || defaultApiBaseUrl(hostname, metaBase)
}
```

`normalizeBaseUrl` is defined later in the file; function declarations hoist, so no reorder is needed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/storage/config.test.js`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Add the meta tag to `index.html`**

Insert after line 39 (the closing `</script>` of the importmap), before the `modulepreload` links:

```html
    <!-- Filled at deploy time by scripts/dreamhost/publish-www.sh; empty = derive from the hostname. -->
    <meta name="oyl-api-base" content="" />
```

- [ ] **Step 6: Wire `main.js` to read the meta once and reuse it**

Replace line 65–66:

```js
  const host = window.location.hostname
  const authState = createAuthState(storage, { baseUrl: getApiBaseUrl(storage, host), fetch: window.fetch.bind(window) })
```

with:

```js
  const host = window.location.hostname
  // Deploy-injected API base (see index.html <meta name="oyl-api-base">); '' means hostname rules.
  const metaBase = /** @type {HTMLMetaElement | null} */ (document.querySelector('meta[name="oyl-api-base"]'))?.content ?? ''
  const apiBase = getApiBaseUrl(storage, host, metaBase)
  const apiDefault = defaultApiBaseUrl(host, metaBase)
  const authState = createAuthState(storage, { baseUrl: apiBase, fetch: window.fetch.bind(window) })
```

Then replace every remaining `getApiBaseUrl(storage, host)` with `apiBase` (lines 70, 82, 142) and every `defaultApiBaseUrl(host)` with `apiDefault` (lines 258, 371), and `getApiBaseUrl(storage, host)` at 257 and 370 with `apiBase`. Verify with:

```bash
grep -n 'getApiBaseUrl(storage, host)\|defaultApiBaseUrl(host)' apps/vanilla-oyl/src/main.js
```

Expected: no output. The import on line 13 keeps both names (both are still used, once each).

- [ ] **Step 7: Typecheck + full vanilla tests**

Run: `pnpm vanilla typecheck && pnpm vanilla test`
Expected: both green.

- [ ] **Step 8: Commit**

```bash
git add apps/vanilla-oyl/src/storage/config.js apps/vanilla-oyl/src/storage/config.test.js apps/vanilla-oyl/index.html apps/vanilla-oyl/src/main.js
git commit -m "feat(vanilla-oyl): deploy-injected API base via <meta name=\"oyl-api-base\">

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: CSP inline-script hasher (pure module)

**Files:**
- Create: `apps/vanilla-oyl/deploy/csp-hashes.js`
- Create: `apps/vanilla-oyl/deploy/csp-hashes.test.js`
- Modify: `apps/vanilla-oyl/tsconfig.json` (`include`)
- Modify: `apps/vanilla-oyl/vitest.config.js` (`include`)

**Interfaces:**
- Produces: `hashInlineScripts(html: string): Promise<string[]>` — one `sha256-<base64>` token per inline `<script>` (no `src` attribute), in document order, hashing the exact body between the tags.

- [ ] **Step 1: Make `deploy/` visible to vitest and tsc**

`apps/vanilla-oyl/tsconfig.json`: change `"include": ["src/**/*.js", "test/**/*.js"]` to `"include": ["src/**/*.js", "test/**/*.js", "deploy/**/*.js"]`.

`apps/vanilla-oyl/vitest.config.js`: change `include: ['src/**/*.test.js', 'test/**/*.test.js']` to `include: ['src/**/*.test.js', 'test/**/*.test.js', 'deploy/**/*.test.js', 'scripts/**/*.test.mjs']` (the `scripts/` tests are `.mjs`, outside tsconfig `include`, so they may use `node:*`).

- [ ] **Step 2: Write the failing test**

Create `apps/vanilla-oyl/deploy/csp-hashes.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { hashInlineScripts } from './csp-hashes.js'

// SHA-256 of the empty string, base64 — the one vector everyone can verify by hand.
const EMPTY = 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='

describe('hashInlineScripts', () => {
  it('hashes each inline script body in document order and ignores <script src>', async () => {
    const html = [
      '<script></script>',
      '<script type="module" src="/src/main.js"></script>',
      '<script type="importmap">{"imports":{}}</script>',
    ].join('\n')
    const hashes = await hashInlineScripts(html)
    expect(hashes).toHaveLength(2)
    expect(hashes[0]).toBe(EMPTY)
    expect(hashes[1]).toMatch(/^sha256-[A-Za-z0-9+/]{43}=$/)
    expect(hashes[1]).not.toBe(EMPTY)
  })

  it('hashes the body exactly as written (whitespace matters to the browser)', async () => {
    const [a] = await hashInlineScripts('<script>\n  x\n</script>')
    const [b] = await hashInlineScripts('<script>x</script>')
    expect(a).not.toBe(b)
  })

  it('returns [] when there is no inline script', async () => {
    expect(await hashInlineScripts('<html><script src="/a.js"></script></html>')).toEqual([])
  })
})
```

The real `index.html` (two inline scripts) is covered by the CLI test in Task 3, which may read files; this file stays free of `node:` imports.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run deploy/csp-hashes.test.js`
Expected: FAIL — cannot resolve `./csp-hashes.js`.

- [ ] **Step 4: Implement**

Create `apps/vanilla-oyl/deploy/csp-hashes.js`:

```js
// DOM-free, Node-free CSP helper: hashes inline <script> bodies the way a browser computes
// 'sha256-…' source expressions. Used by scripts/render-htaccess.mjs at publish time and
// unit-tested here; it must not import node:* (apps/vanilla-oyl typechecks with types: []).

const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g

/** @param {Uint8Array} bytes @returns {string} */
function toBase64(bytes) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

/**
 * One `sha256-<base64>` token per inline `<script>` (no `src`), in document order, hashing the
 * exact text between the tags.
 * @param {string} html
 * @returns {Promise<string[]>}
 */
export async function hashInlineScripts(html) {
  /** @type {string[]} */
  const out = []
  for (const m of html.matchAll(INLINE_SCRIPT)) {
    const body = /** @type {string} */ (m[1])
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))
    out.push(`sha256-${toBase64(new Uint8Array(digest))}`)
  }
  return out
}
```

- [ ] **Step 5: Run the test to verify it passes; typecheck**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run deploy/csp-hashes.test.js && pnpm vanilla typecheck`
Expected: PASS, typecheck clean. If `crypto.subtle` is undefined under happy-dom, add `// @vitest-environment node` as the first line of the test file and re-run.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/deploy/csp-hashes.js apps/vanilla-oyl/deploy/csp-hashes.test.js apps/vanilla-oyl/tsconfig.json apps/vanilla-oyl/vitest.config.js
git commit -m "feat(vanilla-oyl): CSP inline-script hasher for the DreamHost .htaccess

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `.htaccess` template + renderer + CLI

**Files:**
- Create: `apps/vanilla-oyl/deploy/htaccess.template`
- Create: `apps/vanilla-oyl/deploy/render-htaccess.js`
- Create: `apps/vanilla-oyl/deploy/render-htaccess.test.js`
- Create: `apps/vanilla-oyl/scripts/render-htaccess.mjs`
- Create: `apps/vanilla-oyl/scripts/render-htaccess.test.mjs`
- Create: `apps/vanilla-oyl/deploy/README.md`

**Interfaces:**
- Consumes: `hashInlineScripts(html)` from Task 2.
- Produces: `renderHtaccess(template: string, opts: { header: string, hashes: string[], apiOrigin: string }): string` (throws on bad header name, origin with a path, empty hashes, or a leftover `__PLACEHOLDER__`).
- Produces: CLI `node apps/vanilla-oyl/scripts/render-htaccess.mjs --html <file> --api-origin <origin> --csp-header <name> --out <file>` used by Task 5.

- [ ] **Step 1: Write the template**

Create `apps/vanilla-oyl/deploy/htaccess.template`:

```apache
# Rendered by apps/vanilla-oyl/scripts/render-htaccess.mjs at publish time. Do not edit on the host.
Options -MultiViews -Indexes

# Deploy marker is for the operator over SSH, not the public.
<Files "DEPLOYED">
  Require all denied
</Files>

<IfModule mod_rewrite.c>
  RewriteEngine On
  # History-API SPA fallback, scoped: unknown paths serve index.html, but the asset roots stay
  # real 404s (a typo'd /vendor/… must not come back as 200 HTML).
  RewriteCond %{REQUEST_URI} !^/(src|styles|vendor)/
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^ /index.html [L]
</IfModule>

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set X-Frame-Options "DENY"
  # style-src keeps 'unsafe-inline' as belt-and-braces (components use adoptedStyleSheets, which
  # CSP does not govern). connect-src is the API origin only; Google is unconfigured on PHP.
  Header always set __CSP_HEADER__ "default-src 'self'; script-src 'self' __CSP_SCRIPT_HASHES__; style-src 'self' 'unsafe-inline'; connect-src 'self' __API_ORIGIN__; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
  # Assets are not content-hashed: always revalidate. Never cache the shell.
  <FilesMatch "\.(js|css)$">
    Header always set Cache-Control "max-age=0, must-revalidate"
  </FilesMatch>
  <Files "index.html">
    Header always set Cache-Control "no-cache"
  </Files>
</IfModule>
```

- [ ] **Step 2: Write the failing test**

Create `apps/vanilla-oyl/deploy/render-htaccess.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { renderHtaccess } from './render-htaccess.js'

const TEMPLATE = [
  'Header always set __CSP_HEADER__ "script-src \'self\' __CSP_SCRIPT_HASHES__; connect-src \'self\' __API_ORIGIN__"',
].join('\n')
const HASHES = ['sha256-aaaa', 'sha256-bbbb']

describe('renderHtaccess', () => {
  it('fills header name, quoted hashes and API origin', () => {
    const out = renderHtaccess(TEMPLATE, { header: 'Content-Security-Policy', hashes: HASHES, apiOrigin: 'https://api.example.test' })
    expect(out).toBe('Header always set Content-Security-Policy "script-src \'self\' \'sha256-aaaa\' \'sha256-bbbb\'; connect-src \'self\' https://api.example.test"')
  })

  it('accepts the report-only header name', () => {
    expect(renderHtaccess(TEMPLATE, { header: 'Content-Security-Policy-Report-Only', hashes: HASHES, apiOrigin: 'https://api.example.test' }))
      .toContain('Content-Security-Policy-Report-Only')
  })

  it('rejects any other header name', () => {
    expect(() => renderHtaccess(TEMPLATE, { header: 'X-CSP', hashes: HASHES, apiOrigin: 'https://api.example.test' })).toThrow(/header/)
  })

  it('rejects an API origin that carries a path, trailing slash or whitespace', () => {
    for (const bad of ['https://api.example.test/api', 'https://api.example.test/', 'https://api.example.test ', 'api.example.test']) {
      expect(() => renderHtaccess(TEMPLATE, { header: 'Content-Security-Policy', hashes: HASHES, apiOrigin: bad }), bad).toThrow(/origin/)
    }
  })

  it('rejects an empty hash list (a CSP with no inline hashes would white-screen the app)', () => {
    expect(() => renderHtaccess(TEMPLATE, { header: 'Content-Security-Policy', hashes: [], apiOrigin: 'https://api.example.test' })).toThrow(/hash/)
  })

  it('fails on an unrendered placeholder', () => {
    expect(() => renderHtaccess('__NOPE__', { header: 'Content-Security-Policy', hashes: HASHES, apiOrigin: 'https://api.example.test' })).toThrow(/__NOPE__/)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run deploy/render-htaccess.test.js`
Expected: FAIL — cannot resolve `./render-htaccess.js`.

- [ ] **Step 4: Implement the renderer**

Create `apps/vanilla-oyl/deploy/render-htaccess.js`:

```js
// Pure template renderer for deploy/htaccess.template. No node:* imports (see csp-hashes.js).

const HEADER_NAMES = /^Content-Security-Policy(-Report-Only)?$/
// scheme://host[:port] — nothing after the authority; CSP connect-src wants an origin.
const ORIGIN = /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/
const PLACEHOLDER = /__[A-Z_]+__/

/**
 * @param {string} template
 * @param {{ header: string, hashes: string[], apiOrigin: string }} opts
 * @returns {string}
 */
export function renderHtaccess(template, { header, hashes, apiOrigin }) {
  if (!HEADER_NAMES.test(header)) throw new Error(`renderHtaccess: unsupported CSP header name "${header}"`)
  if (!ORIGIN.test(apiOrigin)) throw new Error(`renderHtaccess: apiOrigin must be a bare origin (scheme://host[:port]), got "${apiOrigin}"`)
  if (hashes.length === 0) throw new Error('renderHtaccess: no inline-script hashes — refusing to render a CSP that would block index.html')
  const out = template
    .replaceAll('__CSP_HEADER__', header)
    .replaceAll('__CSP_SCRIPT_HASHES__', hashes.map((h) => `'${h}'`).join(' '))
    .replaceAll('__API_ORIGIN__', apiOrigin)
  const left = PLACEHOLDER.exec(out)
  if (left) throw new Error(`renderHtaccess: unrendered placeholder ${left[0]}`)
  return out
}
```

- [ ] **Step 5: Run the test to verify it passes; typecheck**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run deploy/render-htaccess.test.js && pnpm vanilla typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 6: Write the CLI wrapper**

Create `apps/vanilla-oyl/scripts/render-htaccess.mjs` (outside tsconfig `include`, like `copy-lib.mjs`; the only file here allowed to touch `node:*`):

```js
#!/usr/bin/env node
// Render deploy/htaccess.template for a staged index.html.
// Usage: node scripts/render-htaccess.mjs --html <staged index.html> --api-origin <https://host> \
//        [--csp-header Content-Security-Policy|Content-Security-Policy-Report-Only] --out <file>
import { readFile, writeFile } from 'node:fs/promises'
import { hashInlineScripts } from '../deploy/csp-hashes.js'
import { renderHtaccess } from '../deploy/render-htaccess.js'

const args = new Map()
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i += 2) {
  const k = argv[i], v = argv[i + 1]
  if (!k?.startsWith('--') || v === undefined) {
    console.error(`render-htaccess: bad argument '${k ?? ''}'`)
    process.exit(2)
  }
  args.set(k.slice(2), v)
}
for (const k of ['html', 'api-origin', 'out']) {
  if (!args.get(k)) { console.error(`render-htaccess: --${k} is required`); process.exit(2) }
}

const template = await readFile(new URL('../deploy/htaccess.template', import.meta.url), 'utf8')
const html = await readFile(args.get('html'), 'utf8')
const hashes = await hashInlineScripts(html)
const out = renderHtaccess(template, {
  header: args.get('csp-header') || 'Content-Security-Policy',
  hashes,
  apiOrigin: args.get('api-origin'),
})
await writeFile(args.get('out'), out)
console.log(`render-htaccess: wrote ${args.get('out')} (${hashes.length} inline-script hashes)`)
```

Smoke it by hand:

```bash
node apps/vanilla-oyl/scripts/render-htaccess.mjs --html apps/vanilla-oyl/index.html --api-origin https://api.example.test --out /tmp/oyl-htaccess && grep -c sha256- /tmp/oyl-htaccess && rm /tmp/oyl-htaccess
```

Expected: `wrote … (2 inline-script hashes)` then `1` (one CSP line carrying both hashes).

- [ ] **Step 7: Pin the CLI against the real `index.html` and template (Node-side test)**

Create `apps/vanilla-oyl/scripts/render-htaccess.test.mjs` (`.mjs`: outside tsconfig `include`, so `node:*` is allowed here; vitest picks it up via the `scripts/**/*.test.mjs` pattern from Task 2):

```js
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = fileURLToPath(new URL('..', import.meta.url))
const CLI = join(APP, 'scripts', 'render-htaccess.mjs')
const INDEX = join(APP, 'index.html')

/** @param {string[]} args */
function render(args) {
  const dir = mkdtempSync(join(tmpdir(), 'htaccess-'))
  const out = join(dir, '.htaccess')
  try {
    execFileSync('node', [CLI, '--html', INDEX, '--out', out, ...args], { stdio: 'pipe' })
    return readFileSync(out, 'utf8')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('scripts/render-htaccess.mjs against the real index.html + template', () => {
  it('renders two inline-script hashes (anti-FOUC IIFE + importmap), the scoped SPA fallback, the DEPLOYED deny, cache rules, no placeholders', () => {
    const text = render(['--api-origin', 'https://api.example.test'])
    expect(text.match(/'sha256-[A-Za-z0-9+/=]+'/g)).toHaveLength(2)
    expect(text).toContain('Header always set Content-Security-Policy "')
    expect(text).toContain("connect-src 'self' https://api.example.test;")
    expect(text).toContain('RewriteCond %{REQUEST_URI} !^/(src|styles|vendor)/')
    expect(text).toContain('RewriteRule ^ /index.html [L]')
    expect(text).toContain('<Files "DEPLOYED">')
    expect(text).toContain('Require all denied')
    expect(text).toContain('Header always set Cache-Control "no-cache"')
    expect(text).toContain('max-age=0, must-revalidate')
    expect(text).not.toMatch(/__[A-Z_]+__/)
    expect(text).not.toContain('googleapis')
  })

  it('honours --csp-header Content-Security-Policy-Report-Only', () => {
    expect(render(['--api-origin', 'https://api.example.test', '--csp-header', 'Content-Security-Policy-Report-Only']))
      .toContain('Header always set Content-Security-Policy-Report-Only "')
  })

  it('fails (exit 2) without --api-origin, and (exit 1) on an origin with a path', () => {
    expect(() => render([])).toThrow()
    expect(() => render(['--api-origin', 'https://api.example.test/api'])).toThrow(/origin/)
  })
})
```

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run scripts/render-htaccess.test.mjs`
Expected: PASS (3 tests). The second expectation of the last test relies on the renderer's error text reaching stderr — `execFileSync` with `stdio: 'pipe'` includes stderr in the thrown error's message.

- [ ] **Step 8: Write `deploy/README.md`**

Create `apps/vanilla-oyl/deploy/README.md`:

```markdown
# deploy/ — DreamHost publish inputs for the static app

Nothing here ships as-is. `scripts/dreamhost/publish-www.sh` (repo root) stages `index.html`,
`src/`, `styles/`, `vendor/` (minus `*.test.js`), then:

1. fills `<meta name="oyl-api-base" content="">` in the staged `index.html` with `DH_API_BASE`
   (`src/storage/config.js` reads it first; empty = hostname rules, so dev and tests are unaffected);
2. runs `node scripts/render-htaccess.mjs` → `.htaccess` from `htaccess.template`: scoped SPA
   fallback (asset roots stay 404), `Cache-Control`, security headers and a CSP whose
   `script-src` carries one `sha256-` hash per inline `<script>` in `index.html`
   (`csp-hashes.js`) and whose `connect-src` is the API origin.

Adding an inline `<script>` to `index.html` needs no manual step — the hashes are recomputed on
every publish. `DH_CSP_HEADER=Content-Security-Policy-Report-Only` renders a report-only policy
for a first deploy.
```

- [ ] **Step 9: Commit**

```bash
git add apps/vanilla-oyl/deploy apps/vanilla-oyl/scripts/render-htaccess.mjs apps/vanilla-oyl/scripts/render-htaccess.test.mjs
git commit -m "feat(vanilla-oyl): .htaccess template + renderer for DreamHost (scoped SPA fallback, hashed CSP)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `scripts/dreamhost/publish-api.sh` (extracted from the current deploy script)

**Files:**
- Create: `scripts/dreamhost/publish-api.sh`
- Create: `apps/camis-php-oyl/test/publish-api.test.ts`
- Delete: `apps/camis-php-oyl/test/deploy-script.test.ts` (its guards move here; it asserts on the old single script and the renamed `OYL_DH_APP_ROOT`)

**Interfaces:**
- Produces: `bash scripts/dreamhost/publish-api.sh [--dry-run]` reading `DH_SSH`, `DH_API_ROOT`, optional `DH_API_URL` from the environment only. Exit 1 with a message naming the missing variables.

- [ ] **Step 1: Write the failing test**

Create `apps/camis-php-oyl/test/publish-api.test.ts`:

```ts
import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const SCRIPT = resolve(__dirname, "..", "..", "..", "scripts", "dreamhost", "publish-api.sh")
const src = () => readFileSync(SCRIPT, "utf8")
const run = (args: string[], env: Record<string, string>) =>
  spawnSync("bash", [SCRIPT, ...args], { env: { PATH: process.env.PATH ?? "", HOME: "/nonexistent", ...env }, encoding: "utf8" })

describe("scripts/dreamhost/publish-api.sh", () => {
  it("parses", () => {
    expect(() => execFileSync("bash", ["-n", SCRIPT])).not.toThrow()
  })
  it("refuses to run without DH_SSH / DH_API_ROOT and names them", () => {
    const res = run(["--dry-run"], {})
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("DH_SSH")
    expect(res.stderr).toContain("DH_API_ROOT")
  })
  it("rejects unknown arguments", () => {
    const res = run(["--yolo"], { DH_SSH: "x@y", DH_API_ROOT: "r" })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("unknown argument")
  })
  it("rsync excludes bootstrap/cache and storage/app (a local config:cache or upload must never ship)", () => {
    const line = src().split("\n").find((l) => l.trimStart().startsWith("RSYNC_FLAGS=("))
    expect(line).toBeDefined()
    expect(line).toContain("--exclude 'bootstrap/cache/'")
    expect(line).toContain("--exclude 'storage/app/'")
    expect(line).toContain("--exclude vendor/")
    expect(line).toContain("--exclude '.env'")
  })
  it("verifies the Strapi-owned schema remotely instead of migrating or seeding", () => {
    expect(src()).toContain("php artisan camis:strapi-schema-check")
    expect(src()).not.toContain("php artisan migrate")
    expect(src()).not.toContain("RolePermissionSeeder")
  })
  it("fails fast unless the remote laravel/.env carries a JWT_SECRET of at least 32 bytes, and never echoes it", () => {
    const s = src()
    expect(s).toContain("^JWT_SECRET=")
    expect(s).toContain("-ge 32")
    const envCheck = s.indexOf("[ -f .env ]")
    const guard = s.indexOf("secret_len")
    expect(envCheck, ".env existence check").toBeGreaterThan(-1)
    expect(guard).toBeGreaterThan(envCheck)
    expect(guard).toBeLessThan(s.indexOf("composer install"))
    expect(s).toContain("apps/camis-php-oyl/README.md")
    expect(s).not.toMatch(/echo[^\n]*\$\{?secret/)
  })
  it("clears the config cache before the schema check (bootstrap/cache is rsync-excluded, so the check would read the previous deploy's cached config)", () => {
    const s = src()
    const clear = s.indexOf("php artisan config:clear")
    const check = s.indexOf("php artisan camis:strapi-schema-check")
    expect(clear).toBeGreaterThan(-1)
    expect(clear).toBeLessThan(check)
  })
  it("is non-interactive: every ssh and rsync -e carries BatchMode=yes; no StrictHostKeyChecking=no", () => {
    const s = src()
    const sshCalls = s.split("\n").filter((l) => /^\s*(ssh|rsync)\b/.test(l) || /\brsync\s+"\$\{RSYNC_FLAGS/.test(l))
    expect(sshCalls.length).toBeGreaterThan(0)
    for (const l of sshCalls) expect(l, l).toMatch(/BatchMode=yes|SSH_OPTS|RSYNC_FLAGS/)
    expect(s).toContain("-o BatchMode=yes")
    expect(s).not.toContain("StrictHostKeyChecking=no")
  })
  it("preflights php/composer in a login shell (DreamHost picks the CLI PHP via ~/.bash_profile), like the remote body", () => {
    expect(src()).toContain("bash -l -c")
    expect(src()).toContain("bash -l -s")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/camis-php-oyl exec vitest run test/publish-api.test.ts`
Expected: FAIL — `bash -n` cannot find the script (ENOENT).

- [ ] **Step 3: Create the script**

Create `scripts/dreamhost/publish-api.sh`:

```bash
#!/usr/bin/env bash
# Publish the BUILT camis-php-oyl Laravel app (apps/camis-php-oyl/laravel) to DreamHost.
# Shared by .github/workflows/deploy.yml and scripts/deploy-dreamhost.sh — all config comes from
# the environment; this file is git-tracked and must never hold a host, user, path or secret.
#
#   DH_SSH       user@host (required)
#   DH_API_ROOT  app root relative to the SSH user's home; laravel/ lives under it (required)
#   DH_API_URL   https://<api-domain> — enables the external /api/_health check (optional)
#
# Usage: publish-api.sh [--dry-run]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$REPO_ROOT/apps/camis-php-oyl"
DRY_RUN=0
if [[ $# -gt 0 ]]; then
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "publish-api: unknown argument '$1' (only --dry-run is supported)." >&2; exit 1 ;;
  esac
  if [[ $# -gt 1 ]]; then
    echo "publish-api: too many arguments." >&2
    exit 1
  fi
fi

DH_SSH="${DH_SSH:-}"; DH_API_ROOT="${DH_API_ROOT:-}"; DH_API_URL="${DH_API_URL:-}"
missing=()
if [[ -z "$DH_SSH" ]]; then missing+=(DH_SSH); fi
if [[ -z "$DH_API_ROOT" ]]; then missing+=(DH_API_ROOT); fi
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "publish-api: missing required environment: ${missing[*]} (optional: DH_API_URL)." >&2
  exit 1
fi

if [[ ! -f "$APP_DIR/laravel/artisan" ]]; then
  echo "publish-api: apps/camis-php-oyl/laravel is not built — run 'pnpm php-app build' first." >&2
  exit 1
fi

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=8)
SHORT="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"

# Login shell on purpose: DreamHost selects the per-user CLI PHP through ~/.bash_profile, and
# the remote body below runs under bash -l too — both stages must see the same toolchain.
echo "==> Preflight: ssh $DH_SSH"
ssh "${SSH_OPTS[@]}" "$DH_SSH" 'bash -l -c "command -v php composer >/dev/null"' \
  || { echo "publish-api: cannot ssh to $DH_SSH, or php/composer missing from the login-shell PATH." >&2; exit 1; }

printf 'sha=%s\ndeployed_utc=%s\n' "$(git -C "$REPO_ROOT" rev-parse HEAD)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$APP_DIR/laravel/DEPLOYED"

# vendor/ is installed on the host (platform-matched); .env and the sqlite files never ship.
RSYNC_FLAGS=(-a --delete -e 'ssh -o BatchMode=yes' --exclude vendor/ --exclude node_modules/ --exclude '.env' --exclude 'database/*.sqlite' --exclude 'storage/logs/' --exclude 'storage/framework/cache/' --exclude 'bootstrap/cache/' --exclude 'storage/app/')

if [[ $DRY_RUN -eq 1 ]]; then
  echo "==> DRY RUN: rsync delta ($SHORT -> $DH_SSH:$DH_API_ROOT/laravel); nothing will change"
  rsync -n -i "${RSYNC_FLAGS[@]}" "$APP_DIR/laravel"/ "$DH_SSH:$DH_API_ROOT/laravel"/
  echo "==> DRY RUN complete; no remote steps executed."
  exit 0
fi

echo "==> Syncing laravel/ -> $DH_SSH:$DH_API_ROOT/laravel"
ssh "${SSH_OPTS[@]}" "$DH_SSH" "mkdir -p $(printf %q "$DH_API_ROOT")/laravel"
rsync "${RSYNC_FLAGS[@]}" "$APP_DIR/laravel"/ "$DH_SSH:$DH_API_ROOT/laravel"/

echo "==> Remote composer + schema check + cache"
ssh "${SSH_OPTS[@]}" "$DH_SSH" "APP_ROOT=$(printf %q "$DH_API_ROOT") bash -l -s" <<'REMOTE'
set -euo pipefail
cd "$APP_ROOT/laravel"
[ -f .env ] || { echo "remote: laravel/.env missing — create it from apps/camis-php-oyl/.env.example first (README 'DreamHost one-time setup')"; exit 1; }
# The HS256 key is shared with the Strapi instance that owns this database; firebase/php-jwt
# refuses anything shorter than 32 bytes, so a placeholder .env would 500 every signed request.
# Length only — the value is never printed. Last assignment wins, as dotenv reads it.
secret_len="$(awk '/^JWT_SECRET=/{v=$0; sub(/^JWT_SECRET=/, "", v); sub(/\r$/, "", v); gsub(/^"|"$/, "", v)} END{print length(v)}' .env)"
[ "${secret_len:-0}" -ge 32 ] || { echo "remote: JWT_SECRET in laravel/.env must be >= 32 bytes — see apps/camis-php-oyl/README.md"; exit 1; }
composer install --no-dev --optimize-autoloader --no-interaction
# bootstrap/cache/ is rsync-excluded, so the previous deploy's config:cache is still on the
# host: clear it or the check would read that stale config (e.g. the old database credentials).
php artisan config:clear
# Strapi owns the schema: this fails (listing every missing table/column) until strapi-oyl has
# been booted against this MySQL database — see apps/camis-php-oyl/README.md "Schema sync".
php artisan camis:strapi-schema-check
php artisan config:cache
cat DEPLOYED
REMOTE

if [[ -n "$DH_API_URL" ]]; then
  echo "==> Health: $DH_API_URL/api/_health"
  code="$(curl -s -o /dev/null -w '%{http_code}' "$DH_API_URL/api/_health" || true)"
  [[ "$code" == "204" ]] || { echo "publish-api: health check returned HTTP $code." >&2; exit 1; }
  echo "api is up."
fi

echo "==> Published $SHORT to $DH_SSH:$DH_API_ROOT."
```

Then `chmod +x scripts/dreamhost/publish-api.sh`.

- [ ] **Step 4: Delete the superseded test and run**

```bash
git rm -q apps/camis-php-oyl/test/deploy-script.test.ts
pnpm --filter @oyl/camis-php-oyl exec vitest run test/publish-api.test.ts
```

Expected: PASS (9 tests). Note `scripts/deploy-dreamhost.sh` still exists unchanged until Task 6; nothing tests it in between.

- [ ] **Step 5: Commit**

```bash
git add scripts/dreamhost/publish-api.sh apps/camis-php-oyl/test/publish-api.test.ts
git commit -m "refactor(deploy): extract scripts/dreamhost/publish-api.sh (BatchMode, login-shell preflight) from deploy-dreamhost.sh

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `scripts/dreamhost/publish-www.sh`

**Files:**
- Create: `scripts/dreamhost/publish-www.sh`
- Create: `apps/camis-php-oyl/test/publish-www.test.ts`

**Interfaces:**
- Consumes: `apps/vanilla-oyl/scripts/render-htaccess.mjs` (Task 3); the `<meta name="oyl-api-base">` contract (Task 1).
- Produces: `bash scripts/dreamhost/publish-www.sh [--dry-run]` reading `DH_SSH`, `DH_WWW_ROOT`, `DH_API_BASE` (required), `DH_SITE_URL`, `DH_CSP_HEADER`, `DH_WWW_SRC` (optional) from the environment only.

- [ ] **Step 1: Write the failing test**

Create `apps/camis-php-oyl/test/publish-www.test.ts`:

```ts
import { execFileSync, spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const SCRIPT = resolve(__dirname, "..", "..", "..", "scripts", "dreamhost", "publish-www.sh")
const src = () => readFileSync(SCRIPT, "utf8")

const INDEX = `<!doctype html><html><head>
<script>(function(){})()</script>
<script type="importmap">{"imports":{"@oyl/all-of-oyl":"/vendor/all-of-oyl/index.js"}}</script>
<meta name="oyl-api-base" content="" />
</head><body><script type="module" src="/src/main.js"></script></body></html>`

let tmp: string
let fixture: string
let bin: string
let capture: string

const writeExec = (path: string, body: string) => { writeFileSync(path, body); chmodSync(path, 0o755) }

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "publish-www-"))
  fixture = join(tmp, "app"); bin = join(tmp, "bin"); capture = join(tmp, "capture")
  for (const d of ["src", "styles", "vendor/all-of-oyl"]) mkdirSync(join(fixture, d), { recursive: true })
  mkdirSync(bin); mkdirSync(capture)
  writeFileSync(join(fixture, "index.html"), INDEX)
  writeFileSync(join(fixture, "src", "a.js"), "export const a = 1\n")
  writeFileSync(join(fixture, "src", "a.test.js"), "// must not ship\n")
  writeFileSync(join(fixture, "styles", "x.css"), "body{}\n")
  writeFileSync(join(fixture, "vendor", "all-of-oyl", "index.js"), "export {}\n")
  writeFileSync(join(fixture, "package.json"), "{}\n")
  writeExec(join(bin, "ssh"), "#!/usr/bin/env bash\nprintf '%s\\n' \"$@\" >> \"$FAKE_CAPTURE/ssh\"\nexit 0\n")
  // The push: record argv, the staged file list and the two rendered files before the script's trap removes the stage.
  writeExec(join(bin, "rsync"), [
    "#!/usr/bin/env bash",
    "printf '%s\\n' \"$@\" > \"$FAKE_CAPTURE/argv\"",
    "src=\"${@: -2:1}\"",
    "( cd \"$src\" && find . -type f | sort ) > \"$FAKE_CAPTURE/files\"",
    "cp \"$src/index.html\" \"$FAKE_CAPTURE/index.html\"",
    "cp \"$src/.htaccess\" \"$FAKE_CAPTURE/htaccess\"",
    "exit 0",
    "",
  ].join("\n"))
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

const run = (args: string[], env: Record<string, string>) =>
  spawnSync("bash", [SCRIPT, ...args], {
    env: { PATH: `${bin}:${process.env.PATH ?? ""}`, HOME: "/nonexistent", FAKE_CAPTURE: capture, ...env },
    encoding: "utf8",
  })
const good = () => ({ DH_SSH: "x@y", DH_WWW_ROOT: "www", DH_API_BASE: "https://api.example.test/api" })

describe("scripts/dreamhost/publish-www.sh", () => {
  it("parses", () => {
    expect(() => execFileSync("bash", ["-n", SCRIPT])).not.toThrow()
  })
  it("refuses to run without DH_SSH / DH_WWW_ROOT / DH_API_BASE and names them", () => {
    const res = run(["--dry-run"], {})
    expect(res.status).toBe(1)
    for (const k of ["DH_SSH", "DH_WWW_ROOT", "DH_API_BASE"]) expect(res.stderr).toContain(k)
  })
  it("rejects unknown arguments", () => {
    const res = run(["--yolo"], good())
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("unknown argument")
  })
  it("refuses an unbuilt source (vendor/all-of-oyl/index.js missing → run build:lib)", () => {
    rmSync(join(fixture, "vendor"), { recursive: true })
    const res = run([], { ...good(), DH_WWW_SRC: fixture })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("build:lib")
  })
  it("refuses an index.html without the oyl-api-base meta (it would silently fall back to same-origin /api)", () => {
    writeFileSync(join(fixture, "index.html"), INDEX.replace(/<meta name="oyl-api-base"[^>]*>/, ""))
    const res = run([], { ...good(), DH_WWW_SRC: fixture })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("oyl-api-base")
  })
  it("stages exactly the four asset roots + .htaccess + DEPLOYED, without *.test.js, injects the base and pushes with --delete", () => {
    const res = run([], { ...good(), DH_API_BASE: "https://api.example.test/api/", DH_WWW_SRC: fixture })
    expect(res.status, res.stderr).toBe(0)
    const files = readFileSync(join(capture, "files"), "utf8").trim().split("\n")
    expect(files).toEqual([
      "./.htaccess", "./DEPLOYED", "./index.html", "./src/a.js", "./styles/x.css", "./vendor/all-of-oyl/index.js",
    ])
    const html = readFileSync(join(capture, "index.html"), "utf8")
    expect(html).toContain('<meta name="oyl-api-base" content="https://api.example.test/api" />')
    const htaccess = readFileSync(join(capture, "htaccess"), "utf8")
    expect(htaccess.match(/'sha256-[A-Za-z0-9+/=]+'/g)).toHaveLength(2)
    expect(htaccess).toContain("connect-src 'self' https://api.example.test;")
    expect(htaccess).toContain("Header always set Content-Security-Policy ")
    const argv = readFileSync(join(capture, "argv"), "utf8").trim().split("\n")
    expect(argv).toContain("--delete")
    expect(argv).toContain("--exclude")
    expect(argv).toContain(".well-known/")
    expect(argv.some((a) => a.includes("BatchMode=yes"))).toBe(true)
    expect(argv.at(-1)).toBe("x@y:www/")
  })
  it("an empty DH_CSP_HEADER (unset GitHub variable) still renders the enforcing header; report-only is honoured", () => {
    let res = run([], { ...good(), DH_WWW_SRC: fixture, DH_CSP_HEADER: "" })
    expect(res.status, res.stderr).toBe(0)
    expect(readFileSync(join(capture, "htaccess"), "utf8")).toContain("Header always set Content-Security-Policy \"")
    res = run([], { ...good(), DH_WWW_SRC: fixture, DH_CSP_HEADER: "Content-Security-Policy-Report-Only" })
    expect(res.status, res.stderr).toBe(0)
    expect(readFileSync(join(capture, "htaccess"), "utf8")).toContain("Content-Security-Policy-Report-Only")
  })
  it("--dry-run passes -n to rsync and runs no remote step", () => {
    const res = run(["--dry-run"], { ...good(), DH_WWW_SRC: fixture })
    expect(res.status, res.stderr).toBe(0)
    expect(readFileSync(join(capture, "argv"), "utf8").split("\n")).toContain("-n")
    expect(res.stdout).toContain("DRY RUN")
  })
  it("never weakens host-key checking", () => {
    expect(src()).not.toContain("StrictHostKeyChecking=no")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/camis-php-oyl exec vitest run test/publish-www.test.ts`
Expected: FAIL — script not found.

- [ ] **Step 3: Create the script**

Create `scripts/dreamhost/publish-www.sh`:

```bash
#!/usr/bin/env bash
# Publish the static vanilla-oyl app to DreamHost: stage the four asset roots, inject the API
# base, render .htaccess (scoped SPA fallback + hashed CSP), rsync, health-check.
# Shared by .github/workflows/deploy.yml and scripts/deploy-dreamhost.sh — all config comes from
# the environment; this file is git-tracked and must never hold a host, user, path or secret.
#
#   DH_SSH         user@host (required)
#   DH_WWW_ROOT    web directory relative to the SSH user's home (required)
#   DH_API_BASE    https://<api-domain>/api — injected into index.html; its origin feeds CSP (required)
#   DH_SITE_URL    https://<app-domain> — enables the external health checks (optional)
#   DH_CSP_HEADER  Content-Security-Policy (default) | Content-Security-Policy-Report-Only
#   DH_WWW_SRC     app source dir (default apps/vanilla-oyl; a test seam)
#
# Usage: publish-www.sh [--dry-run]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DRY_RUN=0
if [[ $# -gt 0 ]]; then
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "publish-www: unknown argument '$1' (only --dry-run is supported)." >&2; exit 1 ;;
  esac
  if [[ $# -gt 1 ]]; then
    echo "publish-www: too many arguments." >&2
    exit 1
  fi
fi

DH_SSH="${DH_SSH:-}"; DH_WWW_ROOT="${DH_WWW_ROOT:-}"; DH_API_BASE="${DH_API_BASE:-}"
DH_SITE_URL="${DH_SITE_URL:-}"
CSP_HEADER="${DH_CSP_HEADER:-Content-Security-Policy}"
SRC="${DH_WWW_SRC:-$REPO_ROOT/apps/vanilla-oyl}"
missing=()
if [[ -z "$DH_SSH" ]]; then missing+=(DH_SSH); fi
if [[ -z "$DH_WWW_ROOT" ]]; then missing+=(DH_WWW_ROOT); fi
if [[ -z "$DH_API_BASE" ]]; then missing+=(DH_API_BASE); fi
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "publish-www: missing required environment: ${missing[*]} (optional: DH_SITE_URL, DH_CSP_HEADER, DH_WWW_SRC)." >&2
  exit 1
fi
url_re="^https?://[^[:space:]\"'<>]+\$"
if [[ ! "$DH_API_BASE" =~ $url_re ]]; then
  echo "publish-www: DH_API_BASE must be an http(s) URL without quotes or whitespace." >&2
  exit 1
fi
# Trim trailing slashes — config.js normalizes too, but the shipped HTML should already be clean.
while [[ "$DH_API_BASE" == */ ]]; do DH_API_BASE="${DH_API_BASE%/}"; done

if [[ ! -f "$SRC/index.html" ]]; then
  echo "publish-www: $SRC/index.html not found." >&2
  exit 1
fi
if [[ ! -f "$SRC/vendor/all-of-oyl/index.js" ]]; then
  echo "publish-www: $SRC/vendor/all-of-oyl is missing — run 'pnpm vanilla build:lib' first." >&2
  exit 1
fi
if ! grep -q '<meta name="oyl-api-base"' "$SRC/index.html"; then
  echo "publish-www: index.html has no <meta name=\"oyl-api-base\"> — the app would fall back to same-origin /api. Restore the tag." >&2
  exit 1
fi

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=8)
SHORT="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"

echo "==> Preflight: ssh $DH_SSH"
ssh "${SSH_OPTS[@]}" "$DH_SSH" true \
  || { echo "publish-www: cannot ssh to $DH_SSH (check key/agent and known_hosts)." >&2; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "==> Staging index.html, src/, styles/, vendor/ from $SRC (without *.test.js)"
cp "$SRC/index.html" "$STAGE/index.html"
for root in src styles vendor; do
  cp -R "$SRC/$root" "$STAGE/$root"
done
find "$STAGE" -name '*.test.js' -type f -delete

echo "==> Injecting API base: $DH_API_BASE"
node -e '
  const fs = require("fs")
  const [file, base] = process.argv.slice(1)
  const html = fs.readFileSync(file, "utf8")
  const re = /<meta name="oyl-api-base" content="[^"]*"\s*\/?>/
  if (!re.test(html)) { console.error("publish-www: meta tag not found during injection"); process.exit(1) }
  fs.writeFileSync(file, html.replace(re, `<meta name="oyl-api-base" content="${base}" />`))
' "$STAGE/index.html" "$DH_API_BASE"

API_ORIGIN="$(node -e 'console.log(new URL(process.argv[1]).origin)' "$DH_API_BASE")"
echo "==> Rendering .htaccess ($CSP_HEADER; connect-src $API_ORIGIN)"
node "$REPO_ROOT/apps/vanilla-oyl/scripts/render-htaccess.mjs" \
  --html "$STAGE/index.html" --api-origin "$API_ORIGIN" --csp-header "$CSP_HEADER" --out "$STAGE/.htaccess"

printf 'sha=%s\ndeployed_utc=%s\n' "$(git -C "$REPO_ROOT" rev-parse HEAD)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STAGE/DEPLOYED"

# .well-known/ is DreamHost's (certificate validation); protect it from --delete.
RSYNC_FLAGS=(-a --delete --exclude '.well-known/' -e 'ssh -o BatchMode=yes')

if [[ $DRY_RUN -eq 1 ]]; then
  echo "==> DRY RUN: rsync delta ($SHORT -> $DH_SSH:$DH_WWW_ROOT); nothing will change"
  rsync -n -i "${RSYNC_FLAGS[@]}" "$STAGE"/ "$DH_SSH:$DH_WWW_ROOT"/
  echo "==> DRY RUN complete; no remote steps executed."
  exit 0
fi

echo "==> Syncing -> $DH_SSH:$DH_WWW_ROOT"
rsync "${RSYNC_FLAGS[@]}" "$STAGE"/ "$DH_SSH:$DH_WWW_ROOT"/

if [[ -n "$DH_SITE_URL" ]]; then
  echo "==> Health: $DH_SITE_URL"
  code="$(curl -s -o /dev/null -w '%{http_code}' "$DH_SITE_URL/" || true)"
  [[ "$code" == "200" ]] || { echo "publish-www: GET / returned HTTP $code." >&2; exit 1; }
  body="$(curl -s -w '\n%{http_code}' "$DH_SITE_URL/journal" || true)"
  [[ "${body##*$'\n'}" == "200" && "$body" == *'type="importmap"'* ]] \
    || { echo "publish-www: deep link /journal did not serve index.html (SPA fallback broken)." >&2; exit 1; }
  code="$(curl -s -o /dev/null -w '%{http_code}' "$DH_SITE_URL/vendor/does-not-exist.js" || true)"
  [[ "$code" == "404" ]] || { echo "publish-www: missing asset returned HTTP $code, expected 404 (fallback not scoped)." >&2; exit 1; }
  code="$(curl -s -o /dev/null -w '%{http_code}' "$DH_SITE_URL/DEPLOYED" || true)"
  [[ "$code" == "403" ]] || { echo "publish-www: /DEPLOYED returned HTTP $code, expected 403." >&2; exit 1; }
  echo "site is up; SPA fallback scoped; DEPLOYED denied."
fi

echo "==> Published $SHORT to $DH_SSH:$DH_WWW_ROOT."
```

Then `chmod +x scripts/dreamhost/publish-www.sh`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oyl/camis-php-oyl exec vitest run test/publish-www.test.ts`
Expected: PASS (9 tests). If the "stages exactly…" test's `files` differ only by ordering, the fake uses `sort`, so check the script staged something extra and fix the script, not the test.

- [ ] **Step 5: Commit**

```bash
git add scripts/dreamhost/publish-www.sh apps/camis-php-oyl/test/publish-www.test.ts
git commit -m "feat(deploy): scripts/dreamhost/publish-www.sh — stage, inject API base, render .htaccess, rsync, health

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Local wrapper `scripts/deploy-dreamhost.sh` + housekeeping it depends on

**Files:**
- Modify: `scripts/deploy-dreamhost.sh` (rewrite)
- Create: `apps/camis-php-oyl/test/deploy-dreamhost.test.ts`
- Modify: `apps/camis-php-oyl/package.json:12` (`deploy` script)
- Modify: `apps/strapi-oyl/.gitignore` (+ `git rm --cached apps/strapi-oyl/.strapi-updater.json`)

**Interfaces:**
- Consumes: `publish-www.sh`, `publish-api.sh` env contracts (Tasks 4–5).
- Produces: `pnpm deploy:dreamhost [--dry-run] [--only www|api]`.

- [ ] **Step 1: Write the failing test**

Create `apps/camis-php-oyl/test/deploy-dreamhost.test.ts`:

```ts
import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const SCRIPT = resolve(__dirname, "..", "..", "..", "scripts", "deploy-dreamhost.sh")
const src = () => readFileSync(SCRIPT, "utf8")
const run = (args: string[], env: Record<string, string>) =>
  spawnSync("bash", [SCRIPT, ...args], { env: { PATH: process.env.PATH ?? "", HOME: "/nonexistent", ...env }, encoding: "utf8" })

describe("scripts/deploy-dreamhost.sh (local wrapper)", () => {
  it("parses", () => {
    expect(() => execFileSync("bash", ["-n", SCRIPT])).not.toThrow()
  })
  it("refuses to run without OYL_DH_SSH and lists every OYL_DH_* key to add to .env", () => {
    const res = run(["--dry-run"], { OYL_DH_SSH: "" })
    expect(res.status).toBe(1)
    for (const k of ["OYL_DH_SSH", "OYL_DH_WWW_ROOT", "OYL_DH_API_ROOT", "OYL_DH_API_BASE", "OYL_DH_SITE_URL", "OYL_DH_API_URL", "OYL_DH_CSP_HEADER"]) {
      expect(res.stderr, k).toContain(k)
    }
    expect(res.stderr).not.toContain("OYL_DH_APP_ROOT")
  })
  it("validates --only", () => {
    let res = run(["--only", "pi"], { OYL_DH_SSH: "x@y" })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("--only")
    res = run(["--only"], { OYL_DH_SSH: "x@y" })
    expect(res.status).toBe(1)
    res = run(["--yolo"], { OYL_DH_SSH: "x@y" })
    expect(res.status).toBe(1)
    expect(res.stderr).toContain("unknown argument")
  })
  it("checks for a dirty tree before building or publishing anything, and delegates to the shared publish scripts", () => {
    const s = src()
    const dirty = s.indexOf("git status --porcelain")
    expect(dirty).toBeGreaterThan(-1)
    for (const later of ["pnpm vanilla build:lib", "pnpm php-app build", "dreamhost/publish-www.sh", "dreamhost/publish-api.sh"]) {
      expect(s.indexOf(later), later).toBeGreaterThan(dirty)
    }
    expect(s).not.toContain("rsync ")
    expect(s).not.toContain("composer install")
  })
  it("never sources .env wholesale", () => {
    expect(src()).not.toMatch(/^\s*(source|\.)\s+.*\.env/m)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/camis-php-oyl exec vitest run test/deploy-dreamhost.test.ts`
Expected: FAIL — the key-listing test (no `OYL_DH_WWW_ROOT` in stderr) and the delegation test.

- [ ] **Step 3: Rewrite the wrapper**

Replace `scripts/deploy-dreamhost.sh` entirely with:

```bash
#!/usr/bin/env bash
# Deploy the committed HEAD to DreamHost from a developer machine: the static app (www) and
# the PHP API (api). CI runs the same scripts/dreamhost/publish-*.sh; this wrapper only
# resolves config, checks the tree, builds, and delegates.
#
# Config comes from env vars or OYL_DH_* keys in the UNTRACKED root .env —
# never hard-code host/user/paths here: this file is git-tracked.
#
# Usage: pnpm deploy:dreamhost [--dry-run] [--only www|api]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY_RUN=0
ONLY=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --only)
      if [[ $# -lt 2 ]]; then echo "deploy-dreamhost: --only needs www or api." >&2; exit 1; fi
      case "$2" in
        www|api) ONLY="$2" ;;
        *) echo "deploy-dreamhost: --only accepts www or api, got '$2'." >&2; exit 1 ;;
      esac
      shift 2 ;;
    *) echo "deploy-dreamhost: unknown argument '$1' (supported: --dry-run, --only www|api)." >&2; exit 1 ;;
  esac
done

# Read KEY from the environment (set, even if empty, wins), else from the root .env
# (specific keys only — .env holds unrelated credentials and must never be sourced wholesale).
env_key() {
  local key="$1" val
  if [[ -n "${!key+x}" ]]; then
    printf '%s' "${!key}"
    return
  fi
  val=""
  if [[ -f "$REPO_ROOT/.env" ]]; then
    val="$(grep -E "^${key}=" "$REPO_ROOT/.env" | tail -1 | cut -d= -f2- | tr -d '\r' || true)"
    val="${val%\"}"; val="${val#\"}"
  fi
  printf '%s' "$val"
}

export DH_SSH="$(env_key OYL_DH_SSH)"
export DH_WWW_ROOT="$(env_key OYL_DH_WWW_ROOT)"
export DH_API_ROOT="$(env_key OYL_DH_API_ROOT)"
export DH_API_BASE="$(env_key OYL_DH_API_BASE)"
export DH_SITE_URL="$(env_key OYL_DH_SITE_URL)"
export DH_API_URL="$(env_key OYL_DH_API_URL)"
export DH_CSP_HEADER="$(env_key OYL_DH_CSP_HEADER)"

if [[ -z "$DH_SSH" ]]; then
  cat >&2 <<'EOF'
deploy-dreamhost: OYL_DH_SSH is not set.
Add these lines to the untracked root .env (or export them in your shell):
  OYL_DH_SSH=<user>@<dreamhost-server>
  OYL_DH_WWW_ROOT=domains/<…>/www            # app web dir, relative to the SSH user's home
  OYL_DH_API_ROOT=domains/<…>/camis          # API root; laravel/ lives under it
  OYL_DH_API_BASE=https://<api-domain>/api   # injected into index.html + CSP connect-src
  # optional:
  OYL_DH_SITE_URL=https://<app-domain>       # enables the www health checks
  OYL_DH_API_URL=https://<api-domain>        # enables the api health check
  OYL_DH_CSP_HEADER=Content-Security-Policy-Report-Only   # first deploy only
EOF
  exit 1
fi

DO_WWW=1; DO_API=1
case "$ONLY" in www) DO_API=0 ;; api) DO_WWW=0 ;; esac

cd "$REPO_ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "deploy-dreamhost: working tree is dirty — commit or stash first (deploys ship committed HEAD only)." >&2
  exit 1
fi

FLAGS=()
[[ $DRY_RUN -eq 1 ]] && FLAGS+=(--dry-run)

if [[ $DO_WWW -eq 1 ]]; then
  echo "==> Building the static app (all-of-oyl dist → vendor)"
  pnpm vanilla build:lib >/dev/null
  bash "$REPO_ROOT/scripts/dreamhost/publish-www.sh" "${FLAGS[@]+"${FLAGS[@]}"}"
fi

if [[ $DO_API -eq 1 ]]; then
  echo "==> Building laravel/ from HEAD"
  pnpm --filter @oyl/camis-php-oyl build >/dev/null
  bash "$REPO_ROOT/scripts/dreamhost/publish-api.sh" "${FLAGS[@]+"${FLAGS[@]}"}"
fi

echo "==> Done ($(git rev-parse --short HEAD))."
```

- [ ] **Step 4: Point the PHP package's `deploy` script at the api target only**

In `apps/camis-php-oyl/package.json` change
`"deploy": "bash ../../scripts/deploy-dreamhost.sh",` to
`"deploy": "bash ../../scripts/deploy-dreamhost.sh --only api",`.

- [ ] **Step 5: Untrack `.strapi-updater.json`**

Strapi rewrites it on every build/develop, which would make the wrapper's dirty-tree check fail for anyone who built locally.

```bash
git rm -q --cached apps/strapi-oyl/.strapi-updater.json
printf '.strapi-updater.json\n' >> apps/strapi-oyl/.gitignore
git status --short apps/strapi-oyl
```

Expected: `D  apps/strapi-oyl/.strapi-updater.json` and ` M apps/strapi-oyl/.gitignore`; the file stays on disk.

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @oyl/camis-php-oyl exec vitest run test/deploy-dreamhost.test.ts && pnpm php-app test && pnpm php-app typecheck`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add scripts/deploy-dreamhost.sh apps/camis-php-oyl/test/deploy-dreamhost.test.ts apps/camis-php-oyl/package.json apps/strapi-oyl/.gitignore
git commit -m "refactor(deploy): deploy-dreamhost.sh is a thin wrapper over publish-www/api (--only); untrack .strapi-updater.json

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: GitHub Actions workflow + Node pin

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `package.json` (root; `engines.node`)
- Create: `apps/camis-php-oyl/test/workflow.test.ts`

**Interfaces:**
- Consumes: `publish-www.sh` / `publish-api.sh` env contracts; secrets `DH_SSH_KEY`, `DH_KNOWN_HOSTS`, `DH_SSH`; variables `DH_WWW_ROOT`, `DH_API_ROOT`, `DH_API_BASE`, `DH_SITE_URL`, `DH_API_URL`, `DH_CSP_HEADER`.
- Produces: `env.CAMIS_REF` — the pinned `hynding/camis` commit.

- [ ] **Step 1: Resolve the camis SHA to pin and confirm it is on GitHub**

```bash
git -C ../camis fetch -q origin
git -C ../camis rev-parse HEAD
git -C ../camis merge-base --is-ancestor HEAD origin/master && echo "on origin/master"
```

Expected: a 40-hex SHA (at plan time: `e78a6a6aaa1aa1d74a057b1dce811e8853fc1493`) and `on origin/master`. If the ancestor check fails, push camis first; CI fetches by SHA and GitHub only serves reachable commits.

- [ ] **Step 2: Write the failing test**

Create `apps/camis-php-oyl/test/workflow.test.ts`:

```ts
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = resolve(__dirname, "..", "..", "..")
const yml = readFileSync(resolve(ROOT, ".github", "workflows", "deploy.yml"), "utf8")
const rootPkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { engines?: { node?: string } }

describe(".github/workflows/deploy.yml", () => {
  it("deploys on push to master and on manual dispatch only", () => {
    expect(yml).toMatch(/on:\s*\n\s+push:\s*\n\s+branches:\s*\[master\]\s*\n\s+workflow_dispatch:/)
    expect(yml).not.toMatch(/pull_request/)
    expect(yml).not.toMatch(/branches:\s*\[main\]/)
  })
  it("serialises deploys instead of cancelling an rsync mid-flight", () => {
    expect(yml).toMatch(/concurrency:\s*\n\s+group: deploy\s*\n\s+cancel-in-progress: false/)
  })
  it("pins Node 22 in both the workflow and root package.json#engines.node", () => {
    expect(rootPkg.engines?.node).toBe("22.x")
    expect(yml).toMatch(/NODE_VERSION: ['"]22['"]/)
    expect(yml).toContain("node-version: ${{ env.NODE_VERSION }}")
  })
  it("pins hynding/camis to a full 40-hex SHA (branch names and short SHAs cannot be fetched by CI)", () => {
    const m = /CAMIS_REF:\s*([0-9a-f]+)\s*$/m.exec(yml)
    expect(m, "CAMIS_REF missing").not.toBeNull()
    expect(m![1]).toMatch(/^[0-9a-f]{40}$/)
    expect(yml).toContain('git fetch --depth 1 origin "$CAMIS_REF"')
  })
  it("gates on tests + typecheck (after strapi build, with PHP available) before any SSH step", () => {
    const i = (s: string) => { const k = yml.indexOf(s); expect(k, s).toBeGreaterThan(-1); return k }
    expect(i("shivammathur/setup-php")).toBeLessThan(i("run: pnpm test"))
    expect(i("run: pnpm strapi-app build")).toBeLessThan(i("run: pnpm test"))
    expect(i("run: pnpm test")).toBeLessThan(i("run: pnpm typecheck"))
    expect(i("run: pnpm typecheck")).toBeLessThan(i("webfactory/ssh-agent"))
    expect(i("webfactory/ssh-agent")).toBeLessThan(i("publish-www.sh"))
    expect(i("webfactory/ssh-agent")).toBeLessThan(i("publish-api.sh"))
  })
  it("path filters: the shared core triggers both targets; each target's publish script and the workflow itself are included", () => {
    const www = yml.slice(yml.indexOf("www:\n"), yml.indexOf("api:\n"))
    const api = yml.slice(yml.indexOf("api:\n"), yml.indexOf("- id: targets"))
    for (const block of [www, api]) {
      expect(block).toContain("'packages/all-of-oyl/**'")
      expect(block).toContain("'pnpm-lock.yaml'")
      expect(block).toContain("'.github/workflows/deploy.yml'")
    }
    expect(www).toContain("'apps/vanilla-oyl/**'")
    expect(www).toContain("'scripts/dreamhost/publish-www.sh'")
    expect(api).toContain("'apps/camis-php-oyl/**'")
    expect(api).toContain("'apps/strapi-oyl/src/api/**'")
    expect(api).toContain("'apps/strapi-oyl/src/components/**'")
    expect(api).toContain("'scripts/dreamhost/publish-api.sh'")
  })
  it("pins the host key from a secret and never disables host-key checking; no secret is echoed", () => {
    expect(yml).toContain("secrets.DH_KNOWN_HOSTS")
    expect(yml).toContain("known_hosts")
    expect(yml).not.toContain("StrictHostKeyChecking=no")
    expect(yml).not.toMatch(/echo[^\n]*secrets\.DH_SSH_KEY/)
  })
  it("maps every DH_* input the publish scripts read", () => {
    for (const v of ["DH_SSH", "DH_WWW_ROOT", "DH_API_ROOT", "DH_API_BASE", "DH_SITE_URL", "DH_API_URL", "DH_CSP_HEADER"]) {
      expect(yml, v).toMatch(new RegExp(`${v}: \\$\\{\\{ (secrets|vars)\\.${v} \\}\\}`))
    }
    expect(yml).not.toMatch(/OYL_DH_/)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @oyl/camis-php-oyl exec vitest run test/workflow.test.ts`
Expected: FAIL — ENOENT on `deploy.yml`.

- [ ] **Step 4: Pin Node in the root manifest**

In root `package.json`, change

```json
  "engines": {
    "pnpm": ">=10.6.1"
  },
```

to

```json
  "engines": {
    "node": "22.x",
    "pnpm": ">=10.6.1"
  },
```

Run `pnpm install --frozen-lockfile` once locally to confirm the engine constraint is satisfied by the dev machine's Node (if not, `nvm use 22` / `corepack` — Strapi caps at 22 and camis needs ≥22).

- [ ] **Step 5: Write the workflow**

Create `.github/workflows/deploy.yml` (replace the `CAMIS_REF` value with the SHA from Step 1):

```yaml
name: Deploy to DreamHost

on:
  push:
    branches: [master]
  workflow_dispatch:

# Two pushes queue; never cancel a deploy mid-rsync.
concurrency:
  group: deploy
  cancel-in-progress: false

env:
  # hynding/camis commit that apps/camis-php-oyl links @camis/cli from. Bump deliberately, in a
  # commit that says why; CI fetches this exact SHA (branch names / short SHAs cannot be fetched).
  CAMIS_REF: e78a6a6aaa1aa1d74a057b1dce811e8853fc1493
  # Strapi allows <=22.x and camis needs >=22 — see root package.json#engines.node.
  NODE_VERSION: '22'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - id: changes
        if: github.event_name == 'push'
        uses: dorny/paths-filter@v3
        with:
          filters: |
            www:
              - 'packages/all-of-oyl/**'
              - 'apps/vanilla-oyl/**'
              - 'pnpm-lock.yaml'
              - 'scripts/dreamhost/publish-www.sh'
              - '.github/workflows/deploy.yml'
            api:
              - 'packages/all-of-oyl/**'
              - 'apps/strapi-oyl/src/api/**'
              - 'apps/strapi-oyl/src/components/**'
              - 'apps/camis-php-oyl/**'
              - 'pnpm-lock.yaml'
              - 'scripts/dreamhost/publish-api.sh'
              - '.github/workflows/deploy.yml'

      - id: targets
        name: Decide targets (manual runs deploy both)
        env:
          EVENT: ${{ github.event_name }}
          WWW: ${{ steps.changes.outputs.www }}
          API: ${{ steps.changes.outputs.api }}
        run: |
          if [ "$EVENT" = workflow_dispatch ]; then WWW=true; API=true; fi
          echo "www=$WWW" >> "$GITHUB_OUTPUT"
          echo "api=$API" >> "$GITHUB_OUTPUT"
          echo "targets: www=$WWW api=$API"

      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm

      # PHP before the gate: camis-php-oyl's overlay tests run `php -l` when PHP is present.
      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.3'
          tools: composer
          extensions: pdo_sqlite, pdo_mysql, mbstring, openssl

      - name: Composer cache
        uses: actions/cache@v4
        with:
          path: ~/.cache/composer
          key: composer-${{ runner.os }}-${{ env.CAMIS_REF }}
          restore-keys: composer-${{ runner.os }}-

      - name: Clone camis at CAMIS_REF (sibling of the checkout, where the workspace link points)
        run: |
          set -euo pipefail
          dir="$GITHUB_WORKSPACE/../camis"
          mkdir -p "$dir" && cd "$dir"
          git init -q
          git remote add origin https://github.com/hynding/camis.git
          git fetch --depth 1 origin "$CAMIS_REF"
          git checkout -q FETCH_HEAD
          pnpm install --frozen-lockfile

      - run: pnpm install --frozen-lockfile
      - run: pnpm strapi-app build
      - run: pnpm test
      - run: pnpm typecheck

      - if: steps.targets.outputs.www == 'true' || steps.targets.outputs.api == 'true'
        uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.DH_SSH_KEY }}

      - if: steps.targets.outputs.www == 'true' || steps.targets.outputs.api == 'true'
        name: Pin the DreamHost host key
        env:
          KNOWN_HOSTS: ${{ secrets.DH_KNOWN_HOSTS }}
        run: |
          mkdir -p ~/.ssh && chmod 700 ~/.ssh
          printf '%s\n' "$KNOWN_HOSTS" >> ~/.ssh/known_hosts
          chmod 600 ~/.ssh/known_hosts

      - if: steps.targets.outputs.www == 'true'
        name: Publish www (static app)
        env:
          DH_SSH: ${{ secrets.DH_SSH }}
          DH_WWW_ROOT: ${{ vars.DH_WWW_ROOT }}
          DH_API_BASE: ${{ vars.DH_API_BASE }}
          DH_SITE_URL: ${{ vars.DH_SITE_URL }}
          DH_CSP_HEADER: ${{ vars.DH_CSP_HEADER }}
        run: |
          pnpm vanilla build:lib
          bash scripts/dreamhost/publish-www.sh

      - if: steps.targets.outputs.api == 'true'
        name: Publish api (camis-php-oyl)
        env:
          DH_SSH: ${{ secrets.DH_SSH }}
          DH_API_ROOT: ${{ vars.DH_API_ROOT }}
          DH_API_URL: ${{ vars.DH_API_URL }}
        run: |
          pnpm php-app build
          bash scripts/dreamhost/publish-api.sh

      - if: always()
        name: Summary
        env:
          WWW: ${{ steps.targets.outputs.www }}
          API: ${{ steps.targets.outputs.api }}
        run: |
          {
            echo "## Deploy ${GITHUB_SHA::7}"
            echo "- www: ${WWW:-false}"
            echo "- api: ${API:-false}"
            echo "- status: ${{ job.status }}"
          } >> "$GITHUB_STEP_SUMMARY"
```

- [ ] **Step 6: Run the test to verify it passes; whole PHP package green**

Run: `pnpm --filter @oyl/camis-php-oyl exec vitest run test/workflow.test.ts && pnpm php-app test && pnpm php-app typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/deploy.yml package.json apps/camis-php-oyl/test/workflow.test.ts
git commit -m "feat(ci): deploy master to DreamHost — gate on tests+typecheck, path-filtered www/api publishes, camis pinned by SHA

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Retire the Pi deploy and update the docs

**Files:**
- Delete: `scripts/deploy-pi.sh`
- Modify: `package.json` (root; remove `deploy:pi`)
- Modify: `docs/superpowers/specs/2026-07-20-pi-deploy-script-design.md:4`
- Modify: `TODO.md:36-43` (remove the block)
- Modify: `CLAUDE.md:46,52,105` and the `camis-php-oyl` table row's "Acceptance" sentence
- Modify: `apps/camis-php-oyl/README.md:26,73-85`
- Modify: `packages/ocari-oyl/src/config.ts:35` (comment)

- [ ] **Step 1: Remove the Pi deploy**

```bash
git rm -q scripts/deploy-pi.sh
```

In root `package.json` delete the line `"deploy:pi": "bash scripts/deploy-pi.sh",`.

In `docs/superpowers/specs/2026-07-20-pi-deploy-script-design.md` change line 4 to:

```markdown
**Status:** Superseded 2026-09 by `2026-09-29-dreamhost-ci-deploy-design.md` (the Pi no longer hosts OYL); kept as history
```

In `TODO.md` delete the whole `## deploy-pi hardening follow-ups …` block (lines 36–43).

In `packages/ocari-oyl/src/config.ts` line 35 change `(deploy-pi pattern)` to `(same rules as scripts/deploy-dreamhost.sh)`.

- [ ] **Step 2: CLAUDE.md**

Replace line 46 (`pnpm deploy:pi …`) with nothing (delete it). Replace line 52 with:

```
pnpm deploy:dreamhost    # manual deploy of committed HEAD to DreamHost, both targets (config: OYL_DH_* in untracked root .env; --dry-run, --only www|api). CI does this on every push to master (.github/workflows/deploy.yml)
```

In the "Adding a content type" gotcha (line 105) replace `before `pnpm deploy:dreamhost` — the deploy's `camis:strapi-schema-check` fails otherwise.` with `before **pushing to master** — the CI deploy's `camis:strapi-schema-check` fails otherwise.`

In the `@oyl/camis-php-oyl` table row, append to the end of the description: ` **Production:** DreamHost; `.github/workflows/deploy.yml` deploys `master` (gate: `pnpm test` + `pnpm typecheck`), publishing via `scripts/dreamhost/publish-{www,api}.sh`; `hynding/camis` is pinned by `CAMIS_REF` in the workflow.`

In the `@oyl/vanilla-oyl` table row, append: ` **Production:** static files on DreamHost Apache; `deploy/htaccess.template` (scoped SPA fallback + hashed CSP) and the `<meta name="oyl-api-base">` seam are filled by `scripts/dreamhost/publish-www.sh` — see `apps/vanilla-oyl/deploy/README.md`.`

- [ ] **Step 3: `apps/camis-php-oyl/README.md`**

Line 26: replace with
```
pnpm deploy:dreamhost      # manual deploy (both targets; --only api for this package); CI does it on push to master
```

Replace the whole `## DreamHost one-time setup` section (lines 73–85) with:

```markdown
## DreamHost one-time setup

Values below are placeholders; the real ones live in the untracked root `.env` (`OYL_DH_*`)
and in the GitHub repository's secrets/variables — never in tracked files.

1. **Panel:** point the API domain's web directory at `~/<api-root>/laravel/public`
   (Laravel's `public/.htaccess` assumes it is the docroot) and set the domain to PHP 8.3 with
   HTTPS. Set the SSH user's CLI PHP to 8.3 as well (`~/.bash_profile` PATH) and install
   composer; verify with `ssh <user>@<host> 'bash -l -c "php -v; composer -V"'` — the publish
   script preflights exactly that.
2. **MySQL:** the database is the one strapi-oyl already runs against (shared schema,
   `storageLayout: "strapi"`). Add your developer IP to its "Allowable Hosts" for schema syncs;
   the web server is allowed by default.
3. **Skeleton + env:** `mkdir -p ~/<api-root>/laravel/{bootstrap/cache,storage/logs,storage/framework/cache,storage/app}`
   (these are the rsync-excluded directories, so the deploy never creates them; without
   `bootstrap/cache/` composer's `package:discover` fails) and make them writable by the PHP
   user. Create `laravel/.env` from `.env.example`: `DB_*` for that database, `APP_KEY`
   (generate one locally with `php artisan key:generate --show` or reuse your dev value),
   and `JWT_SECRET` — **at least 32 bytes** (`openssl rand -base64 48`); firebase/php-jwt
   refuses shorter HS256 keys, so Strapi's default short secret cannot be reused. Give the
   same value to Strapi for future schema syncs.
4. **Deploy key:** a CI-only keypair; public half in the SSH user's `~/.ssh/authorized_keys`.
   `ssh-keyscan <host>` for the pinned host key.
5. **GitHub:** secrets `DH_SSH_KEY`, `DH_KNOWN_HOSTS`, `DH_SSH`; variables `DH_WWW_ROOT`,
   `DH_API_ROOT`, `DH_API_BASE`, `DH_SITE_URL`, `DH_API_URL`, and `DH_CSP_HEADER=Content-Security-Policy-Report-Only`
   for the first deploy (unset it afterwards and re-run via *Run workflow*).
6. **Local mirror:** `OYL_DH_SSH`, `OYL_DH_WWW_ROOT`, `OYL_DH_API_ROOT`, `OYL_DH_API_BASE`,
   `OYL_DH_SITE_URL`, `OYL_DH_API_URL` in the root `.env`; `pnpm deploy:dreamhost --dry-run`
   shows the rsync delta and proves SSH.
7. Changing `CAMIS_AUTH_THROTTLE_PER_MINUTE` on the host requires `php artisan config:cache`
   (the publish script runs it).

## CI

`.github/workflows/deploy.yml` runs on every push to `master`: clones `hynding/camis` at
`CAMIS_REF` beside the checkout (the `@camis/cli` link target), installs, `strapi build`,
`pnpm test`, `pnpm typecheck`, then publishes whichever of `www` / `api` the push touched
(`packages/all-of-oyl` touches both; a manual *Run workflow* publishes both). To take a newer
camis: `git -C ../camis rev-parse HEAD`, confirm it is pushed, set `CAMIS_REF`, and say why in
the commit. A Strapi schema change needs the "Schema sync" above **before** the push, or the
api publish stops at `camis:strapi-schema-check`.
```

- [ ] **Step 4: Verify nothing references the Pi deploy any more; run the guards**

```bash
grep -rn 'deploy-pi\|deploy:pi\|OYL_PI_' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=log --exclude-dir=.remember . | grep -v 'docs/superpowers/specs/2026-07-20-pi-deploy-script-design.md'
pnpm php-app test && pnpm --filter @oyl/ocari-oyl test
```

Expected: the grep prints only the superseded Pi spec's own body (if anything); tests green.

- [ ] **Step 5: Commit**

```bash
git add -A scripts package.json TODO.md CLAUDE.md docs/superpowers/specs/2026-07-20-pi-deploy-script-design.md apps/camis-php-oyl/README.md packages/ocari-oyl/src/config.ts
git commit -m "chore(deploy): retire deploy-pi; document the DreamHost CI deploy and one-time setup

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Whole-branch verification

**Files:** none new.

- [ ] **Step 1: Full gates, exactly as CI will run them**

```bash
pnpm install --frozen-lockfile
pnpm strapi-app build
pnpm test
pnpm typecheck
pnpm all-of build
```

Expected: all green. `pnpm test` includes the new `publish-*`, `deploy-dreamhost`, `workflow` guards and the vanilla `deploy/` tests.

- [ ] **Step 2: e2e (the meta seam is the only app-facing change)**

```bash
pnpm vanilla build:lib
pnpm e2e
```

Expected: green on desktop + mobile. The hygiene fixture would catch a console error from the new `<meta>` handling or the `main.js` rewiring.

- [ ] **Step 3: Local dry-run of the real wrapper against an unreachable host (proves the arg/config path end to end without a server)**

```bash
OYL_DH_SSH=nobody@invalid.invalid OYL_DH_WWW_ROOT=www OYL_DH_API_ROOT=camis OYL_DH_API_BASE=https://api.example.test/api pnpm deploy:dreamhost --dry-run --only www; echo "exit=$?"
```

Expected: builds, then `publish-www: cannot ssh to nobody@invalid.invalid …`, `exit=1`. (A clean tree is required; commit first.)

- [ ] **Step 4: Update memory, then hand off**

Update the memory file `oyl-pi-deployment-progress.md` (and its `MEMORY.md` line) to record: Pi decommissioned for OYL per the 2026-09-29 spec; production = DreamHost via CI; Pi reserved for Ocari. Then follow `superpowers:finishing-a-development-branch`. The operator cutover (spec §6) happens after merge, outside this plan.
