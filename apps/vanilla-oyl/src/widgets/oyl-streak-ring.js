import { DayRange, streakOf } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from '../components/sheet.js'
import { badgeStyles, SAMPLE, sampleBadge, withSample } from './sample-data.js'
import { ringSvg } from './svg.js'

/** Next milestone the arc fills toward. */
const MILESTONES = [7, 30, 100, 365]

const styles = sheet(`
  :host { display: block; }
  .wrap { position: relative; display: grid; justify-items: center; gap: var(--space-1); }
  .count { font-size: var(--step-1); font-weight: 700; font-variant-numeric: tabular-nums; }
  .k { font-size: var(--step--1); color: var(--color-muted); }
`)

export class OylStreakRing extends OylElement {
  static styles = [badgeStyles, styles]

  constructor() {
    super()
    /** @type {import('./context.js').WidgetContext} */
    this.context = /** @type {import('./context.js').WidgetContext} */ (/** @type {unknown} */ (undefined))
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    this.track(() => {
      const today = this.context.today()
      // 366-day lookback window (spec): a streak at the cap renders as 365+.
      const days = this.context.activeDays(DayRange.of(today.addDays(-365), today))
      const { value, sample } = withSample(days.size === 0, streakOf(days, today), SAMPLE.streak)
      const milestone = MILESTONES.find((m) => value < m) ?? 365

      const wrap = document.createElement('div')
      wrap.className = 'wrap'
      wrap.append(ringSvg(Math.min(value / milestone, 1)))
      const count = document.createElement('div')
      count.className = 'count'
      count.textContent = value > 365 ? '365+' : String(value)
      const k = document.createElement('div')
      k.className = 'k'
      k.textContent = 'day streak'
      wrap.append(count, k)
      if (sample) wrap.append(sampleBadge())
      root.replaceChildren(wrap)
    })
  }
}

/** Register the element (idempotent). */
export function defineStreakRing() {
  if (!customElements.get('oyl-streak-ring')) customElements.define('oyl-streak-ring', OylStreakRing)
}
