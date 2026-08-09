/**
 * The widget registry: deck order = this order. Each entry's create(context)
 * returns a ready element (the deck wraps it in a card and isolates crashes).
 * Widgets register here as they land — final v1 order: greeting-digest,
 * streak-ring, today-plan, trend-sparklines, goal-rings.
 * @typedef {{ id: string, label: string, create(context: import('./context.js').WidgetContext): HTMLElement }} WidgetEntry
 * @type {readonly WidgetEntry[]}
 */
export const WIDGETS = Object.freeze([])
