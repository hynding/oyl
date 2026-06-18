// The only barrel — and (in later phases) the only file allowed to know
// every module, which is why the kind→fromJSON revivers will live here.

export { DomainError, type DomainErrorCode } from './core/domain-error.js'
export { assertSlug, isSlug } from './core/slug.js'
export { Id } from './core/id.js'
export { KNOWN_NAMESPACES, MEASUREMENT_NAMESPACES, MetricKey } from './core/metric-key.js'
export { DayKey, assertTimezone } from './core/day-key.js'
export { DayRange } from './core/day-range.js'
export { Cadence, type CadenceUnit } from './core/cadence.js'
export { Quantity } from './core/quantity.js'
export { Money } from './core/money.js'
export { type PersistedMeta, type PersistedMetaShape, metaFromJSON, metaToJSON } from './core/persisted-meta.js'
export { LifeArea } from './core/life-area.js'
export { Entry } from './core/entry.js'
export { Plan, type PlanStatus } from './core/plan.js'
export { Journal, type AggregateKind } from './core/journal.js'
export { Catalog } from './core/catalog.js'
export { type Repository } from './core/repository.js'
export { InMemoryRepository } from './core/in-memory-repository.js'
export { LocalStorageRepository, type StorageLike } from './core/local-storage-repository.js'
export { createCacheStore, type CacheStore } from './core/cache-store.js'
export { createOutbox, type Outbox, type OutboxEntry, type OutboxOp } from './core/outbox.js'
export { createCursorStore, type CursorStore } from './core/cursor-store.js'
export { type Connectivity, alwaysOnline, alwaysOffline, manualConnectivity } from './core/connectivity.js'
export { createSyncEngine, type SyncEngine, type SyncState, type Observable, type Lock } from './core/sync-engine.js'
export { createHttpClient, createHttpRepository, HttpRepositoryError, type RecordEnvelope, type HttpClient } from './core/http-repository.js'
export { User, type Units } from './user/user.js'
export { fixtureId } from './fixtures/fixture-id.js'
export { FIXTURE_TODAY, FIXTURE_TZ } from './fixtures/constants.js'
export {
  makeAccount,
  makeActivity,
  makeActivitySession,
  makeAppointment,
  makeBudget,
  makeConnection,
  makeConsumption,
  makeDayPlan,
  makeDocument,
  makeFood,
  makeGoal,
  makeGrant,
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
} from './fixtures/builders.js'
export { makeSeed, type Seed } from './fixtures/seed.js'
export { COLLECTIONS, type CollectionName, type Codec } from './collections.js'

export { Activity } from './activity/activity.js'
export { ActivitySession } from './activity/activity-session.js'
export { Food } from './nutrition/food.js'
export { type Nutrients, NUTRIENT_METRICS, assertNutrients, nutrientsFromJSON, nutrientsToJSON } from './nutrition/nutrients.js'
export { Consumption } from './nutrition/consumption.js'
export { sumNutrients } from './nutrition/totals.js'
export { Account } from './finance/account.js'
export { Transaction, type TransactionDirection } from './finance/transaction.js'
export { Measurement } from './track/measurement.js'
export { Note } from './track/note.js'

export { type GoalPeriod, GOAL_PERIODS, periodWindowOf } from './goal/period.js'
export { Goal, type GoalDirection, type EmptyPeriods, type GoalProgress } from './goal/goal.js'
export { Budget } from './goal/budget.js'

export { Task } from './plan/task.js'
export { Appointment } from './plan/appointment.js'
export { PlannedMeal } from './plan/planned-meal.js'
export { Project } from './plan/project.js'
export { DayPlan, type DayPlanSlot } from './plan/day-plan.js'
export { Planner, type ScheduledSlot } from './plan/planner.js'

export { type Due } from './core/due.js'
export { Document } from './vault/document.js'
export { Possession } from './vault/possession.js'
export { Subscription, type SubscriptionCharge } from './vault/subscription.js'
export { Contact, type Occasion } from './vault/contact.js'
export { GiftIdea } from './vault/gift-idea.js'
export { Vault, type UpcomingDue } from './vault/vault.js'

export { Connection, type ConnectionStatus } from './share/connection.js'
export { Grant, type GrantScope } from './share/grant.js'

export { streak } from './insights/streak.js'
export { correlate } from './insights/correlate.js'
export { review, type Review, type ReviewTotals, type GoalReview, type AreaRollup } from './insights/review.js'
export { sharedProgress, type SharedView, type SharedMetricSummary, type SharedDayPlan } from './insights/shared-progress.js'

// ── Revivers ────────────────────────────────────────────────────────────────
// The kind → fromJSON map must know every Entry subclass, and the barrel is
// the only file allowed to know all modules (see spec, "The reviver lives in
// index.ts"). New domains register their kind here (extension checklist #5).

import { DomainError } from './core/domain-error.js'
import type { Entry } from './core/entry.js'
import { ActivitySession } from './activity/activity-session.js'
import { Consumption } from './nutrition/consumption.js'
import { Transaction } from './finance/transaction.js'
import { Measurement } from './track/measurement.js'
import { Note } from './track/note.js'

const ENTRY_REVIVERS: Readonly<Record<string, (shape: unknown) => Entry>> = {
  'activity-session': ActivitySession.fromJSON,
  consumption: Consumption.fromJSON,
  transaction: Transaction.fromJSON,
  measurement: Measurement.fromJSON,
  note: Note.fromJSON,
}

/**
 * Dispatch a heterogeneous shape by its kind discriminant. Own-property
 * lookup only (prototype keys like "toString" must not leak past the guard);
 * unknown kinds throw — louder and safer than silently dropping a user's data.
 */
function reviveByKind<T>(shape: unknown, revivers: Readonly<Record<string, (s: unknown) => T>>, label: string): T {
  const kind = (shape as { kind?: unknown } | null)?.kind
  const revive = typeof kind === 'string' && Object.hasOwn(revivers, kind) ? revivers[kind] : undefined
  if (!revive) {
    throw new DomainError('UNKNOWN_KIND', `unknown ${label} kind: ${JSON.stringify(kind)}`)
  }
  return revive(shape)
}

/** Revive a heterogeneous entry shape by its kind discriminant. */
export function reviveEntry(shape: unknown): Entry {
  return reviveByKind(shape, ENTRY_REVIVERS, 'entry')
}

import type { Plan } from './core/plan.js'
import { Task } from './plan/task.js'
import { Appointment } from './plan/appointment.js'
import { PlannedMeal } from './plan/planned-meal.js'

const PLAN_REVIVERS: Readonly<Record<string, (shape: unknown) => Plan>> = {
  task: Task.fromJSON,
  appointment: Appointment.fromJSON,
  'planned-meal': PlannedMeal.fromJSON,
}

/** Revive a heterogeneous plan shape by its kind discriminant. */
export function revivePlan(shape: unknown): Plan {
  return reviveByKind(shape, PLAN_REVIVERS, 'plan')
}
