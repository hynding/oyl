import { review, Transaction } from '../index.js'
import type { ApiClient, BootstrapPayload, Connectivity, WriteOutbox, LifeArea, Activity, Project, DayRange, Review, Id, DayKey, SubscriptionCharge } from '../index.js'
import type { EnumerableStorage, StorageEstimate, StorageEstimator } from './ports.js'
import { signal } from './reactive/signal.js'
import { makeRepositories, collectionCounts, decodeBootstrap } from './storage/bootstrap.js'
import type { Repositories } from './storage/bootstrap.js'
import { readSchemaState } from './storage/schema.js'
import type { SchemaState } from './storage/schema.js'
import { defaultTimezone } from './storage/clock.js'
import { createJournalStore } from './stores/journal.js'
import { createPlannerStore } from './stores/planner.js'
import { createVaultStore } from './stores/vault.js'
import { createGoalsStore } from './stores/goals.js'
import { createBudgetsStore } from './stores/budgets.js'
import { createAccountsStore } from './stores/accounts.js'
import { createConsumablesStore } from './stores/consumables.js'
import { createConsumableProductsStore } from './stores/consumable-products.js'

export interface DataStateOptions {
  api?: ApiClient
  connectivity?: Connectivity
  repos?: Repositories
  outbox?: WriteOutbox
  timezone?: string
  bootstrap?: () => Promise<BootstrapPayload | undefined>
  /** Outbox mutation ids when repos are built here (browser: crypto.randomUUID). */
  newId?: () => string
  /** Best-effort quota probe for Status diagnostics (browser: navigator.storage.estimate). */
  estimateStorage?: StorageEstimator
  /** Build marker echoed by readDiagnostics(). */
  build?: string
}

/**
 * App data state: online-first repositories over real storage + reactive diagnostics the
 * Status screen reads. refresh() re-reads everything (boot, seed, multi-tab). The server is
 * the source of truth; writes enqueue to the outbox and the app's flusher drains them.
 */
export function createDataState<TTheme = unknown>(
  storage: Pick<EnumerableStorage, 'getItem' | 'setItem' | 'key' | 'length'>,
  themeState: { settings: { get(): TTheme } },
  opts: DataStateOptions = {},
) {
  const built = opts.repos
    ? { repos: opts.repos, outbox: opts.outbox }
    : makeRepositories(storage, {
        ...(opts.api ? { api: opts.api } : {}),
        ...(opts.connectivity ? { connectivity: opts.connectivity } : {}),
        ...(opts.newId ? { newId: opts.newId } : {}),
      })
  const estimateStorage: StorageEstimator = opts.estimateStorage ?? (async () => null)
  const { repos } = built
  const outbox = opts.outbox ?? built.outbox
  const reposByKind = {
    'note': repos.notes,
    'consumption': repos.consumptions,
    'transaction': repos.transactions,
    'measurement': repos.measurements,
    'activity-session': repos.activitySessions,
  }
  const journal = createJournalStore(reposByKind, opts.timezone ?? defaultTimezone())
  const planner = createPlannerStore(repos.plans)
  const vault = createVaultStore(repos)
  const goals = createGoalsStore(repos.goals)
  const budgets = createBudgetsStore(repos.budgets)
  const accounts = createAccountsStore(repos.accounts)
  const consumables = createConsumablesStore(repos.consumables)
  const consumableProducts = createConsumableProductsStore(repos.consumableProducts)

  /**
   * Cheap pending-writes indicator derived from the outbox. It is a snapshot read on
   * refresh()/refreshPending() — not a live subscription — which is enough for the
   * Status surface until the sync UI reshape (Sub-project D).
   */
  const pending = signal<number>(outbox ? outbox.size() : 0)
  /** Re-read the outbox size into the pending signal. */
  function refreshPending() { pending.set(outbox ? outbox.size() : 0) }

  let lifeAreas: readonly LifeArea[] = []
  let activities: readonly Activity[] = []
  let projects: readonly Project[] = []
  const counts = signal<Record<string, number>>({})
  const schema = signal<SchemaState>(readSchemaState(storage))
  const storageEstimate = signal<StorageEstimate | null>(null)

  /** Best-effort; a rejecting probe reports null and never fails refresh(). */
  async function readStorageEstimate(): Promise<StorageEstimate | null> {
    try {
      return await estimateStorage()
    } catch {
      return null
    }
  }

  async function refresh() {
    schema.set(readSchemaState(storage))
    const payload = opts.bootstrap ? await opts.bootstrap() : undefined
    if (payload) {
      // One-request path: GET /bootstrap returned every backed collection — distribute
      // the decoded lists to the stores (zero per-collection reads) and derive counts
      // from the same payload. Unbacked stores (planner/vault) hydrate off empty repos.
      const lists = decodeBootstrap(payload)
      await Promise.all([
        journal.hydrate({
          'note': lists.notes,
          'consumption': lists.consumptions,
          'transaction': lists.transactions,
          'measurement': lists.measurements,
          'activity-session': lists.activitySessions,
        }),
        planner.hydrate(), vault.hydrate(),
        goals.hydrate(lists.goals), budgets.hydrate(lists.budgets), accounts.hydrate(lists.accounts),
        consumables.hydrate(lists.consumables), consumableProducts.hydrate(lists.consumableProducts),
      ])
      lifeAreas = lists.lifeAreas; activities = lists.activities; projects = lists.projects
      storageEstimate.set(await readStorageEstimate())
      counts.set(Object.fromEntries(Object.entries(lists).map(([name, rows]) => [name, rows.length])))
      refreshPending()
      return
    }
    // Fan-out path: no bootstrap fetcher (tests, local repos) or an older backend
    // without the endpoint — read each collection individually.
    const tasks = [
      journal.hydrate(), planner.hydrate(), vault.hydrate(), goals.hydrate(), budgets.hydrate(), accounts.hydrate(), consumables.hydrate(), consumableProducts.hydrate(),
      repos.lifeAreas.list(), repos.activities.list(), repos.projects.list(), readStorageEstimate(), collectionCounts(repos),
    ]
    const results = await Promise.allSettled(tasks)
    const failure = results.find((r) => r.status === 'rejected')
    if (failure && failure.status === 'rejected') throw failure.reason
    const val = (i: number) => (results[i] as any).value
    lifeAreas = val(8); activities = val(9); projects = val(10)
    storageEstimate.set(val(11)); counts.set(val(12))
    refreshPending()
  }

  /** Compose the current diagnostics snapshot (reads signals — call inside an effect to stay live). */
  function readDiagnostics() {
    const s = schema.get()
    return {
      schema: 'version' in s ? { status: s.status, version: s.version } : { status: s.status },
      counts: counts.get(),
      theme: themeState.settings.get(),
      build: opts.build ?? 'dev',
      storage: storageEstimate.get(),
    }
  }

  /**
   * Compose the domain review for a period. Reactive: journal.peek()/planner.peek()/goals.all()
   * each touch their revision, so a reactive reader (the insights screen) re-runs on any change.
   * The activities/areas/projects catalogs feed the life-wheel (review().areas); they reload in
   * refresh() alongside the hydrates, so a catalog change always coincides with a tracked revision.
   */
  function reviewOn(range: DayRange): Review {
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
   */
  async function renewSubscription(id: Id, on: DayKey): Promise<SubscriptionCharge | undefined> {
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

  return { repos, counts, schema, refresh, readDiagnostics, journal, planner, vault, goals, reviewOn, budgets, renewSubscription, accounts, consumables, consumableProducts, pending, refreshPending }
}

export type DataState = ReturnType<typeof createDataState>
