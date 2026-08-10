import { periodWindowOf } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from '../components/sheet.js'
import { badgeStyles, SAMPLE, sampleBadge, withSample } from './sample-data.js'
import { ringSvg } from './svg.js'

const styles = sheet(`
  :host { display: block; }
  .wrap { position: relative; display: flex; gap: var(--space-3); }
  .goal { display: grid; justify-items: center; gap: var(--space-1); }
  .name { font-size: var(--step--1); color: var(--color-text); }
  .flame { font-size: var(--step--1); color: var(--color-muted); font-variant-numeric: tabular-nums; }
`)

export class OylGoalRings extends OylElement {
  static styles = [badgeStyles, styles]

  constructor() {
    super()
    /** @type {import('./context.js').WidgetContext} */
    this.context = /** @type {import('./context.js').WidgetContext} */ (/** @type {unknown} */ (undefined))
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    this.track(() => {
      const week = periodWindowOf('week', this.context.today())
      const reviews = this.context.review(week).goals
      /** @type {ReadonlyArray<{ name: string, ratio: number, streak: number }>} */
      const real = reviews.map((g) => ({ name: g.name ?? 'Goal', ratio: g.progress.ratio, streak: g.streak }))
      const { value, sample } = withSample(real.length === 0, real, SAMPLE.goals)

      const wrap = document.createElement('div')
      wrap.className = 'wrap'
      for (const g of value) {
        const item = document.createElement('div')
        item.className = 'goal'
        item.append(ringSvg(g.ratio, { size: 40, stroke: 4 }))
        const name = document.createElement('span')
        name.className = 'name'
        name.textContent = g.name
        item.append(name)
        if (g.streak > 0) {
          const flame = document.createElement('span')
          flame.className = 'flame'
          flame.textContent = `🔥 ${g.streak}`
          item.append(flame)
        }
        wrap.append(item)
      }
      if (sample) wrap.append(sampleBadge())
      root.replaceChildren(wrap)
    })
  }
}

/** Register the element (idempotent). */
export function defineGoalRings() {
  if (!customElements.get('oyl-goal-rings')) customElements.define('oyl-goal-rings', OylGoalRings)
}
