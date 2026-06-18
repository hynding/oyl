import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

const KG_PER_LB = 0.45359237
const CM_PER_IN = 2.54
const GENDERS = ['female', 'male', 'non-binary', 'prefer not to say']

const styles = sheet(`
  .grid { display: grid; gap: .5rem; max-inline-size: 28rem; }
  label { display: grid; gap: .2rem; font-size: .85rem; color: var(--color-muted); }
  input, select { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .45rem .55rem; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1rem; font: inherit; font-weight: 600; cursor: pointer; justify-self: start; }
`)

export class OylProfileFields extends OylElement {
  static styles = [styles]
  constructor() {
    super()
    /** @type {Record<string, any>} */
    this.value = {}
    /** @type {boolean} */
    this.showSave = false
    /** @type {(patch: Record<string, any>) => void} */
    this.onSave = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const grid = document.createElement('div'); grid.className = 'grid'
    const v = this.value || {}
    const sysTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

    const tz = this._tzControl(v.timezone ?? sysTz)
    const units = this._select('units', 'Units', [['metric', 'Metric (kg, cm)'], ['imperial', 'Imperial (lb, ft/in)']], v.units ?? 'metric')
    const birthday = this._input('birthday', 'date', 'Birthday', v.birthday ?? '')
    const isImperial = () => /** @type {HTMLSelectElement} */ (units).value === 'imperial'
    const weight = this._input('weight', 'number', 'Weight', v.weightKg != null ? String(v.units === 'imperial' ? round1(v.weightKg / KG_PER_LB) : v.weightKg) : '')
    const height = this._input('height', 'number', 'Height', v.heightCm != null ? String(v.units === 'imperial' ? round1(v.heightCm / CM_PER_IN) : v.heightCm) : '')
    const gender = this._genderControl(v.gender ?? '')
    const location = this._input('location', 'text', 'Location', v.location ?? '')

    grid.append(
      this._field('Timezone', tz),
      this._field('Units', units),
      this._field('Birthday', birthday),
      this._field('Weight', weight),
      this._field('Height', height),
      this._field('Gender', gender),
      this._field('Location', location),
    )
    // Relabel weight/height units live.
    const sync = () => {
      weight.placeholder = isImperial() ? 'Weight (lb)' : 'Weight (kg)'
      height.placeholder = isImperial() ? 'Height (in)' : 'Height (cm)'
    }
    units.addEventListener('change', sync, { signal: this.lifecycle }); sync()

    if (this.showSave) {
      const save = document.createElement('button')
      save.className = 'primary'; save.dataset.act = 'save'; save.textContent = 'Save profile'
      save.addEventListener('click', () => this.onSave(this.getValues()), { signal: this.lifecycle })
      grid.append(save)
    }
    root.append(grid)
  }

  /** @returns {Record<string, any>} */
  getValues() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const get = (/** @type {string} */ n) => /** @type {HTMLInputElement|HTMLSelectElement} */ (root.querySelector(`[name="${n}"]`)).value.trim()
    const units = /** @type {'metric'|'imperial'} */ (get('units'))
    /** @type {Record<string, any>} */
    const patch = { timezone: get('timezone'), units }
    const birthday = get('birthday'); if (birthday) patch.birthday = birthday
    const w = Number(get('weight')); if (get('weight') && Number.isFinite(w) && w > 0) patch.weightKg = units === 'imperial' ? round1(w * KG_PER_LB) : w
    const h = Number(get('height')); if (get('height') && Number.isFinite(h) && h > 0) patch.heightCm = units === 'imperial' ? round1(h * CM_PER_IN) : h
    const genderSel = /** @type {HTMLSelectElement} */ (root.querySelector('[name="gender"]')).value
    if (genderSel === '__other__') {
      const t = /** @type {HTMLInputElement} */ (root.querySelector('[name="gender-other"]')).value.trim()
      if (t) patch.gender = t
    } else if (genderSel) { patch.gender = genderSel }
    const location = get('location'); if (location) patch.location = location
    return patch
  }

  /** @param {string} labelText @param {HTMLElement} control @returns {HTMLLabelElement} */
  _field(labelText, control) {
    const l = document.createElement('label'); l.append(labelText, control); return l
  }
  /** @param {string} name @param {string} type @param {string} label @param {string} val @returns {HTMLInputElement} */
  _input(name, type, label, val) {
    const i = document.createElement('input'); i.name = name; i.type = type; i.placeholder = label; i.setAttribute('aria-label', label); i.value = val; return i
  }
  /** @param {string} name @param {string} label @param {Array<[string,string]>} opts @param {string} val @returns {HTMLSelectElement} */
  _select(name, label, opts, val) {
    const s = document.createElement('select'); s.name = name; s.setAttribute('aria-label', label)
    for (const [value, text] of opts) { const o = document.createElement('option'); o.value = value; o.textContent = text; s.append(o) }
    s.value = val; return s
  }
  /** @param {string} val @returns {HTMLElement} */
  _tzControl(val) {
    const zones = typeof (/** @type {any} */ (Intl).supportedValuesOf) === 'function'
      ? /** @type {string[]} */ (/** @type {any} */ (Intl).supportedValuesOf('timeZone')) : null
    if (!zones) return this._input('timezone', 'text', 'Timezone (IANA)', val)
    const s = this._select('timezone', 'Timezone', zones.map((z) => [z, z]), zones.includes(val) ? val : (zones[0] ?? ''))
    return s
  }
  /** Gender = a select plus an "Other" self-describe text input revealed when "Other" is chosen. @param {string} val @returns {HTMLElement} */
  _genderControl(val) {
    const wrap = document.createElement('div')
    wrap.style.display = 'grid'; wrap.style.gap = '.35rem'
    const isOther = val !== '' && !GENDERS.includes(val)
    const opts = /** @type {Array<[string,string]>} */ ([['', '—'], ...GENDERS.map((g) => [g, g]), ['__other__', 'Other']])
    const select = this._select('gender', 'Gender', opts, isOther ? '__other__' : val)
    const other = this._input('gender-other', 'text', 'Self-describe', isOther ? val : '')
    other.hidden = !isOther
    select.addEventListener('change', () => { other.hidden = select.value !== '__other__' }, { signal: this.lifecycle })
    wrap.append(select, other)
    return wrap
  }
}

/** @param {number} n @returns {number} */
function round1(n) { return Math.round(n * 10) / 10 }

/** Register the element (idempotent). */
export function defineProfileFields() {
  if (!customElements.get('oyl-profile-fields')) customElements.define('oyl-profile-fields', OylProfileFields)
}
