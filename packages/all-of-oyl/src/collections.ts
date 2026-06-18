import { reviveEntry, revivePlan } from './index.js'
import { User } from './user/user.js'
import { LifeArea } from './core/life-area.js'
import { Activity } from './activity/activity.js'
import { Consumable } from './nutrition/consumable.js'
import { Account } from './finance/account.js'
import { Goal } from './goal/goal.js'
import { Budget } from './goal/budget.js'
import { Project } from './plan/project.js'
import { DayPlan } from './plan/day-plan.js'
import { Document } from './vault/document.js'
import { Possession } from './vault/possession.js'
import { Subscription } from './vault/subscription.js'
import { Contact } from './vault/contact.js'
import { GiftIdea } from './vault/gift-idea.js'
import { Connection } from './share/connection.js'
import { Grant } from './share/grant.js'

/** A symmetric (de)serializer for one collection's records. */
export interface Codec<T> {
  toJSON(item: T): unknown
  fromJSON(shape: unknown): T
}

/** Wrap a class whose instances expose toJSON() and whose statics expose fromJSON(). */
function classCodec<T extends { toJSON(): unknown }>(fromJSON: (shape: unknown) => T): Codec<T> {
  return { toJSON: (item) => item.toJSON(), fromJSON }
}

/**
 * The canonical map of persistable collection → codec. The ONE place that knows the
 * full set of persistable types and how to (de)serialize each. Apps (bootstrap, backup,
 * seeding) and the future backend all consume this instead of re-deriving the mapping.
 * Keys mirror the `Seed` shape exactly (enforced by collections.test.ts).
 */
export const COLLECTIONS = {
  users: classCodec(User.fromJSON),
  lifeAreas: classCodec(LifeArea.fromJSON),
  activities: classCodec(Activity.fromJSON),
  consumables: classCodec(Consumable.fromJSON),
  accounts: classCodec(Account.fromJSON),
  entries: { toJSON: (e: { toJSON(): unknown }) => e.toJSON(), fromJSON: reviveEntry },
  goals: classCodec(Goal.fromJSON),
  budgets: classCodec(Budget.fromJSON),
  plans: { toJSON: (p: { toJSON(): unknown }) => p.toJSON(), fromJSON: revivePlan },
  projects: classCodec(Project.fromJSON),
  dayPlans: classCodec(DayPlan.fromJSON),
  documents: classCodec(Document.fromJSON),
  possessions: classCodec(Possession.fromJSON),
  subscriptions: classCodec(Subscription.fromJSON),
  contacts: classCodec(Contact.fromJSON),
  giftIdeas: classCodec(GiftIdea.fromJSON),
  connections: classCodec(Connection.fromJSON),
  grants: classCodec(Grant.fromJSON),
} as const

export type CollectionName = keyof typeof COLLECTIONS

export type EntityKind = 'catalog' | 'personal' | 'system'

/** Authoritative kind per collection — drives the data-access path. */
export const KINDS: Record<CollectionName, EntityKind> = {
  users: 'personal', lifeAreas: 'catalog', activities: 'catalog', consumables: 'catalog',
  accounts: 'personal', entries: 'personal', goals: 'personal', budgets: 'personal',
  plans: 'personal', projects: 'personal', dayPlans: 'personal', documents: 'personal',
  possessions: 'personal', subscriptions: 'personal', contacts: 'personal', giftIdeas: 'personal',
  connections: 'system', grants: 'system',
}

export function kindOf(name: CollectionName): EntityKind { return KINDS[name] }

export function entitiesByKind(kind: EntityKind): CollectionName[] {
  return (Object.keys(KINDS) as CollectionName[]).filter((n) => KINDS[n] === kind)
}
