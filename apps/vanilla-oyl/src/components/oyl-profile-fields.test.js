import { describe, expect, it, beforeAll, afterEach, vi } from 'vitest'
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

  describe('timezones missing from Intl.supportedValuesOf (it omits "UTC")', () => {
    /** Pin both the zone list and the system tz so the behaviour is machine-independent. @param {string} systemTz */
    function stubIntl(systemTz) {
      const real = Intl.DateTimeFormat.prototype.resolvedOptions
      vi.spyOn(/** @type {any} */ (Intl), 'supportedValuesOf').mockReturnValue(['Africa/Abidjan', 'America/Los_Angeles'])
      vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(
        /** @this {Intl.DateTimeFormat} */ function () { return { ...real.call(this), timeZone: systemTz } },
      )
    }
    afterEach(() => { vi.restoreAllMocks() })

    it('keeps a UTC system tz instead of falling back to the first listed zone', () => {
      stubIntl('UTC')
      const el = mount()
      const tz = el.shadowRoot.querySelector('[name="timezone"]')
      expect(tz.value).toBe('UTC')
      el.remove()
    })

    it('keeps a saved timezone the list does not contain, so saving does not rewrite it', () => {
      stubIntl('America/Los_Angeles')
      const el = mount({ timezone: 'Asia/Calcutta' })
      const tz = el.shadowRoot.querySelector('[name="timezone"]')
      expect(tz.value).toBe('Asia/Calcutta')
      expect(el.getValues().timezone).toBe('Asia/Calcutta')
      el.remove()
    })

    it('still offers every listed zone after the kept one', () => {
      stubIntl('UTC')
      const el = mount()
      const values = [...el.shadowRoot.querySelectorAll('[name="timezone"] option')].map((o) => o.value)
      expect(values).toEqual(['UTC', 'Africa/Abidjan', 'America/Los_Angeles'])
      el.remove()
    })
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
