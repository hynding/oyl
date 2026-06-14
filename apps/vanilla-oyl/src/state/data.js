import { review, Transaction } from '@oyl/all-of-oyl'
import { signal } from '../lib/reactive/signal.js'
import { makeRepositories, collectionCounts } from '../storage/bootstrap.js'
import { readSchemaState } from '../storage/schema.js'
import { createJournalStore } from './journal-store.js'
import { createPlannerStore } from './planner-store.js'
import { createVaultStore } from './vault-store.js'
import { createGoalsStore } from './goals-store.js'
import { createBudgetsStore } from './budgets-store.js'
import { defaultTimezone } from '../storage/clock.js'

/** @typedef {import('../storage/schema.js').SchemaState} SchemaState */
/** @typedef {ReturnType<typeof import('./theme.js').createThemeState>} ThemeState */
/** @typedef {{ getItem(k: string): string | null, setItem(k: string, v: string): void, key(i: number): string | null, length: number }} AppStorage */

/**
 * App data state: repositories over real storage + reactive diagnostics the Status
 * screen reads. refresh() re-reads everything (boot, seed, import, multi-tab).
 * @param {AppStorage & import('@oyl/all-of-oyl').StorageLike} storage
 * @param {ThemeState} themeState
 */
export function createDataState(storage, themeState) {
  const repos = makeRepositories(storage)
  const journal = createJournalStore(repos.entries, defaultTimezone())
  const planner = createPlannerStore(repos.plans)
  const vault = createVaultStore(repos)
  const goals = createGoalsStore(repos.goals)
  const budgets = createBudgetsStore(repos.budgets)
  /** @type {readonly import('@oyl/all-of-oyl').LifeArea[]} */
  let lifeAreas = []
  /** @type {readonly import('@oyl/all-of-oyl').Activity[]} */
  let activities = []
  /** @type {readonly import('@oyl/all-of-oyl').Project[]} */
  let projects = []
  /** @type {import('../lib/reactive/signal.js').Signal<Record<string, number>>} */
  const counts = signal(/** @type {Record<string, number>} */ ({}))
  /** @type {import('../lib/reactive/signal.js').Signal<SchemaState>} */
  const schema = signal(readSchemaState(storage))
  /** @type {import('../lib/reactive/signal.js').Signal<{ usage: number, quota: number } | null>} */
  const storageEstimate = signal(/** @type {{ usage: number, quota: number } | null} */ (null))

  async function refresh() {
    schema.set(readSchemaState(storage))
    counts.set(await collectionCounts(repos))
    await journal.hydrate()
    await planner.hydrate()
    await vault.hydrate()
    await goals.hydrate()
    await budgets.hydrate()
    lifeAreas = await repos.lifeAreas.list()
    activities = await repos.activities.list()
    projects = await repos.projects.list()
    storageEstimate.set(await readStorageEstimate())
  }

  /** Compose the current diagnostics snapshot (reads signals — call inside an effect to stay live). */
  function readDiagnostics() {
    const s = schema.get()
    return {
      schema: 'version' in s ? { status: s.status, version: s.version } : { status: s.status },
      counts: counts.get(),
      theme: themeState.settings.get(),
      build: /** @type {any} */ (globalThis).__OYL_LIB_BUILD__ ?? 'dev',
      storage: storageEstimate.get(),
    }
  }

  /**
   * Compose the domain review for a period. Reactive: journal.peek()/planner.peek()/goals.all()
   * each touch their revision, so a reactive reader (the insights screen) re-runs on any change.
   * The activities/areas/projects catalogs feed the life-wheel (review().areas); they reload in
   * refresh() alongside the hydrates, so a catalog change always coincides with a tracked revision.
   * @param {import('@oyl/all-of-oyl').DayRange} range @returns {import('@oyl/all-of-oyl').Review}
   */
  function reviewOn(range) {
    return review({
      journal: journal.peek(),
      planner: planner.peek(),
      goals: goals.all(),
      activities,
      areas: lifeAreas,
      projects,
      period: range,
    })
  }

  /**
   * Renew a subscription AND post the resulting charge as an expense Transaction to the
   * journal — closing the finance loop (the charge then shows in the ledger, budgets, and
   * Insights). Orchestration lives here so vaultStore/journalStore stay decoupled. The
   * Transaction is mapped purely from the charge (charge.on is the day paid, not the past
   * due date — overdue renewals post dated today).
   * @param {import('@oyl/all-of-oyl').Id} id
   * @param {import('@oyl/all-of-oyl').DayKey} on
   * @returns {Promise<import('@oyl/all-of-oyl').SubscriptionCharge | undefined>}
   */
  async function renewSubscription(id, on) {
    const charge = await vault.renew(id, on)
    if (charge) {
      await journal.add(new Transaction({
        occurredAt: new Date(`${charge.on.value}T12:00:00`),
        amount: charge.amount,
        category: charge.category,
        direction: charge.direction,
        ...(charge.accountId !== undefined ? { accountId: charge.accountId } : {}),
      }))
    }
    return charge
  }

  return { repos, counts, schema, refresh, readDiagnostics, journal, planner, vault, goals, reviewOn, budgets, renewSubscription }
}

/**
 * Best-effort localStorage/quota usage via the Storage API. Returns null when the API
 * is unavailable (older browsers, test envs) or fails — never throws.
 * @returns {Promise<{ usage: number, quota: number } | null>}
 */
async function readStorageEstimate() {
  try {
    const nav = /** @type {Navigator | undefined} */ (globalThis.navigator)
    if (nav?.storage?.estimate) {
      const { usage, quota } = await nav.storage.estimate()
      return { usage: usage ?? 0, quota: quota ?? 0 }
    }
  } catch {
    // ignore — diagnostics are best-effort
  }
  return null
}
