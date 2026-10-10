# `apps/stencil-oyl` Profile screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the last placeholder, `/profile`, in `apps/stencil-oyl` with the redesigned Profile (identity + body summary, the editable profile form, the Google Drive card, a pointer to Status, Log out) and retire `oyl-not-yet`. Same stores and rules as vanilla; no Connection/Data duplication.

**Architecture:** `oyl-profile` mirrors three signals (`session`, `profile`, `google.connection`) through `bindSignal` into `@State` and derives everything in `render()`; `oyl-profile-form` owns its select state and emits vanilla's patch; the route owns the save/reload/notice rule and the Google navigation. Pure rules live in `src/profile/format.ts` with unit tests.

**Tech Stack:** as sub-projects 2–9.

**Spec:** `docs/superpowers/specs/2026-10-09-stencil-oyl-profile-design.md`

## Global Constraints

- **Branch** `feat/stencil-oyl-profile` (stacked on `feat/stencil-oyl-insights`; spec commits `4ba78fd` + `e08eaa5`, reviewed + amended in this commit). One commit per task; session trailer; never commit on red; no push/PR unless asked.
- **Parity with vanilla's `oyl-profile` + `oyl-profile-fields`** (patch rules, conversions, timezone-option rule, body summary, Google card states/texts, reload rule, notices). Divergence by decision: no Connection/Data on Profile (a note links to Status); `ui-*` primitives.
- **Selectors for e2e** (keep stable): `oyl-profile`, `[data-role="identity"]`, `[data-role="body-summary"]`, `oyl-profile-form ui-select[name="timezone"|"units"|"gender"] select`, `oyl-profile-form ui-field[name="birthday"|"weight"|"height"|"location"|"genderOther"] input`, `oyl-profile-form ui-button[type="submit"] button`, `[data-role="google-drive"]`, `[data-act="google-connect"|"google-disconnect"]` (on `ui-button` hosts — e2e clicks `ui-button[data-act=…] button`), `[data-role="google-reconnect"]`, `oyl-profile a[href="/status"]`, `oyl-profile ui-button[data-act="logout"] button`.
- **Gates per task:** `pnpm stencil test|typecheck|build`; Task 5 runs the stencil e2e projects (`PW_CHROMIUM_PATH`, `--workers=4`, ports 1341/1342/8043 freed first). First `stencil test` after adding a tag may fail on stale `components.d.ts` — rerun.
- `ui-*` hosts get stable handlers; `@Event()` names avoid native ones (`saveProfile`, `logout`, `save` — none is a native DOM event; verified against Stencil's reserved public names too); forms read values from the primitives at submit; `ui-select` state is owned by the form; the text fields are rendered `value={seed.x}` from a `@State seed` recomputed in `@Watch('value')` (so unrelated parent re-renders never re-apply a value and a custom gender seeds the self-describe field even though it mounts in the same render); the screen derives the form's `value` in the `profile` mirror, never in `render()`.
- `Intl.supportedValuesOf` is read through a prop `zones: readonly string[] | null` whose class-field default reads the global (`typeof Intl.supportedValuesOf === 'function' ? … : null`), so the spec drives both branches. Timezone options are recomputed from the seeded timezone (`defaultTimezone()` when the profile has none).
- Mirrors bind in `connectedCallback` and dispose in `disconnectedCallback`, as every mirror in the shell.

---

## Task 1: `src/profile/format.ts`

**Files:** `apps/stencil-oyl/src/profile/format.ts` + `format.unit.ts`

- [x] **Step 1: failing tests** — `GENDERS` (female / male / non-binary / prefer not to say), `GENDER_OPTIONS` (`''` "—", the four, `__other__` "Other"), `UNIT_OPTIONS` (metric "Metric (kg, cm)", imperial "Imperial (lb, ft/in)"), `KG_PER_LB = 0.45359237`, `CM_PER_IN = 2.54`, `round1`; `toPatch(user)` → `{ displayName, timezone, defaultCurrency }` + each of units/birthday/weightKg/heightCm/gender/location only when defined; `bodySummary(profile, today)` → "81.5 kg · 179.5 cm · 36 yrs" (metric), imperial via `formatWeight/formatHeight`, each part optional, `""` when none, `null` profile → `""`; `timezoneOptions(zones, current)` → `null` when `zones` is null, `[current, ...zones]` when current is set and absent, else `zones`, mapped to `{ value, label }`; `displayNumber(value?, units, factor)` → `""` when undefined, the kg/cm number as a string in metric, `round1(value / factor)` in imperial; `readPatch({ timezone, units, birthday, weight, height, gender, genderOther, location })` → vanilla's rule: `{ timezone, units }` always; `birthday` when non-empty; `weightKg` when `weight` non-empty, finite and > 0 (imperial → `round1(w * KG_PER_LB)`), same for `heightCm` with `CM_PER_IN`; `gender` = the select value, or trimmed `genderOther` when `__other__` (omitted when empty); `location` trimmed when non-empty; `"0"`/`"-1"`/`"abc"` weight → no `weightKg`.
- [x] **Step 2: implement.**
- [x] **Step 3: gate + commit** — `feat(stencil-oyl): profile format helpers`.

## Task 2: `oyl-profile-form`

**Files:** `apps/stencil-oyl/src/components/oyl-profile-form/{oyl-profile-form.tsx,oyl-profile-form.css,oyl-profile-form.spec.tsx}`

- [x] **Step 1: failing spec** — `value: ProfilePatch`, `zones?: readonly string[] | null` (spec passes `['UTC', 'America/Los_Angeles', 'Europe/Paris']`), event `save`:
  - with `zones` renders `ui-select[name=timezone]` whose options are the zones (current `'Asia/Calcutta'` prepended when absent; a seeded `'UTC'` likewise kept; no timezone in `value` → `defaultTimezone()`) and `value` = the seeded timezone; with `zones = null` renders `ui-field[name=timezone]` with the value; `ui-select[name=units]` value from `value.units` (default metric); `birthday`/`location` fields seeded; `weight`/`height` seeded in display units (`{ units: 'imperial', weightKg: 81.5, heightCm: 179.5 }` → "179.7" / "70.7") with hints "lb"/"in" (metric: "kg"/"cm"); `gender` select `''` by default; a custom gender (`'agender'`) → select `__other__` and `ui-field[name=genderOther]` visible with "agender"; otherwise no `genderOther` field.
  - `uiChange` units → imperial flips the hints to lb/in and leaves the typed numbers alone; `uiChange` gender `__other__` reveals `genderOther`, back to `male` hides it.
  - submit (native form submit) with birthday "1990-06-15", weight "81.5", height "179.5", location " Berlin " (metric) → `save` detail `{ timezone, units: 'metric', birthday: '1990-06-15', weightKg: 81.5, heightCm: 179.5, location: 'Berlin' }` (no gender); imperial with weight "180" height "70" → `weightKg: 81.6`, `heightCm: 177.8`; gender `__other__` + "agender" → `gender: 'agender'`; blanks omitted.
  - setting `value` again (new object) re-seeds fields and select state — including a custom gender (`__other__` + the self-describe text) and a different unlisted timezone (its own option appears, the old one goes); a parent re-render with the same `value` reference leaves typed text alone.
- [x] **Step 2: implement** — `@State seed: { timezone, units, birthday, weight, height, gender, genderOther, location }` computed by a pure `seedFrom(value, zonesKnown)` (in `format.ts`, unit-tested: display conversion, `__other__` detection, `defaultTimezone()` fallback) in `componentWillLoad` + `@Watch('value')`; `@State timezone/units/gender` mirror the seed and follow `uiChange`; `tzOptions` derived from `seed.timezone`. Text fields render `value={seed.x}`; `onSubmit` reads each field host's current `.value`, calls `readPatch`, emits `save`. CSS: `.grid { grid-template-columns: minmax(0,1fr) minmax(0,1fr) }`, 1 column under a 26rem container query; `.actions` right-aligned.
- [x] **Step 3: gate + commit** — `feat(stencil-oyl): oyl-profile-form`.

## Task 3: `oyl-profile` screen

**Files:** `apps/stencil-oyl/src/components/oyl-profile/{oyl-profile.tsx,oyl-profile.css,oyl-profile.spec.tsx}`

- [x] **Step 1: failing spec** — props `session: Signal<{ user: { username, email } } | null>`, `profile: Signal<User | null>`, `today`, `google: { connection: Signal<GoogleConnection>, connect: vi.fn, disconnect: vi.fn }`, `zones` passthrough; signals from `core()`:
  - `h2` "Profile" `tabindex=-1`; `[data-role=identity]` "steve · steve@example.com"; no `[data-role=body-summary]` with a bare profile, "81.5 kg · 179.5 cm · 36 yrs" with a full one (today fixed); `oyl-profile-form` with `value` = `toPatch(profile)` (and `{}` when the profile is null) — and the SAME `value` reference after a Google-connection change (the patch is derived in the profile mirror).
  - the form's `save` event (bubbling CustomEvent with a patch) → `saveProfile` emitted with the same patch.
  - Google: `{ state: 'unknown' }` and `'unconfigured'` → no `[data-role=google-drive]`; `'disconnected'` → `ui-button[data-act=google-connect]` "Connect Google Drive", click → `connect()`; `'connected', email` → "Connected as x@gmail.test" + `[data-act=google-disconnect]` → `disconnect()`; `'reconnect-needed'` → `[data-role=google-reconnect]` text + `[data-act=google-connect]` "Reconnect"; setting the signal re-renders (flush).
  - `a[href="/status"]` in the note; `ui-button[data-act=logout]` click → `logout` emitted.
- [x] **Step 2: implement** — `bindSignal` ×3 in `connectedCallback` (the profile mirror also sets `this.patch = p ? toPatch(p) : EMPTY`), disposed in `disconnectedCallback`; `ui-card`s; CSS: `.screen` grid, `h2`, `.identity` text, `.body-summary` muted, `.note` centered muted, `.logout` centered.
- [x] **Step 3: gate + commit** — `feat(stencil-oyl): oyl-profile screen`.

## Task 4: route + retire the placeholder

**Files:** `apps/stencil-oyl/src/boot/routes.ts` (+ `routes.unit.ts`), delete `src/components/oyl-not-yet/`, `apps/e2e-oyl/tests-stencil/routing.spec.ts`

- [x] **Step 1:** `profile` factory per the spec (session/profile/today/google; `saveProfile` → vanilla's rule with `app.win.location.assign('/profile')` (already on `BootWindow`) after `profileStore.save` when tz/units changed, else `noticeState.show('Profile saved.')`, `.catch` → "Could not save profile."; `logout` → `app.authState.logout()`; google `connect` → `connectUrl().then(assign).catch(notice)`, `disconnect` → `.then(notice 'Google disconnected.').catch(notice)`). Remove `NOT_YET`, `notYet`, the `classicBase` read, and the `oyl-not-yet` component + spec (`components.d.ts` regenerates — commit it; `ui-icon` stays registered for `oyl-day-nav`). `routes.unit.ts` label only (it never calls `buildRoutes`).
- [x] **Step 2:** `routing.spec.ts`: replace the placeholder test with "deep link to /profile renders the profile screen" (`oyl-profile [data-role=identity]` visible).
- [x] **Step 3: gate + commit** — `feat(stencil-oyl): Profile route; retire oyl-not-yet`.

## Task 5: e2e

**Files:** `apps/e2e-oyl/tests-stencil/profile.spec.ts`

- [x] **Step 1:** `profile.spec.ts` — identity (username + email via `deepText` + `expect.poll`); save with decimals (birthday 1990-06-15, weight 81.5, height 179.5; `const reloaded = page.waitForEvent('load')` → submit → `await reloaded`; the weight input is `''` afterwards and `h2` "Profile" is back — first save = units change → reload; `users` is unbacked so the profile is `null` after the reload: this assertion inverts when it gains a backend); gender Other reveals `ui-field[name=genderOther]`; the Status note `a[href="/status"]` visible; log out → `/login` + `oyl/auth` null.
- [x] **Step 2:** the Google card on the stencil projects: `ui-button[data-act=google-connect] button` visible on `/profile` (the e2e backend has Google configured; `test.skip` under `E2E_BACKEND=php`). The OAuth journeys stay on vanilla's `tests/google-auth.spec.ts` (the backend's single `APP_URL` is vanilla's origin — see the spec; multi-origin state is cutover work).
- [x] **Step 3:** run `--project stencil-desktop --project stencil-mobile --workers=4` green.
- [x] **Step 4: commit** — `test(e2e): stencil profile spec`.

## Task 6: Visual check + docs

- [x] **Step 1:** temporary `zz-shot.spec.ts` screenshots of `/profile` (signed in, after a save with body values; Google disconnected state) on desktop + Pixel 7; fix layout issues; delete the temp spec.
- [x] **Step 2: docs** — spec status → implemented (+ amendments); plan ticked; program table row 10 Profile (all screens done; next: cutover); CLAUDE.md stencil-oyl row (Profile; no placeholders; `oyl-not-yet` gone; the "What this is" line); `TODO.md` if it lists the placeholder.
- [x] **Step 3: commit** — `docs: stencil-oyl Profile; spec statuses`.
