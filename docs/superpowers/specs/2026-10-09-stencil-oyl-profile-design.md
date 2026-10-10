# `apps/stencil-oyl` Profile screen — Design

**Date:** 2026-10-09
**Status:** reviewed (branch `feat/stencil-oyl-profile`, stacked on `feat/stencil-oyl-insights`)
**Program:** Stencil front-end — sub-project 10, the last redesigned screen (see
`2026-10-06-extract-client-layer-design.md` §Program context). After it, no `oyl-not-yet`
placeholder remains and the program moves to cutover work.

## Purpose

Replace the `/profile` placeholder: who is signed in, the editable profile (timezone, units,
body, gender, location) that feeds the effective-timezone seam and the body formatters, the
Google Drive link, and Log out. Same stores and rules as vanilla's `oyl-profile`
(`profileStore.save` + the tz/units reload rule, `googleStore.connectUrl/disconnect`,
`authState.logout`); new look; no Connection/Data duplication.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Connection + Data on Profile | **Status only.** Stencil's Status already owns the Connection card and the export/import/seed/reset tools; Profile shows one line, "Connection settings and backups live on [Status](/status)." (vanilla repeats both on Profile — a deliberate divergence). |
| Timezone control | **`ui-select` of IANA zones** from `Intl.supportedValuesOf('timeZone')`, a stored value missing from the list (e.g. `UTC`, aliases) kept as its own first option (vanilla's rule); `ui-field` text when `supportedValuesOf` is unavailable. |
| After save | **Vanilla's rule:** `profileStore.save(patch)`, then `location.assign('/profile')` when the timezone or units changed (the tz seam is boot-time; a first-ever save sets units so it reloads too), else `noticeState.show('Profile saved.')`. |
| Sync section | Stays deferred (vanilla passes `sync = null`). Not rendered. |

## Screen anatomy

```
<oyl-profile session profile today units? onSave onLogout google>
  h2[tabindex=-1] "Profile"
  ui-card[data-role=identity]         "{username} · {email}"  + .body-summary[data-role=body-summary] "81.5 kg · 179.5 cm · 36 yrs" (only with parts)
  ui-card heading="About you"         <oyl-profile-form value onSave>
  ui-card heading="Google Drive"[data-role=google-drive]   (absent while state is unknown/unconfigured)
      connected:        "Connected as {email}"  ui-button[data-act=google-disconnect] "Disconnect"
      reconnect-needed: p[data-role=google-reconnect] "Google access expired — reconnect to keep using Drive."  ui-button[data-act=google-connect] "Reconnect"
      disconnected:     ui-button[data-act=google-connect] "Connect Google Drive"
  p.note              "Connection settings and backups live on <a href=/status>Status</a>."
  ui-button variant=danger data-act=logout "Log out"   (centered, under the note)
```

- Props: `session: Signal<Session | null>` and `profile: Signal<User | null>` mirrored through
  `bindSignal`; `today: string` (`YYYY-MM-DD` in the effective tz) for `age`; `google: { connection:
  Signal<GoogleConnection>, connect(): void, disconnect(): void }` (the screen mirrors
  `connection`); events `saveProfile: ProfilePatch`, `logout: void`. The route (not the screen)
  owns the reload/notice rule and the Google navigation, as vanilla's `main.js` does.
- Identity text is `${user.username} · ${user.email}` from the session; the screen is only
  reachable signed in (the guard), so no "sign in to sync" branch.
- Body summary parts (vanilla): `formatWeight(weightKg, units ?? 'metric')`, `formatHeight(heightCm,
  units ?? 'metric')`, `${age(birthday, today)} yrs` — rendered only when at least one is present.
- Log out emits `logout`; the route calls `authState.logout()` (the guard then lands on `/login`).

### `oyl-profile-form`

- Props `value: ProfilePatch` (from `toPatch(user)`: displayName/timezone/defaultCurrency + the
  optional body fields when set); event `save: ProfilePatch`.
- Fields (a 2-column `.grid`, 1 column under 26rem): `ui-select name=timezone label=Timezone`
  (zones; the stored value prepended when unknown; default = the browser zone) or `ui-field
  name=timezone` text fallback; `ui-select name=units label=Units` (`metric` "Metric (kg, cm)" /
  `imperial` "Imperial (lb, ft/in)"); `ui-field name=birthday type=date label=Birthday`;
  `ui-field name=location label=Location`; `ui-field name=weight type=number label=Weight
  hint="kg"|"lb"`; `ui-field name=height type=number label=Height hint="cm"|"in"`; `ui-select
  name=gender label=Gender` (`''` "—", the four presets, `__other__` "Other") + `ui-field
  name=genderOther label="Self-describe"` rendered only while `__other__` is chosen.
- The form owns `timezone`, `units`, `gender` as state (silent `ui-select` rule); weight/height
  **display values** are derived from `value` once (`componentWillLoad`) in the stored units
  (imperial → `round1(kg / 0.45359237)`, `round1(cm / 2.54)`), and the hints follow `units` live —
  changing units does NOT convert the typed numbers (vanilla relabels only).
- `ui-field` has no `step` prop, so the inner number inputs keep the browser's default step
  (`:invalid` for decimals, invisibly — the shadow input is not a control of the light form, so
  `requestSubmit` never runs its constraint validation; decimals submit as in Finance). Vanilla's
  `step="any"` is therefore not reproduced — a known divergence, no ui-oyl change.
- Submit (`ui-button type=submit variant=primary` "Save profile", native `<form>` submit) builds
  vanilla's patch: `{ timezone, units }` always; `birthday` when non-empty; `weightKg`/`heightCm`
  when the field is non-empty, finite and > 0, converted from imperial when selected and rounded
  to 0.1; `gender` = the select value, or the trimmed self-describe text when `__other__` (omitted
  when empty); `location` when non-empty. Emits `save`.
- Fields are rendered with `value={seed.x}` from a `@State seed` recomputed only in
  `@Watch('value')` (and once at load), so Stencil's vnode diff re-applies a field's value only
  when the seeded value itself changes; the user's typing survives unrelated parent re-renders.
  The screen passes a `value` object that is **derived in the `profile` mirror, not in
  `render()`** — the Google connection signal resolves after mount (`probe → loadStatus`) and
  re-renders the screen; a fresh `toPatch()` per render would re-seed the form mid-edit.
- The self-describe field is controlled the same way (`value={seed.genderOther}`), so a re-seed
  with a custom gender seeds it even though the field mounts in that same render.
- Timezone options are recomputed from the **seeded** timezone (`timezoneOptions(zones,
  seed.timezone)`), so a re-seed to another unlisted zone keeps its own option; the seeded
  timezone defaults to the browser zone (`defaultTimezone()` from the client layer) when the
  profile has none — a `UTC` system zone stays `UTC`.

## Shared code

- Nothing new in `@oyl/all-of-oyl`: `ProfilePatch`, `createProfileStore`, `createGoogleStore`,
  `GoogleConnection`, `formatWeight`/`formatHeight`/`age` exist.
- `src/profile/format.ts`: `GENDERS`, `UNIT_OPTIONS`, `KG_PER_LB`, `CM_PER_IN`, `round1`,
  `toPatch(user)`, `bodySummary(profile, today)`, `timezoneOptions(zones | null, current)`,
  `displayValue(kg|cm, units, factor)` and `readPatch(fields)` (pure: the submit rule above) —
  ported from vanilla with unit tests.
- `boot/routes.ts`: `profile` creates `oyl-profile` with `session = app.authState.session`,
  `profile = app.profileStore.profile`, `today = DayKey.from(now(), app.tz).value`, `google = {
  connection: app.googleStore.connection, connect, disconnect }` where `connect` = `connectUrl()
  → win.location.assign(url)` (`catch` → notice "Could not start Google connect — try again."),
  `disconnect` = `disconnect() → notice 'Google disconnected.'` (`catch` → "Disconnect failed — try
  again."); `onSaveProfile` = vanilla's rule (`tzChanged = patch.timezone !== app.tz`,
  `unitsChanged = patch.units !== profile.units`; `save` then `win.location.assign('/profile')` or
  the notice "Profile saved."; a rejected save — `new User` throws on an invalid zone typed into
  the text fallback — shows "Could not save profile." instead of an unhandled rejection). The
  notice path is only reachable on a second save within one session: `users` is unbacked, so
  after any reload the profile is `null` again and a first save always counts as a units change.
  `onLogout` = `app.authState.logout()`. `NOT_YET`/`notYet` go away and `oyl-not-yet` (only the
  routes rendered it) is deleted with its spec. The routing spec's "placeholder" test is
  replaced by a "deep link to /profile renders the profile screen" test.
- The `users` collection is **not backed** (`BACKED` in `bootstrap.ts`), so the profile persists
  in-session only, as in vanilla; the e2e asserts the save round-trip through the reload only as
  far as vanilla's does (the screen re-renders), not values surviving.

## Verification

- **Unit:** `src/profile/format.unit.ts` — `toPatch` (optional fields only when set),
  `bodySummary` (each part, metric/imperial, empty → ""), `timezoneOptions` (unknown current
  first; `null` zones → `null`), `readPatch` (every rule: blanks omitted, imperial conversion +
  rounding, `__other__` text / empty, non-positive numbers dropped).
- **Specs:** `oyl-profile-form` (seeds fields from `value` incl. imperial display conversion and
  the `__other__` reveal for a custom gender; units change flips the hints; gender `__other__`
  reveals the self-describe field; submit emits the patch (`81.5`/`179.5` metric; imperial
  conversion); a new `value` re-seeds); `oyl-profile` (identity text from the session; body
  summary present/absent; the form gets `value = toPatch(profile)`; `save` from the form re-emits
  `saveProfile`; Google card absent for unknown/unconfigured, the three states' text + buttons
  and `connect`/`disconnect` calls; `logout` emits; the Status note link).
- **e2e `tests-stencil/profile.spec.ts`** = vanilla's five on stencil selectors: identity shows
  username + email; save with decimals reloads `/profile` (first save = units change) and the
  form is back; gender Other reveals `ui-field[name=genderOther]`; **the Status note replaces the
  connection-card test** (link `a[href="/status"]`); log out → `/login` and `oyl/auth` cleared.
  The Google card's **configured, disconnected** state is asserted on the stencil projects
  (the e2e backend has Google configured: `ui-button[data-act=google-connect]` visible; skipped
  under `E2E_BACKEND=php`). The OAuth journeys themselves (sign in with Google, link from
  Profile + disconnect, no auto-link) stay on vanilla's `tests/google-auth.spec.ts`: the
  backend's OAuth callback redirects to the single `APP_URL` (`apps/strapi-oyl/src/utils/
  google-config.ts`), which the e2e backend sets to vanilla's origin (8042), so a stencil-origin
  journey cannot land back on 8043 without a multi-origin state change in the backend. That
  change (the requesting origin carried in the signed OAuth state against an `APP_URLS`
  allowlist) belongs to the cutover sub-project, where `APP_URL` moves to the stencil app anyway.
- Definition of Done per CLAUDE.md: `pnpm stencil test|typecheck|build`, stencil e2e projects
  green; ui-oyl and vanilla untouched.

## Out of scope

- Backing `users` in Strapi; the Sync section; display name / default currency editing (vanilla
  keeps them in the patch but offers no fields — same here); Connection/Data on Profile.

## Risks

| Risk | Mitigation |
|---|---|
| `Intl.supportedValuesOf` lists ~420 zones | `ui-select` renders native `<option>`s — fine; the list is built once in `componentWillLoad`. |
| A stored timezone absent from the list (`UTC`, aliases) | Prepended as its own option so a save never silently rewrites it (vanilla's rule, unit-tested). |
| Reload after save in the e2e | `waitForURL('**/profile')` is satisfied before any reload (already on `/profile`) — vanilla's test has that hole. The stencil test awaits `page.waitForEvent('load')` around the submit and asserts the weight input is **empty** afterwards (`users` is unbacked, so the profile is `null` after a reload) — a deterministic reload signal that inverts when `users` gains a backend. |
| Google card reacts to a signal | `bindSignal` mirrors (bound in `connectedCallback`, as every mirror in the shell) → `@State`; the card is derived in `render()`. |
| Long IANA names widen the 2-column grid at Pixel 7 width | `grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)`; the mobile overflow spec already visits `/profile`. |
