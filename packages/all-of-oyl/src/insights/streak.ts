// packages/all-of-oyl/src/insights/streak.ts
import type { DayKey } from '../core/day-key'
import type { Journal } from '../core/journal'
import type { Goal } from '../goal/goal'
import { periodWindowOf } from '../goal/period'

/**
 * Consecutive periods (ending at asOf) where the goal was met. Works for any
 * goal, any domain — one progress engine, one streak algorithm.
 *
 * Bridging: paused periods and no-data periods (under the default 'skip'
 * policy) neither break nor extend a streak. The in-progress period
 * containing asOf is asymmetric by direction: atLeast counts as soon as it's
 * met (and bridges while not-yet-met — the period isn't over); atMost is
 * excluded until complete (you can't have "kept under budget" for a day that
 * isn't over). Streaks evaluate data, not goal age — retroactive credit is
 * deliberate — and the walk is bounded by the journal's span.
 */
export function streak(journal: Journal, goal: Goal, asOf: DayKey): number {
  const span = journal.span()
  if (span === undefined) return 0

  let count = 0
  let window = periodWindowOf(goal.period, asOf)
  let inProgress = true

  while (window.end.compare(span.start) >= 0) {
    const progress = goal.progressOn(journal, window.start)
    const excluded =
      (inProgress && goal.direction === 'atMost') ||
      progress.paused ||
      (progress.empty && goal.emptyPeriods === 'skip')

    if (!excluded) {
      if (progress.met === true) {
        count += 1
      } else if (progress.met === false) {
        // in-progress atLeast that isn't met yet bridges — the period isn't over
        if (!inProgress) break
      }
    }

    window = periodWindowOf(goal.period, window.start.addDays(-1))
    inProgress = false
  }

  return count
}
