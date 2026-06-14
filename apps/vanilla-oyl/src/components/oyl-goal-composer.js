import { Goal } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { metricUnit } from '../goal/format.js'

/** @typedef {ReturnType<typeof import('../state/goals-store.js').createGoalsStore>} GoalsStore */

const PRESETS = [
  { label: 'Sleep (hours)', metric: 'sleep.hours', direction: 'atLeast', aggregation: 'sum', period: 'day' },
  { label: 'Weight (kg)', metric: 'body.weight_kg', direction: 'atMost', aggregation: 'last', period: 'day' },
  { label: 'Calories', metric: 'nutrition.calories', direction: 'atMost', aggregation: 'sum', period: 'day' },
  { label: 'Run minutes', metric: 'activity.run.minutes', direction: 'atLeast', aggregation: 'sum', period: 'week' },
  { label: 'Screen time (min)', metric: 'screen.minutes', direction: 'atMost', aggregation: 'sum', period: 'day' },
]
const PERIODS = ['day', 'week', 'month']

const styles = sheet(`
  form { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-2); padding: 1rem; }
  label { display: block; font-size: .85rem; color: var(--color-muted); margin-block-end: .25rem; }
  input, select { width: 100%; font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .6rem .7rem; }
  .field { margin-block-end: .7rem; }
  .target { display: grid; grid-template-columns: 1fr auto; gap: .5rem; align-items: center; }
  .unit { color: var(--color-muted); font-size: .9rem; }
  .actions { display: flex; justify-content: flex-end; margin-block-start: .9rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1.1rem; font: inherit; font-weight: 600; cursor: pointer; }
  [data-role="error"]:not(:empty) { color: var(--color-danger); font-size: .85rem; margin-block-start: .5rem; }
`)

export class OylGoalComposer extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {GoalsStore} */
    this.store = /** @type {GoalsStore} */ (/** @type {unknown} */ (undefined))
    /** @type {() => void} */
    this.onAdded = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const formEl = document.createElement('form')

    const preset = document.createElement('select')
    preset.name = 'preset'
    PRESETS.forEach((p, i) => {
      const o = document.createElement('option')
      o.value = String(i)
      o.textContent = p.label
      preset.append(o)
    })

    const name = this._input('name', 'text')
    const target = this._input('target', 'number')
    target.min = '0'
    target.step = 'any'
    const unit = document.createElement('span')
    unit.className = 'unit'
    const targetWrap = document.createElement('div')
    targetWrap.className = 'target'
    targetWrap.append(target, unit)

    const period = document.createElement('select')
    period.name = 'period'
    for (const pr of PERIODS) {
      const o = document.createElement('option')
      o.value = pr
      o.textContent = pr
      period.append(o)
    }

    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')

    const actions = document.createElement('div')
    actions.className = 'actions'
    const submit = document.createElement('button')
    submit.type = 'submit'
    submit.className = 'primary'
    submit.textContent = 'Add goal'
    actions.append(submit)

    formEl.append(
      this._labeled('preset', 'Metric', preset),
      this._labeled('name', 'Name (optional)', name),
      this._labeled('target', 'Target', targetWrap),
      this._labeled('period', 'Period', period),
      error, actions,
    )
    root.append(formEl)

    const applyPreset = () => {
      const p = PRESETS[Number(preset.value)]
      if (!p) return
      unit.textContent = metricUnit(p.metric)
      period.value = p.period
    }
    applyPreset()
    preset.addEventListener('change', applyPreset, { signal: this.lifecycle })

    formEl.addEventListener('submit', (e) => {
      e.preventDefault()
      void this._submit({ error, preset, name, target, period })
    }, { signal: this.lifecycle })
  }

  /** @param {{ error: HTMLElement, preset: HTMLSelectElement, name: HTMLInputElement, target: HTMLInputElement, period: HTMLSelectElement }} ctx */
  async _submit(ctx) {
    ctx.error.textContent = ''
    try {
      const p = PRESETS[Number(ctx.preset.value)]
      if (!p) return
      const props = /** @type {{ metric: string, target: number, direction: any, aggregation: any, period: any, name?: string }} */ ({
        metric: p.metric,
        target: Number(ctx.target.value),
        direction: p.direction,
        aggregation: p.aggregation,
        period: ctx.period.value,
      })
      if (ctx.name.value) props.name = ctx.name.value
      await this.store.add(new Goal(props))
      ctx.name.value = ''
      ctx.target.value = ''
      this.onAdded()
    } catch (err) {
      ctx.error.textContent = err instanceof Error ? err.message : String(err)
    }
  }

  /** @param {string} name @param {string} type @returns {HTMLInputElement} */
  _input(name, type) {
    const i = document.createElement('input')
    i.name = name
    i.type = type
    return i
  }

  /** @param {string} forName @param {string} text @param {HTMLElement} control @returns {HTMLElement} */
  _labeled(forName, text, control) {
    const wrap = document.createElement('div')
    wrap.className = 'field'
    const label = document.createElement('label')
    label.textContent = text
    label.htmlFor = forName
    if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) control.id = forName
    wrap.append(label, control)
    return wrap
  }
}

/** Register the element (idempotent). */
export function defineGoalComposer() {
  if (!customElements.get('oyl-goal-composer')) customElements.define('oyl-goal-composer', OylGoalComposer)
}
