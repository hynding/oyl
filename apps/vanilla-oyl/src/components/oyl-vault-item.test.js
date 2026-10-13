import { describe, expect, it, beforeAll, vi } from 'vitest'
import { defineVaultItem } from './oyl-vault-item.js'

beforeAll(() => defineVaultItem())

/** @param {string} label @param {ReadonlyArray<string | null | undefined>} lines @param {() => void} [onDelete] */
function item(label, lines, onDelete = () => {}) {
  const el = /** @type {import('./oyl-vault-item.js').OylVaultItem} */ (document.createElement('oyl-vault-item'))
  el.label = label
  el.lines = lines
  el.onDelete = onDelete
  document.body.append(el)
  return el
}

describe('<oyl-vault-item>', () => {
  it('renders the label and non-empty lines, filtering falsy', () => {
    const el = item('Passport', ['passport', null, 'Expires 2026-08-30'])
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)
    const text = root.textContent ?? ''
    expect(text).toContain('Passport')
    expect(text).toContain('passport')
    expect(text).toContain('Expires 2026-08-30')
    expect(root.querySelectorAll('.line')).toHaveLength(2)
    el.remove()
  })

  it('inline-confirm delete: Delete → Yes calls onDelete; No reverts', () => {
    const onDelete = vi.fn()
    const el = item('Espresso', ['Kitchen'], onDelete)
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)

    ;/** @type {HTMLButtonElement} */ (root.querySelector('button[data-act="delete"]')).click()
    ;/** @type {HTMLButtonElement} */ (root.querySelector('button[data-act="confirm-no"]')).click()
    expect(root.querySelector('button[data-act="delete"]')).toBeTruthy()
    expect(onDelete).not.toHaveBeenCalled()

    ;/** @type {HTMLButtonElement} */ (root.querySelector('button[data-act="delete"]')).click()
    ;/** @type {HTMLButtonElement} */ (root.querySelector('button[data-act="confirm-yes"]')).click()
    expect(onDelete).toHaveBeenCalledTimes(1)
    el.remove()
  })
})
