# deploy/ — DreamHost publish inputs for the static app

Nothing here ships as-is. `scripts/dreamhost/publish-www.sh` (repo root) stages `index.html`,
`src/`, `styles/`, `vendor/` (minus `*.test.js`), then:

1. fills `<meta name="oyl-api-base" content="">` in the staged `index.html` with `DH_API_BASE`
   (`packages/all-of-oyl/src/client/storage/config.ts` (shared package, not vanilla) reads it first; empty = hostname rules, so dev and tests are unaffected);
2. runs `node scripts/render-htaccess.mjs` → `.htaccess` from `htaccess.template`: scoped SPA
   fallback (asset roots stay 404), `Cache-Control`, security headers and a CSP whose
   `script-src` carries one `sha256-` hash per inline `<script>` in `index.html`
   (`csp-hashes.js`) and whose `connect-src` is the API origin.

Adding an inline `<script>` to `index.html` needs no manual step — the hashes are recomputed on
every publish. `DH_CSP_HEADER=Content-Security-Policy-Report-Only` renders a report-only policy
for a first deploy.
