# Auth, Profile, and Effective Timezone — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add login/register/profile pages (with skip-to-local), a real synced user profile, and make the user's stored timezone drive every dated screen.

**Architecture:** Reuse the existing `@oyl/all-of-oyl` `User` domain record (extended with typed optional profile fields) as the synced profile. Resolve an effective timezone at boot from that record (fallback: browser tz) and inject it into the data stores; tz/units changes save + reload. Login implies Remote mode (persist session → reload → immediate local-data backup); Skip keeps Local. A pure guard redirects to `/login` only when Remote + no session.

**Tech Stack:** Vanilla JS + JSDoc Web Components (`OylElement`, signals), Vitest (happy-dom for the app, node for the lib), `@oyl/all-of-oyl` (strict TS), Strapi 5 (reference backend).

## Global Constraints

- `@oyl/all-of-oyl` `src/` is `"type": "module"` + NodeNext: **every relative import uses an explicit `.js` extension**.
- Anything in `src/` touching Web/DOM globals must be injected via an interface — the browser build has **no DOM lib**. `format/` and `user/` are DOM-free.
- Shared business logic / formatters live ONLY in `@oyl/all-of-oyl` — never duplicated app-side. The app imports formatters from `@oyl/all-of-oyl/format`.
- Component tests assert via the component's **own `shadowRoot`/props**, never a parent's `textContent` (shadow boundaries don't pierce). Never add sr-only duplicate markup just to pass a test.
- No component calls `location.*` directly — reload/mode-switch are **injected callbacks** owned by `main.js`.
- Definition of Done per package: tests + typecheck green; for `all-of-oyl` also `pnpm all-of build` (DOM-safety). Never commit on red.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Work on branch `feat/auth-profile-timezone`.

**Commands:**
- Lib test: `pnpm --filter @oyl/all-of-oyl test`
- Lib strict typecheck: `pnpm all-of typecheck:src`
- Lib DOM-safety build: `pnpm all-of build`
- App test: `pnpm vanilla test`
- App typecheck: `pnpm vanilla typecheck`
- Backend test: `pnpm --filter @oyl/strapi-oyl-app test`

## File Map

| File | Responsibility | Task |
|---|---|---|
| `packages/all-of-oyl/src/user/user.ts` | `User` gains typed optional fields | 1 |
| `packages/all-of-oyl/src/format/body.ts` (+ `format/index.ts`) | `formatWeight`/`formatHeight`/`age` | 2 |
| `apps/vanilla-oyl/src/storage/keys.js` | `PROFILE_ID_KEY`, `TZ_RELOADED_KEY` | 3 |
| `apps/vanilla-oyl/src/state/profile-store.js` | current-user store + `resolveTimezone` | 3 |
| `apps/vanilla-oyl/src/state/data.js` | injectable `{ repos, engine, timezone }` | 4 |
| `apps/vanilla-oyl/src/state/auth-guard.js` | pure `shouldRedirectToLogin` | 5 |
| `apps/strapi-oyl/src/index.ts` | explicit Public `register`/`callback` | 6 |
| `apps/vanilla-oyl/src/components/oyl-auth-form.js` | single-mode credential form | 7 |
| `apps/vanilla-oyl/src/components/oyl-profile-fields.js` | controlled profile field set | 8 |
| `apps/vanilla-oyl/src/components/oyl-login.js` | `/login` page | 9 |
| `apps/vanilla-oyl/src/components/oyl-register.js` | `/register` page | 10 |
| `apps/vanilla-oyl/src/components/oyl-account-menu.js` | header logout + profile/sign-in | 11 |
| `apps/vanilla-oyl/src/components/oyl-profile.js` | `/profile` page | 12 |
| `apps/vanilla-oyl/src/components/oyl-status-panel.js` | remove Account section | 13 |
| `apps/vanilla-oyl/src/components/oyl-auth.js` + test | **delete** | 13 |
| `apps/vanilla-oyl/src/main.js` | wire routes, guard, tz, immediate migration, menu | 14 |

---

## Task 1: `User` gains typed optional profile fields

**Files:**
- Modify: `packages/all-of-oyl/src/user/user.ts`
- Test: `packages/all-of-oyl/src/user/user.test.ts`

**Interfaces:**
- Produces: `User` with optional readonly `birthday?: string` (`YYYY-MM-DD`), `weightKg?: number` (`>0`), `heightCm?: number` (`>0`), `gender?: string`, `location?: string`. Constructor props gain the same optionals. `toJSON`/`fromJSON` round-trip them. Existing `Units = 'metric' | 'imperial'` unchanged.

- [ ] **Step 1: Write the failing test** — append to `user.test.ts`:

```ts
describe('User optional profile fields', () => {
  it('round-trips birthday/weightKg/heightCm/gender/location', () => {
    const u = new User({
      displayName: 'Avery', timezone: 'America/New_York', defaultCurrency: 'USD', units: 'imperial',
      birthday: '1990-06-20', weightKg: 72.5, heightCm: 178, gender: 'non-binary', location: 'Austin, TX',
    })
    const back = User.fromJSON(JSON.parse(JSON.stringify(u.toJSON())))
    expect(back.birthday).toBe('1990-06-20')
    expect(back.weightKg).toBe(72.5)
    expect(back.heightCm).toBe(178)
    expect(back.gender).toBe('non-binary')
    expect(back.location).toBe('Austin, TX')
  })

  it('omits unset optional fields from JSON', () => {
    const u = new User({ displayName: 'A', timezone: 'UTC', defaultCurrency: 'USD' })
    expect('birthday' in u.toJSON()).toBe(false)
    expect('weightKg' in u.toJSON()).toBe(false)
  })

  it('rejects a malformed birthday and non-positive measurements', () => {
    const bad = (props: Record<string, unknown>) => {
      try { new User({ displayName: 'A', timezone: 'UTC', defaultCurrency: 'USD', ...props } as never); return null }
      catch (e) { return (e as DomainError).code }
    }
    expect(bad({ birthday: '06/20/1990' })).toBe('INVALID_QUANTITY')
    expect(bad({ weightKg: 0 })).toBe('INVALID_QUANTITY')
    expect(bad({ heightCm: -1 })).toBe('INVALID_QUANTITY')
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test user`
Expected: FAIL — `birthday` etc. are `undefined` / not on the type.

- [ ] **Step 3: Implement** — in `user.ts`, add fields, validation, and round-trip.

Add readonly fields after `units`:
```ts
  readonly birthday?: string
  readonly weightKg?: number
  readonly heightCm?: number
  readonly gender?: string
  readonly location?: string
```

Widen the constructor props and add validation + assignment (place the validation before `this.extra = extra`, the assignments after the `units` block):
```ts
  constructor(
    props: {
      id?: Id; displayName: string; timezone: string; defaultCurrency: string; units?: Units
      birthday?: string; weightKg?: number; heightCm?: number; gender?: string; location?: string
    },
    extra: Record<string, unknown> = {},
  ) {
    // ...existing displayName + currency checks...
    if (props.birthday !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(props.birthday)) {
      throw new DomainError('INVALID_QUANTITY', `birthday must be YYYY-MM-DD: "${props.birthday}"`)
    }
    for (const [k, v] of [['weightKg', props.weightKg], ['heightCm', props.heightCm]] as const) {
      if (v !== undefined && (!Number.isFinite(v) || v <= 0)) {
        throw new DomainError('INVALID_QUANTITY', `${k} must be a positive number`)
      }
    }
    // ...existing id/displayName/timezone/defaultCurrency/units assignment...
    if (props.birthday !== undefined) this.birthday = props.birthday
    if (props.weightKg !== undefined) this.weightKg = props.weightKg
    if (props.heightCm !== undefined) this.heightCm = props.heightCm
    if (props.gender !== undefined) this.gender = props.gender
    if (props.location !== undefined) this.location = props.location
    this.extra = extra
  }
```

In `toJSON()`, add before the `meta` spread:
```ts
      ...(this.birthday !== undefined ? { birthday: this.birthday } : {}),
      ...(this.weightKg !== undefined ? { weightKg: this.weightKg } : {}),
      ...(this.heightCm !== undefined ? { heightCm: this.heightCm } : {}),
      ...(this.gender !== undefined ? { gender: this.gender } : {}),
      ...(this.location !== undefined ? { location: this.location } : {}),
```

In `fromJSON()`, destructure and type-check the new fields (they must come out of `extra`, then be re-validated by the constructor):
```ts
    const { id, displayName, timezone, defaultCurrency, units, meta,
      birthday, weightKg, heightCm, gender, location, ...extra } = shape as Record<string, unknown>
    if (
      // ...existing id/displayName/timezone/defaultCurrency/units guards... ||
      (birthday !== undefined && typeof birthday !== 'string') ||
      (weightKg !== undefined && typeof weightKg !== 'number') ||
      (heightCm !== undefined && typeof heightCm !== 'number') ||
      (gender !== undefined && typeof gender !== 'string') ||
      (location !== undefined && typeof location !== 'string')
    ) {
      throw new DomainError('MALFORMED_JSON', 'not a User shape')
    }
    const user = new User(
      {
        id: parsedId, displayName, timezone, defaultCurrency,
        ...(units !== undefined ? { units: units as Units } : {}),
        ...(birthday !== undefined ? { birthday: birthday as string } : {}),
        ...(weightKg !== undefined ? { weightKg: weightKg as number } : {}),
        ...(heightCm !== undefined ? { heightCm: heightCm as number } : {}),
        ...(gender !== undefined ? { gender: gender as string } : {}),
        ...(location !== undefined ? { location: location as string } : {}),
      },
      extra,
    )
```

- [ ] **Step 4: Run the test + gates, verify green**

Run: `pnpm --filter @oyl/all-of-oyl test user && pnpm all-of typecheck:src && pnpm all-of build`
Expected: PASS; build emits with no bare-import error.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/user/user.ts packages/all-of-oyl/src/user/user.test.ts
git commit -m "feat(all-of-oyl): add optional profile fields to User

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Shared body formatters (`formatWeight`/`formatHeight`/`age`)

**Files:**
- Create: `packages/all-of-oyl/src/format/body.ts`
- Create: `packages/all-of-oyl/src/format/body.test.ts`
- Modify: `packages/all-of-oyl/src/format/index.ts`

**Interfaces:**
- Consumes: `Units` from `../user/user.js`.
- Produces: `formatWeight(kg: number, units: Units): string`; `formatHeight(cm: number, units: Units): string`; `age(birthday: string, today: string): number`. Exported from `@oyl/all-of-oyl/format`.

- [ ] **Step 1: Write the failing test** — `format/body.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatWeight, formatHeight, age } from './body.js'

describe('formatWeight', () => {
  it('metric shows kilograms to one decimal', () => {
    expect(formatWeight(72.5, 'metric')).toBe('72.5 kg')
    expect(formatWeight(70, 'metric')).toBe('70 kg')
  })
  it('imperial shows whole pounds', () => {
    expect(formatWeight(72.5, 'imperial')).toBe('160 lb')
  })
})

describe('formatHeight', () => {
  it('metric shows whole centimetres', () => {
    expect(formatHeight(178, 'metric')).toBe('178 cm')
  })
  it('imperial shows feet and inches, carrying 12in up', () => {
    expect(formatHeight(178, 'imperial')).toBe('5 ft 10 in')
    expect(formatHeight(183, 'imperial')).toBe('6 ft 0 in')
  })
})

describe('age', () => {
  it('counts whole years, not yet reached this year', () => {
    expect(age('1990-06-20', '2026-06-17')).toBe(35)
  })
  it('counts the birthday itself', () => {
    expect(age('1990-06-17', '2026-06-17')).toBe(36)
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test body`
Expected: FAIL — `./body.js` not found.

- [ ] **Step 3: Implement** — `format/body.ts`:

```ts
import type { Units } from '../user/user.js'

const LB_PER_KG = 2.2046226218

/** "72.5 kg" (metric, 1 dp, trailing zero trimmed) or "160 lb" (imperial, whole). */
export function formatWeight(kg: number, units: Units): string {
  if (units === 'imperial') return `${Math.round(kg * LB_PER_KG)} lb`
  return `${Number((Math.round(kg * 10) / 10).toFixed(1)).toString()} kg`
}

/** "178 cm" (metric, whole) or "5 ft 10 in" (imperial, carrying 12in up). */
export function formatHeight(cm: number, units: Units): string {
  if (units !== 'imperial') return `${Math.round(cm)} cm`
  const totalIn = cm / 2.54
  let ft = Math.floor(totalIn / 12)
  let inch = Math.round(totalIn - ft * 12)
  if (inch === 12) { ft += 1; inch = 0 }
  return `${ft} ft ${inch} in`
}

/** Whole years between two YYYY-MM-DD civil dates (no timezone). */
export function age(birthday: string, today: string): number {
  const [by, bm, bd] = birthday.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  let years = ty - by
  if (tm < bm || (tm === bm && td < bd)) years -= 1
  return years
}
```

Add to `format/index.ts`:
```ts
export { formatWeight, formatHeight, age } from './body.js'
```

- [ ] **Step 4: Run the test + gates, verify green**

Run: `pnpm --filter @oyl/all-of-oyl test body && pnpm all-of typecheck:src && pnpm all-of build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/format/body.ts packages/all-of-oyl/src/format/body.test.ts packages/all-of-oyl/src/format/index.ts
git commit -m "feat(all-of-oyl): add formatWeight/formatHeight/age body formatters

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> **Note for app consumers:** `@oyl/all-of-oyl/format` is vendored into the app via `pnpm vanilla build:lib`. Tasks that import the new formatters in the app must run `pnpm vanilla build:lib` (or `pnpm vanilla dev`) so `vendor/all-of-oyl/format/index.js` includes them. The app typecheck resolves TS source, so it sees them without a build.

---

## Task 3: Profile store + `resolveTimezone` + keys

**Files:**
- Modify: `apps/vanilla-oyl/src/storage/keys.js`
- Create: `apps/vanilla-oyl/src/state/profile-store.js`
- Create: `apps/vanilla-oyl/src/state/profile-store.test.js`

**Interfaces:**
- Produces:
  - `PROFILE_ID_KEY = 'oyl/profile-id'`, `TZ_RELOADED_KEY = 'oyl/tz-reloaded'` (in `keys.js`).
  - `resolveTimezone(profile: User | null, browserTz: string): string`.
  - `createProfileStore(repos, storage)` → `{ profile: Signal<User|null>, load(): Promise<void>, save(patch): Promise<void> }` where `patch` is a partial of User props (`displayName`/`timezone`/`defaultCurrency`/`units`/`birthday`/`weightKg`/`heightCm`/`gender`/`location`).
- Consumes: `repos.users` (a `Repository<User>` with `list()`/`save()`), `User` from `@oyl/all-of-oyl`.

- [ ] **Step 1: Add keys** — append to `keys.js`:

```js
export const PROFILE_ID_KEY = 'oyl/profile-id'
export const TZ_RELOADED_KEY = 'oyl/tz-reloaded'
```

- [ ] **Step 2: Write the failing test** — `profile-store.test.js`:

```js
import { describe, expect, it, beforeEach } from 'vitest'
import { User } from '@oyl/all-of-oyl'
import { makeRepositories } from '../storage/bootstrap.js'
import { createProfileStore, resolveTimezone } from './profile-store.js'

beforeEach(() => localStorage.clear())

describe('resolveTimezone', () => {
  it('prefers the profile timezone, falls back to the browser tz', () => {
    const u = new User({ displayName: 'A', timezone: 'Asia/Tokyo', defaultCurrency: 'USD' })
    expect(resolveTimezone(u, 'UTC')).toBe('Asia/Tokyo')
    expect(resolveTimezone(null, 'America/New_York')).toBe('America/New_York')
  })
})

describe('createProfileStore', () => {
  it('load() is null when no user record exists', async () => {
    const { repos } = makeRepositories(localStorage)
    const store = createProfileStore(repos, localStorage)
    await store.load()
    expect(store.profile.get()).toBe(null)
  })

  it('save() creates a record, pins its id, and load() reads it back', async () => {
    const { repos } = makeRepositories(localStorage)
    const store = createProfileStore(repos, localStorage)
    await store.save({ displayName: 'Avery', timezone: 'Asia/Tokyo', defaultCurrency: 'USD' })
    expect(store.profile.get()?.timezone).toBe('Asia/Tokyo')
    expect(localStorage.getItem('oyl/profile-id')).toBe(store.profile.get()?.id)

    const store2 = createProfileStore(repos, localStorage)
    await store2.load()
    expect(store2.profile.get()?.displayName).toBe('Avery')
  })

  it('save() merges a patch onto the existing record', async () => {
    const { repos } = makeRepositories(localStorage)
    const store = createProfileStore(repos, localStorage)
    await store.save({ displayName: 'Avery', timezone: 'UTC', defaultCurrency: 'USD' })
    await store.save({ weightKg: 80, units: 'metric' })
    expect(store.profile.get()?.weightKg).toBe(80)
    expect(store.profile.get()?.displayName).toBe('Avery') // preserved
  })
})
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `pnpm vanilla test profile-store`
Expected: FAIL — `profile-store.js` not found.

- [ ] **Step 4: Implement** — `profile-store.js`:

```js
import { signal } from '../lib/reactive/signal.js'
import { User } from '@oyl/all-of-oyl'
import { PROFILE_ID_KEY } from '../storage/keys.js'

/** @typedef {import('@oyl/all-of-oyl').User} User */
/** @typedef {Partial<{ displayName: string, timezone: string, defaultCurrency: string, units: 'metric'|'imperial', birthday: string, weightKg: number, heightCm: number, gender: string, location: string }>} ProfilePatch */

/** Effective timezone: the stored profile's, else the browser's. @param {User|null} profile @param {string} browserTz @returns {string} */
export function resolveTimezone(profile, browserTz) {
  return profile?.timezone ?? browserTz
}

/**
 * The current-user profile over repos.users. Single-user: the pinned id (oyl/profile-id),
 * else the first record. save() is create-or-update + re-pin.
 * @param {{ users: import('@oyl/all-of-oyl').Repository<User> }} repos
 * @param {{ getItem(k: string): string|null, setItem(k: string, v: string): void }} storage
 */
export function createProfileStore(repos, storage) {
  const profile = signal(/** @type {User|null} */ (null))

  async function load() {
    const all = await repos.users.list()
    if (all.length === 0) { profile.set(null); return }
    const pinned = storage.getItem(PROFILE_ID_KEY)
    const current = (pinned && all.find((u) => u.id === pinned)) || all[0]
    storage.setItem(PROFILE_ID_KEY, current.id)
    profile.set(current)
  }

  /** @param {ProfilePatch} patch */
  async function save(patch) {
    const cur = profile.get()
    const pick = (/** @type {keyof ProfilePatch} */ k, /** @type {any} */ fallback) =>
      k in patch ? patch[k] : (cur ? /** @type {any} */ (cur)[k] : fallback)
    const next = new User({
      ...(cur ? { id: cur.id } : {}),
      displayName: pick('displayName', 'You'),
      timezone: pick('timezone', 'UTC'),
      defaultCurrency: pick('defaultCurrency', 'USD'),
      units: pick('units', undefined),
      birthday: pick('birthday', undefined),
      weightKg: pick('weightKg', undefined),
      heightCm: pick('heightCm', undefined),
      gender: pick('gender', undefined),
      location: pick('location', undefined),
    })
    await repos.users.save(next)
    storage.setItem(PROFILE_ID_KEY, next.id)
    profile.set(next)
  }

  return { profile, load, save }
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `pnpm vanilla test profile-store && pnpm vanilla typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/storage/keys.js apps/vanilla-oyl/src/state/profile-store.js apps/vanilla-oyl/src/state/profile-store.test.js
git commit -m "feat(vanilla-oyl): profile store + resolveTimezone over repos.users

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `createDataState` accepts injected `{ repos, engine, timezone }`

**Files:**
- Modify: `apps/vanilla-oyl/src/state/data.js:37-39`
- Test: `apps/vanilla-oyl/src/state/data.test.js`

**Interfaces:**
- Produces: `createDataState(storage, themeState, opts)` where `opts` may additionally include `repos` (pre-built `Repositories`), `engine` (`SyncEngine?`), and `timezone` (string). When `opts.repos` is present it is used as-is (and `opts.timezone ?? defaultTimezone()` drives the journal store); otherwise behaviour is unchanged (builds internally, browser tz). Existing callers passing `{}` / `{ client, connectivity }` keep working.

- [ ] **Step 1: Write the failing test** — append to `data.test.js`:

```js
describe('createDataState injected repos + timezone', () => {
  it('uses injected repos and the provided timezone for the journal store', async () => {
    const storage = fakeStorage()
    const { makeRepositories } = await import('../storage/bootstrap.js')
    const { repos, engine } = makeRepositories(storage)
    const ds = createDataState(storage, createThemeState(storage), { repos, engine, timezone: 'Asia/Tokyo' })
    expect(ds.repos).toBe(repos)
    // A note added at this instant lands on the Tokyo civil day.
    await ds.journal.add(new Note({ body: 'hi', occurredAt: new Date('2026-06-17T16:00:00Z') }))
    const tokyoDay = DayKey.from(new Date('2026-06-17T16:00:00Z'), 'Asia/Tokyo')
    expect(ds.journal.entriesOn(tokyoDay).length).toBe(1)
  })
})
```

> `fakeStorage`, `Note`, `DayKey`, `createThemeState`, and `createDataState` are all already imported/defined in `data.test.js`; `journal.entriesOn(day)` is the confirmed accessor (see `journal-store.js:56`).

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm vanilla test data`
Expected: FAIL — `ds.repos` is an internally-built object, not the injected `repos` (referential inequality).

- [ ] **Step 3: Implement** — replace `data.js:37-39`:

```js
export function createDataState(storage, themeState, opts = {}) {
  const { repos, engine } = opts.repos
    ? { repos: opts.repos, engine: opts.engine }
    : makeRepositories(storage, opts.client ? { client: opts.client, ...(opts.connectivity ? { connectivity: opts.connectivity } : {}) } : {})
  const journal = createJournalStore(repos.entries, opts.timezone ?? defaultTimezone())
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm vanilla test data && pnpm vanilla typecheck`
Expected: PASS (and all pre-existing `data` tests still green).

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/state/data.js apps/vanilla-oyl/src/state/data.test.js
git commit -m "feat(vanilla-oyl): allow injecting repos/engine/timezone into createDataState

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Pure login-redirect guard

**Files:**
- Create: `apps/vanilla-oyl/src/state/auth-guard.js`
- Create: `apps/vanilla-oyl/src/state/auth-guard.test.js`

**Interfaces:**
- Produces: `shouldRedirectToLogin(mode: 'local'|'remote', session: object|null, route: string): boolean` and `tzNeedsReload(builtTz: string, profile: User|null, browserTz: string): boolean`.

- [ ] **Step 1: Write the failing test** — `auth-guard.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { User } from '@oyl/all-of-oyl'
import { shouldRedirectToLogin, tzNeedsReload } from './auth-guard.js'

const session = { token: 't', user: { id: 1, username: 'a', email: 'a@b.c' } }

describe('shouldRedirectToLogin', () => {
  it('redirects only when remote + no session + not already on an auth page', () => {
    expect(shouldRedirectToLogin('remote', null, 'status')).toBe(true)
    expect(shouldRedirectToLogin('remote', null, 'login')).toBe(false)
    expect(shouldRedirectToLogin('remote', null, 'register')).toBe(false)
    expect(shouldRedirectToLogin('remote', session, 'status')).toBe(false)
    expect(shouldRedirectToLogin('local', null, 'status')).toBe(false)
  })
})

describe('tzNeedsReload', () => {
  it('is true when the pulled profile tz differs from the tz screens were built with', () => {
    const u = new User({ displayName: 'A', timezone: 'Asia/Tokyo', defaultCurrency: 'USD' })
    expect(tzNeedsReload('UTC', u, 'UTC')).toBe(true)
    expect(tzNeedsReload('Asia/Tokyo', u, 'UTC')).toBe(false)
    expect(tzNeedsReload('UTC', null, 'UTC')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm vanilla test auth-guard`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `auth-guard.js`:

```js
import { resolveTimezone } from './profile-store.js'

/** Force the login page only in Remote mode with no session (never while on an auth page). @param {'local'|'remote'} mode @param {object|null} session @param {string} route @returns {boolean} */
export function shouldRedirectToLogin(mode, session, route) {
  return mode === 'remote' && !session && route !== 'login' && route !== 'register'
}

/** After the first remote pull, whether the now-known profile tz differs from what screens were built with. @param {string} builtTz @param {import('@oyl/all-of-oyl').User|null} profile @param {string} browserTz @returns {boolean} */
export function tzNeedsReload(builtTz, profile, browserTz) {
  return resolveTimezone(profile, browserTz) !== builtTz
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm vanilla test auth-guard && pnpm vanilla typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/state/auth-guard.js apps/vanilla-oyl/src/state/auth-guard.test.js
git commit -m "feat(vanilla-oyl): pure shouldRedirectToLogin + tzNeedsReload guards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Backend — make Public register/login permissions explicit

**Files:**
- Modify: `apps/strapi-oyl/src/index.ts`

**Interfaces:**
- Produces: on bootstrap, the `public` users-permissions role has `plugin::users-permissions.auth.register` and `plugin::users-permissions.auth.callback` permissions (idempotent), so `/api/auth/local/register` and `/api/auth/local` work after a volume reset.

- [ ] **Step 1: Implement** — in `index.ts`, add a helper mirroring `grantAuthenticated` and call it in `bootstrap`:

```ts
const PUBLIC_AUTH_ACTIONS = [
  'plugin::users-permissions.auth.register',
  'plugin::users-permissions.auth.callback',
]

async function grantPublicAuth(strapi: Core.Strapi) {
  const role = (await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'public' } })) as { id: number } | null
  if (!role) { strapi.log.warn('[oyl] public role not found; skipping auth permission grant'); return }
  for (const action of PUBLIC_AUTH_ACTIONS) {
    const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({ where: { action, role: role.id } })
    if (!existing) await strapi.db.query('plugin::users-permissions.permission').create({ data: { action, role: role.id } })
  }
}
```

Update `bootstrap`:
```ts
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await grantAuthenticated(strapi)
    await grantPublicAuth(strapi)
  },
```

- [ ] **Step 2: Build + run the backend test suite**

Run: `pnpm --filter @oyl/strapi-oyl-app exec tsc --noEmit && pnpm --filter @oyl/strapi-oyl-app test`
Expected: PASS — the existing `httpProtocolContract` + smoke suite stays green (this change only adds public-role rows).

- [ ] **Step 3: Manual verification (fresh DB)**

Run (in a scratch shell; uses the dev SQLite DB):
```bash
rm -f apps/strapi-oyl/.tmp/data.db
pnpm strapi-app build && pnpm strapi-app develop &
# once booted on :1340, in another shell:
curl -s -X POST http://localhost:1340/api/auth/local/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"smoke","email":"smoke@example.com","password":"smoke-pass-123"}'
```
Expected: a JSON body containing a `jwt` and `user` (not a 403 "Forbidden"). Stop the dev server afterward.

- [ ] **Step 4: Commit**

```bash
git add apps/strapi-oyl/src/index.ts
git commit -m "feat(strapi-oyl): grant Public role register/callback on bootstrap

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `oyl-auth-form` — single-mode credential form

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-auth-form.js`
- Create: `apps/vanilla-oyl/src/components/oyl-auth-form.test.js`

**Interfaces:**
- Produces: `class OylAuthForm extends OylElement` + `defineAuthForm()`. Props: `auth` (an object with `login(identifier, password)` and `register(username, email, password)` returning Promises), `mode: 'login'|'register'`, `onSuccess: () => void`. On submit it calls the matching auth method; on resolve calls `onSuccess`; on reject renders the error in `[data-role="error"]`. Submit button `disabled` while pending.

- [ ] **Step 1: Write the failing test** — `oyl-auth-form.test.js`:

```js
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { defineAuthForm } from './oyl-auth-form.js'

beforeAll(() => defineAuthForm())

/** @returns {any} */
function mount(mode, auth, onSuccess = () => {}) {
  const el = /** @type {any} */ (document.createElement('oyl-auth-form'))
  el.auth = auth; el.mode = mode; el.onSuccess = onSuccess
  document.body.append(el)
  return el
}

describe('<oyl-auth-form>', () => {
  it('login mode calls auth.login and onSuccess', async () => {
    const auth = { login: vi.fn().mockResolvedValue({}), register: vi.fn() }
    const onSuccess = vi.fn()
    const el = mount('login', auth, onSuccess)
    const root = el.shadowRoot
    root.querySelector('input[name="identifier"]').value = 'avery'
    root.querySelector('input[name="password"]').value = 'pw'
    root.querySelector('form').requestSubmit()
    await Promise.resolve(); await Promise.resolve()
    expect(auth.login).toHaveBeenCalledWith('avery', 'pw')
    expect(onSuccess).toHaveBeenCalled()
    el.remove()
  })

  it('register mode calls auth.register with username/email/password', async () => {
    const auth = { login: vi.fn(), register: vi.fn().mockResolvedValue({}) }
    const el = mount('register', auth)
    const root = el.shadowRoot
    root.querySelector('input[name="username"]').value = 'avery'
    root.querySelector('input[name="email"]').value = 'a@b.c'
    root.querySelector('input[name="password"]').value = 'pw'
    root.querySelector('form').requestSubmit()
    await Promise.resolve(); await Promise.resolve()
    expect(auth.register).toHaveBeenCalledWith('avery', 'a@b.c', 'pw')
    el.remove()
  })

  it('renders the error message when auth rejects', async () => {
    const auth = { login: vi.fn().mockRejectedValue(new Error('bad creds')), register: vi.fn() }
    const el = mount('login', auth)
    const root = el.shadowRoot
    root.querySelector('input[name="identifier"]').value = 'x'
    root.querySelector('input[name="password"]').value = 'y'
    root.querySelector('form').requestSubmit()
    await Promise.resolve(); await Promise.resolve()
    expect(root.querySelector('[data-role="error"]').textContent).toContain('bad creds')
    el.remove()
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm vanilla test oyl-auth-form`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `oyl-auth-form.js` (modelled on the existing `oyl-auth.js` form half):

```js
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

const styles = sheet(`
  form { display: grid; gap: .5rem; max-inline-size: 22rem; }
  input { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .5rem .6rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1rem; font: inherit; font-weight: 600; cursor: pointer; }
  button.primary:disabled { opacity: .6; cursor: default; }
  [data-role="error"]:not(:empty) { color: var(--color-danger); font-size: .85rem; }
`)

export class OylAuthForm extends OylElement {
  static styles = [styles]
  constructor() {
    super()
    /** @type {{ login(i: string, p: string): Promise<unknown>, register(u: string, e: string, p: string): Promise<unknown> }} */
    this.auth = /** @type {any} */ (undefined)
    /** @type {'login'|'register'} */
    this.mode = 'login'
    /** @type {() => void} */
    this.onSuccess = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const isLogin = this.mode === 'login'
    const form = document.createElement('form')
    const fields = isLogin
      ? [this._input('identifier', 'text', 'Username or email', 'username')]
      : [this._input('username', 'text', 'Username', 'username'), this._input('email', 'email', 'Email', 'email')]
    const password = this._input('password', 'password', 'Password', isLogin ? 'current-password' : 'new-password')
    const submit = document.createElement('button')
    submit.type = 'submit'; submit.className = 'primary'
    submit.textContent = isLogin ? 'Sign in' : 'Create account'
    const error = document.createElement('div')
    error.dataset.role = 'error'; error.setAttribute('aria-live', 'polite')
    form.append(...fields, password, submit, error)
    root.append(form)

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      error.textContent = ''; submit.disabled = true
      try {
        if (isLogin) {
          const id = /** @type {HTMLInputElement} */ (form.querySelector('input[name="identifier"]'))
          await this.auth.login(id.value, password.value)
        } else {
          const u = /** @type {HTMLInputElement} */ (form.querySelector('input[name="username"]'))
          const em = /** @type {HTMLInputElement} */ (form.querySelector('input[name="email"]'))
          await this.auth.register(u.value, em.value, password.value)
        }
        this.onSuccess()
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : String(err)
      } finally {
        submit.disabled = false
      }
    }, { signal: this.lifecycle })
  }

  /** @param {string} name @param {string} type @param {string} label @param {string} autocomplete @returns {HTMLInputElement} */
  _input(name, type, label, autocomplete) {
    const i = document.createElement('input')
    i.name = name; i.type = type; i.placeholder = label
    i.setAttribute('aria-label', label); i.autocomplete = /** @type {AutoFill} */ (autocomplete)
    return i
  }
}

/** Register the element (idempotent). */
export function defineAuthForm() {
  if (!customElements.get('oyl-auth-form')) customElements.define('oyl-auth-form', OylAuthForm)
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm vanilla test oyl-auth-form && pnpm vanilla typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-auth-form.js apps/vanilla-oyl/src/components/oyl-auth-form.test.js
git commit -m "feat(vanilla-oyl): oyl-auth-form single-mode credential form

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: `oyl-profile-fields` — controlled profile field set

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-profile-fields.js`
- Create: `apps/vanilla-oyl/src/components/oyl-profile-fields.test.js`

**Interfaces:**
- Produces: `class OylProfileFields extends OylElement` + `defineProfileFields()`. Props: `value` (a `ProfilePatch`-shaped object to hydrate from, may be `{}`), `showSave: boolean` (default `false`), `onSave: (patch) => void`. Methods: `getValues(): ProfilePatch` — reads the current inputs into a patch (omitting empty optionals; converts imperial display inputs to canonical `weightKg`/`heightCm` when entered). When `showSave` is true it renders a Save button that calls `onSave(getValues())`.
- Units handling: a single `units` select (`metric`/`imperial`) governs the weight/height **input labels and conversion** — values are stored canonically.
- Timezone: `<select>` from `Intl.supportedValuesOf('timeZone')` when available, else a text input; default value = `value.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone`.

- [ ] **Step 1: Write the failing test** — `oyl-profile-fields.test.js`:

```js
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { defineProfileFields } from './oyl-profile-fields.js'

beforeAll(() => defineProfileFields())

/** @returns {any} */
function mount(value = {}, showSave = false, onSave = () => {}) {
  const el = /** @type {any} */ (document.createElement('oyl-profile-fields'))
  el.value = value; el.showSave = showSave; el.onSave = onSave
  document.body.append(el)
  return el
}

describe('<oyl-profile-fields>', () => {
  it('defaults the timezone field to the system tz', () => {
    const el = mount()
    const tz = el.shadowRoot.querySelector('[name="timezone"]')
    expect(tz.value).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
    el.remove()
  })

  it('getValues returns canonical metric values', () => {
    const el = mount({ units: 'metric' })
    const root = el.shadowRoot
    root.querySelector('[name="weight"]').value = '80'
    root.querySelector('[name="height"]').value = '180'
    root.querySelector('[name="gender"]').value = 'female'
    const v = el.getValues()
    expect(v.weightKg).toBe(80)
    expect(v.heightCm).toBe(180)
    expect(v.gender).toBe('female')
    el.remove()
  })

  it('omits empty optional fields from getValues', () => {
    const el = mount()
    const v = el.getValues()
    expect('weightKg' in v).toBe(false)
    expect('birthday' in v).toBe(false)
    el.remove()
  })

  it('renders a Save button that emits the patch when showSave', () => {
    const onSave = vi.fn()
    const el = mount({}, true, onSave)
    el.shadowRoot.querySelector('[data-act="save"]').click()
    expect(onSave).toHaveBeenCalledTimes(1)
    el.remove()
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm vanilla test oyl-profile-fields`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `oyl-profile-fields.js`:

```js
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

const KG_PER_LB = 0.45359237
const CM_PER_IN = 2.54
const GENDERS = ['female', 'male', 'non-binary', 'prefer not to say']

const styles = sheet(`
  .grid { display: grid; gap: .5rem; max-inline-size: 28rem; }
  label { display: grid; gap: .2rem; font-size: .85rem; color: var(--color-muted); }
  input, select { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .45rem .55rem; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1rem; font: inherit; font-weight: 600; cursor: pointer; justify-self: start; }
`)

export class OylProfileFields extends OylElement {
  static styles = [styles]
  constructor() {
    super()
    /** @type {Record<string, any>} */
    this.value = {}
    /** @type {boolean} */
    this.showSave = false
    /** @type {(patch: Record<string, any>) => void} */
    this.onSave = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const grid = document.createElement('div'); grid.className = 'grid'
    const v = this.value || {}
    const sysTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

    const tz = this._tzControl(v.timezone ?? sysTz)
    const units = this._select('units', 'Units', [['metric', 'Metric (kg, cm)'], ['imperial', 'Imperial (lb, ft/in)']], v.units ?? 'metric')
    const birthday = this._input('birthday', 'date', 'Birthday', v.birthday ?? '')
    const isImperial = () => /** @type {HTMLSelectElement} */ (units).value === 'imperial'
    const weight = this._input('weight', 'number', 'Weight', v.weightKg != null ? String(v.units === 'imperial' ? round1(v.weightKg / KG_PER_LB) : v.weightKg) : '')
    const height = this._input('height', 'number', 'Height', v.heightCm != null ? String(v.units === 'imperial' ? round1(v.heightCm / CM_PER_IN) : v.heightCm) : '')
    const gender = this._genderControl(v.gender ?? '')
    const location = this._input('location', 'text', 'Location', v.location ?? '')

    grid.append(
      this._field('Timezone', tz),
      this._field('Units', units),
      this._field('Birthday', birthday),
      this._field('Weight', weight),
      this._field('Height', height),
      this._field('Gender', gender),
      this._field('Location', location),
    )
    // Relabel weight/height units live.
    const sync = () => {
      weight.placeholder = isImperial() ? 'Weight (lb)' : 'Weight (kg)'
      height.placeholder = isImperial() ? 'Height (in)' : 'Height (cm)'
    }
    units.addEventListener('change', sync, { signal: this.lifecycle }); sync()

    if (this.showSave) {
      const save = document.createElement('button')
      save.className = 'primary'; save.dataset.act = 'save'; save.textContent = 'Save profile'
      save.addEventListener('click', () => this.onSave(this.getValues()), { signal: this.lifecycle })
      grid.append(save)
    }
    root.append(grid)
  }

  /** @returns {Record<string, any>} */
  getValues() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const get = (/** @type {string} */ n) => /** @type {HTMLInputElement|HTMLSelectElement} */ (root.querySelector(`[name="${n}"]`)).value.trim()
    const units = /** @type {'metric'|'imperial'} */ (get('units'))
    /** @type {Record<string, any>} */
    const patch = { timezone: get('timezone'), units }
    const birthday = get('birthday'); if (birthday) patch.birthday = birthday
    const w = Number(get('weight')); if (get('weight') && Number.isFinite(w) && w > 0) patch.weightKg = units === 'imperial' ? round1(w * KG_PER_LB) : w
    const h = Number(get('height')); if (get('height') && Number.isFinite(h) && h > 0) patch.heightCm = units === 'imperial' ? round1(h * CM_PER_IN) : h
    const gender = get('gender'); if (gender) patch.gender = gender
    const location = get('location'); if (location) patch.location = location
    return patch
  }

  /** @param {string} labelText @param {HTMLElement} control @returns {HTMLLabelElement} */
  _field(labelText, control) {
    const l = document.createElement('label'); l.append(labelText, control); return l
  }
  /** @param {string} name @param {string} type @param {string} label @param {string} val @returns {HTMLInputElement} */
  _input(name, type, label, val) {
    const i = document.createElement('input'); i.name = name; i.type = type; i.placeholder = label; i.setAttribute('aria-label', label); i.value = val; return i
  }
  /** @param {string} name @param {string} label @param {Array<[string,string]>} opts @param {string} val @returns {HTMLSelectElement} */
  _select(name, label, opts, val) {
    const s = document.createElement('select'); s.name = name; s.setAttribute('aria-label', label)
    for (const [value, text] of opts) { const o = document.createElement('option'); o.value = value; o.textContent = text; s.append(o) }
    s.value = val; return s
  }
  /** @param {string} val @returns {HTMLElement} */
  _tzControl(val) {
    const zones = typeof (/** @type {any} */ (Intl).supportedValuesOf) === 'function'
      ? /** @type {string[]} */ (/** @type {any} */ (Intl).supportedValuesOf('timeZone')) : null
    if (!zones) return this._input('timezone', 'text', 'Timezone (IANA)', val)
    const s = this._select('timezone', 'Timezone', zones.map((z) => [z, z]), zones.includes(val) ? val : zones[0])
    return s
  }
  /** @param {string} val @returns {HTMLSelectElement} */
  _genderControl(val) {
    const opts = /** @type {Array<[string,string]>} */ ([['', '—'], ...GENDERS.map((g) => [g, g])])
    const known = val === '' || GENDERS.includes(val)
    return this._select('gender', 'Gender', known ? opts : [...opts, [val, val]], val)
  }
}

/** @param {number} n @returns {number} */
function round1(n) { return Math.round(n * 10) / 10 }

/** Register the element (idempotent). */
export function defineProfileFields() {
  if (!customElements.get('oyl-profile-fields')) customElements.define('oyl-profile-fields', OylProfileFields)
}
```

> The gender control here is a select; the spec's "Other free-text" affordance is satisfied minimally by preserving an unknown stored value as an extra option. If a free-text "Other" input is desired interactively, that is a follow-up — keep this task's scope to the tested behaviour.

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm vanilla test oyl-profile-fields && pnpm vanilla typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-profile-fields.js apps/vanilla-oyl/src/components/oyl-profile-fields.test.js
git commit -m "feat(vanilla-oyl): oyl-profile-fields controlled profile field set

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: `oyl-login` page

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-login.js`
- Create: `apps/vanilla-oyl/src/components/oyl-login.test.js`

**Interfaces:**
- Produces: `class OylLogin extends OylElement` + `defineLogin()`. Props: `auth`, `onAuthenticated: () => void`, `onSkip: () => void`. Renders an `<h2>Sign in`, an `oyl-auth-form` (mode login, `onSuccess = onAuthenticated`), a **Skip / use local data** button (`data-act="skip"` → `onSkip`), and an anchor to `/register`.

- [ ] **Step 1: Write the failing test** — `oyl-login.test.js`:

```js
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { defineLogin } from './oyl-login.js'

beforeAll(() => defineLogin())

describe('<oyl-login>', () => {
  it('wires skip and a register link, and forwards auth success', async () => {
    const onSkip = vi.fn(); const onAuthenticated = vi.fn()
    const auth = { login: vi.fn().mockResolvedValue({}), register: vi.fn() }
    const el = /** @type {any} */ (document.createElement('oyl-login'))
    el.auth = auth; el.onSkip = onSkip; el.onAuthenticated = onAuthenticated
    document.body.append(el)
    const root = el.shadowRoot
    expect(root.querySelector('h2')).toBeTruthy()
    expect(root.querySelector('a[href="/register"]')).toBeTruthy()
    root.querySelector('[data-act="skip"]').click()
    expect(onSkip).toHaveBeenCalled()

    const formEl = root.querySelector('oyl-auth-form')
    formEl.shadowRoot.querySelector('input[name="identifier"]').value = 'a'
    formEl.shadowRoot.querySelector('input[name="password"]').value = 'b'
    formEl.shadowRoot.querySelector('form').requestSubmit()
    await Promise.resolve(); await Promise.resolve()
    expect(onAuthenticated).toHaveBeenCalled()
    el.remove()
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm vanilla test oyl-login`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `oyl-login.js`:

```js
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { defineAuthForm } from './oyl-auth-form.js'

const styles = sheet(`
  h2 { font-size: var(--step-2); margin-block-end: var(--space-4); }
  .alt { margin-block-start: var(--space-4); display: flex; gap: var(--space-4); align-items: center; }
  button.ghost { font: inherit; background: transparent; border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .4rem .8rem; cursor: pointer; color: var(--color-text); }
  a { color: var(--color-accent); }
`)

export class OylLogin extends OylElement {
  static styles = [styles]
  constructor() {
    super()
    /** @type {any} */ this.auth = undefined
    /** @type {() => void} */ this.onAuthenticated = () => {}
    /** @type {() => void} */ this.onSkip = () => {}
  }
  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    defineAuthForm()
    const h2 = document.createElement('h2'); h2.textContent = 'Sign in'; h2.setAttribute('tabindex', '-1')
    const form = /** @type {any} */ (document.createElement('oyl-auth-form'))
    form.auth = this.auth; form.mode = 'login'; form.onSuccess = () => this.onAuthenticated()
    const alt = document.createElement('div'); alt.className = 'alt'
    const skip = document.createElement('button'); skip.className = 'ghost'; skip.dataset.act = 'skip'; skip.textContent = 'Skip — use local data'
    skip.addEventListener('click', () => this.onSkip(), { signal: this.lifecycle })
    const reg = document.createElement('a'); reg.href = '/register'; reg.textContent = 'Create an account'
    alt.append(skip, reg)
    root.append(h2, form, alt)
  }
}

/** Register the element (idempotent). */
export function defineLogin() {
  if (!customElements.get('oyl-login')) customElements.define('oyl-login', OylLogin)
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm vanilla test oyl-login && pnpm vanilla typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-login.js apps/vanilla-oyl/src/components/oyl-login.test.js
git commit -m "feat(vanilla-oyl): oyl-login page with skip + register link

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: `oyl-register` page

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-register.js`
- Create: `apps/vanilla-oyl/src/components/oyl-register.test.js`

**Interfaces:**
- Produces: `class OylRegister extends OylElement` + `defineRegister()`. Props: `auth`, `onAuthenticated: (profilePatch) => void`, `onSkip: () => void`. Renders `<h2>Create account`, an `oyl-auth-form` (mode register), a collapsible `oyl-profile-fields` ("Optional details", `showSave=false`), a Skip button, and a link to `/login`. On auth-form success it calls `onAuthenticated(profileFields.getValues())` so the host can persist the profile (incl. timezone) and switch to Remote.

- [ ] **Step 1: Write the failing test** — `oyl-register.test.js`:

```js
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { defineRegister } from './oyl-register.js'

beforeAll(() => defineRegister())

describe('<oyl-register>', () => {
  it('forwards register success with the collected profile patch (incl. timezone)', async () => {
    const onAuthenticated = vi.fn(); const onSkip = vi.fn()
    const auth = { login: vi.fn(), register: vi.fn().mockResolvedValue({}) }
    const el = /** @type {any} */ (document.createElement('oyl-register'))
    el.auth = auth; el.onAuthenticated = onAuthenticated; el.onSkip = onSkip
    document.body.append(el)
    const root = el.shadowRoot
    expect(root.querySelector('a[href="/login"]')).toBeTruthy()
    root.querySelector('[data-act="skip"]').click()
    expect(onSkip).toHaveBeenCalled()

    const formEl = root.querySelector('oyl-auth-form')
    formEl.shadowRoot.querySelector('input[name="username"]').value = 'avery'
    formEl.shadowRoot.querySelector('input[name="email"]').value = 'a@b.c'
    formEl.shadowRoot.querySelector('input[name="password"]').value = 'pw'
    formEl.shadowRoot.querySelector('form').requestSubmit()
    await Promise.resolve(); await Promise.resolve()
    expect(auth.register).toHaveBeenCalledWith('avery', 'a@b.c', 'pw')
    expect(onAuthenticated).toHaveBeenCalledTimes(1)
    const patch = onAuthenticated.mock.calls[0][0]
    expect(typeof patch.timezone).toBe('string')
    el.remove()
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm vanilla test oyl-register`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `oyl-register.js`:

```js
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { defineAuthForm } from './oyl-auth-form.js'
import { defineProfileFields } from './oyl-profile-fields.js'

const styles = sheet(`
  h2 { font-size: var(--step-2); margin-block-end: var(--space-4); }
  details { margin-block-start: var(--space-4); }
  summary { cursor: pointer; color: var(--color-muted); margin-block-end: var(--space-3); }
  .alt { margin-block-start: var(--space-4); display: flex; gap: var(--space-4); align-items: center; }
  button.ghost { font: inherit; background: transparent; border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .4rem .8rem; cursor: pointer; color: var(--color-text); }
  a { color: var(--color-accent); }
`)

export class OylRegister extends OylElement {
  static styles = [styles]
  constructor() {
    super()
    /** @type {any} */ this.auth = undefined
    /** @type {(patch: Record<string, any>) => void} */ this.onAuthenticated = () => {}
    /** @type {() => void} */ this.onSkip = () => {}
  }
  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    defineAuthForm(); defineProfileFields()
    const h2 = document.createElement('h2'); h2.textContent = 'Create account'; h2.setAttribute('tabindex', '-1')
    const fields = /** @type {any} */ (document.createElement('oyl-profile-fields'))
    fields.value = {}; fields.showSave = false
    const form = /** @type {any} */ (document.createElement('oyl-auth-form'))
    form.auth = this.auth; form.mode = 'register'
    form.onSuccess = () => this.onAuthenticated(fields.getValues())
    const details = document.createElement('details')
    const summary = document.createElement('summary'); summary.textContent = 'Optional details (timezone, body, location)'
    details.append(summary, fields)
    const alt = document.createElement('div'); alt.className = 'alt'
    const skip = document.createElement('button'); skip.className = 'ghost'; skip.dataset.act = 'skip'; skip.textContent = 'Skip — use local data'
    skip.addEventListener('click', () => this.onSkip(), { signal: this.lifecycle })
    const login = document.createElement('a'); login.href = '/login'; login.textContent = 'I already have an account'
    alt.append(skip, login)
    root.append(h2, form, details, alt)
  }
}

/** Register the element (idempotent). */
export function defineRegister() {
  if (!customElements.get('oyl-register')) customElements.define('oyl-register', OylRegister)
}
```

> `<details>` starts collapsed; happy-dom still renders its children in the DOM so `getValues()` works and the test can read the auth-form. The timezone field inside defaults to the system tz (Task 8), so the patch always carries a `timezone`.

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm vanilla test oyl-register && pnpm vanilla typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-register.js apps/vanilla-oyl/src/components/oyl-register.test.js
git commit -m "feat(vanilla-oyl): oyl-register page with optional profile fields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: `oyl-account-menu` — header logout + profile/sign-in

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-account-menu.js`
- Create: `apps/vanilla-oyl/src/components/oyl-account-menu.test.js`

**Interfaces:**
- Produces: `class OylAccountMenu extends OylElement` + `defineAccountMenu()`. Props: `session` (a `Signal<AuthSession>`), `onLogout: () => void`. Always renders a Profile link (`a[href="/profile"]`). When `session.get()` is truthy it also renders a **Log out** button (`data-act="logout"` → `onLogout`); when falsy it renders a **Sign in** link (`a[href="/login"]`). Reacts to session changes.

- [ ] **Step 1: Write the failing test** — `oyl-account-menu.test.js`:

```js
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { signal } from '../lib/reactive/signal.js'
import { defineAccountMenu } from './oyl-account-menu.js'

beforeAll(() => defineAccountMenu())

describe('<oyl-account-menu>', () => {
  it('shows Sign in when logged out, Log out when logged in', async () => {
    const session = signal(/** @type {any} */ (null))
    const onLogout = vi.fn()
    const el = /** @type {any} */ (document.createElement('oyl-account-menu'))
    el.session = session; el.onLogout = onLogout
    document.body.append(el)
    const root = el.shadowRoot
    expect(root.querySelector('a[href="/profile"]')).toBeTruthy()
    expect(root.querySelector('a[href="/login"]')).toBeTruthy()
    expect(root.querySelector('[data-act="logout"]')).toBeFalsy()

    session.set({ token: 't', user: { id: 1, username: 'a', email: 'a@b.c' } })
    await Promise.resolve()
    expect(root.querySelector('a[href="/login"]')).toBeFalsy()
    const logout = root.querySelector('[data-act="logout"]')
    expect(logout).toBeTruthy()
    logout.click()
    expect(onLogout).toHaveBeenCalled()
    el.remove()
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm vanilla test oyl-account-menu`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `oyl-account-menu.js`:

```js
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

const styles = sheet(`
  nav { display: inline-flex; align-items: center; gap: var(--space-3); }
  a { color: var(--color-muted); text-decoration: none; font-weight: 550; }
  a:hover { color: var(--color-text); }
  button { font: inherit; background: transparent; border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .3rem .7rem; cursor: pointer; color: var(--color-text); }
`)

export class OylAccountMenu extends OylElement {
  static styles = [styles]
  constructor() {
    super()
    /** @type {import('../lib/reactive/signal.js').Signal<any>} */
    this.session = /** @type {any} */ (undefined)
    /** @type {() => void} */ this.onLogout = () => {}
  }
  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const nav = document.createElement('nav'); nav.setAttribute('aria-label', 'Account')
    const profile = document.createElement('a'); profile.href = '/profile'; profile.textContent = 'Profile'
    const signin = document.createElement('a'); signin.href = '/login'; signin.textContent = 'Sign in'
    const logout = document.createElement('button'); logout.dataset.act = 'logout'; logout.textContent = 'Log out'
    logout.addEventListener('click', () => this.onLogout(), { signal: this.lifecycle })
    nav.append(profile)
    root.append(nav)
    this.track(() => {
      const signedIn = !!this.session?.get()
      if (signedIn) { if (!logout.isConnected) nav.append(logout); signin.remove() }
      else { if (!signin.isConnected) nav.append(signin); logout.remove() }
    })
  }
}

/** Register the element (idempotent). */
export function defineAccountMenu() {
  if (!customElements.get('oyl-account-menu')) customElements.define('oyl-account-menu', OylAccountMenu)
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm vanilla test oyl-account-menu && pnpm vanilla typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-account-menu.js apps/vanilla-oyl/src/components/oyl-account-menu.test.js
git commit -m "feat(vanilla-oyl): oyl-account-menu header control

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: `oyl-profile` page

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-profile.js`
- Create: `apps/vanilla-oyl/src/components/oyl-profile.test.js`

**Interfaces:**
- Produces: `class OylProfile extends OylElement` + `defineProfile()`. Props: `session` (`Signal<AuthSession>`), `profile` (`Signal<User|null>`), `onSaveProfile: (patch) => void`, `onLogout: () => void`. Renders `<h2>Profile`; when signed in an identity block (`[data-role="identity"]` with username/email); when signed out a "Sign in to sync" CTA (`a[href="/login"]`) and no logout button. Always renders an `oyl-profile-fields` (`showSave=true`, hydrated from `profile.get()`, `onSave = onSaveProfile`). When signed in, a **Log out** button (`data-act="logout"`). Body summary (`formatWeight`/`formatHeight`/`age`) shown when the profile has those values.

- [ ] **Step 1: Write the failing test** — `oyl-profile.test.js`:

```js
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { signal } from '../lib/reactive/signal.js'
import { User } from '@oyl/all-of-oyl'
import { defineProfile } from './oyl-profile.js'

beforeAll(() => defineProfile())

/** @returns {any} */
function mount(session, profile, onSaveProfile = () => {}, onLogout = () => {}) {
  const el = /** @type {any} */ (document.createElement('oyl-profile'))
  el.session = session; el.profile = profile; el.onSaveProfile = onSaveProfile; el.onLogout = onLogout
  document.body.append(el)
  return el
}

describe('<oyl-profile>', () => {
  it('shows identity + logout when signed in', () => {
    const session = signal({ token: 't', user: { id: 1, username: 'avery', email: 'a@b.c' } })
    const profile = signal(new User({ displayName: 'Avery', timezone: 'UTC', defaultCurrency: 'USD' }))
    const el = mount(session, profile)
    const root = el.shadowRoot
    expect(root.querySelector('[data-role="identity"]').textContent).toContain('avery')
    expect(root.querySelector('[data-act="logout"]')).toBeTruthy()
    expect(root.querySelector('oyl-profile-fields')).toBeTruthy()
    el.remove()
  })

  it('shows a sign-in CTA and no logout when signed out', () => {
    const el = mount(signal(null), signal(null))
    const root = el.shadowRoot
    expect(root.querySelector('a[href="/login"]')).toBeTruthy()
    expect(root.querySelector('[data-act="logout"]')).toBeFalsy()
    expect(root.querySelector('oyl-profile-fields')).toBeTruthy()
    el.remove()
  })

  it('forwards the saved patch from the field set', () => {
    const onSaveProfile = vi.fn()
    const profile = signal(new User({ displayName: 'A', timezone: 'UTC', defaultCurrency: 'USD' }))
    const el = mount(signal({ token: 't', user: { id: 1, username: 'a', email: 'a@b.c' } }), profile, onSaveProfile)
    el.shadowRoot.querySelector('oyl-profile-fields').shadowRoot.querySelector('[data-act="save"]').click()
    expect(onSaveProfile).toHaveBeenCalledTimes(1)
    el.remove()
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm vanilla test oyl-profile`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `oyl-profile.js`:

```js
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { defineProfileFields } from './oyl-profile-fields.js'

const styles = sheet(`
  h2 { font-size: var(--step-2); margin-block-end: var(--space-4); }
  .card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-2); padding: var(--space-4); margin-block-end: var(--space-4); }
  .muted { color: var(--color-muted); }
  a { color: var(--color-accent); }
  button.danger { margin-block-start: var(--space-4); font: inherit; background: transparent; color: var(--color-danger); border: 1px solid color-mix(in oklch, var(--color-danger) 40%, var(--color-border)); border-radius: var(--radius-1); padding: .4rem .8rem; cursor: pointer; }
`)

export class OylProfile extends OylElement {
  static styles = [styles]
  constructor() {
    super()
    /** @type {import('../lib/reactive/signal.js').Signal<any>} */ this.session = /** @type {any} */ (undefined)
    /** @type {import('../lib/reactive/signal.js').Signal<any>} */ this.profile = /** @type {any} */ (undefined)
    /** @type {(patch: Record<string, any>) => void} */ this.onSaveProfile = () => {}
    /** @type {() => void} */ this.onLogout = () => {}
  }
  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    defineProfileFields()
    const sess = this.session?.get() ?? null
    const prof = this.profile?.get() ?? null

    const h2 = document.createElement('h2'); h2.textContent = 'Profile'; h2.setAttribute('tabindex', '-1')

    const identity = document.createElement('div'); identity.className = 'card'
    if (sess) {
      identity.dataset.role = 'identity'
      identity.textContent = `${sess.user.username} · ${sess.user.email}`
    } else {
      const p = document.createElement('p'); p.className = 'muted'
      const a = document.createElement('a'); a.href = '/login'; a.textContent = 'Sign in to sync'
      p.append('Using local data. ', a, ' to back up and sync across devices.')
      identity.append(p)
    }

    const fields = /** @type {any} */ (document.createElement('oyl-profile-fields'))
    fields.value = prof ? toPatch(prof) : {}
    fields.showSave = true
    fields.onSave = (/** @type {any} */ patch) => this.onSaveProfile(patch)

    root.append(h2, identity, fields)
    if (sess) {
      const logout = document.createElement('button'); logout.className = 'danger'; logout.dataset.act = 'logout'; logout.textContent = 'Log out'
      logout.addEventListener('click', () => this.onLogout(), { signal: this.lifecycle })
      root.append(logout)
    }
  }
}

/** @param {import('@oyl/all-of-oyl').User} u @returns {Record<string, any>} */
function toPatch(u) {
  /** @type {Record<string, any>} */
  const p = { displayName: u.displayName, timezone: u.timezone, defaultCurrency: u.defaultCurrency }
  for (const k of ['units', 'birthday', 'weightKg', 'heightCm', 'gender', 'location']) {
    const v = /** @type {any} */ (u)[k]; if (v !== undefined) p[k] = v
  }
  return p
}

/** Register the element (idempotent). */
export function defineProfile() {
  if (!customElements.get('oyl-profile')) customElements.define('oyl-profile', OylProfile)
}
```

> Sync/connection summary and data-action buttons on `/profile` are deferred to the wiring task (14), where the same `dataState`/connection callbacks Status uses are in scope. This task delivers identity + fields + logout, which are independently testable.

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm vanilla test oyl-profile && pnpm vanilla typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-profile.js apps/vanilla-oyl/src/components/oyl-profile.test.js
git commit -m "feat(vanilla-oyl): oyl-profile page (identity, fields, logout)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: Remove auth from Status; delete `oyl-auth`

**Files:**
- Modify: `apps/vanilla-oyl/src/components/oyl-status-panel.js`
- Delete: `apps/vanilla-oyl/src/components/oyl-auth.js`, `apps/vanilla-oyl/src/components/oyl-auth.test.js`
- Test: `apps/vanilla-oyl/src/components/oyl-status-panel.test.js`

**Interfaces:**
- Produces: `OylStatusPanel` no longer renders an `oyl-auth` element, no longer imports `defineAuth`, and drops the `auth` property. Sync/Connection/Actions unchanged.

- [ ] **Step 1: Update the Status test** — in `oyl-status-panel.test.js`, find any assertion that the panel renders `oyl-auth` / an Account heading and replace it with the negative assertion (add this `it` and delete/adjust the positive one if present):

```js
it('no longer renders the auth form (moved to /login + /register)', () => {
  const panel = /** @type {any} */ (document.createElement('oyl-status-panel'))
  panel.connection = { mode: 'local', apiBaseUrl: '', defaultApiBaseUrl: '', onApply: () => {} }
  document.body.append(panel)
  expect(panel.shadowRoot.querySelector('oyl-auth')).toBeFalsy()
  panel.remove()
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm vanilla test oyl-status-panel`
Expected: FAIL — `oyl-auth` is still rendered.

- [ ] **Step 3: Implement** — in `oyl-status-panel.js`:
  - Remove `import { defineAuth } from './oyl-auth.js'`.
  - Remove `defineAuth()` from `render()`.
  - Remove the `accountLabel` + `authEl` creation block and drop them from the final `root.append(...)` (the append becomes `root.append(h2, grid, actions, connLabel, connEl, ...syncNodes, ...migrateNodes)`).
  - Remove the `/** @type {any} */ this.auth = null` field from the constructor.

Then delete the dead component:
```bash
git rm apps/vanilla-oyl/src/components/oyl-auth.js apps/vanilla-oyl/src/components/oyl-auth.test.js
```

- [ ] **Step 4: Run tests, verify green**

Run: `pnpm vanilla test oyl-status-panel && pnpm vanilla typecheck`
Expected: PASS (and `oyl-auth.test.js` is gone).

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-status-panel.js apps/vanilla-oyl/src/components/oyl-status-panel.test.js
git commit -m "refactor(vanilla-oyl): remove auth form from Status; delete oyl-auth

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 14: Wire it all in `main.js`

**Files:**
- Modify: `apps/vanilla-oyl/src/main.js`

**Interfaces:**
- Consumes: everything above. No new exports.

This task has no unit test (`main.js` is the composition root); its gate is `pnpm vanilla typecheck`, the full `pnpm vanilla test` suite staying green, and the manual smoke below.

- [ ] **Step 1: Imports** — add to the import block:

```js
import { makeRepositories } from './storage/bootstrap.js'
import { createProfileStore, resolveTimezone } from './state/profile-store.js'
import { shouldRedirectToLogin, tzNeedsReload } from './state/auth-guard.js'
import { hasUnmigratedLocal } from './storage/migrate.js' // ensure present
import { TZ_RELOADED_KEY } from './storage/keys.js'        // add to the existing keys import
import { defineLogin } from './components/oyl-login.js'
import { defineRegister } from './components/oyl-register.js'
import { defineProfile } from './components/oyl-profile.js'
import { defineAccountMenu } from './components/oyl-account-menu.js'
```
Call the new defines alongside the others near the top of `boot()`:
```js
  defineLogin(); defineRegister(); defineProfile(); defineAccountMenu()
```

- [ ] **Step 2: Hoist repos + resolve tz** — replace the `client`/`connectivity`/`createDataState` block (around `main.js:53-65`) with:

```js
  const client = mode === 'remote'
    ? createHttpClient({
        baseUrl: getApiBaseUrl(storage),
        fetch: window.fetch.bind(window),
        getToken: authState.getToken,
        onAuthError: () => authState.logout(),
        timeoutMs: 15000,
        newAbortController: () => new AbortController(),
        timer: { set: (fn, ms) => setTimeout(fn, ms), clear: (/** @type {any} */ id) => clearTimeout(id) },
      })
    : undefined
  const connectivity = mode === 'remote' ? createBrowserConnectivity(window) : undefined
  const { repos, engine } = makeRepositories(storage, client ? { client, ...(connectivity ? { connectivity } : {}) } : {})
  const profileStore = createProfileStore(repos, storage)
  await profileStore.load()
  const browserTz = defaultTimezone()
  const tz = resolveTimezone(profileStore.profile.get(), browserTz)
  const dataState = createDataState(storage, themeState, { repos, engine, timezone: tz })
```

- [ ] **Step 3: Guard + skip the no-session boot work** — replace the `await dataState.refresh()` try/catch + the `if (mode === 'remote') { startSync; maybeOfferMigration }` block with:

```js
  routeState.start()

  // Force the login page in Remote mode with no session (before touching the network).
  if (shouldRedirectToLogin(mode, authState.session.get(), routeState.route.get())) {
    routeState.navigate('/login')
  }

  const hasSession = !!authState.session.get()
  if (mode !== 'remote' || hasSession) {
    try {
      await dataState.refresh()
    } catch (err) {
      if (mode === 'remote') noticeState.show("Couldn't reach the backend — sign in (Status → Account) or reload to retry.")
      else throw err
    }
  }

  /** Immediately back up any local-only data to the API (idempotent via MIGRATED_KEY). */
  function backupLocalNow() {
    if (mode === 'remote' && authState.session.get() && hasUnmigratedLocal(storage)) {
      void dataState.migrateLocal().then((n) => { if (n > 0) noticeState.show(`Backed up ${n} local item(s) to your account.`) }).catch(() => {})
    }
  }

  if (mode === 'remote' && hasSession) {
    void dataState.startSync()
      .then(() => {
        // New-device correction: if the pulled profile tz differs from what we built with, reload once.
        if (tzNeedsReload(tz, profileStore.profile.get(), browserTz) && !sessionStorage.getItem(TZ_RELOADED_KEY)) {
          sessionStorage.setItem(TZ_RELOADED_KEY, '1')
          location.reload()
        }
      })
      .catch(() => {})
    backupLocalNow()
  }
```

> Note: `profileStore.load()` after `startSync()` is implicit via `dataState.refresh()` re-hydration; to re-read the profile after the pull, call `await profileStore.load()` inside the `.then` before the `tzNeedsReload` check:
> ```js
> .then(async () => { await profileStore.load(); if (tzNeedsReload(tz, profileStore.profile.get(), browserTz) && !sessionStorage.getItem(TZ_RELOADED_KEY)) { sessionStorage.setItem(TZ_RELOADED_KEY, '1'); location.reload() } })
> ```

- [ ] **Step 4: Guard effect + immediate-backup on login transition** — replace the existing `wasSignedIn` effect (`main.js:93-98`) with:

```js
  let wasSignedIn = !!authState.session.get()
  effect(() => {
    const signedIn = !!authState.session.get()
    if (signedIn && !wasSignedIn) { dataState.syncFlush(); backupLocalNow() }
    wasSignedIn = signedIn
    if (shouldRedirectToLogin(mode, authState.session.get(), routeState.route.get())) {
      routeState.navigate('/login')
    }
  })
```

Delete the now-unused `maybeOfferMigration` function and its `MIGRATE_DECLINED_KEY` import usage.

- [ ] **Step 5: Replace `view.tz = defaultTimezone()` with the resolved `tz`** — in each of the six route factories, change `view.tz = defaultTimezone()` to `view.tz = tz`.

- [ ] **Step 6: Add the new routes + account menu** — in the `router.routes` object add:

```js
    login: () => {
      const page = /** @type {import('./components/oyl-login.js').OylLogin} */ (document.createElement('oyl-login'))
      page.auth = authState
      page.onAuthenticated = () => { setStorageMode(storage, 'remote'); location.assign('/status') }
      page.onSkip = () => { setStorageMode(storage, 'local'); location.assign('/status') }
      return page
    },
    register: () => {
      const page = /** @type {import('./components/oyl-register.js').OylRegister} */ (document.createElement('oyl-register'))
      page.auth = authState
      page.onAuthenticated = (patch) => {
        void profileStore.save(patch).finally(() => { setStorageMode(storage, 'remote'); location.assign('/status') })
      }
      page.onSkip = () => { setStorageMode(storage, 'local'); location.assign('/status') }
      return page
    },
    profile: () => {
      const page = /** @type {import('./components/oyl-profile.js').OylProfile} */ (document.createElement('oyl-profile'))
      page.session = authState.session
      page.profile = profileStore.profile
      page.onLogout = () => authState.logout()
      page.onSaveProfile = (patch) => {
        const tzChanged = 'timezone' in patch && patch.timezone !== tz
        const unitsChanged = 'units' in patch && patch.units !== profileStore.profile.get()?.units
        void profileStore.save(patch).then(() => {
          if (tzChanged || unitsChanged) location.assign('/profile')
          else noticeState.show('Profile saved.')
        })
      }
      return page
    },
```

And mount the account menu in the toolbar (next to the theme toggle):
```js
  const accountMenu = /** @type {import('./components/oyl-account-menu.js').OylAccountMenu} */ (document.createElement('oyl-account-menu'))
  accountMenu.slot = 'toolbar'
  accountMenu.session = authState.session
  accountMenu.onLogout = () => authState.logout()
```
Add it to the shell append:
```js
  shell.append(navEl, ...(syncChip ? [syncChip] : []), toggle, accountMenu, router)
```

Also remove `panel.auth = authState` from the `status` route factory (the property no longer exists after Task 13).

- [ ] **Step 7: Build the vendored lib, typecheck, run the full suite**

Run:
```bash
pnpm vanilla build:lib && pnpm vanilla typecheck && pnpm vanilla test
```
Expected: typecheck clean; all tests green.

- [ ] **Step 8: Manual smoke (local + remote)**

Run `pnpm vanilla dev` (and the backend per CLAUDE.md for the remote path), then verify:
1. Local: visiting `/` → `/status`; header shows **Profile** + **Sign in**; `/profile` lets you set timezone; after save the app reloads and journal/finance day headers reflect the new tz.
2. Remote: from `/login`, **Skip** drops to local; **Create an account** registers, lands on `/status`, header shows **Profile** + **Log out**, and a "Backed up N local item(s)" notice appears if local data existed.
3. Logout returns you to `/login`; **Skip** there keeps working locally.

- [ ] **Step 9: Commit**

```bash
git add apps/vanilla-oyl/src/main.js
git commit -m "feat(vanilla-oyl): wire login/register/profile routes, tz, guard, immediate backup

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] `pnpm --filter @oyl/all-of-oyl test && pnpm all-of typecheck:src && pnpm all-of build`
- [ ] `pnpm --filter @oyl/strapi-oyl-app exec tsc --noEmit && pnpm --filter @oyl/strapi-oyl-app test`
- [ ] `pnpm vanilla build:lib && pnpm vanilla typecheck && pnpm vanilla test`
- [ ] Manual smoke (Task 14, Step 8) passes for local, register, login, skip, and logout.

## Self-review notes (coverage map)

- Spec B1 (User fields) → Task 1. B2 (formatters) → Task 2. B3 (tz seam: profile-store, resolveTimezone, DI, feed views, first-pull reload) → Tasks 3, 4, 14. B4 (auth flows) → Tasks 7, 9, 10, 14. B5 (guard) → Tasks 5, 14. B6/B6a (components + contracts) → Tasks 7–12. B7 (Status cleanup) → Task 13. B8 (immediate migration) → Task 14. B9 (backend public auth) → Task 6. Edge cases (no-session profile, mode-aware menu, skip, logout) → Tasks 11, 12, 14.
- Deferred per spec: `/profile` sync-summary + data-action buttons are stubbed into Task 14's wiring scope (identity/fields/logout are tested in Task 12); a fully interactive gender "Other" text input is noted as follow-up.
