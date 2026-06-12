import { LifeArea } from '../core/life-area'
import { User, type Units } from '../user/user'
import type { Id } from '../core/id'
import { FIXTURE_TZ } from './constants'
import { fixtureId } from './fixture-id'
import { Activity } from '../activity/activity'
import { ActivitySession } from '../activity/activity-session'
import { Food, type Nutrients } from '../nutrition/food'
import { Consumption } from '../nutrition/consumption'
import { Account } from '../finance/account'
import { Transaction, type TransactionDirection } from '../finance/transaction'
import { Measurement } from '../track/measurement'
import { Note } from '../track/note'
import { Money } from '../core/money'
import { Quantity } from '../core/quantity'

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
    ...(overrides.areaId !== undefined ? { areaId: overrides.areaId } : { areaId: fixtureId(10) }),
  })
}

export function makeFood(overrides: { id?: Id; name?: string; nutrients?: Nutrients } = {}): Food {
  return new Food({
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
  overrides: { id?: Id; occurredAt?: Date; note?: string; food?: Food; nutrients?: Nutrients; servings?: number } = {},
): Consumption {
  return new Consumption({
    ...(overrides.id !== undefined ? { id: overrides.id } : {}),
    occurredAt: overrides.occurredAt ?? DEFAULT_AT,
    ...(overrides.note !== undefined ? { note: overrides.note } : {}),
    ...(overrides.nutrients !== undefined ? { nutrients: overrides.nutrients } : {}),
    ...(overrides.food !== undefined
      ? { food: overrides.food }
      : overrides.nutrients === undefined
        ? { food: makeFood() }
        : {}),
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
