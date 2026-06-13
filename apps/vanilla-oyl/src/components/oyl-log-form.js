import { Note, Measurement } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { signal } from '../lib/reactive/signal.js'
import { sheet } from './sheet.js'

/** @typedef {ReturnType<typeof import('../state/journal-store.js').createJournalStore>} JournalStore */
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */

const METRICS = ['body.weight_kg', 'sleep.hours', 'mood.score', 'screen.minutes', 'custom']

const styles = sheet(`
  form { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-2); padding: 1rem; }
  .seg { display: inline-flex; background: color-mix(in oklch, var(--color-text) 6%, transparent); border-radius: 999px; padding: .2rem; gap: .15rem; margin-block-end: .85rem; }
  .seg button { font: inherit; border: 0; background: none; cursor: pointer; padding: .3rem .9rem; border-radius: 999px; font-size: .85rem; font-weight: 550; color: var(--color-muted); }
  .seg button[aria-pressed="true"] { background: var(--color-surface); color: var(--color-text); }
  label { display: block; font-size: .85rem; color: var(--color-muted); margin-block-end: .25rem; }
  textarea, input, select { width: 100%; font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .6rem .7rem; }
  textarea { resize: vertical; min-block-size: 3.2rem; }
  .field { margin-block-end: .7rem; }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: .7rem; }
  .chips { display: flex; flex-wrap: wrap; gap: .35rem; margin-block-start: .4rem; }
  .chip { font-size: .72rem; font-weight: 600; color: var(--color-accent); background: color-mix(in oklch, var(--color-accent) 14%, transparent); border-radius: 999px; padding: .12rem .55rem; }
  .chip.bad { color: var(--color-danger); background: color-mix(in oklch, var(--color-danger) 14%, transparent); }
  .actions { display: flex; justify-content: flex-end; margin-block-start: .9rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1.1rem; font: inherit; font-weight: 600; cursor: pointer; }
  [data-role="error"]:not(:empty) { color: var(--color-danger); font-size: .85rem; margin-block-start: .5rem; }
`)

export class OylLogForm extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {JournalStore} */
    this.store = /** @type {JournalStore} */ (/** @type {unknown} */ (undefined))
    /** @type {() => DayKey} */
    this.getDay = () => /** @type {DayKey} */ (/** @type {unknown} */ (undefined))
    /** @type {() => void} */
    this.onLogged = () => {}
    this._type = signal('note')
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const formEl = document.createElement('form')

    const seg = document.createElement('div')
    seg.className = 'seg'
    seg.setAttribute('role', 'group')
    seg.setAttribute('aria-label', 'Entry type')
    const noteBtn = this._segButton('note', 'Note')
    const measBtn = this._segButton('measurement', 'Measurement')
    seg.append(noteBtn, measBtn)

    const noteFields = document.createElement('div')
    const textArea = this._textarea('text', 'A line about your day…')
    const tagsInput = this._input('tags', 'text')
    const chips = document.createElement('div')
    chips.className = 'chips'
    tagsInput.addEventListener('input', () => this._renderChips(chips, tagsInput.value), { signal: this.lifecycle })
    noteFields.append(this._labeled('text', 'What happened?', textArea), this._labeled('tags', 'Tags (optional, lowercase words)', tagsInput), chips)

    const measFields = document.createElement('div')
    measFields.hidden = true
    const metricSel = document.createElement('select')
    metricSel.name = 'metric'
    for (const m of METRICS) {
      const o = document.createElement('option')
      o.value = m
      o.textContent = m === 'custom' ? 'custom.…' : m
      metricSel.append(o)
    }
    const customInput = this._input('custom', 'text')
    customInput.placeholder = 'custom.your_metric'
    customInput.hidden = true
    metricSel.addEventListener('change', () => { customInput.hidden = metricSel.value !== 'custom' }, { signal: this.lifecycle })
    const valueInput = this._input('value', 'number')
    valueInput.setAttribute('inputmode', 'decimal')
    const row2 = document.createElement('div')
    row2.className = 'row2'
    row2.append(this._labeled('metric', 'Metric', metricSel), this._labeled('value', 'Value', valueInput))
    measFields.append(row2, this._labeled('custom', 'Custom metric key', customInput))

    const whenInput = this._input('when', 'datetime-local')

    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')

    const actions = document.createElement('div')
    actions.className = 'actions'
    const submit = document.createElement('button')
    submit.type = 'submit'
    submit.className = 'primary'
    submit.textContent = 'Log it'
    actions.append(submit)

    formEl.append(seg, noteFields, measFields, this._labeled('when', 'When', whenInput), error, actions)
    root.append(formEl)

    this.track(() => {
      const note = this._type.get() === 'note'
      noteFields.hidden = !note
      measFields.hidden = note
      noteBtn.setAttribute('aria-pressed', String(note))
      measBtn.setAttribute('aria-pressed', String(!note))
    })
    this._syncWhen(whenInput)

    formEl.addEventListener('submit', (e) => {
      e.preventDefault()
      void this._submit({ error, whenInput, textArea, tagsInput, metricSel, customInput, valueInput, chips, formEl })
    }, { signal: this.lifecycle })
    formEl.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (typeof formEl.requestSubmit === 'function') formEl.requestSubmit()
        else formEl.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
      }
    }, { signal: this.lifecycle })
  }

  /** @param {HTMLInputElement} whenInput */
  _syncWhen(whenInput) {
    const day = this.getDay()
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    whenInput.value = `${day.value}T${hh}:${mm}`
  }

  /**
   * @param {{ error: HTMLElement, whenInput: HTMLInputElement, textArea: HTMLTextAreaElement, tagsInput: HTMLInputElement, metricSel: HTMLSelectElement, customInput: HTMLInputElement, valueInput: HTMLInputElement, chips: HTMLElement, formEl: HTMLFormElement }} ctx
   */
  async _submit(ctx) {
    ctx.error.textContent = ''
    const occurredAt = new Date(ctx.whenInput.value)
    try {
      /** @type {import('@oyl/all-of-oyl').Entry} */
      let entry
      if (this._type.get() === 'note') {
        const tags = ctx.tagsInput.value.split(/[\s,]+/).filter(Boolean)
        entry = new Note({ occurredAt, text: ctx.textArea.value, tags })
      } else {
        const metric = ctx.metricSel.value === 'custom' ? ctx.customInput.value : ctx.metricSel.value
        entry = new Measurement({ occurredAt, metric, value: Number(ctx.valueInput.value) })
      }
      await this.store.add(entry)
      ctx.formEl.reset()
      this._syncWhen(ctx.whenInput)
      ctx.chips.replaceChildren()
      this.onLogged()
    } catch (err) {
      ctx.error.textContent = err instanceof Error ? err.message : String(err)
    }
  }

  /** @param {HTMLElement} mount @param {string} raw */
  _renderChips(mount, raw) {
    mount.replaceChildren()
    for (const t of raw.split(/[\s,]+/).filter(Boolean)) {
      const ok = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t)
      const chip = document.createElement('span')
      chip.className = ok ? 'chip' : 'chip bad'
      chip.textContent = t
      mount.append(chip)
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

  /** @param {string} name @param {string} placeholder @returns {HTMLTextAreaElement} */
  _textarea(name, placeholder) {
    const t = document.createElement('textarea')
    t.name = name
    t.placeholder = placeholder
    return t
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
export function defineLogForm() {
  if (!customElements.get('oyl-log-form')) customElements.define('oyl-log-form', OylLogForm)
}
