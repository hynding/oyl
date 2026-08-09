import { DayRange, streakOf } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from '../components/sheet.js'
import { SAMPLE, withSample } from './sample-data.js'
import { ringSvg } from './svg.js'

/** Next milestone the arc fills toward. */
const MILESTONES = [7, 30, 100, 365]

const styles = sheet(`
  :host { display: block; }
  .wrap { position: relative; display: grid; justify-items: center; gap: var(--space-1); }
  .count { font-size: var(--step-1); font-weight: 700; font-variant-numeric: tabular-nums; }
  .k { font-size: var(--step--1); color: var(--color-muted); }
  [data-sample-badge] {
    position: absolute; inset-block-start: 0; inset-inline-end: 0;
    font-size: 0.62rem; text-transform: uppercase; letter-spacing: .06em;
    color: var(--color-muted); border: 1px solid var(--color-border);
    border-radius: 999px; padding: 0 .4rem;
  }
`)

export class OylStreakRing extends OylElement {
  static styles = [styles]

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
      if (sample) wrap.append(badge())
      root.replaceChildren(wrap)
    })
  }
}

function badge() {
  const b = document.createElement('span')
  b.setAttribute('data-sample-badge', '')
  b.textContent = 'Sample'
  return b
}

/** Register the element (idempotent). */
export function defineStreakRing() {
  if (!customElements.get('oyl-streak-ring')) customElements.define('oyl-streak-ring', OylStreakRing)
}
