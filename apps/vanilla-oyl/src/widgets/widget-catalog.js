import { defineStreakRing } from './oyl-streak-ring.js'
import { defineTodayPlan } from './oyl-today-plan.js'

/**
 * The widget registry: deck order = this order. Each entry's create(context)
 * returns a ready element (the deck wraps it in a card and isolates crashes).
 * Widgets register here as they land — final v1 order: greeting-digest,
 * streak-ring, today-plan, trend-sparklines, goal-rings.
 * @typedef {{ id: string, label: string, create(context: import('./context.js').WidgetContext): HTMLElement }} WidgetEntry
 * @type {readonly WidgetEntry[]}
 */
export const WIDGETS = Object.freeze([
  {
    id: 'streak-ring',
    label: 'Streak',
    create(context) {
      defineStreakRing()
      const el = /** @type {import('./oyl-streak-ring.js').OylStreakRing} */ (document.createElement('oyl-streak-ring'))
      el.context = context
      return el
    },
  },
  {
    id: 'today-plan',
    label: "Today's plan",
    create(context) {
      defineTodayPlan()
      const el = /** @type {import('./oyl-today-plan.js').OylTodayPlan} */ (document.createElement('oyl-today-plan'))
      el.context = context
      return el
    },
  },
])
