import { Journal } from '@oyl/all-of-oyl'
import { signal } from '../lib/reactive/signal.js'

/** @typedef {import('@oyl/all-of-oyl').Entry} Entry */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */
/** @typedef {import('@oyl/all-of-oyl').Repository<Entry>} EntriesRepo */

/**
 * App-level reactive wrapper over the entries Repository + an in-memory domain Journal.
 * Persist-first surgical writes; a `revision` signal makes reads reactive. The domain
 * Journal stays a plain aggregate. Full re-hydrate only on boot/seed/import/multi-tab.
 * @param {EntriesRepo} entriesRepo
 * @param {string} tz  IANA timezone
 */
export function createJournalStore(entriesRepo, tz) {
  let journal = new Journal(tz)
  let n = 0
  const revision = signal(0)

  return {
    revision,

    /** Persist an entry, then reflect it in the aggregate. @param {Entry} entry @returns {Promise<Entry>} */
    async add(entry) {
      const saved = await entriesRepo.save(entry)
      journal.add(saved)
      revision.set((n += 1))
      return saved
    },

    /** Soft-delete an entry and drop it from the aggregate (idempotent). @param {Id} id */
    async remove(id) {
      await entriesRepo.delete(id)
      journal.remove(id)
      revision.set((n += 1))
    },

    /** The day's entries (auto-tracks revision). @param {DayKey} day @returns {readonly Entry[]} */
    entriesOn(day) {
      revision.get()
      return journal.entriesOn(day)
    },

    /** Rebuild the aggregate from the repository. Boot/seed/import/multi-tab only. */
    async hydrate() {
      const fresh = new Journal(tz)
      for (const e of await entriesRepo.list()) fresh.add(e)
      journal = fresh
      revision.set((n += 1))
    },
  }
}
