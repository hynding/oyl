import { LifeArea } from '../core/life-area.js'
import { User, type Units } from '../user/user.js'
import type { Id } from '../core/id.js'
import { FIXTURE_TODAY, FIXTURE_TZ } from './constants.js'
import { fixtureId } from './fixture-id.js'
import { Connection, type ConnectionStatus } from '../share/connection.js'
import { Grant, type GrantScope } from '../share/grant.js'
import { Cadence } from '../core/cadence.js'
import { DayKey } from '../core/day-key.js'
import { Task } from '../plan/task.js'
import { Appointment } from '../plan/appointment.js'
import { PlannedMeal } from '../plan/planned-meal.js'
import { Project } from '../plan/project.js'
import { DayPlan, type DayPlanSlot } from '../plan/day-plan.js'
import { Activity } from '../activity/activity.js'
import { ActivitySession } from '../activity/activity-session.js'
import { Consumable } from '../nutrition/consumable.js'
import type { Nutrients } from '../nutrition/nutrients.js'
import { Consumption } from '../nutrition/consumption.js'
import { Account } from '../finance/account.js'
import { Transaction, type TransactionDirection } from '../finance/transaction.js'
import { Measurement } from '../track/measurement.js'
import { Note } from '../track/note.js'
import { Money } from '../core/money.js'
import { Quantity } from '../core/quantity.js'
import { Goal, type GoalDirection, type EmptyPeriods } from '../goal/goal.js'
import { Budget } from '../goal/budget.js'
import type { GoalPeriod } from '../goal/period.js'
import type { AggregateKind } from '../core/journal.js'
import { Document } from '../vault/document.js'
import { Possession } from '../vault/possession.js'
import { Subscription } from '../vault/subscription.js'
import { Contact, type Occasion } from '../vault/contact.js'
import { GiftIdea } from '../vault/gift-idea.js'

type UserProps = { id?: Id; displayName?: string; timezone?: string; defaultCurrency?: string; units?: Units }

export function makeUser(overrides: UserProps = {}): User {
  return new User({
    id: overrides.id ?? fixtureId(1),
    displayName: overrides.displayName ?? 'Avery',
    timezone: overrides.timezone ?? FIXTURE_TZ,
    defaultCurrency: overrides.defaultCurrency ?? 'USD',
    ...(overrides.units !== undefined ? { units: overrides.units } : {}),
  })
}

type LifeAreaProps = { id?: Id; name?: string; slug?: string }

export function makeLifeArea(overrides: LifeAreaProps = {}): LifeArea {
  return new LifeArea({
    id: overrides.id ?? fixtureId(10),
    name: overrides.name ?? 'Health',
    slug: overrides.slug ?? 'health',
  })
}

/** Default instant for entry builders: noon UTC on FIXTURE_TODAY (morning in FIXTURE_TZ). */
const DEFAULT_AT = new Date('2026-06-01T12:00:00Z')

export function makeActivity(overrides: { id?: Id; name?: string; slug?: string; defaultUnit?: string; areaId?: Id } = {}): Activity {
  return new Activity({
    id: overrides.id ?? fixtureId(30),
    name: overrides.name ?? 'Run',
    slug: overrides.slug ?? 'run',
    defaultUnit: overrides.defaultUnit ?? 'minutes',
    areaId: overrides.areaId ?? fixtureId(10),
  })
}

export function makeConsumable(overrides: { id?: Id; name?: string; nutrients?: Nutrients } = {}): Consumable {
  return new Consumable({
    id: overrides.id ?? fixtureId(31),
    name: overrides.name ?? 'Oatmeal',
    nutrients: overrides.nutrients ?? { calories: 150, protein: 5, carbs: 27, fat: 3 },
  })
}

export function makeAccount(overrides: { id?: Id; name?: string; currency?: string } = {}): Account {
  return new Account({
    id: overrides.id ?? fixtureId(32),
    name: overrides.name ?? 'Checking',
    currency: overrides.currency ?? 'USD',
  })
}

export function makeActivitySession(
  overrides: { id?: Id; occurredAt?: Date; note?: string; activity?: Activity; quantities?: readonly Quantity[] } = {},
): ActivitySession {
  return new ActivitySession({
    ...(overrides.id !== undefined ? { id: overrides.id } : {}),
    occurredAt: overrides.occurredAt ?? DEFAULT_AT,
    ...(overrides.note !== undefined ? { note: overrides.note } : {}),
    activity: overrides.activity ?? makeActivity(),
    quantities: overrides.quantities ?? [Quantity.of(30, 'minutes')],
  })
}

export function makeConsumption(
  overrides: { id?: Id; occurredAt?: Date; note?: string; consumable?: Consumable; nutrients?: Nutrients; servings?: number } = {},
): Consumption {
  const consumable = overrides.consumable ?? (overrides.nutrients === undefined ? makeConsumable() : undefined)
  return new Consumption({
    ...(overrides.id !== undefined ? { id: overrides.id } : {}),
    occurredAt: overrides.occurredAt ?? DEFAULT_AT,
    ...(overrides.note !== undefined ? { note: overrides.note } : {}),
    ...(overrides.nutrients !== undefined ? { nutrients: overrides.nutrients } : {}),
    ...(consumable !== undefined ? { consumable } : {}),
    ...(overrides.servings !== undefined ? { servings: overrides.servings } : {}),
  })
}

export function makeTransaction(
  overrides: { id?: Id; occurredAt?: Date; note?: string; amount?: Money; category?: string; direction?: TransactionDirection; account?: Account } = {},
): Transaction {
  return new Transaction({
    ...(overrides.id !== undefined ? { id: overrides.id } : {}),
    occurredAt: overrides.occurredAt ?? DEFAULT_AT,
    ...(overrides.note !== undefined ? { note: overrides.note } : {}),
    amount: overrides.amount ?? Money.usd(4210),
    category: overrides.category ?? 'groceries',
    direction: overrides.direction ?? 'expense',
    account: overrides.account ?? makeAccount(),
  })
}

export function makeMeasurement(
  overrides: { id?: Id; occurredAt?: Date; note?: string; metric?: string; value?: number } = {},
): Measurement {
  return new Measurement({
    ...(overrides.id !== undefined ? { id: overrides.id } : {}),
    occurredAt: overrides.occurredAt ?? DEFAULT_AT,
    ...(overrides.note !== undefined ? { note: overrides.note } : {}),
    metric: overrides.metric ?? 'body.weight_kg',
    value: overrides.value ?? 80,
  })
}

export function makeNote(
  overrides: { id?: Id; occurredAt?: Date; note?: string; text?: string; tags?: readonly string[] } = {},
): Note {
  return new Note({
    ...(overrides.id !== undefined ? { id: overrides.id } : {}),
    occurredAt: overrides.occurredAt ?? DEFAULT_AT,
    ...(overrides.note !== undefined ? { note: overrides.note } : {}),
    text: overrides.text ?? 'Weekly reflection: good week.',
    tags: overrides.tags ?? ['gratitude'],
  })
}

export function makeGoal(
  overrides: {
    id?: Id
    name?: string
    metric?: string
    target?: number
    direction?: GoalDirection
    period?: GoalPeriod
    aggregation?: AggregateKind
    emptyPeriods?: EmptyPeriods
    areaId?: Id
  } = {},
): Goal {
  return new Goal({
    id: overrides.id ?? fixtureId(50),
    ...(overrides.name !== undefined ? { name: overrides.name } : {}),
    metric: overrides.metric ?? 'nutrition.calories',
    target: overrides.target ?? 2200,
    direction: overrides.direction ?? 'atMost',
    period: overrides.period ?? 'day',
    ...(overrides.aggregation !== undefined ? { aggregation: overrides.aggregation } : {}),
    ...(overrides.emptyPeriods !== undefined ? { emptyPeriods: overrides.emptyPeriods } : {}),
    ...(overrides.areaId !== undefined ? { areaId: overrides.areaId } : {}),
  })
}

export function makeBudget(overrides: { id?: Id; name?: string; category?: string; limit?: Money } = {}): Budget {
  return new Budget({
    id: overrides.id ?? fixtureId(60),
    ...(overrides.name !== undefined ? { name: overrides.name } : {}),
    category: overrides.category ?? 'groceries',
    limit: overrides.limit ?? Money.usd(40000),
  })
}

export function makeTask(
  overrides: { id?: Id; title?: string; due?: DayKey; projectId?: Id; cadence?: Cadence; possessionId?: Id } = {},
): Task {
  return new Task({
    id: overrides.id ?? fixtureId(1001),
    title: overrides.title ?? 'Water the plants',
    due: overrides.due ?? FIXTURE_TODAY.addDays(1),
    ...(overrides.projectId !== undefined ? { projectId: overrides.projectId } : {}),
    ...(overrides.cadence !== undefined ? { cadence: overrides.cadence } : {}),
    ...(overrides.possessionId !== undefined ? { possessionId: overrides.possessionId } : {}),
  })
}

export function makeProject(overrides: { id?: Id; name?: string; areaId?: Id } = {}): Project {
  return new Project({
    id: overrides.id ?? fixtureId(1000),
    name: overrides.name ?? 'Spring reset',
    ...(overrides.areaId !== undefined ? { areaId: overrides.areaId } : {}),
  })
}

export function makeAppointment(
  overrides: { id?: Id; title?: string; startsAt?: Date; durationMinutes?: number; tz?: string } = {},
): Appointment {
  return new Appointment({
    id: overrides.id ?? fixtureId(1006),
    title: overrides.title ?? 'Dentist',
    startsAt: overrides.startsAt ?? new Date('2026-06-03T15:00:00Z'),
    tz: overrides.tz ?? FIXTURE_TZ,
    ...(overrides.durationMinutes !== undefined ? { durationMinutes: overrides.durationMinutes } : {}),
  })
}

export function makePlannedMeal(
  overrides: { id?: Id; title?: string; day?: DayKey; consumableId?: Id; servings?: number } = {},
): PlannedMeal {
  return new PlannedMeal({
    id: overrides.id ?? fixtureId(1007),
    title: overrides.title ?? 'Oatmeal breakfast',
    day: overrides.day ?? FIXTURE_TODAY.addDays(1),
    consumableId: overrides.consumableId ?? fixtureId(31),
    ...(overrides.servings !== undefined ? { servings: overrides.servings } : {}),
  })
}

export function makeDayPlan(overrides: { id?: Id; day?: DayKey; slots?: readonly DayPlanSlot[] } = {}): DayPlan {
  return new DayPlan({
    id: overrides.id ?? fixtureId(1010),
    day: overrides.day ?? FIXTURE_TODAY,
    slots: overrides.slots ?? [{ planId: fixtureId(1003), start: '09:00', end: '10:00' }],
  })
}

export function makeDocument(overrides: { id?: Id; name?: string; kind?: string; expiresOn?: DayKey } = {}): Document {
  return new Document({
    id: overrides.id ?? fixtureId(2000),
    name: overrides.name ?? 'Passport',
    kind: overrides.kind ?? 'passport',
    ...(overrides.expiresOn !== undefined ? { expiresOn: overrides.expiresOn } : { expiresOn: FIXTURE_TODAY.addDays(90) }),
  })
}

export function makePossession(
  overrides: { id?: Id; name?: string; location?: string; warrantyUntil?: DayKey; purchasePrice?: Money; purchasedOn?: DayKey } = {},
): Possession {
  return new Possession({
    id: overrides.id ?? fixtureId(2010),
    name: overrides.name ?? 'Espresso machine',
    location: overrides.location ?? 'Kitchen',
    ...(overrides.warrantyUntil !== undefined ? { warrantyUntil: overrides.warrantyUntil } : { warrantyUntil: FIXTURE_TODAY.addDays(30) }),
    ...(overrides.purchasePrice !== undefined ? { purchasePrice: overrides.purchasePrice } : {}),
    ...(overrides.purchasedOn !== undefined ? { purchasedOn: overrides.purchasedOn } : {}),
  })
}

export function makeSubscription(
  overrides: { id?: Id; name?: string; amount?: Money; cadence?: Cadence; anchor?: DayKey; renewedThrough?: DayKey; category?: string; accountId?: Id } = {},
): Subscription {
  return new Subscription({
    id: overrides.id ?? fixtureId(2020),
    name: overrides.name ?? 'Netflix',
    amount: overrides.amount ?? Money.usd(1599),
    cadence: overrides.cadence ?? Cadence.of(1, 'months'),
    anchor: overrides.anchor ?? DayKey.of('2026-01-15'),
    ...(overrides.renewedThrough !== undefined ? { renewedThrough: overrides.renewedThrough } : {}),
    category: overrides.category ?? 'streaming',
    ...(overrides.accountId !== undefined ? { accountId: overrides.accountId } : {}),
  })
}

export function makeContact(
  overrides: { id?: Id; name?: string; lastContactedOn?: DayKey; occasions?: readonly Occasion[] } = {},
): Contact {
  return new Contact({
    id: overrides.id ?? fixtureId(2030),
    name: overrides.name ?? 'Sam',
    ...(overrides.lastContactedOn !== undefined ? { lastContactedOn: overrides.lastContactedOn } : {}),
    occasions: overrides.occasions ?? [{ name: 'birthday', anchor: DayKey.of('1990-06-20'), cadence: Cadence.of(1, 'years') }],
  })
}

export function makeGiftIdea(overrides: { id?: Id; text?: string; contactId?: Id } = {}): GiftIdea {
  return new GiftIdea({
    id: overrides.id ?? fixtureId(2040),
    text: overrides.text ?? 'Pour-over kettle',
    contactId: overrides.contactId ?? fixtureId(2030),
  })
}

export function makeConnection(
  overrides: { id?: Id; requesterId?: Id; addresseeId?: Id; status?: ConnectionStatus; blockedById?: Id } = {},
): Connection {
  return new Connection({
    id: overrides.id ?? fixtureId(3000),
    requesterId: overrides.requesterId ?? fixtureId(2), // Blake asked
    addresseeId: overrides.addresseeId ?? fixtureId(1), // Avery accepted
    status: overrides.status ?? 'accepted',
    ...(overrides.blockedById !== undefined ? { blockedById: overrides.blockedById } : {}),
  })
}

export function makeGrant(
  overrides: { id?: Id; connectionId?: Id; grantorId?: Id; scope?: GrantScope; expiresOn?: DayKey; revokedOn?: DayKey } = {},
): Grant {
  return new Grant({
    id: overrides.id ?? fixtureId(3010),
    connectionId: overrides.connectionId ?? fixtureId(3000),
    grantorId: overrides.grantorId ?? fixtureId(1), // Avery shares
    scope: overrides.scope ?? { kind: 'goal-progress', goalId: fixtureId(51) },
    ...(overrides.expiresOn !== undefined ? { expiresOn: overrides.expiresOn } : {}),
    ...(overrides.revokedOn !== undefined ? { revokedOn: overrides.revokedOn } : {}),
  })
}
