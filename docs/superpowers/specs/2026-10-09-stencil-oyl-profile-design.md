# `apps/stencil-oyl` Profile screen — Design

**Date:** 2026-10-09
**Status:** draft (branch `feat/stencil-oyl-profile`, stacked on `feat/stencil-oyl-insights`)
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
- Submit (`ui-button type=submit variant=primary` "Save profile", native `<form>` submit) builds
  vanilla's patch: `{ timezone, units }` always; `birthday` when non-empty; `weightKg`/`heightCm`
  when the field is non-empty, finite and > 0, converted from imperial when selected and rounded
  to 0.1; `gender` = the select value, or the trimmed self-describe text when `__other__` (omitted
  when empty); `location` when non-empty. Emits `save`.
- `value` changes after first render (the profile signal re-hydrating) re-seed the fields via
  `@Watch('value')` — the same conversion, only when the user has not started editing? **No:**
  keep it simple as vanilla does (vanilla re-renders the whole form on every signal change): the
  watch re-seeds unconditionally; the only post-save change triggers either a reload or no
  profile change at all (save is persist-first and `profile.set` happens before the notice).

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
  the notice); `onLogout` = `app.authState.logout()`. `NOT_YET` becomes empty and is removed with
  `notYet`; `oyl-not-yet` stays as a component only if something else renders it — otherwise
  delete it and its registration/spec. The routing spec's "placeholder" test is replaced by a
  "deep link to /profile renders the profile screen" test.
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
  Plus `tests-stencil/google-auth.spec.ts`, a port of vanilla's three Google journeys (the
  stencil `auth.spec.ts` has none today): sign in with Google from `/login`, link from Profile +
  disconnect, email collision does not auto-link; skipped under `E2E_BACKEND=php` as vanilla's.
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
| Reload after save in the e2e | `page.waitForURL('**/profile')` + the form visible again, as vanilla's test. |
| Google card reacts to a signal | `bindSignal` mirror → `@State`; the card is derived in `render()`. |
