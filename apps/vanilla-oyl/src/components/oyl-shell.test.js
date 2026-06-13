import { describe, expect, it, beforeAll } from 'vitest'
import { defineShell } from './oyl-shell.js'

beforeAll(() => defineShell())

describe('<oyl-shell>', () => {
  it('renders a header with the title and named slots', () => {
    const el = document.createElement('oyl-shell')
    document.body.append(el)
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)
    expect(root.querySelector('header h1')?.textContent).toBe('OYL')
    expect(root.querySelector('slot[name="toolbar"]')).toBeTruthy()
    expect(root.querySelector('slot[name="main"]')).toBeTruthy()
    el.remove()
  })
})
