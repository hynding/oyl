# Google OAuth Sign-in + Google Drive Files — Design

**Date:** 2026-08-18
**Status:** Approved design, pre-implementation
**Scope:** Sub-project 1 of the Google/Drive program (see Decomposition)

## Problem

OYL is online-first and account-required, but the only identity is a Strapi
email+password account, and the only file-shaped capability is a JSON backup
downloaded to the local disk. We want:

1. **Sign in with Google** as a first-class login method (email+password stays).
2. **General file storage in the user's own Google Drive** — starting with a
   `/files` screen, and laying the foundation for attachments, Drive backups,
   and the ocari receipt pipeline.

## Decomposition

Four capabilities share one foundation (Google OAuth + a Drive client). This
spec fully covers SP1; SP2–SP4 are follow-on sub-projects with their own specs.

| Sub-project | Contents | Status |
|---|---|---|
| **SP1** | Google sign-in, server-side Google connection, shared Drive client, `/files` screen | **This spec** |
| SP2 | Backup export/import to Drive | Future |
| SP3 | Attachments on records (record → Drive file reference model) | Future |
| SP4 | ocari Drive inbox/outbox (CLI consumer of the same connection) | Future |

## Architecture decision

**Server-brokered auth, client-direct Drive** (chosen over full server
proxying and over client-side Google Identity Services):

- Strapi runs the whole OAuth authorization-code flow and is the only holder
  of the client secret and refresh tokens.
- The browser gets short-lived Drive access tokens from a JWT-gated Strapi
  endpoint and calls the Drive REST API **directly** — file bytes never
  transit the Pi.
- Sign-in is a plain redirect (no external scripts), so the zero-dependency
  ethos and the strict production CSP survive; the only CSP change is adding
  `https://www.googleapis.com` to `connect-src`.
- **Scope: `drive.file` only** — a non-restricted scope (no Google security
  assessment needed). The app sees only files it created: it makes an "OYL"
  folder in the user's Drive and works entirely inside it. This fits all four
  sub-projects.

## Backend (`apps/strapi-oyl`)

### Content-type `google-account`

Server-side infrastructure, **not** a syncable domain record — it is NOT
registered in `@oyl/all-of-oyl` `src/collections.ts` and has **no public REST
routes**; it is reached only through the custom controller below (same pattern
as `bootstrap`).

| Field | Notes |
|---|---|
| `user` | one-to-one relation to `plugin::users-permissions.user` |
| `googleUserId` | the ID token `sub` claim; unique |
| `email` | Google account email at connect time |
| `scopes` | space-separated granted scopes |
| `connectedAt` | datetime |
| `refreshToken` | `private: true` (never serializes) **and** encrypted at rest with AES-256-GCM using the existing `ENCRYPTION_KEY` env |

New Strapi content-type checklist applies: run `strapi ts:generate-types` so
the UID registers, then use `as const` UIDs (no `as any`).

### Custom API `src/api/google/` (non-content-type routes, like `bootstrap`)

| Route | Auth | Behavior |
|---|---|---|
| `GET /api/google/config` | public | `{ configured: boolean }` — how the pre-auth login screen learns whether to show the Google button (it has no JWT, so this cannot live on the JWT-gated `status` route). |
| `GET /api/google/connect` | public | 302 to Google's auth URL. Scopes `openid email profile https://www.googleapis.com/auth/drive.file`, `access_type=offline`. `state` is HMAC-signed and short-lived (nonce, `mode`, `retried` flag, expiry; link mode adds the user id). Used directly (plain anchor) only for `mode=login`. |
| `GET /api/google/connect-url` | JWT | Returns `{ url }` — the Google auth URL with a signed `mode=link` state carrying the JWT-verified user id. The Profile screen fetches this with its JWT, then navigates to the returned URL. (A plain anchor cannot send an Authorization header, and a JWT in a query string would leak into server logs — hence this two-step.) |
| `GET /api/google/callback` | public | Verify `state`; exchange the code server-side; read the ID token (came directly from Google's token endpoint over TLS; still check `aud` == our client id). **login mode:** find user by `googleUserId`; else, if a user with that email already exists, redirect to `#google_error=account_exists` (NO silent auto-link — OYL registration never verifies email, so auto-linking would let an attacker pre-register a victim's email and capture their Google/Drive link; the user instead signs in with their password and links from Profile); else create a confirmed user with a random password. **link mode:** attach to the user id from state. Upsert `google-account`; store the refresh token when Google returns one. If no refresh token arrived and none is stored: when `retried` is unset, redirect once more with `prompt=consent` and `retried` set in state; when already set, fail to `#google_error=no_refresh_token` (no loop). Issue the standard OYL JWT via the users-permissions JWT service and redirect to `${APP_URL}/login#google=<jwt>` (URL **fragment** — never reaches server logs). Failures (denied consent, bad/expired state) redirect to `${APP_URL}/login#google_error=<code>`. |
| `GET /api/google/drive-token` | JWT | Use the stored refresh token to mint a short-lived Drive access token; return `{ accessToken, expiresAt }`. Cached per user in an in-process Map until expiry (lost on restart — harmless, a refresh mints a new one). Revoked/invalid refresh token → `410` (client interprets as "reconnect needed"). |
| `GET /api/google/status` | JWT | `{ connected, email, scopes }` for the Profile screen. |
| `POST /api/google/disconnect` | JWT | POST to Google's revoke endpoint, delete the `google-account` row. |

Permissions are granted in the bootstrap (`src/index.ts`) exactly like existing
grants (`grantRoleActions` already handles custom API actions — see
`api::bootstrap.bootstrap.find`): `config` + `connect` + `callback` to the
**public** role, the other four to **authenticated**.

**Key derivation (explicit, since it bakes into stored ciphertexts):**
- `state` HMAC: HMAC-SHA256 keyed by SHA-256(`"google-state:" + JWT_SECRET`).
- Refresh-token encryption: AES-256-GCM keyed by SHA-256(`ENCRYPTION_KEY`)
  (raw digest bytes as the 32-byte key), random 12-byte IV per record,
  IV + auth tag stored alongside the ciphertext.

### Config (env)

| Var | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth client credentials |
| `GOOGLE_REDIRECT_URI` | e.g. `http://localhost:1340/api/google/callback` |
| `APP_URL` | where the callback redirects back, e.g. `http://localhost:8041` |
| `GOOGLE_AUTH_BASE_URL`, `GOOGLE_TOKEN_URL`, `GOOGLE_REVOKE_URL` | default to real Google; overridable for the fake-Google test servers |

With `GOOGLE_CLIENT_ID`/`SECRET` unset, all five routes answer `501` and the
client hides every Google affordance. Dev without Google credentials keeps
working unchanged.

## Shared Drive client (`packages/all-of-oyl/src/google/`)

DOM-free, zero-dependency, Web globals injected (the `pnpm all-of build` gate
enforces this):

- `types.ts` — `DriveFile` (`id`, `name`, `mimeType`, `size`, `modifiedTime`),
  `AccessTokenProvider` (`getAccessToken(): Promise<string>`): the seam
  between the Drive client and its token source (browser store now, ocari CLI
  in SP4).
- `drive-client.ts` — `createDriveClient({ fetch, tokens, baseUrl? })` against
  Drive REST v3:
  - `ensureFolder(name)` — find-or-create the "OYL" folder
  - `list(folderId)` — `files.list` filtered by parent, paginated
  - `upload(folderId, name, mimeType, bytes)` — multipart create (always a new
    file; no name-match magic)
  - `update(fileId, mimeType, bytes)` — multipart overwrite of an existing file
  - `download(fileId)` — `files.get?alt=media` → bytes
  - `remove(fileId)`
  - On 401: request a fresh token once, retry once. Failures map to a typed
    `DriveError` (`unauthorized` | `not-found` | `rate-limited` | `network`),
    mirroring `HttpRepositoryError`.
- **Not** in `collections.ts`; file operations do **not** ride the outbox.
  Files are online-only with explicit error states (file bytes in a
  localStorage outbox would blow its quota; the durable-write contract is for
  records).
- Exported from the main `@oyl/all-of-oyl` entry — no new importmap entry
  needed; `pnpm vanilla build:lib` vendors it as-is.

## Vanilla app (`apps/vanilla-oyl`)

- **`src/state/google-store.js`** — signals: `connection` ∈ `unknown |
  unconfigured | disconnected | connected(email) | reconnect-needed`.
  Pre-auth, `unconfigured` comes from the public `/api/google/config`;
  signed-in, the JWT-gated `/api/google/status` fills in the rest. Implements
  `AccessTokenProvider` over `/api/google/drive-token` with
  refresh-before-expiry caching; a `410` flips state to `reconnect-needed`.
- **Login handoff** — `src/state/auth.js` gains `adoptTokenFromHash()`: on
  boot, `#google=<jwt>` → persist session, fetch `/users/me` for the user
  record, clean the hash with `replaceState`. `#google_error=<code>` → login
  screen renders a human-readable message, hash cleaned the same way.
- **`oyl-auth-form`** — a "Continue with Google" button on both login and
  register: a plain anchor to `${apiBase}/google/connect?mode=login`. Hidden
  in the `unconfigured` state.
- **Profile screen** — a Google Drive row: connected email + Disconnect;
  or Connect (authenticated fetch of `/api/google/connect-url`, then navigate
  to the returned URL); or a Reconnect prompt.
- **`/files` route + `oyl-files` screen** — new nav item. Lists the OYL
  folder (name, size, modified); Upload via hidden file input; Download
  fetches bytes through the Drive client and saves via the backup screen's
  download helper, **generalized/extracted to `(bytes, name, mimeType)`**
  (today's `download(doc)` in `main.js` is backup-specific and
  module-private); Delete with confirm. Non-list states: *not
  connected* (connect CTA), *reconnect needed*, *offline* (reuses the
  existing connectivity signal). After every mutation the list re-fetches —
  no optimistic inserts, so failed uploads leave no phantom rows.
- **Drive base URL override** — a localStorage key (same pattern as
  `oyl/api-base-url`) so tests can point the Drive client at a fake server.

## Error handling summary

| Failure | Behavior |
|---|---|
| Drive 401 mid-call | one silent token refresh + retry |
| `drive-token` 410 | `reconnect-needed` state; every Drive surface shows a Reconnect CTA |
| Other Drive errors | typed `DriveError` → inline message/toast, never a console error (e2e hygiene enforces) |
| OAuth callback failure | redirect to `/login#google_error=<code>`, human message; codes: `denied`, `bad_state`, `account_exists`, `no_refresh_token`, `exchange_failed` |
| Google env unset | routes answer 501; client renders no Google UI |
| Offline | `/files` shows the offline state; no queued file operations |

## Testing

- **`all-of-oyl` (vitest):** `drive-client` against a fake `FetchFn` —
  multipart body shape, pagination, 401-retry-once, error mapping,
  `ensureFolder` find-vs-create. No network.
- **`strapi-oyl` (vitest smoke):** a small fake-Google server (`node:http`,
  test-owned, started before Strapi boots so the `GOOGLE_*_URL` env overrides
  are set at `boot()`). Asserts: state verification, code exchange,
  find-or-create, `account_exists` rejection for an existing email, link
  mode, no-refresh-token retry-once-then-fail, refresh-token encryption at
  rest, JWT issuance + fragment redirect, `drive-token` refresh, `410` on
  revocation, `501` when unconfigured.
- **`vanilla-oyl` (vitest):** google-store state transitions (config probe →
  `unconfigured` hides the button; `410` → `reconnect-needed`), hash adoption
  (`#google=` / `#google_error=`), `oyl-files` states via shadowRoot/props.
- **`e2e-oyl` (Playwright):** the fake-Google fixture server (auth + token +
  a minimal fake Drive files API) on a dedicated port; backend gets the
  override env in `playwright.config.ts`; the app points its Drive client at
  the fake via the localStorage override. Specs: sign-in-with-Google round
  trip, connect-from-Profile, `/files` list/upload/download/delete, and the
  reconnect-needed path (`hygiene.allow` on the intentional 410). The
  Google-*unconfigured* state is NOT e2e-tested — the e2e backend boots once
  per run with fake-Google env, so unconfigured coverage lives in the strapi
  smoke + vanilla unit tests above. Desktop + mobile projects as usual;
  per-test registered users as usual.

Definition of Done per CLAUDE.md: affected packages' tests + typecheck green,
`pnpm all-of build` green, `pnpm e2e` green.

## Implementation plan split

SP1 is one spec but **two implementation plans**, sequenced:

- **Plan A** — backend (`google-account`, `src/api/google/`), shared Drive
  client, sign-in/link/disconnect UI (login button, hash adoption, Profile
  row). Independently shippable; de-risks the OAuth surface first.
- **Plan B** — `/files` screen, download-helper extraction, fake-Drive e2e
  fixtures.

## Manual prerequisites (operator)

1. Google Cloud project → OAuth consent screen (External; testing mode is
   fine — `drive.file` is not a restricted scope, no verification audit).
   Testing mode caps at 100 test users and shows an "unverified app" screen.
2. Web OAuth client with authorized redirect URIs for dev
   (`http://localhost:1340/api/google/callback`) and the production API host.
3. `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in the untracked root `.env`
   (dev) and `/etc/strapi/strapi.env` (Pi).
4. Pi deploy: add `https://www.googleapis.com` to the Caddy CSP
   `connect-src`.

## Out of scope (deferred)

- SP2 backup-to-Drive, SP3 attachments, SP4 ocari integration (each gets its
  own spec riding on this foundation).
- Multiple Google accounts per user; Drive folder browsing outside the OYL
  folder; shared-drive support; Drive change-watching/sync.
- Unlinking email+password after Google sign-in (account management beyond
  connect/disconnect).
