import type { Plan } from '../core/plan'

/** Stub — full implementation lands in the next task. */
export class Planner {
  private readonly plans: Plan[] = []

  all(): readonly Plan[] {
    return [...this.plans]
  }
}
