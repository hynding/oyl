import { DayKey } from '@oyl/all-of-oyl'
import { now, type ProfilePatch } from '@oyl/all-of-oyl/client'
import type { Routes } from '../components/oyl-router/oyl-router.js'
import type { Diagnostics } from '../components/oyl-status/oyl-status.js'
import { NAV_ITEMS } from './nav-items.js'
import { statusActions } from './data-tools.js'
import type { App } from './types.js'

/** The route → screen factories for the shell. Screens receive state as properties. */
export function buildRoutes(app: App, doc: Document): Routes {
  const authPage = (tag: 'oyl-login' | 'oyl-register') => () => {
    const el = doc.createElement(tag)
    el.auth = app.authState
    el.googleAuth = app.googleLoginHref
    el.addEventListener('authenticated', () => app.onAuthenticated())
    return el
  }
  const routes: Routes = {
    status: () => {
      const el = doc.createElement('oyl-status')
      // createDataState's theme generic is `unknown` here; the shell always passes ThemeSettings.
      el.diagnostics = () => app.dataState.readDiagnostics() as Diagnostics
      el.pending = app.dataState.pending
      el.tick = app.refreshTick
      el.connection = app.connection
      el.actions = statusActions(app, now)
      return el
    },
    login: authPage('oyl-login'),
    register: authPage('oyl-register'),
    journal: () => {
      const el = doc.createElement('oyl-journal')
      el.store = app.dataState.journal
      el.tz = app.tz
      return el
    },
    planner: () => {
      const el = doc.createElement('oyl-planner')
      el.store = app.dataState.planner
      el.tz = app.tz
      return el
    },
    finance: () => {
      const el = doc.createElement('oyl-finance')
      el.store = app.dataState.journal
      el.budgets = app.dataState.budgets
      el.accounts = app.dataState.accounts
      el.tz = app.tz
      return el
    },
    vault: () => {
      const el = doc.createElement('oyl-vault')
      el.store = app.dataState.vault
      el.renew = app.dataState.renewSubscription
      el.tz = app.tz
      return el
    },
    insights: () => {
      const el = doc.createElement('oyl-insights')
      el.review = app.dataState.reviewOn
      el.tz = app.tz
      return el
    },
    profile: () => {
      const el = doc.createElement('oyl-profile')
      el.session = app.authState.session
      el.profile = app.profileStore.profile
      el.today = DayKey.from(now(), app.tz).value
      el.google = {
        connection: app.googleStore.connection,
        connect: () => { void app.googleStore.connectUrl().then((url) => app.win.location.assign(url)).catch(() => app.noticeState.show('Could not start Google connect — try again.')) },
        disconnect: () => { void app.googleStore.disconnect().then(() => app.noticeState.show('Google disconnected.')).catch(() => app.noticeState.show('Disconnect failed — try again.')) },
      }
      el.addEventListener('saveProfile', (e) => {
        // Vanilla's rule: the timezone seam is boot-time, so a tz or units change reloads the
        // screen; otherwise a notice. (A first save always counts as a units change.)
        const patch = (e as CustomEvent<ProfilePatch>).detail
        const tzChanged = 'timezone' in patch && patch.timezone !== app.tz
        const unitsChanged = 'units' in patch && patch.units !== app.profileStore.profile.get()?.units
        void app.profileStore.save(patch)
          .then(() => { if (tzChanged || unitsChanged) app.win.location.assign('/profile'); else app.noticeState.show('Profile saved.') })
          .catch(() => app.noticeState.show('Could not save profile.'))
      })
      el.addEventListener('logout', () => app.authState.logout())
      return el
    },
    goals: () => {
      const el = doc.createElement('oyl-goals')
      el.store = app.dataState.goals
      el.journal = app.dataState.journal
      el.tz = app.tz
      return el
    },
    nutrition: () => {
      const el = doc.createElement('oyl-nutrition')
      el.store = app.dataState.journal
      el.consumables = app.dataState.consumables
      el.consumableProducts = app.dataState.consumableProducts
      el.tz = app.tz
      return el
    },
  }
  return routes
}

/** Every nav item must resolve to a route (guards a renamed screen). */
export function navRoutesCovered(routes: Routes): string[] {
  return NAV_ITEMS.map((i) => i.name).filter((name) => !(name in routes))
}
