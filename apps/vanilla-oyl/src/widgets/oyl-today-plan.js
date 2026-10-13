import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from '../components/sheet.js'
import { badgeStyles, SAMPLE, sampleBadge, withSample } from './sample-data.js'

const styles = sheet(`
  :host { display: block; }
  .wrap { position: relative; display: grid; gap: var(--space-1); min-inline-size: 10rem; }
  .k { font-size: var(--step--1); color: var(--color-muted); }
  .progress { font-size: var(--step-1); font-weight: 700; font-variant-numeric: tabular-nums; }
  .bar { block-size: .35rem; background: color-mix(in oklch, var(--color-text) 10%, transparent); border-radius: 999px; overflow: hidden; }
  .fill { block-size: 100%; inline-size: 0; background: var(--color-accent); }
  .next { font-size: var(--step--1); color: var(--color-text); }
`)

export class OylTodayPlan extends OylElement {
  static styles = [badgeStyles, styles]

  constructor() {
    super()
    /** @type {import('./context.js').WidgetContext} */
    this.context = /** @type {import('./context.js').WidgetContext} */ (/** @type {unknown} */ (undefined))
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    this.track(() => {
      const plans = this.context.plansOn(this.context.today())
      const real = {
        done: plans.filter((p) => p.status === 'done').length,
        total: plans.length,
        next: plans.find((p) => p.status === 'open')?.label,
      }
      const { value, sample } = withSample(plans.length === 0, real, SAMPLE.todayPlan)

      const wrap = document.createElement('div')
      wrap.className = 'wrap'
      const k = document.createElement('div')
      k.className = 'k'
      k.textContent = "Today's plan"
      const progress = document.createElement('div')
      progress.className = 'progress'
      progress.textContent = `${value.done}/${value.total}`
      const bar = document.createElement('div')
      bar.className = 'bar'
      const fill = document.createElement('div')
      fill.className = 'fill'
      fill.style.setProperty('inline-size', `${Math.round((value.done / Math.max(value.total, 1)) * 100)}%`)
      bar.append(fill)
      const next = document.createElement('div')
      next.className = 'next'
      next.textContent = value.next ? `next: ${value.next}` : 'All done 🎉'
      wrap.append(k, progress, bar, next)
      if (sample) wrap.append(sampleBadge())
      root.replaceChildren(wrap)
    })
  }
}

/** Register the element (idempotent). */
export function defineTodayPlan() {
  if (!customElements.get('oyl-today-plan')) customElements.define('oyl-today-plan', OylTodayPlan)
}
