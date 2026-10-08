import { COLLECTIONS, makeSeed, Id } from '../../index.js'
import type { DayKey } from '../../index.js'
import type { DataState } from '../data.js'

/**
 * Account-scoped dataset loading (online-first): shapes are revived through their
 * codecs and written through the SAME stores the UI uses, so every backed collection
 * flows into the outbox and flushes to the server, and every screen updates live.
 *
 * Collections with no store/backend surface yet are intentionally ignored:
 * users, lifeAreas, projects, dayPlans, connections, grants. Wire them here when
 * they gain stores — the seed dataset already carries them.
 */
export type Dataset = Partial<Record<keyof typeof COLLECTIONS, unknown[]>>

/** Entry-kind collections all route through the journal store (it dispatches by kind). */
const ENTRY_COLLECTIONS = ['notes', 'measurements', 'consumptions', 'transactions', 'activitySessions'] as const

/**
 * Load a wire-shape dataset (seed or backup) into the signed-in account via the stores.
 * Per-item failures (e.g. duplicate ids on a re-run — the server upserts by id anyway)
 * are counted and skipped so one bad row never aborts the rest.
 */
export async function loadDataset(dataState: DataState, dataset: Dataset): Promise<{ added: number, skipped: number }> {
  let added = 0
  let skipped = 0
  const attempt = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      added += 1
    } catch {
      skipped += 1
    }
  }
  const revive = (name: keyof typeof COLLECTIONS): any[] => (dataset[name] ?? []).map((shape) => (COLLECTIONS[name] as any).fromJSON(shape))

  for (const name of ENTRY_COLLECTIONS) {
    for (const entry of revive(name)) await attempt(() => dataState.journal.add(entry))
  }
  for (const plan of revive('plans')) await attempt(() => dataState.planner.add(plan))
  for (const doc of revive('documents')) await attempt(() => dataState.vault.addDocument(doc))
  for (const p of revive('possessions')) await attempt(() => dataState.vault.addPossession(p))
  for (const s of revive('subscriptions')) await attempt(() => dataState.vault.addSubscription(s))
  for (const c of revive('contacts')) await attempt(() => dataState.vault.addContact(c))
  for (const g of revive('giftIdeas')) await attempt(() => dataState.vault.addGiftIdea(g))
  for (const g of revive('goals')) await attempt(() => dataState.goals.add(g))
  for (const b of revive('budgets')) await attempt(() => dataState.budgets.add(b))
  for (const a of revive('accounts')) await attempt(() => dataState.accounts.add(a))
  for (const c of revive('consumables')) await attempt(() => dataState.consumables.add(c))
  for (const p of revive('consumableProducts')) await attempt(() => dataState.consumableProducts.add(p))
  // Activities have no dedicated store — write via the catalog-backed repo facade.
  // (They surface in Insights after the next boot refresh re-reads the catalogs.)
  for (const a of revive('activities')) await attempt(() => dataState.repos.activities.save(a))

  return { added, skipped }
}

/**
 * Re-mint every record id in a wire-shape dataset, rewriting cross-references
 * (consumableId/accountId/contactId/…) consistently. Fixture ids are fixed constants,
 * but `recordId` is globally unique server-side — two accounts seeding the same
 * dataset must never collide. String replacement is exact-match against known ids,
 * so ordinary field values are untouched.
 */
export function remapIds(dataset: Record<string, unknown[] | undefined>, newId: () => string = () => Id.create()): Record<string, unknown[]> {
  const map = new Map<string, string>()
  for (const rows of Object.values(dataset)) {
    for (const row of rows ?? []) {
      const id = (row as { id?: unknown } | null | undefined)?.id
      if (typeof id === 'string' && !map.has(id)) map.set(id, newId())
    }
  }
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return map.get(value) ?? value
    if (Array.isArray(value)) return value.map(walk)
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]))
    }
    return value
  }
  return walk(dataset) as Record<string, unknown[]>
}

/**
 * Seed the signed-in account with the canonical demo dataset, re-anchored so its
 * rolling six-week slice ends at `today` (screens open onto populated days) and
 * re-minted with account-fresh ids (see remapIds).
 */
export async function seedAccount(dataState: DataState, today: DayKey): Promise<{ added: number, skipped: number }> {
  return loadDataset(dataState, remapIds(makeSeed(today) as unknown as Record<string, unknown[]>))
}
