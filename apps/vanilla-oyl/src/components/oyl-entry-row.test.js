import { describe, expect, it, beforeAll, vi } from 'vitest'
import { Note, Measurement } from '@oyl/all-of-oyl'
import { defineEntryRow } from './oyl-entry-row.js'

beforeAll(() => defineEntryRow())

/**
 * @param {import('@oyl/all-of-oyl').Entry} entry
 * @param {(id: import('@oyl/all-of-oyl').Id) => void} [onDelete]
 */
function row(entry, onDelete = () => {}) {
  const el = /** @type {import('./oyl-entry-row.js').OylEntryRow} */ (document.createElement('oyl-entry-row'))
  el.entry = entry
  el.onDelete = onDelete
  document.body.append(el)
  return el
}

describe('<oyl-entry-row>', () => {
  it('renders a note with text and tags', () => {
    const el = row(new Note({ occurredAt: new Date('2026-06-10T08:14:00Z'), text: 'Calm morning', tags: ['gratitude'] }))
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)
    const text = root.textContent ?? ''
    expect(text).toContain('Calm morning')
    expect(text).toContain('gratitude')
    expect(text.toLowerCase()).toContain('note')
    el.remove()
  })

  it('renders a measurement as metric = value', () => {
    const el = row(new Measurement({ occurredAt: new Date('2026-06-10T07:30:00Z'), metric: 'body.weight_kg', value: 81.4 }))
    const text = /** @type {ShadowRoot} */ (el.shadowRoot).textContent ?? ''
    expect(text).toContain('body.weight_kg')
    expect(text).toContain('81.4')
    el.remove()
  })

  it('inline-confirm delete: Delete → Yes calls onDelete(id); No reverts', () => {
    const note = new Note({ occurredAt: new Date('2026-06-10T08:14:00Z'), text: 'x' })
    const onDelete = vi.fn()
    const el = row(note, onDelete)
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)

    ;/** @type {HTMLButtonElement} */ (root.querySelector('button[data-act="delete"]')).click()
    ;/** @type {HTMLButtonElement} */ (root.querySelector('button[data-act="confirm-no"]')).click()
    expect(root.querySelector('button[data-act="delete"]')).toBeTruthy()
    expect(onDelete).not.toHaveBeenCalled()

    ;/** @type {HTMLButtonElement} */ (root.querySelector('button[data-act="delete"]')).click()
    ;/** @type {HTMLButtonElement} */ (root.querySelector('button[data-act="confirm-yes"]')).click()
    expect(onDelete).toHaveBeenCalledWith(note.id)
    el.remove()
  })
})
