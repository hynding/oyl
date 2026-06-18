import { describe, expect, it, beforeAll, vi } from 'vitest'
import { defineProfileFields } from './oyl-profile-fields.js'

beforeAll(() => defineProfileFields())

/** @returns {any} */
function mount(value = {}, showSave = false, onSave = () => {}) {
  const el = /** @type {any} */ (document.createElement('oyl-profile-fields'))
  el.value = value; el.showSave = showSave; el.onSave = onSave
  document.body.append(el)
  return el
}

describe('<oyl-profile-fields>', () => {
  it('defaults the timezone field to the system tz', () => {
    const el = mount()
    const tz = el.shadowRoot.querySelector('[name="timezone"]')
    expect(tz.value).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
    el.remove()
  })

  it('getValues returns canonical metric values', () => {
    const el = mount({ units: 'metric' })
    const root = el.shadowRoot
    root.querySelector('[name="weight"]').value = '80'
    root.querySelector('[name="height"]').value = '180'
    root.querySelector('[name="gender"]').value = 'female'
    const v = el.getValues()
    expect(v.weightKg).toBe(80)
    expect(v.heightCm).toBe(180)
    expect(v.gender).toBe('female')
    el.remove()
  })

  it('omits empty optional fields from getValues', () => {
    const el = mount()
    const v = el.getValues()
    expect('weightKg' in v).toBe(false)
    expect('birthday' in v).toBe(false)
    el.remove()
  })

  it('captures a self-described gender via the Other free-text input', () => {
    const el = mount({})
    const root = el.shadowRoot
    const select = root.querySelector('[name="gender"]')
    select.value = '__other__'
    select.dispatchEvent(new Event('change'))
    const other = root.querySelector('[name="gender-other"]')
    expect(other.hidden).toBe(false)
    other.value = 'agender'
    expect(el.getValues().gender).toBe('agender')
    el.remove()
  })

  it('hydrates an unknown stored gender into the Other input', () => {
    const el = mount({ gender: 'genderfluid' })
    const root = el.shadowRoot
    expect(root.querySelector('[name="gender"]').value).toBe('__other__')
    expect(root.querySelector('[name="gender-other"]').value).toBe('genderfluid')
    el.remove()
  })

  it('renders a Save button that emits the patch when showSave', () => {
    const onSave = vi.fn()
    const el = mount({}, true, onSave)
    el.shadowRoot.querySelector('[data-act="save"]').click()
    expect(onSave).toHaveBeenCalledTimes(1)
    el.remove()
  })
})
