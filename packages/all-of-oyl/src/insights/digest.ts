// packages/all-of-oyl/src/insights/digest.ts
import type { Review } from './review.js'

export type Digest = {
  plansDone: number
  plansTotal: number
  goalsMet: number
  goalsTotal: number
  streak: number
}

/**
 * The greeting widget's summary values. `todayPlan` is an agenda list
 * (structurally typed — anything with `status`); `dayStreak` is the streakOf
 * result passed through verbatim (NOT the per-goal goal-period streaks that
 * ride inside review.goals).
 */
export function digestOf(
  review: Pick<Review, 'goals'>,
  todayPlan: readonly { status: string }[],
  dayStreak: number,
): Digest {
  return {
    plansDone: todayPlan.filter((p) => p.status === 'done').length,
    plansTotal: todayPlan.length,
    goalsMet: review.goals.filter((g) => g.progress.met === true).length,
    goalsTotal: review.goals.length,
    streak: dayStreak,
  }
}
