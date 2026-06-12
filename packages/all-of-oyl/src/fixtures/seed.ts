import { DayKey } from '../core/day-key'
import { DayRange } from '../core/day-range'
import type { Entry } from '../core/entry'
import { Money } from '../core/money'
import { Quantity } from '../core/quantity'
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
} from './builders'
import { Cadence } from '../core/cadence'
import { FIXTURE_TODAY } from './constants'
import { fixtureId } from './fixture-id'

/**
 * The canonical dataset as wire shapes (toJSON). Sourceable: apps seed any
 * backend by walking these through repository adapters or an API; tests
 * revive them through reviveEntry/fromJSON — a standing round-trip test.
 * Personas: Avery (rich account), Blake (sparse). Phase 2 adds Avery's
 * catalogs and ~6 weeks of entries, deliberately exercising the spec's
 * semantics: a refund, an ad-hoc meal, and a DST-straddling March cluster.
 *
 * Call `makeSeed()` to obtain the dataset; construction is deferred until
 * first call so that importing the barrel costs nothing at module-eval time.
 */

export type Seed = {
  users: Record<string, unknown>[]
  lifeAreas: Record<string, unknown>[]
  activities: Record<string, unknown>[]
  foods: Record<string, unknown>[]
  accounts: Record<string, unknown>[]
  entries: Record<string, unknown>[]
  goals: Record<string, unknown>[]
  budgets: Record<string, unknown>[]
  plans: Record<string, unknown>[]
  projects: Record<string, unknown>[]
  dayPlans: Record<string, unknown>[]
}

let cached: Seed | undefined

/** Build (once) and return the canonical seed dataset as wire shapes. Lazy so importing the barrel costs nothing. */
export function makeSeed(): Seed {
  if (cached) return cached

  const avery = makeUser({ id: fixtureId(1), displayName: 'Avery', units: 'metric' })
  const blake = makeUser({ id: fixtureId(2), displayName: 'Blake', timezone: 'America/Chicago' })

  const areas = [
    makeLifeArea({ id: fixtureId(10), name: 'Health', slug: 'health' }),
    makeLifeArea({ id: fixtureId(11), name: 'Family', slug: 'family' }),
    makeLifeArea({ id: fixtureId(12), name: 'Career', slug: 'career' }),
    makeLifeArea({ id: fixtureId(13), name: 'Money', slug: 'money' }),
  ]

  // ── Catalogs (id block 30-99) ───────────────────────────────────────────────
  const run = makeActivity({ id: fixtureId(30), name: 'Run', slug: 'run', areaId: fixtureId(10) })
  const meditate = makeActivity({ id: fixtureId(33), name: 'Meditate', slug: 'meditate', defaultUnit: 'minutes', areaId: fixtureId(10) })
  const oatmeal = makeFood({ id: fixtureId(31), name: 'Oatmeal', nutrients: { calories: 150, protein: 5, carbs: 27, fat: 3 } })
  const chickenBowl = makeFood({ id: fixtureId(34), name: 'Chicken Bowl', nutrients: { calories: 550, protein: 42, carbs: 45, fat: 18 } })
  const checking = makeAccount({ id: fixtureId(32), name: 'Checking', currency: 'USD' })

  // ── Entries (id block 100+); all instants are UTC, FIXTURE_TZ is UTC-4 in June ──
  let nextEntryId = 100
  const eid = () => fixtureId(nextEntryId++)
  const at = (day: DayKey, hourUtc: number) => new Date(`${day.value}T${String(hourUtc).padStart(2, '0')}:00:00Z`)

  const entries: Entry[] = []
  const start = FIXTURE_TODAY.addDays(-41) // six weeks, inclusive of today
  let dayIndex = 0
  for (const day of DayRange.of(start, FIXTURE_TODAY)) {
    // breakfast every day; dinner most days
    entries.push(makeConsumption({ id: eid(), occurredAt: at(day, 12), food: oatmeal }))
    if (dayIndex % 3 !== 2) {
      entries.push(makeConsumption({ id: eid(), occurredAt: at(day, 23), food: chickenBowl }))
    }
    // run every other day, meditate on the off days
    if (dayIndex % 2 === 0) {
      entries.push(
        makeActivitySession({
          id: eid(),
          occurredAt: at(day, 11),
          activity: run,
          quantities: [Quantity.of(30, 'minutes'), Quantity.of(5, 'km')],
        }),
      )
    } else {
      entries.push(
        makeActivitySession({ id: eid(), occurredAt: at(day, 11), activity: meditate, quantities: [Quantity.of(15, 'minutes')] }),
      )
    }
    // daily gauges: weight drifts down, sleep and mood vary deterministically
    entries.push(makeMeasurement({ id: eid(), occurredAt: at(day, 11), metric: 'body.weight_kg', value: 82 - dayIndex * 0.05 }))
    entries.push(makeMeasurement({ id: eid(), occurredAt: at(day, 10), metric: 'sleep.hours', value: 6.5 + (dayIndex % 4) * 0.5 }))
    entries.push(makeMeasurement({ id: eid(), occurredAt: at(day, 22), metric: 'mood.score', value: 5 + (dayIndex % 5) }))
    // groceries every third day
    if (dayIndex % 3 === 0) {
      entries.push(
        makeTransaction({ id: eid(), occurredAt: at(day, 19), amount: Money.usd(6500 + (dayIndex % 7) * 300), category: 'groceries', account: checking }),
      )
    }
    // weekly reflection on Sundays
    if (day.weekday() === 7) {
      entries.push(makeNote({ id: eid(), occurredAt: at(day, 23), text: `Week ending ${day.value}: steady progress.`, tags: ['gratitude'] }))
    }
    dayIndex += 1
  }

  // Showcase: spec semantics a demo should display
  entries.push(
    makeTransaction({
      id: eid(),
      occurredAt: at(FIXTURE_TODAY.addDays(-5), 20),
      amount: Money.usd(-1500),
      category: 'groceries',
      note: 'refund: returned the moldy berries',
      account: checking,
    }),
  )
  entries.push(
    makeConsumption({
      id: eid(),
      occurredAt: at(FIXTURE_TODAY.addDays(-3), 23),
      nutrients: { calories: 850, protein: 35, fat: 40 },
      note: 'ad-hoc: restaurant ramen, no catalog entry',
    }),
  )
  // March DST cluster (FIXTURE_TZ springs forward 2026-03-08)
  for (const dayValue of ['2026-03-07', '2026-03-08', '2026-03-09']) {
    entries.push(makeMeasurement({ id: eid(), occurredAt: at(DayKey.of(dayValue), 11), metric: 'body.weight_kg', value: 84 }))
  }

  // ── Goals & budget (id block 50-69) ─────────────────────────────────────
  const calorieGoal = makeGoal({ id: fixtureId(50), name: 'Eat lighter', metric: 'nutrition.calories', target: 2200, direction: 'atMost', period: 'day', areaId: fixtureId(10) })
  const runGoal = makeGoal({ id: fixtureId(51), name: 'Run weekly', metric: 'activity.run.minutes', target: 100, direction: 'atLeast', period: 'week', areaId: fixtureId(10) })
  const sleepGoal = makeGoal({ id: fixtureId(52), name: 'Sleep enough', metric: 'sleep.hours', target: 7, direction: 'atLeast', period: 'day' })
  const weightGoal = makeGoal({ id: fixtureId(53), name: 'Trim down', metric: 'body.weight_kg', target: 81, direction: 'atMost', period: 'day', aggregation: 'last' })
  // showcase: a paused goal mid-streak (spec, "Fixtures double as seed data")
  weightGoal.pause(FIXTURE_TODAY.addDays(-10), FIXTURE_TODAY.addDays(-7))
  // limit $1,000: the deterministic May spend is ~$728 net of the refund, so the budget is met
  const groceryBudget = makeBudget({ id: fixtureId(60), name: 'Food money', category: 'groceries', limit: Money.usd(100000) })

  // ── Plans (id block 1000-1999) ──────────────────────────────────────────
  const project = makeProject({ id: fixtureId(1000), name: 'Spring reset', areaId: fixtureId(12) })
  // showcase: a recurring chore completed late + its respawned (already overdue from today's view) successor
  const wateredLate = makeTask({ id: fixtureId(1001), title: 'Water the plants', due: FIXTURE_TODAY.addDays(-9), cadence: Cadence.of(7, 'days') })
  wateredLate.complete(FIXTURE_TODAY.addDays(-6))
  // the successor is constructed explicitly with a fixture id — spawnNext() would
  // generate a random id and break the seed's byte-stability contract
  const wateringNext = makeTask({
    id: fixtureId(1002),
    title: 'Water the plants',
    due: wateredLate.cadence!.nextAfter(wateredLate.completedOn!), // -6 + 7 = TODAY+1
    cadence: Cadence.of(7, 'days'),
  })
  const taxes = makeTask({ id: fixtureId(1003), title: 'File taxes', due: FIXTURE_TODAY.addDays(-3) })
  const projectDone = makeTask({ id: fixtureId(1004), title: 'Declutter closet', due: FIXTURE_TODAY.addDays(-5), projectId: project.id })
  projectDone.complete(FIXTURE_TODAY.addDays(-5))
  const projectOpen = makeTask({ id: fixtureId(1005), title: 'Donate the pile', due: FIXTURE_TODAY.addDays(3), projectId: project.id })
  const dentist = makeAppointment({ id: fixtureId(1006), title: 'Dentist', startsAt: new Date('2026-06-03T15:00:00Z') })
  const mealTomorrow = makePlannedMeal({ id: fixtureId(1007), title: 'Oatmeal breakfast', day: FIXTURE_TODAY.addDays(1) })
  const mealLater = makePlannedMeal({ id: fixtureId(1008), title: 'Oatmeal again', day: FIXTURE_TODAY.addDays(3) })
  const todayPlan = makeDayPlan({
    id: fixtureId(1010),
    day: FIXTURE_TODAY,
    slots: [{ planId: fixtureId(1003), start: '09:00', end: '10:00' }],
  })

  cached = {
    users: [avery.toJSON(), blake.toJSON()],
    lifeAreas: areas.map((a) => a.toJSON()),
    activities: [run.toJSON(), meditate.toJSON()],
    foods: [oatmeal.toJSON(), chickenBowl.toJSON()],
    accounts: [checking.toJSON()],
    entries: entries.map((e) => e.toJSON()),
    goals: [calorieGoal.toJSON(), runGoal.toJSON(), sleepGoal.toJSON(), weightGoal.toJSON()],
    budgets: [groceryBudget.toJSON()],
    plans: [wateredLate.toJSON(), wateringNext.toJSON(), taxes.toJSON(), projectDone.toJSON(), projectOpen.toJSON(), dentist.toJSON(), mealTomorrow.toJSON(), mealLater.toJSON()],
    projects: [project.toJSON()],
    dayPlans: [todayPlan.toJSON()],
  }
  return cached
}
