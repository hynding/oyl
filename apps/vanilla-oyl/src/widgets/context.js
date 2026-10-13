import { DayKey, activeDaysIn, dailySeries, spendingOn, caloriesOn, activeMinutesOn } from '@oyl/all-of-oyl'

/** @typedef {import('@oyl/all-of-oyl').DayRange} DayRange */
/** @typedef {import('@oyl/all-of-oyl').Review} Review */
/** @typedef {'spending' | 'calories' | 'activeMinutes'} SeriesKind */
/**
 * @typedef {{
 *   tz: string,
 *   today(): DayKey,
 *   hour(): number,
 *   profileName(): string | undefined,
 *   activeDays(range: DayRange): ReadonlySet<string>,
 *   series(range: DayRange, kind: SeriesKind): readonly number[],
 *   plansOn(day: DayKey): readonly { status: string, label: string }[],
 *   review(range: DayRange): Review,
 * }} WidgetContext
 */

const SELECTORS = Object.freeze({
  spending: spendingOn,
  calories: caloriesOn,
  activeMinutes: activeMinutesOn,
})

/**
 * The read-only facade every widget receives — READ-ONLY BY SHAPE, not
 * convention: only functions returning plain data (plus the tz string) are
 * exposed. No store, signal setter, repository, or domain aggregate is
 * reachable through it, so no widget can enqueue outbox writes or mutate
 * shared state. Reactivity comes for free: journal.peek()/agendaFor/reviewOn
 * touch their revision signals, so calls inside a widget's track() re-run.
 * @param {{
 *   journal: { peek(): import('@oyl/all-of-oyl').Journal },
 *   planner: { agendaFor(day: DayKey): readonly import('@oyl/all-of-oyl').Plan[] },
 *   reviewOn: (range: DayRange) => Review,
 *   profile: { get(): import('@oyl/all-of-oyl').User | null },
 *   tz: string,
 *   now: () => Date,
 * }} deps
 * @returns {WidgetContext}
 */
export function createWidgetContext({ journal, planner, reviewOn, profile, tz, now }) {
  return Object.freeze({
    tz,
    today: () => DayKey.from(now(), tz),
    hour: () => now().getHours(),
    profileName: () => profile.get()?.displayName,
    activeDays: (range) => activeDaysIn(journal.peek(), range),
    series: (range, kind) => dailySeries(journal.peek(), range, SELECTORS[kind]),
    plansOn: (day) =>
      planner.agendaFor(day).map((p) => ({
        status: p.status,
        label: /** @type {{ title?: string }} */ (p).title ?? p.kind,
      })),
    review: (range) => reviewOn(range),
  })
}
