import { describe, expect, it } from 'vitest'
import { fixtureId } from './fixture-id'
import { FIXTURE_TODAY, FIXTURE_TZ } from './constants'
import {
  makeAccount,
  makeActivity,
  makeActivitySession,
  makeAppointment,
  makeBudget,
  makeConsumption,
  makeDayPlan,
  makeFood,
  makeGoal,
  makeLifeArea,
  makeMeasurement,
  makeNote,
  makePlannedMeal,
  makeProject,
  makeTask,
  makeTransaction,
  makeUser,
  makeContact,
  makeDocument,
  makeGiftIdea,
  makePossession,
  makeSubscription,
} from './builders'
import { makeSeed } from './seed'
import { LifeArea } from '../core/life-area'
import { User } from '../user/user'
import { Id } from '../core/id'
import { reviveEntry, revivePlan } from '../index'
import { Journal } from '../core/journal'
import { DayKey } from '../core/day-key'
import { DayRange } from '../core/day-range'
import { MetricKey } from '../core/metric-key'
import { Transaction } from '../finance/transaction'
import { Consumption } from '../nutrition/consumption'
import { Goal } from '../goal/goal'
import { Budget } from '../goal/budget'
import { Money } from '../core/money'
import { Planner } from '../plan/planner'
import { Project } from '../plan/project'
import { DayPlan } from '../plan/day-plan'
import { Task } from '../plan/task'
import { Vault } from '../vault/vault'
import { Document } from '../vault/document'
import { Possession } from '../vault/possession'
import { Subscription } from '../vault/subscription'
import { Contact } from '../vault/contact'
import { GiftIdea } from '../vault/gift-idea'

const seed = makeSeed()

describe('fixtures', () => {
  it('fixtureId yields valid, stable, distinct ids', () => {
    expect(fixtureId(1)).toBe(Id.of('00000000-0000-4000-8000-000000000001'))
    expect(fixtureId(42)).toBe(fixtureId(42))
    expect(fixtureId(1)).not.toBe(fixtureId(2))
  })

  it('anchors at FIXTURE_TODAY in a DST-rich timezone', () => {
    expect(FIXTURE_TODAY.value).toBe('2026-06-01')
    expect(FIXTURE_TZ).toBe('America/New_York')
  })

  it('builders produce valid objects with overridable fields', () => {
    const user = makeUser()
    expect(user.timezone).toBe(FIXTURE_TZ)
    expect(makeUser({ displayName: 'Blake' }).displayName).toBe('Blake')
    const area = makeLifeArea()
    expect(area.slug).toBe('health')
    expect(makeLifeArea({ slug: 'money', name: 'Money' }).slug).toBe('money')
  })

  it('seed shapes revive through the domain (standing round-trip test)', () => {
    expect(seed.users).toHaveLength(2)
    expect(seed.lifeAreas).toHaveLength(4)
    const users = seed.users.map((shape) => User.fromJSON(shape))
    expect(users.map((u) => u.displayName)).toEqual(['Avery', 'Blake'])
    const areas = seed.lifeAreas.map((shape) => LifeArea.fromJSON(shape))
    expect(new Set(areas.map((a) => a.slug)).size).toBe(4)
    // re-serializing equals the seed (no drift)
    expect(users.map((u) => u.toJSON())).toEqual(seed.users)
    expect(areas.map((a) => a.toJSON())).toEqual(seed.lifeAreas)
    // serialization is idempotent: revive(serialize(revive(x))) === serialize(revive(x))
    for (const u of users) {
      expect(User.fromJSON(u.toJSON()).toJSON()).toEqual(u.toJSON())
    }
    for (const a of areas) {
      expect(LifeArea.fromJSON(a.toJSON()).toJSON()).toEqual(a.toJSON())
    }
  })

  it('phase 2 builders produce valid objects with overridable fields', () => {
    expect(makeActivity().slug).toBe('run')
    expect(makeFood().nutrients.calories).toBe(150)
    expect(makeAccount().currency).toBe('USD')
    expect(makeActivitySession().slug).toBe('run')
    expect(makeConsumption().servings).toBe(1)
    expect(makeTransaction().direction).toBe('expense')
    expect(makeMeasurement().metric).toBe('body.weight_kg')
    expect(makeNote().text.length).toBeGreaterThan(0)
    expect(makeTransaction({ direction: 'income', category: 'salary' }).direction).toBe('income')
  })

  it('seed contains the phase 2 catalogs and a six-week entry slice', () => {
    expect(seed.activities.length).toBeGreaterThanOrEqual(2)
    expect(seed.foods.length).toBeGreaterThanOrEqual(2)
    expect(seed.accounts).toHaveLength(1)
    expect(seed.entries).toHaveLength(263) // deterministic: 42 days × pattern + showcase
  })

  it('every seed entry revives through reviveEntry and re-serializes identically', () => {
    const entries = seed.entries.map((shape) => reviveEntry(shape))
    expect(entries).toHaveLength(seed.entries.length)
    for (const entry of entries) {
      expect(reviveEntry(entry.toJSON()).toJSON()).toEqual(entry.toJSON())
    }
  })

  it('seed showcases the spec semantics: a refund and an ad-hoc meal', () => {
    const entries = seed.entries.map((shape) => reviveEntry(shape))
    const refund = entries.find((e) => e instanceof Transaction && e.amount.minor < 0)
    expect(refund).toBeDefined()
    const adHoc = entries.find((e) => e instanceof Consumption && e.foodId === undefined)
    expect(adHoc).toBeDefined()
  })

  it('seed straddles the DST transition', () => {
    const entries = seed.entries.map((shape) => reviveEntry(shape))
    const journal = new Journal(FIXTURE_TZ)
    for (const e of entries) journal.add(e)
    const dstWeekend = DayRange.of(DayKey.of('2026-03-07'), DayKey.of('2026-03-09'))
    expect(journal.aggregate(MetricKey.of('body.weight_kg'), dstWeekend, 'avg')).toBeGreaterThan(0)
  })

  it('a Journal hydrated from seed answers real questions', () => {
    const journal = new Journal(FIXTURE_TZ)
    for (const shape of seed.entries) journal.add(reviveEntry(shape))
    const lastWeek = DayRange.of(FIXTURE_TODAY.addDays(-6), FIXTURE_TODAY)
    expect(journal.totalOf(MetricKey.of('nutrition.calories'), lastWeek)).toBeGreaterThan(0)
    expect(journal.totalOf(MetricKey.of('activity.run.minutes'), lastWeek)).toBeGreaterThan(0)
    expect(journal.totalsByPrefix('finance.spend', lastWeek).size).toBeGreaterThan(0)
  })

  it('phase 3 builders produce valid objects with overridable fields', () => {
    expect(makeGoal().direction).toBe('atMost')
    expect(makeGoal({ direction: 'atLeast', metric: 'custom.km', target: 10 }).metric).toBe('custom.km')
    expect(makeBudget().category).toBe('groceries')
    expect(makeBudget({ limit: Money.usd(10000) }).limit.equals(Money.usd(10000))).toBe(true)
  })

  it('seed contains goals (incl. the paused showcase) and a budget that revive and answer', () => {
    expect(seed.goals).toHaveLength(4)
    expect(seed.budgets).toHaveLength(1)
    const goals = seed.goals.map((shape) => Goal.fromJSON(shape))
    const budget = Budget.fromJSON(seed.budgets[0])

    // hydrate the journal once
    const journal = new Journal(FIXTURE_TZ)
    for (const shape of seed.entries) journal.add(reviveEntry(shape))

    // the calorie goal is judged on FIXTURE_TODAY
    const calories = goals.find((g) => g.metric === 'nutrition.calories')!
    const cp = calories.progressOn(journal, FIXTURE_TODAY)
    expect(cp.empty).toBe(false)
    expect(cp.met).toBe(true) // 150 cal breakfast, no dinner on day 41

    // the weekly run goal is met for the prior (full) week
    const run = goals.find((g) => g.metric === 'activity.run.minutes')!
    expect(run.progressOn(journal, FIXTURE_TODAY.addDays(-7)).met).toBe(true)

    // the paused weight goal reports paused with met unasserted inside its pause
    const weight = goals.find((g) => g.metric === 'body.weight_kg')!
    const wp = weight.progressOn(journal, FIXTURE_TODAY.addDays(-8))
    expect(wp.paused).toBe(true)
    expect(wp.met).toBeUndefined()
    expect(weight.progressOn(journal, FIXTURE_TODAY).paused).toBe(false)

    // the budget nets the refund and stays under limit for May
    const may = FIXTURE_TODAY.addDays(-7)
    const spent = budget.spent(journal, may)
    expect(spent.currency).toBe('USD')
    expect(spent.minor).toBeGreaterThan(0)
    expect(budget.remaining(journal, may).equals(budget.limit.subtract(spent))).toBe(true)
    expect(budget.progressOn(journal, may).met).toBe(true)

    // serialization idempotence for the new shapes
    for (const g of goals) expect(Goal.fromJSON(g.toJSON()).toJSON()).toEqual(g.toJSON())
    expect(Budget.fromJSON(budget.toJSON()).toJSON()).toEqual(budget.toJSON())
  })

  it('phase 4 builders produce valid objects with overridable fields', () => {
    expect(makeTask().title.length).toBeGreaterThan(0)
    expect(makeTask({ title: 'Custom' }).title).toBe('Custom')
    expect(makeProject().name).toBe('Spring reset')
    expect(makeAppointment().kind).toBe('appointment')
    expect(makePlannedMeal().servings).toBe(1)
    expect(makeDayPlan().slots.length).toBeGreaterThan(0)
  })

  it('seed plans revive, hydrate a Planner, and answer real questions', () => {
    expect(seed.plans.length).toBeGreaterThanOrEqual(7)
    expect(seed.projects).toHaveLength(1)
    expect(seed.dayPlans).toHaveLength(1)

    const planner = new Planner()
    for (const shape of seed.plans) planner.add(revivePlan(shape))
    planner.setDayPlan(DayPlan.fromJSON(seed.dayPlans[0]))
    const project = Project.fromJSON(seed.projects[0])

    // the showcase: a recurring chore completed late, with its respawned successor
    const doneChore = planner.all().find((p) => p instanceof Task && p.cadence !== undefined && p.status === 'done') as Task
    expect(doneChore).toBeDefined()
    const successor = planner.all().find((p) => p instanceof Task && p.cadence !== undefined && p.status === 'open' && p.title === doneChore.title) as Task
    expect(successor).toBeDefined()
    expect(successor.due?.value).toBe(doneChore.cadence!.nextAfter(doneChore.completedOn!).value)

    // taxes are overdue today
    expect(planner.overdue(FIXTURE_TODAY).map((p) => p.title)).toContain('File taxes')

    // the project is half done
    expect(project.progress(planner)).toBeCloseTo(0.5)

    // groceries for the coming week include the planned oatmeal
    const nextWeek = DayRange.of(FIXTURE_TODAY, FIXTURE_TODAY.addDays(6))
    expect(planner.groceryList(nextWeek).get(fixtureId(31))?.amount).toBeGreaterThanOrEqual(2)

    // the stored day plan wins for today; schedule resolves its live slots
    expect(planner.dayPlanFor(FIXTURE_TODAY).slots.length).toBeGreaterThan(0)
    expect(planner.scheduleFor(FIXTURE_TODAY).length).toBeGreaterThan(0)

    // serialization idempotence
    for (const shape of seed.plans) {
      expect(revivePlan(revivePlan(shape).toJSON()).toJSON()).toEqual(revivePlan(shape).toJSON())
    }
  })

  it('phase 5 builders produce valid objects with overridable fields', () => {
    expect(makeDocument().kind).toBe('passport')
    expect(makePossession().name).toBe('Espresso machine')
    expect(makeSubscription().category).toBe('streaming')
    expect(makeContact().name).toBe('Sam')
    expect(makeGiftIdea().text.length).toBeGreaterThan(0)
  })

  it('seed vault items revive, hydrate a Vault, and answer real questions', () => {
    expect(seed.documents).toHaveLength(1)
    expect(seed.possessions).toHaveLength(1)
    expect(seed.subscriptions).toHaveLength(2)
    expect(seed.contacts).toHaveLength(1)
    expect(seed.giftIdeas).toHaveLength(1)

    const vault = new Vault()
    for (const shape of seed.documents) vault.addDocument(Document.fromJSON(shape))
    for (const shape of seed.possessions) vault.addPossession(Possession.fromJSON(shape))
    for (const shape of seed.subscriptions) vault.addSubscription(Subscription.fromJSON(shape))
    for (const shape of seed.contacts) vault.addContact(Contact.fromJSON(shape))
    for (const shape of seed.giftIdeas) vault.addGiftIdea(GiftIdea.fromJSON(shape))

    // the unified feed for the next 120 days: netflix renewal, Sam's birthday, warranty, passport
    const feed = vault.upcoming(DayRange.of(FIXTURE_TODAY, FIXTURE_TODAY.addDays(120)))
    expect(feed.map((d) => d.label)).toEqual(['Netflix', 'Sam — birthday', 'Espresso machine (warranty)', 'Passport'])

    // the lapsed gym subscription surfaces its overdue pending — the showcase
    const gym = vault.subscriptions().find((s) => s.name === 'Gym')!
    expect(gym.nextDueOn(FIXTURE_TODAY)!.compare(FIXTURE_TODAY)).toBeLessThan(0)

    // Sam is stale and has a gift idea waiting
    const sam = vault.contacts()[0]!
    expect(sam.staleness(FIXTURE_TODAY)).toBeGreaterThan(90)
    expect(vault.giftIdeasFor(sam.id)).toHaveLength(1)

    // renewing netflix yields a charge that converts to a Transaction (the app-side conversion)
    const netflix = vault.subscriptions().find((s) => s.name === 'Netflix')!
    const charge = netflix.renew(FIXTURE_TODAY.addDays(14))
    const tx = new Transaction({
      occurredAt: new Date(`${charge.on.value}T16:00:00Z`),
      amount: charge.amount,
      category: charge.category,
      direction: charge.direction,
      ...(charge.accountId !== undefined ? { accountId: charge.accountId } : {}),
    })
    expect(tx.metrics().size).toBe(1)
    expect(netflix.nextDueOn(FIXTURE_TODAY.addDays(15))?.value).toBe('2026-07-15') // anchor preserved

    // totals per currency
    expect(vault.monthlySubscriptionTotals().get('USD')?.minor).toBeGreaterThan(0)

    // serialization idempotence across all five registries
    for (const [shapes, revive] of [
      [seed.documents, Document.fromJSON],
      [seed.possessions, Possession.fromJSON],
      [seed.subscriptions, Subscription.fromJSON],
      [seed.contacts, Contact.fromJSON],
      [seed.giftIdeas, GiftIdea.fromJSON],
    ] as const) {
      for (const shape of shapes) {
        expect(revive(revive(shape).toJSON()).toJSON()).toEqual(revive(shape).toJSON())
      }
    }
  })
})
