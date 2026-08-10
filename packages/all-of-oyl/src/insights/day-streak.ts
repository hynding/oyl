// packages/all-of-oyl/src/insights/day-streak.ts
import type { DayKey } from '../core/day-key.js'
import type { DayRange } from '../core/day-range.js'
import type { Journal } from '../core/journal.js'

/**
 * Consecutive ACTIVE DAYS ending at `today` — the app-wide "did anything"
 * streak. Distinct from the goal-period `streak()` in streak.ts (which judges
 * goal attainment per period); the two live side by side on purpose.
 *
 * Today counts if active; an inactive today does not break yesterday's streak
 * (the day isn't over yet).
 *
 * Callers pass a range-bounded set (activeDaysIn over a bounded range): the
 * walk-back visits one day per consecutive member, so the set's span bounds
 * the work.
 */
export function streakOf(activeDays: ReadonlySet<string>, today: DayKey): number {
  let count = 0
  let cursor = activeDays.has(today.value) ? today : today.addDays(-1)
  while (activeDays.has(cursor.value)) {
    count += 1
    cursor = cursor.addDays(-1)
  }
  return count
}

/** Day keys (values) with at least one journal entry in `range`, tz-bucketed by the journal. */
export function activeDaysIn(journal: Journal, range: DayRange): ReadonlySet<string> {
  const days = new Set<string>()
  for (const entry of journal.entriesIn(range)) days.add(journal.dayOf(entry).value)
  return days
}
