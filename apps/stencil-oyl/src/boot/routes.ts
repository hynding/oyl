import { now } from '@oyl/all-of-oyl/client'
import type { Routes } from '../components/oyl-router/oyl-router.js'
import type { Diagnostics } from '../components/oyl-status/oyl-status.js'
import { NAV_ITEMS } from './nav-items.js'
import { statusActions } from './data-tools.js'
import type { App } from './types.js'

/** Redesigned screens arrive one spec at a time; the rest show the placeholder. */
const NOT_YET: Record<string, string> = {
  insights: 'Insights', profile: 'Profile',
}

/** The route → screen factories for the shell. Screens receive state as properties. */
export function buildRoutes(app: App, doc: Document): Routes {
  const classicBase = (doc.querySelector('meta[name="oyl-classic-url"]') as HTMLMetaElement | null)?.content ?? ''
  const notYet = (route: string) => () => {
    const el = doc.createElement('oyl-not-yet')
    el.name = NOT_YET[route] ?? route
    if (classicBase) el.classicUrl = `${classicBase.replace(/\/$/, '')}/${route}`
    return el
  }
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
  for (const route of Object.keys(NOT_YET)) routes[route] = notYet(route)
  return routes
}

/** Every nav item must resolve to a route (guards a renamed screen). */
export function navRoutesCovered(routes: Routes): string[] {
  return NAV_ITEMS.map((i) => i.name).filter((name) => !(name in routes))
}
