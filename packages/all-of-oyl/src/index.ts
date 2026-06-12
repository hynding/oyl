// The only barrel — and (in later phases) the only file allowed to know
// every module, which is why the kind→fromJSON revivers will live here.

export { DomainError, type DomainErrorCode } from './core/domain-error'
export { assertSlug, isSlug } from './core/slug'
export { Id } from './core/id'
export { KNOWN_NAMESPACES, MEASUREMENT_NAMESPACES, MetricKey } from './core/metric-key'
export { DayKey, assertTimezone } from './core/day-key'
export { DayRange } from './core/day-range'
export { Cadence, type CadenceUnit } from './core/cadence'
export { Quantity } from './core/quantity'
export { Money } from './core/money'
export { type PersistedMeta, type PersistedMetaShape, metaFromJSON, metaToJSON } from './core/persisted-meta'
export { LifeArea } from './core/life-area'
export { Entry } from './core/entry'
export { Plan, type PlanStatus } from './core/plan'
export { Journal, type AggregateKind } from './core/journal'
export { Catalog } from './core/catalog'
export { type Repository } from './core/repository'
export { InMemoryRepository } from './core/in-memory-repository'
export { User, type Units } from './user/user'
export { fixtureId } from './fixtures/fixture-id'
export { FIXTURE_TODAY, FIXTURE_TZ } from './fixtures/constants'
export {
  makeAccount,
  makeActivity,
  makeActivitySession,
  makeAppointment,
  makeBudget,
  makeConsumption,
  makeDayPlan,
  makeDocument,
  makeFood,
  makeGoal,
  makeContact,
  makeGiftIdea,
  makeLifeArea,
  makeMeasurement,
  makeNote,
  makePlannedMeal,
  makePossession,
  makeProject,
  makeSubscription,
  makeTask,
  makeTransaction,
  makeUser,
} from './fixtures/builders'
export { makeSeed, type Seed } from './fixtures/seed'

export { Activity } from './activity/activity'
export { ActivitySession } from './activity/activity-session'
export { Food, type Nutrients, NUTRIENT_METRICS, assertNutrients, nutrientsFromJSON, nutrientsToJSON } from './nutrition/food'
export { Consumption } from './nutrition/consumption'
export { Account } from './finance/account'
export { Transaction, type TransactionDirection } from './finance/transaction'
export { Measurement } from './track/measurement'
export { Note } from './track/note'

export { type GoalPeriod, GOAL_PERIODS, periodWindowOf } from './goal/period'
export { Goal, type GoalDirection, type EmptyPeriods, type GoalProgress } from './goal/goal'
export { Budget } from './goal/budget'

export { Task } from './plan/task'
export { Appointment } from './plan/appointment'
export { PlannedMeal } from './plan/planned-meal'
export { Project } from './plan/project'
export { DayPlan, type DayPlanSlot } from './plan/day-plan'
export { Planner, type ScheduledSlot } from './plan/planner'

export { type Due } from './core/due'
export { Document } from './vault/document'
export { Possession } from './vault/possession'
export { Subscription, type SubscriptionCharge } from './vault/subscription'
export { Contact, type Occasion } from './vault/contact'
export { GiftIdea } from './vault/gift-idea'
export { Vault, type UpcomingDue } from './vault/vault'

export { streak } from './insights/streak'
export { correlate } from './insights/correlate'
export { review, type Review, type ReviewTotals, type GoalReview, type AreaRollup } from './insights/review'

// ── Revivers ────────────────────────────────────────────────────────────────
// The kind → fromJSON map must know every Entry subclass, and the barrel is
// the only file allowed to know all modules (see spec, "The reviver lives in
// index.ts"). New domains register their kind here (extension checklist #5).

import { DomainError } from './core/domain-error'
import type { Entry } from './core/entry'
import { ActivitySession } from './activity/activity-session'
import { Consumption } from './nutrition/consumption'
import { Transaction } from './finance/transaction'
import { Measurement } from './track/measurement'
import { Note } from './track/note'

const ENTRY_REVIVERS: Readonly<Record<string, (shape: unknown) => Entry>> = {
  'activity-session': ActivitySession.fromJSON,
  consumption: Consumption.fromJSON,
  transaction: Transaction.fromJSON,
  measurement: Measurement.fromJSON,
  note: Note.fromJSON,
}

/** Revive a heterogeneous entry shape by its kind discriminant. Unknown kinds throw — louder and safer than silently dropping a user's data. */
export function reviveEntry(shape: unknown): Entry {
  const kind = (shape as { kind?: unknown } | null)?.kind
  const revive =
    typeof kind === 'string' && Object.hasOwn(ENTRY_REVIVERS, kind) ? ENTRY_REVIVERS[kind] : undefined
  if (!revive) {
    throw new DomainError('UNKNOWN_KIND', `unknown entry kind: ${JSON.stringify(kind)}`)
  }
  return revive(shape)
}

import type { Plan } from './core/plan'
import { Task } from './plan/task'
import { Appointment } from './plan/appointment'
import { PlannedMeal } from './plan/planned-meal'

const PLAN_REVIVERS: Readonly<Record<string, (shape: unknown) => Plan>> = {
  task: Task.fromJSON,
  appointment: Appointment.fromJSON,
  'planned-meal': PlannedMeal.fromJSON,
}

/** Revive a heterogeneous plan shape by its kind discriminant. Unknown kinds throw — louder and safer than silently dropping a user's data. */
export function revivePlan(shape: unknown): Plan {
  const kind = (shape as { kind?: unknown } | null)?.kind
  const revive = typeof kind === 'string' && Object.hasOwn(PLAN_REVIVERS, kind) ? PLAN_REVIVERS[kind] : undefined
  if (!revive) {
    throw new DomainError('UNKNOWN_KIND', `unknown plan kind: ${JSON.stringify(kind)}`)
  }
  return revive(shape)
}
