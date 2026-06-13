import type { DayKey } from './day-key.js'

/**
 * Anything with a future obligation. `asOf` exists because recurring dues
 * (birthdays, renewals) have no single due date — only a next occurrence
 * relative to a day; fixed dues (a document's expiry) simply ignore it.
 * Named nextDueOn (not dueOn) so it never collides with planner.dueOn(day).
 */
export interface Due {
  nextDueOn(asOf: DayKey): DayKey | undefined
}
