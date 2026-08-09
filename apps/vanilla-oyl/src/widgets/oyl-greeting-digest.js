import { DayRange, digestOf, periodWindowOf, streakOf } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from '../components/sheet.js'
import { SAMPLE, sampleBadge, withSample } from './sample-data.js'

const styles = sheet(`
  :host { display: block; }
  .wrap { position: relative; display: grid; gap: var(--space-1); min-inline-size: 13rem; }
  .hello { font-size: var(--step-1); font-weight: 650; }
  .line { font-size: var(--step--1); color: var(--color-muted); font-variant-numeric: tabular-nums; }
  [data-sample-badge] {
    position: absolute; inset-block-start: 0; inset-inline-end: 0;
    font-size: 0.62rem; text-transform: uppercase; letter-spacing: .06em;
    color: var(--color-muted); border: 1px solid var(--color-border);
    border-radius: 999px; padding: 0 .4rem;
  }
`)

/** @param {number} hour */
function greetingFor(hour) {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export class OylGreetingDigest extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {import('./context.js').WidgetContext} */
    this.context = /** @type {import('./context.js').WidgetContext} */ (/** @type {unknown} */ (undefined))
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    this.track(() => {
      const ctx = this.context
      const today = ctx.today()
      const plans = ctx.plansOn(today)
      const review = ctx.review(periodWindowOf('week', today))
      const days = ctx.activeDays(DayRange.of(today.addDays(-365), today))
      const real = digestOf(review, plans, streakOf(days, today))
      const empty = real.plansTotal === 0 && real.goalsTotal === 0 && real.streak === 0
      const { value, sample } = withSample(empty, real, SAMPLE.digest)

      const wrap = document.createElement('div')
      wrap.className = 'wrap'
      const hello = document.createElement('div')
      hello.className = 'hello'
      const name = ctx.profileName()
      hello.textContent = name ? `${greetingFor(ctx.hour())}, ${name}` : greetingFor(ctx.hour())
      const line = document.createElement('div')
      line.className = 'line'
      line.textContent = `${value.plansDone}/${value.plansTotal} plans · ${value.goalsMet}/${value.goalsTotal} goals this week · 🔥 ${value.streak}`
      wrap.append(hello, line)
      if (sample) wrap.append(sampleBadge())
      root.replaceChildren(wrap)
    })
  }
}

/** Register the element (idempotent). */
export function defineGreetingDigest() {
  if (!customElements.get('oyl-greeting-digest')) customElements.define('oyl-greeting-digest', OylGreetingDigest)
}
