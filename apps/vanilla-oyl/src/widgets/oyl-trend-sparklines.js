import { DayRange } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from '../components/sheet.js'
import { badgeStyles, SAMPLE, sampleBadge, withSample } from './sample-data.js'
import { sparklineSvg } from './svg.js'

/** Row order + labels; kinds are the WidgetContext series kinds. */
const ROWS = /** @type {ReadonlyArray<readonly ['spending' | 'calories' | 'activeMinutes', string]>} */ ([
  ['spending', 'Spending'],
  ['calories', 'Calories'],
  ['activeMinutes', 'Active min'],
])

const styles = sheet(`
  :host { display: block; }
  .wrap { position: relative; display: grid; gap: var(--space-2); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
  .k { font-size: var(--step--1); color: var(--color-muted); }
  svg { color: var(--color-accent); }
`)

export class OylTrendSparklines extends OylElement {
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
      const range = DayRange.of(today.addDays(-13), today) // 14-day window (spec)
      const real = {
        spending: this.context.series(range, 'spending'),
        calories: this.context.series(range, 'calories'),
        activeMinutes: this.context.series(range, 'activeMinutes'),
      }
      const empty = Object.values(real).every((s) => s.length === 0 || s.every((v) => v === 0))
      const { value, sample } = withSample(empty, real, SAMPLE.series)

      const wrap = document.createElement('div')
      wrap.className = 'wrap'
      for (const [kind, label] of ROWS) {
        const row = document.createElement('div')
        row.className = 'row'
        const k = document.createElement('span')
        k.className = 'k'
        k.textContent = label
        row.append(k, sparklineSvg(value[kind]))
        wrap.append(row)
      }
      if (sample) wrap.append(sampleBadge())
      root.replaceChildren(wrap)
    })
  }
}

/** Register the element (idempotent). */
export function defineTrendSparklines() {
  if (!customElements.get('oyl-trend-sparklines')) customElements.define('oyl-trend-sparklines', OylTrendSparklines)
}
