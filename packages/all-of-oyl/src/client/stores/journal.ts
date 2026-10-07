import { Journal, Transaction, Consumption, sumNutrients } from '../../index.js'
import type { Entry, Id, DayKey, DayRange, Money, Goal, GoalProgress, Budget, Account, Nutrients, Repository } from '../../index.js'
import { signal } from '../reactive/signal.js'

export type ReposByKind = Record<string, Repository<Entry>>

/**
 * App-level reactive wrapper over per-kind entry Repositories + an in-memory domain Journal.
 * Persist-first surgical writes; a `revision` signal makes reads reactive. The domain
 * Journal stays a plain aggregate. Full re-hydrate only on boot/seed/import/multi-tab.
 * @param reposByKind  Object keyed by entry-kind string (e.g. 'note', 'consumption', …) to its Repository.
 * @param tz  IANA timezone
 */
export function createJournalStore(reposByKind: ReposByKind, tz: string) {
  let journal = new Journal(tz)
  let n = 0
  const revision = signal(0)

  /** Store-local index: entry id.value → entry.kind for routing remove() without changing the lib. */
  const kindById = new Map<string, string>()

  const consumptionsOnDay = (day: DayKey): Consumption[] => journal.entriesOn(day).filter((e) => e instanceof Consumption) as Consumption[]

  return {
    revision,

    /**
     * Persist a NEW entry to its kind-specific repo, then reflect it in the aggregate.
     * Expects a freshly-created entry (a new Id). Re-adding an entry already in the
     * aggregate diverges repo and aggregate: the repo save succeeds but `journal.add`
     * then throws DUPLICATE_ID — so don't feed back an entry obtained from `entriesOn`;
     * create a new one. Throws a clear error for unknown entry kinds before any mutation.
     */
    async add(entry: Entry): Promise<Entry> {
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
     */
    async remove(id: Id) {
      const kind = kindById.get(id)
      if (kind === undefined) return // id unknown — already removed or never added; stay idempotent
      const repo = reposByKind[kind]
      if (!repo) throw new Error(`no repo for entry kind: ${kind}`)
      await repo.delete(id)
      kindById.delete(id)
      journal.remove(id)
      revision.set((n += 1))
    },

    /** The day's entries (auto-tracks revision). */
    entriesOn(day: DayKey): readonly Entry[] {
      revision.get()
      return journal.entriesOn(day)
    },

    /** Current-period progress of a goal at `day`, judged against journal entries (auto-tracks revision). */
    progressOf(goal: Goal, day: DayKey): GoalProgress {
      revision.get()
      return goal.progressOn(journal, day)
    },

    /** Live Journal aggregate for read-only insights — touches revision. */
    peek(): Journal {
      revision.get()
      return journal
    },

    /** Transactions whose day falls in `range`, for the finance ledger (auto-tracks revision). */
    transactionsIn(range: DayRange): readonly Transaction[] {
      revision.get()
      return journal.entriesIn(range).filter((e) => e instanceof Transaction) as Transaction[]
    },

    /** The day's consumptions (auto-tracks revision). */
    consumptionsOn(day: DayKey): readonly Consumption[] {
      revision.get()
      return consumptionsOnDay(day)
    },

    /** Summed nutrient totals for the day's consumptions (reactive). */
    dailyNutrients(day: DayKey): Nutrients {
      revision.get()
      return sumNutrients(consumptionsOnDay(day))
    },

    /** Budget progress + spent (Money) for the month containing `day` (reactive). */
    budgetStatus(budget: Budget, day: DayKey): { progress: GoalProgress, spent: Money } {
      revision.get()
      return { progress: budget.progressOn(journal, day), spent: budget.spent(journal, day) }
    },

    /** This-month expense total for `account` (Money in the account's currency; reactive). */
    accountSpend(account: Account, day: DayKey): Money {
      revision.get()
      return account.spentIn(journal, day)
    },

    /** All-time balance for `account`: income minus expense over recorded transactions (Money in the account's currency; reactive). Net-of-recorded. */
    accountBalance(account: Account): Money {
      revision.get()
      return account.balanceIn(journal)
    },

    /**
     * Rebuild the aggregate from all per-kind repos. Boot/seed/import/multi-tab only.
     * Reads all repos in parallel, flattens the results into a fresh Journal, and rebuilds
     * the kindById index.
     */
    /**
     * Rebuild the aggregate. With `preloadedByKind` (the one-request bootstrap payload,
     * keyed by entry kind) no repo reads happen; otherwise each kind repo is listed.
     */
    async hydrate(preloadedByKind?: Record<string, readonly Entry[]>) {
      const results = preloadedByKind
        ? Object.keys(reposByKind).map((k) => preloadedByKind[k] ?? [])
        : await Promise.all(Object.values(reposByKind).map((r) => r.list()))
      const fresh = new Journal(tz)
      const freshKindById = new Map<string, string>()
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
