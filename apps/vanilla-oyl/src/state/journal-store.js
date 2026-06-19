import { Journal, Transaction, Consumption, sumNutrients } from '@oyl/all-of-oyl'
import { signal } from '../lib/reactive/signal.js'

/** @typedef {import('@oyl/all-of-oyl').Entry} Entry */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */
/** @typedef {import('@oyl/all-of-oyl').DayRange} DayRange */
/** @typedef {import('@oyl/all-of-oyl').Money} Money */
/** @typedef {import('@oyl/all-of-oyl').Goal} Goal */
/** @typedef {import('@oyl/all-of-oyl').GoalProgress} GoalProgress */
/** @typedef {import('@oyl/all-of-oyl').Budget} Budget */
/** @typedef {import('@oyl/all-of-oyl').Account} Account */
/** @typedef {import('@oyl/all-of-oyl').Nutrients} Nutrients */
/** @typedef {Record<string, import('@oyl/all-of-oyl').Repository<Entry>>} ReposByKind */

/**
 * App-level reactive wrapper over per-kind entry Repositories + an in-memory domain Journal.
 * Persist-first surgical writes; a `revision` signal makes reads reactive. The domain
 * Journal stays a plain aggregate. Full re-hydrate only on boot/seed/import/multi-tab.
 * @param {ReposByKind} reposByKind  Object keyed by entry-kind string (e.g. 'note', 'consumption', …) to its Repository.
 * @param {string} tz  IANA timezone
 */
export function createJournalStore(reposByKind, tz) {
  let journal = new Journal(tz)
  let n = 0
  const revision = signal(0)

  /** Store-local index: entry id.value → entry.kind for routing remove() without changing the lib. */
  const kindById = new Map()

  /** @param {DayKey} day @returns {Consumption[]} */
  const consumptionsOnDay = (day) => /** @type {Consumption[]} */ (journal.entriesOn(day).filter((e) => e instanceof Consumption))

  return {
    revision,

    /**
     * Persist a NEW entry to its kind-specific repo, then reflect it in the aggregate.
     * Expects a freshly-created entry (a new Id). Re-adding an entry already in the
     * aggregate diverges repo and aggregate: the repo save succeeds but `journal.add`
     * then throws DUPLICATE_ID — so don't feed back an entry obtained from `entriesOn`;
     * create a new one. Throws a clear error for unknown entry kinds before any mutation.
     * @param {Entry} entry @returns {Promise<Entry>}
     */
    async add(entry) {
      const repo = reposByKind[entry.kind]
      if (!repo) throw new Error(`unknown entry kind: ${entry.kind}`)
      const saved = await repo.save(entry)
      kindById.set(saved.id, saved.kind)
      journal.add(saved)
      revision.set((n += 1))
      return saved
    },

    /**
     * Soft-delete an entry and drop it from the aggregate (idempotent).
     * Routes the delete to the kind-specific repo by looking up the id in the store-local index.
     * @param {Id} id
     */
    async remove(id) {
      const kind = kindById.get(id)
      if (kind === undefined) return // id unknown — already removed or never added; stay idempotent
      const repo = reposByKind[kind]
      if (repo) await repo.delete(id)
      journal.remove(id)
      kindById.delete(id)
      revision.set((n += 1))
    },

    /** The day's entries (auto-tracks revision). @param {DayKey} day @returns {readonly Entry[]} */
    entriesOn(day) {
      revision.get()
      return journal.entriesOn(day)
    },

    /** Current-period progress of a goal at `day`, judged against journal entries (auto-tracks revision). @param {Goal} goal @param {DayKey} day @returns {GoalProgress} */
    progressOf(goal, day) {
      revision.get()
      return goal.progressOn(journal, day)
    },

    /** Live Journal aggregate for read-only insights — touches revision. @returns {Journal} */
    peek() {
      revision.get()
      return journal
    },

    /** Transactions whose day falls in `range`, for the finance ledger (auto-tracks revision). @param {DayRange} range @returns {readonly Transaction[]} */
    transactionsIn(range) {
      revision.get()
      return /** @type {Transaction[]} */ (journal.entriesIn(range).filter((e) => e instanceof Transaction))
    },

    /** The day's consumptions (auto-tracks revision). @param {DayKey} day @returns {readonly Consumption[]} */
    consumptionsOn(day) {
      revision.get()
      return consumptionsOnDay(day)
    },

    /** Summed nutrient totals for the day's consumptions (reactive). @param {DayKey} day @returns {Nutrients} */
    dailyNutrients(day) {
      revision.get()
      return sumNutrients(consumptionsOnDay(day))
    },

    /** Budget progress + spent (Money) for the month containing `day` (reactive). @param {Budget} budget @param {DayKey} day @returns {{ progress: GoalProgress, spent: Money }} */
    budgetStatus(budget, day) {
      revision.get()
      return { progress: budget.progressOn(journal, day), spent: budget.spent(journal, day) }
    },

    /** This-month expense total for `account` (Money in the account's currency; reactive). @param {Account} account @param {DayKey} day @returns {Money} */
    accountSpend(account, day) {
      revision.get()
      return account.spentIn(journal, day)
    },

    /** All-time balance for `account`: income minus expense over recorded transactions (Money in the account's currency; reactive). Net-of-recorded. @param {Account} account @returns {Money} */
    accountBalance(account) {
      revision.get()
      return account.balanceIn(journal)
    },

    /**
     * Rebuild the aggregate from all per-kind repos. Boot/seed/import/multi-tab only.
     * Reads all repos in parallel, flattens the results into a fresh Journal, and rebuilds
     * the kindById index.
     */
    async hydrate() {
      const repos = Object.values(reposByKind)
      const results = await Promise.all(repos.map((r) => r.list()))
      const fresh = new Journal(tz)
      /** @type {Map<string, string>} */
      const freshKindById = new Map()
      for (const entries of results) {
        for (const e of entries) {
          fresh.add(e)
          freshKindById.set(e.id, e.kind)
        }
      }
      journal = fresh
      kindById.clear()
      for (const [k, v] of freshKindById) kindById.set(k, v)
      revision.set((n += 1))
    },
  }
}
