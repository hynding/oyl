# deploy/ — DreamHost publish inputs for the Stencil app

Nothing here ships as-is. `scripts/dreamhost/publish-www.sh` (repo root; run by
`.github/workflows/deploy.yml` on every push to `master` and by `pnpm deploy:dreamhost`) takes
the production build in `www/` (`pnpm stencil build` — a `--dev` build is refused), stages
`index.html`, `build/`, `themes/`, `tokens.css`, `favicon.svg` (minus source maps), then:

1. fills `<meta name="oyl-api-base" content="">` in the staged `index.html` with `DH_API_BASE`
   (`boot/compose.ts` reads it first; empty = hostname rules, so dev and tests are unaffected);
2. runs `node scripts/dreamhost/render-htaccess.mjs --template deploy/htaccess.template` →
   `.htaccess`: the SPA fallback scoped to the real asset roots (`/build`, `/themes`,
   `/tokens.css`, `/favicon.*` stay 404), `Cache-Control` (content-hashed `p-*` chunks
   immutable, everything else revalidated, the shell `no-cache`), security headers and a CSP
   whose `script-src` carries one `sha256-` hash per inline `<script>` in `index.html` (the
   anti-FOUC one; `scripts/dreamhost/lib/csp-hashes.mjs`) and whose `connect-src` is the API
   origin;
3. rsyncs with `--delete` into `DH_WWW_ROOT` and health-checks `/`, `/journal` (fallback),
   `/build/does-not-exist.js` (404), `/DEPLOYED` (403) and the `nosniff` header.

Stencil inlines the token/theme stylesheets (they are under its 3 KB inline limit), so nothing
requests `/themes/` or `/tokens.css` at runtime today; they ship anyway as the safety net for a
sheet that grows past the limit.

Configuration lives only in the environment (`DH_SSH`, `DH_WWW_ROOT`, `DH_API_BASE`,
`DH_SITE_URL`, `DH_CSP_HEADER`, `DH_API_ROOT`, `DH_FIRST_DEPLOY`; locally `OYL_DH_*` in the
untracked root `.env` via `pnpm deploy:dreamhost`). For the first deploy of a new policy, set
`DH_CSP_HEADER=Content-Security-Policy-Report-Only`, check the browser console on the live
site, then unset it and re-run the workflow. Rollback = revert the offending merge and push.
