# Auth pages, user profile, and effective timezone — design

**Date:** 2026-06-17
**Status:** Approved (brainstorming)
**Scope:** `apps/vanilla-oyl` (+ a typed-field addition to `@oyl/all-of-oyl` `User` and a shared formatter)

## Goal

Give vanilla-oyl dedicated **login** and **register** pages and a **profile** page, plus a
real user profile whose **timezone drives every date on every screen**. Both auth pages let
the user **skip** and keep using local data. Logging in **immediately backs up** local data to
the API. Bad credentials clear the session and force re-login.

## Background — what already exists

- `state/auth.js` stores the session (`{ token, user }`) in `localStorage` under `AUTH_KEY`, with
  `login`/`register`/`logout`/`getToken`/`refresh`. Credentials are already persisted and cleared
  on logout.
- The HTTP client is created with `onAuthError: () => authState.logout()`, so a rejected/expired
  token already clears the session.
- `oyl-auth` is a combined login+register widget, currently surfaced inside **Status → Account**.
- On a signed-out→signed-in transition `main.js` already flushes the sync outbox and *offers*
  (via `confirm()`) to upload local data.
- `@oyl/all-of-oyl` `User` (`packages/all-of-oyl/src/user/user.ts`) is a persistable `users`
  record modelling the profile: `id`, `displayName`, `timezone`, `defaultCurrency`,
  `units?: 'metric' | 'imperial'`, plus a tolerant `extra` bag. Its doc comment states timezone is
  "the value every root is hydrated with."
- **But the app never loads or creates a `User`.** `main.js` passes `defaultTimezone()` (browser tz)
  to every screen's `view.tz`, and `data.js` builds the journal store with `defaultTimezone()`.
  `clock.js` calls the browser tz a fallback "until a stored User record supplies one" — that seam
  was never finished.
- `migrateLocalToRemote` (`storage/migrate.js`) is idempotent via `MIGRATED_KEY`.
- `oyl-router` renders a "Not found" view for unregistered routes and focuses the rendered view's
  first `h1`/`h2`. It has no route guard. `oyl-nav` shows a fixed `ITEMS` list (so new routes won't
  appear in primary nav unless added).
- `makeRepositories` (`storage/bootstrap.js`) is a standalone export that builds a repo for every
  `COLLECTIONS` entry (including `users`) and, in remote mode, the sync engine.

## Decisions

| Decision | Choice |
|---|---|
| Login ↔ Remote | **Login implies Remote.** Successful login/register persists the session, sets `mode = remote`, then reloads. **Skip** sets/keeps `mode = local`. |
| Forced login | **Only when Remote + no session.** Redirect to `/login`, except while on `/login` or `/register`. Local mode never forces login. |
| Backup on login | **Immediate** — no `confirm()` prompt. |
| Weight/height units | **One `metric`/`imperial` toggle** (reuse `User.units`): imperial → lbs + ft/in, metric → kg + cm. |
| Applying a tz/units change | **Save + reload** (reuse the existing "Apply & reload" pattern). |
| Gender | **Select + free-text** (short list + an "Other" text input). |
| New profile fields' home | **Typed optional fields on the `User` domain type** (not the `extra` bag). |
| Status overlap | **Move auth out of Status; share the rest.** Status keeps Sync/Connection/Actions; `/profile` reuses existing components. |

## Architecture

### B1. Domain — `User` gains typed optional fields (`@oyl/all-of-oyl`)

Add to `User` (all optional, validated, canonical units):

- `birthday?: string` — civil date `YYYY-MM-DD`. **Not** run through `DayKey`/tz (a birthday has no
  time and must not shift at tz boundaries).
- `weightKg?: number` — canonical kilograms (`> 0`).
- `heightCm?: number` — canonical centimetres (`> 0`).
- `gender?: string` — free-form stored value (UI offers a select + "Other").
- `location?: string` — free text (city/region; not geocoded).

`units: 'metric' | 'imperial'` (already present) is the single display toggle for weight/height.
Update `constructor` validation, `toJSON`, `fromJSON`, and `user.test.ts`. Unknown fields continue
to round-trip through `extra`.

**DoD for this change:** `pnpm --filter @oyl/all-of-oyl test`, `pnpm all-of typecheck:src`, and
`pnpm all-of build` (DOM-safety) all green.

### B2. Shared formatters — `@oyl/all-of-oyl/format`

New DOM-free `format/body.ts`, exported from the format barrel:

- `formatWeight(kg: number, units: Units): string` → e.g. `"72.5 kg"` / `"160 lb"`.
- `formatHeight(cm: number, units: Units): string` → e.g. `"178 cm"` / `"5 ft 10 in"`.
- `age(birthday: string, today: string): number` — whole years from two `YYYY-MM-DD` civil dates.

Used by `/profile`. Never duplicated app-side (mirrors `formatMoney`/`formatNutrients`).

### B3. The timezone seam (the substantive app change)

**Hoist repository creation into `main.js`** and inject it:

1. `main.js` calls `makeRepositories(storage, …)` → `{ repos, engine? }`.
2. New `state/profile-store.js` wraps `repos.users`:
   - `load(): Promise<void>` resolves the **current** user record into a `profile` signal. Identity:
     prefer the domain id pinned in `localStorage` under `oyl/profile-id`; else fall back to the
     most-recently-updated `users` record (by `meta`), and pin its id. (`/v1` is owner-scoped, so a
     pull only ever returns this account's records — see B9.)
   - `profile: Signal<User | null>`.
   - `save(patch): Promise<void>` — create-or-update the User record (merge patch onto the current
     record or a new one seeded with `displayName`, `timezone`, `defaultCurrency`), then pin its id to
     `oyl/profile-id`.
3. Pure helper `resolveTimezone(profile: User | null, browserTz: string): string`
   → `profile?.timezone ?? browserTz`. Unit-tested.
4. `await profileStore.load()`, compute `const tz = resolveTimezone(profile.get(), defaultTimezone())`.
5. `createDataState` becomes **dependency-injected**:
   `createDataState(storage, themeState, { repos, engine, timezone, client?, connectivity? })`.
   It no longer calls `makeRepositories` itself and builds the journal store with the injected `tz`.
   Update `data.test.ts` accordingly.
6. `main.js` feeds `tz` to **every** `view.tz` (replacing the six `defaultTimezone()` calls).

**Applying a change:** saving timezone or units on `/register` or `/profile` persists the User
record, then `location.assign(currentPath)` (or `/status`) to rebuild every screen + the journal
store with the new tz. Non-tz field edits (birthday/weight/height/gender/location/currency) save
without reload.

**New-device first-pull correction:** in Remote mode `repos.users` is empty until the first sync
pull lands, so boot falls back to browser tz. After `startSync()` completes its initial pull,
re-resolve tz from the now-available profile; if it differs from the tz screens were built with,
trigger **one** reload, guarded by a `sessionStorage` one-shot flag (`oyl/tz-reloaded`) to prevent
loops.

### B4. Auth state & flows

`createAuthState` is unchanged (it already persists/clears the session). Flows are orchestrated by
the page components via injected callbacks from `main.js` (mirroring how `oyl-connection` receives
`onApply`):

- **Login success:** `authState.login()` (persists session) → set `mode = remote` → `location.assign('/status')`.
  After reload: Remote + session present → guard inactive → boot runs `startSync()` and the
  **immediate** `migrateLocal()` (idempotent) to back up local data.
- **Register success:** `authState.register()` (persists session) → `profileStore.save({ displayName: username, timezone, defaultCurrency: 'USD', …optional fields })` to the current (local) repos →
  set `mode = remote` → `location.assign('/status')`. On reload the new User record uploads via the
  immediate migration. If `register()` throws (e.g. username taken), show the form error and do **not**
  create the record or reload.
- **Skip (either page):** set `mode = local` → `location.assign('/status')`.
- **Logout:** `authState.logout()` → session null → (Remote) guard redirects to `/login`, where Skip
  lets the user drop to Local and keep working.

### B5. Route guard (forced login)

Pure helper `shouldRedirectToLogin(mode, session, route): boolean`
→ `mode === 'remote' && !session && route !== 'login' && route !== 'register'`. Unit-tested.

Wired in `main.js` via an effect on `authState.session` + `routeState.route`; on `true` it calls
`routeState.navigate('/login')` (history `replaceState`). At boot in Remote mode with no session,
**skip** the `dataState.refresh()`/`startSync()` attempts to avoid 401 noise, and land on `/login`.

### B6. Components

| Component | Role |
|---|---|
| `oyl-auth-form` | Presentational single-mode credential form (`mode: 'login' \| 'register'`), bound to `authState`. Replaces `oyl-auth`. Renders inline errors (`[data-role="error"]`, `aria-live="polite"`). Calls injected `onSuccess`. |
| `oyl-profile-fields` | Reusable field set: timezone (select from `Intl.supportedValuesOf('timeZone')`, default `defaultTimezone()`; text-input + `assertTimezone` fallback), units toggle, birthday (date), weight, height, gender (select + Other), location, currency. Bound to a value + `onSave(patch)`. Used by **both** register and profile. |
| `oyl-login` | `/login` page: heading + `oyl-auth-form` (login) + **Skip / use local data** + link to `/register`. |
| `oyl-register` | `/register` page: heading + `oyl-auth-form` (register) + collapsible `oyl-profile-fields` ("Optional details", timezone prefilled) + Skip + link to `/login`. |
| `oyl-profile` | `/profile` page: heading; identity (username/email) when signed in, else a "Sign in to sync" CTA; `oyl-profile-fields`; logout (when signed in); reused `oyl-connection`; a sync summary (reuses `oyl-sync-status` + a Resync button); data actions (export/import/upload-local) wired to the same `dataState` callbacks Status uses. |
| `oyl-account-menu` | Header control in the `toolbar` slot. **Always** links to **Profile**; shows **Log out** when signed in, **Sign in** when not. Reacts to `authState.session`. |

Each page has an `h1`/`h2` so the router can focus it.

### B6a. Component contracts (testability)

- **No component calls `location.*` directly.** Reload and mode-switch are **injected callbacks**
  from `main.js` (e.g. `onAuthenticated()`, `onSkip()`, `onProfileSaved(patch)`), so happy-dom tests
  exercise the components without a real navigation. `main.js` owns the actual `location.assign`.
- **The "reload vs. save" decision lives in the host/`main.js` callback, not in `oyl-profile-fields`.**
  On save, the host compares old vs. new `timezone`/`units`; if either changed it reloads, otherwise it
  persists and shows a saved state.
- **`oyl-profile-fields` is a controlled field set** exposing `getValues(): Partial<UserProps>` (and a
  `setValues()` for hydration). The **profile** page renders its own Save button wired to
  `onProfileSaved`; the **register** page renders no Save and reads `getValues()` on the create-account
  submit. One component, two usages.
- **Timezone input feature-detects `Intl.supportedValuesOf('timeZone')`**: a `<select>` when available,
  otherwise a text input validated at save by `assertTimezone`. The fallback path also keeps the
  field-set tests green under happy-dom.
- **Currency input** uppercases and must match `^[A-Z]{3}$` (the `User` constructor throws a
  `DomainError` otherwise); surfaced as the form error.

### B7. Status panel cleanup

Remove the Account section from `oyl-status-panel.js` (the `defineAuth` import, the `oyl-auth`
element, `accountLabel`, and the `auth` property) and stop setting `panel.auth` in `main.js`. Delete
`components/oyl-auth.js` and `oyl-auth.test.js` (logic absorbed by `oyl-auth-form`).

### B8. Migration → immediate

Replace the `confirm()`-gated offer in `main.js` with an immediate `migrateLocal()` when
`hasUnmigratedLocal(storage)` is true (on the signed-in transition and at boot when already signed
in), showing a notice on completion. `migrateLocalToRemote` stays idempotent via `MIGRATED_KEY`.
`shouldOfferMigration`/`MIGRATE_DECLINED_KEY` and the `confirm` are dropped from the auto path; the
manual "Upload local data" button on Status (driven by `hasUnmigratedLocal`) remains as a fallback.

### B9. Backend (`apps/strapi-oyl`) — make public auth reproducible

The login/register endpoints (`POST /api/auth/local`, `POST /api/auth/local/register`) are provided
by the **users-permissions plugin**, not defined in this repo. They work today only via Strapi
defaults (`allow_register: true`; Public role `register`/`callback` enabled). Because operators are
told to run `docker compose down -v` (re-seeding the DB), that default state is not guaranteed by
code.

**Change:** extend the bootstrap in `apps/strapi-oyl/src/index.ts` to **explicitly enable the Public
role's `register` and `callback` permissions** (idempotently, mirroring `grantAuthenticated`). This
keeps the auth flow reproducible after a volume reset and self-documented. No content-type or route
change — the backend-agnostic `oyl-record` contract is untouched.

**Owner-scoping note:** `oyl-record` has an `owner` relation and `/v1` is owner-scoped, so a pull
returns only the authenticated user's records — including their single `users` (profile) record. No
content-type change is needed for profile fields; they ride the generic record body.

**DoD for this change:** `pnpm --filter @oyl/strapi-oyl-app test` (the `httpProtocolContract` + smoke
suite) stays green; a manual check that register/login succeed against a freshly reset DB.

## Edge cases

- **Skip → register/login into a *pre-existing* account.** The local `users` record migrates and may
  land alongside an existing backend profile, yielding two `users` records. `profile-store` picks the
  pinned/most-recently-updated one as current; **merging two pre-existing profiles is out of scope**.
- **New-device Remote login.** Profile (and tz) is empty until the first pull; handled by the
  one-shot post-pull reload (B3).
- **Logout in Remote mode** lands on `/login`; Skip there drops to Local without losing local data.
- **`/profile` with no session** (Local/skip user): fields editable and saved to the local `users`
  record; identity block replaced by a "Sign in to sync" CTA; no logout button.
- **Profile data actions are mode-aware** (mirroring Status): Export always; Import/Reset Local-only;
  "Upload local data" shown in Remote only when `hasUnmigratedLocal`. The sync summary renders only in
  Remote mode.
- **Theme/mode stay device-local** in `oyl/settings` and are deliberately **not** part of the synced
  profile (appearance is per-device; tz/units are per-account).

## Data flow summary

```
Register → authState.register() → profileStore.save({displayName, tz, currency, …}) → mode=remote → reload
  → boot: Remote + session → startSync() + immediate migrateLocal() (uploads new User record + local data)

Login → authState.login() → mode=remote → reload
  → boot: Remote + session → startSync() + immediate migrateLocal()

Skip → mode=local → reload → local-first app, guard inactive

Bad/expired token → onAuthError → authState.logout() → session null → guard → /login

Boot tz → makeRepositories → profileStore.load() → resolveTimezone(profile, browserTz) → inject into stores + views
  (Remote new-device: re-resolve after first pull; reload once if changed)
```

## Error handling

- Auth/network errors render inline on the form; they never trigger a forced reload.
- The guard never traps the user on `/login` or `/register`.
- `/profile` renders without a session (local users): fields editable, identity replaced by a CTA.
- Domain validation errors (bad tz, non-positive weight/height) surface as the form error.

## Testing (TDD)

- **Domain:** `User` round-trips the new fields; rejects bad values (empty after parse, non-positive
  weight/height, malformed birthday).
- **Format:** `formatWeight`/`formatHeight`/`age` in both unit systems and edge values.
- **Helpers:** `resolveTimezone`, `shouldRedirectToLogin` (pure, exhaustive cases).
- **Store:** `profile-store` load (empty → null), create, update, tz fallback.
- **Components (happy-dom, assert via own shadowRoot):** `oyl-auth-form` submit calls
  `login`/`register` and renders errors; `oyl-profile-fields` save emits the patch and validates;
  `oyl-login`/`oyl-register` Skip + cross-link + `onSuccess`; `oyl-profile` identity/CTA + logout;
  `oyl-account-menu` visibility + actions react to session.
- **Refactor:** `data.test.ts` updated for injected `{ repos, engine, timezone }`.

## Definition of Done

- `pnpm vanilla test`, `pnpm vanilla typecheck` green.
- `pnpm --filter @oyl/all-of-oyl test`, `pnpm all-of typecheck:src`, `pnpm all-of build` green
  (for the `User` + format changes).
- No business logic duplicated app-side; new persistable fields live on the domain `User`.

## Suggested implementation phases

1. **Domain + format** — `User` fields, `format/body.ts`, their tests/gates.
2. **Tz seam + DI refactor** — `makeRepositories` hoist, `profile-store`, `resolveTimezone`,
   `createDataState` injection, feed tz to views/journal store, first-pull reload.
3. **Backend public auth** — make Public `register`/`callback` permissions explicit in
   `apps/strapi-oyl/src/index.ts`; verify against a reset DB (B9).
4. **Auth pages + guard + immediate migration** — `oyl-auth-form`, `oyl-login`, `oyl-register`,
   `shouldRedirectToLogin`, remove `oyl-auth`, Status cleanup.
5. **Profile + header** — `oyl-profile-fields`, `oyl-profile`, `oyl-account-menu`, wiring.

## Out of scope / notes

- `defaultCurrency` defaults to `'USD'`; editable on `/profile`, hidden on register.
- The single units toggle governs only profile weight/height display (not nutrition, which stays in
  grams).
- Backend needs no schema/route change for profile data: fields ride the generic `oyl-record` store,
  preserving the backend-agnostic contract. The only backend change is making Public auth permissions
  explicit (B9).
- Live (no-reload) reactive tz updates are intentionally deferred in favour of save+reload.
- Merging two pre-existing profiles into one is out of scope (see Edge cases).
