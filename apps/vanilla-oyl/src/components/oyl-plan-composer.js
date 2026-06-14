import { Task, Appointment, Cadence, DayKey } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { signal } from '../lib/reactive/signal.js'
import { sheet } from './sheet.js'

/** @typedef {ReturnType<typeof import('../state/planner-store.js').createPlannerStore>} PlannerStore */

const UNITS = ['days', 'weeks', 'months']

const styles = sheet(`
  form { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-2); padding: 1rem; }
  .seg { display: inline-flex; background: color-mix(in oklch, var(--color-text) 6%, transparent); border-radius: 999px; padding: .2rem; gap: .15rem; margin-block-end: .85rem; }
  .seg button { font: inherit; border: 0; background: none; cursor: pointer; padding: .3rem .9rem; border-radius: 999px; font-size: .85rem; font-weight: 550; color: var(--color-muted); }
  .seg button[aria-pressed="true"] { background: var(--color-surface); color: var(--color-text); }
  label { display: block; font-size: .85rem; color: var(--color-muted); margin-block-end: .25rem; }
  input, select { width: 100%; font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .6rem .7rem; }
  .field { margin-block-end: .7rem; }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: .7rem; }
  .repeat { display: flex; align-items: center; gap: .5rem; font-size: .85rem; color: var(--color-muted); flex-wrap: wrap; }
  .repeat input[type="checkbox"] { width: auto; }
  .repeat input[type="number"] { width: 4.5rem; }
  .repeat select { width: auto; }
  .actions { display: flex; justify-content: flex-end; margin-block-start: .9rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1.1rem; font: inherit; font-weight: 600; cursor: pointer; }
  [data-role="error"]:not(:empty) { color: var(--color-danger); font-size: .85rem; margin-block-start: .5rem; }
`)

export class OylPlanComposer extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {PlannerStore} */
    this.store = /** @type {PlannerStore} */ (/** @type {unknown} */ (undefined))
    /** @type {string} */
    this.tz = 'UTC'
    /** @type {() => DayKey} */
    this.getDay = () => /** @type {DayKey} */ (/** @type {unknown} */ (undefined))
    /** @type {() => void} */
    this.onAdded = () => {}
    this._type = signal('task')
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const formEl = document.createElement('form')

    const seg = document.createElement('div')
    seg.className = 'seg'
    seg.setAttribute('role', 'group')
    seg.setAttribute('aria-label', 'Plan type')
    const taskBtn = this._segButton('task', 'Task')
    const apptBtn = this._segButton('appointment', 'Appointment')
    seg.append(taskBtn, apptBtn)

    const title = this._input('title', 'text')

    const taskFields = document.createElement('div')
    const due = this._input('due', 'date')
    const repeat = this._input('repeat', 'checkbox')
    const repeatN = this._input('repeatN', 'number')
    repeatN.value = '1'
    repeatN.min = '1'
    repeatN.disabled = true
    const repeatUnit = document.createElement('select')
    repeatUnit.name = 'repeatUnit'
    repeatUnit.disabled = true
    for (const u of UNITS) {
      const o = document.createElement('option')
      o.value = u
      o.textContent = u
      repeatUnit.append(o)
    }
    repeat.addEventListener('change', () => { repeatN.disabled = !repeat.checked; repeatUnit.disabled = !repeat.checked }, { signal: this.lifecycle })
    const repeatRow = document.createElement('div')
    repeatRow.className = 'repeat'
    const repeatLabel = document.createElement('label')
    repeatLabel.style.margin = '0'
    repeatLabel.textContent = 'Repeat'
    repeatLabel.append(repeat)
    repeatRow.append(repeatLabel, repeatN, repeatUnit)
    taskFields.append(this._labeled('due', 'Due', due), repeatRow)

    const apptFields = document.createElement('div')
    apptFields.hidden = true
    const startsAt = this._input('startsAt', 'datetime-local')
    const duration = this._input('duration', 'number')
    duration.min = '1'
    const apptRow = document.createElement('div')
    apptRow.className = 'row2'
    apptRow.append(this._labeled('startsAt', 'Starts', startsAt), this._labeled('duration', 'Minutes (optional)', duration))
    apptFields.append(apptRow)

    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')

    const actions = document.createElement('div')
    actions.className = 'actions'
    const submit = document.createElement('button')
    submit.type = 'submit'
    submit.className = 'primary'
    submit.textContent = 'Add to plan'
    actions.append(submit)

    formEl.append(seg, this._labeled('title', 'Title', title), taskFields, apptFields, error, actions)
    root.append(formEl)

    this.track(() => {
      const isTask = this._type.get() === 'task'
      taskFields.hidden = !isTask
      apptFields.hidden = isTask
      taskBtn.setAttribute('aria-pressed', String(isTask))
      apptBtn.setAttribute('aria-pressed', String(!isTask))
    })
    this._syncDefaults(due, startsAt)

    formEl.addEventListener('submit', (e) => {
      e.preventDefault()
      void this._submit({ error, title, due, repeat, repeatN, repeatUnit, startsAt, duration, formEl })
    }, { signal: this.lifecycle })
    formEl.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (typeof formEl.requestSubmit === 'function') formEl.requestSubmit()
        else formEl.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
      }
    }, { signal: this.lifecycle })
  }

  /** @param {HTMLInputElement} due @param {HTMLInputElement} startsAt */
  _syncDefaults(due, startsAt) {
    const day = this.getDay().value
    due.value = day
    startsAt.value = `${day}T09:00`
  }

  /**
   * @param {{ error: HTMLElement, title: HTMLInputElement, due: HTMLInputElement, repeat: HTMLInputElement,
   *   repeatN: HTMLInputElement, repeatUnit: HTMLSelectElement, startsAt: HTMLInputElement, duration: HTMLInputElement,
   *   formEl: HTMLFormElement }} ctx
   */
  async _submit(ctx) {
    ctx.error.textContent = ''
    ctx.title.removeAttribute('aria-invalid')
    try {
      /** @type {import('@oyl/all-of-oyl').Plan} */
      let plan
      if (this._type.get() === 'task') {
        const props = /** @type {{ title: string, due?: import('@oyl/all-of-oyl').DayKey, cadence?: import('@oyl/all-of-oyl').Cadence }} */ ({ title: ctx.title.value })
        if (ctx.due.value) props.due = DayKey.of(ctx.due.value)
        if (ctx.repeat.checked) props.cadence = Cadence.of(Number(ctx.repeatN.value), /** @type {any} */ (ctx.repeatUnit.value))
        plan = new Task(props)
      } else {
        const props = /** @type {{ title: string, startsAt: Date, durationMinutes?: number, tz: string }} */ ({ title: ctx.title.value, startsAt: new Date(ctx.startsAt.value), tz: this.tz })
        if (ctx.duration.value) props.durationMinutes = Number(ctx.duration.value)
        plan = new Appointment(props)
      }
      await this.store.add(plan)
      ctx.formEl.reset()
      this._syncDefaults(ctx.due, ctx.startsAt)
      ctx.repeatN.disabled = true
      ctx.repeatUnit.disabled = true
      this.onAdded()
    } catch (err) {
      ctx.error.textContent = err instanceof Error ? err.message : String(err)
      ctx.title.setAttribute('aria-invalid', 'true')
      ctx.title.setAttribute('aria-describedby', 'plan-error')
      ctx.error.id = 'plan-error'
    }
  }

  /** @param {string} type @param {string} label @returns {HTMLButtonElement} */
  _segButton(type, label) {
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.type = type
    b.textContent = label
    b.addEventListener('click', () => this._type.set(type), { signal: this.lifecycle })
    return b
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
    control.id = forName
    wrap.append(label, control)
    return wrap
  }
}

/** Register the element (idempotent). */
export function definePlanComposer() {
  if (!customElements.get('oyl-plan-composer')) customElements.define('oyl-plan-composer', OylPlanComposer)
}
