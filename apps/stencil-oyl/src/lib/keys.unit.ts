import { describe, expect, it } from 'vitest'
import { isEditableTarget } from './keys.js'

const ev = (tagName: string, role?: string) =>
  ({ composedPath: () => [{ tagName, getAttribute: (n: string) => (n === 'role' ? role ?? null : null) }] }) as unknown as Event

describe('isEditableTarget', () => {
  it('is true for fields and radios (where arrow keys mean something else)', () => {
    expect(isEditableTarget(ev('INPUT'))).toBe(true)
    expect(isEditableTarget(ev('TEXTAREA'))).toBe(true)
    expect(isEditableTarget(ev('SELECT'))).toBe(true)
    expect(isEditableTarget(ev('BUTTON', 'radio'))).toBe(true)
  })
  it('is false elsewhere', () => {
    expect(isEditableTarget(ev('BUTTON'))).toBe(false)
    expect(isEditableTarget(ev('DIV'))).toBe(false)
    expect(isEditableTarget({ composedPath: () => [] } as unknown as Event)).toBe(false)
  })
})
