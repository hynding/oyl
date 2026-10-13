import { describe, it, expect, vi, beforeAll } from 'vitest'
import { defineConnection } from './oyl-connection.js'

beforeAll(() => defineConnection())

/** @param {Partial<import('./oyl-connection.js').ConnectionConfig>} [over] */
function mount(over = {}) {
  const el = /** @type {any} */ (document.createElement('oyl-connection'))
  el.connection = {
    mode: 'local',
    apiBaseUrl: 'http://localhost:1340/api',
    defaultApiBaseUrl: 'http://localhost:1340/api',
    onApply: vi.fn(),
    ...over,
  }
  document.body.append(el)
  return el
}

/** @param {any} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)
/** @param {any} el */
const seg = (el) => root(el).querySelector('.seg[role="group"]')
/** @param {any} el @param {string} v */
const segBtn = (el, v) => /** @type {HTMLButtonElement} */ (root(el).querySelector(`.seg button[data-value="${v}"]`))
/** @param {any} el */
const urlInput = (el) => /** @type {HTMLInputElement} */ (root(el).querySelector('input[type="url"]'))
/** @param {any} el */
const applyBtn = (el) => /** @type {HTMLButtonElement} */ (root(el).querySelector('button.primary'))
/** @param {any} el */
const errorText = (el) => (root(el).querySelector('[data-role="error"]')?.textContent ?? '')

describe('<oyl-connection>', () => {
  it('renders the seg with saved mode pressed and the url reflected', () => {
    const el = mount({ mode: 'remote', apiBaseUrl: 'http://x/api' })
    expect(seg(el)).toBeTruthy()
    expect(segBtn(el, 'remote').getAttribute('aria-pressed')).toBe('true')
    expect(segBtn(el, 'local').getAttribute('aria-pressed')).toBe('false')
    expect(urlInput(el).value).toBe('http://x/api')
    expect(urlInput(el).placeholder).toBe('http://localhost:1340/api')
    el.remove()
  })

  it('disables Apply until something changes, and re-disables on revert', () => {
    const el = mount()
    expect(applyBtn(el).disabled).toBe(true)
    segBtn(el, 'remote').click()
    expect(applyBtn(el).disabled).toBe(false)
    expect(segBtn(el, 'remote').getAttribute('aria-pressed')).toBe('true')
    segBtn(el, 'local').click()
    expect(applyBtn(el).disabled).toBe(true) // back to saved mode
    const input = urlInput(el)
    input.value = 'http://changed/api'
    input.dispatchEvent(new Event('input'))
    expect(applyBtn(el).disabled).toBe(false)
    input.value = 'http://localhost:1340/api' // back to saved
    input.dispatchEvent(new Event('input'))
    expect(applyBtn(el).disabled).toBe(true)
    el.remove()
  })

  it('applies a valid changed config via onApply', () => {
    const onApply = vi.fn()
    const el = mount({ onApply })
    segBtn(el, 'remote').click()
    const input = urlInput(el)
    input.value = 'https://api.example.com/api'
    input.dispatchEvent(new Event('input'))
    applyBtn(el).click()
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledWith('remote', 'https://api.example.com/api')
    el.remove()
  })

  it('rejects an invalid url inline and does not apply', () => {
    const onApply = vi.fn()
    const el = mount({ onApply })
    const input = urlInput(el)
    for (const bad of ['not a url', 'localhost:1340/api']) {
      input.value = bad
      input.dispatchEvent(new Event('input'))
      applyBtn(el).click()
      expect(onApply).not.toHaveBeenCalled()
      expect(errorText(el)).toMatch(/valid/i)
    }
    el.remove()
  })

  it('treats an empty url as apply-default', () => {
    const onApply = vi.fn()
    const el = mount({ onApply })
    segBtn(el, 'remote').click()
    const input = urlInput(el)
    input.value = ''
    input.dispatchEvent(new Event('input'))
    applyBtn(el).click()
    expect(onApply).toHaveBeenCalledWith('remote', '')
    el.remove()
  })
})
