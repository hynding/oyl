import { render, h, describe, it, expect, vi } from '@stencil/vitest'
import { Note, Measurement } from '@oyl/all-of-oyl'

const at = new Date('2026-10-08T07:40:00')
const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))

describe('oyl-entry-row', () => {
  it('renders a note with time, kind, text and tag chips', async () => {
    const entry = new Note({ occurredAt: at, text: 'Morning run', tags: ['running', 'morning'] })
    const { root } = await render(<oyl-entry-row entry={entry} />)
    expect(q(root, '.time')).toHaveTextContent('07:40')
    expect(q(root, '.kind')).toHaveTextContent('Note')
    expect(q(root, '.text')).toHaveTextContent('Morning run')
    expect([...root.shadowRoot!.querySelectorAll('.chip')].map((c) => c.textContent)).toEqual(['running', 'morning'])
  })

  it('renders a measurement as metric = value unit, plus an annotation', async () => {
    const entry = new Measurement({ occurredAt: at, metric: 'body.weight_kg', value: 78.4, note: 'after coffee' })
    const { root } = await render(<oyl-entry-row entry={entry} />)
    expect(q(root, '.kind')).toHaveTextContent('Measurement')
    expect(q(root, '.measure')).toHaveTextContent('body.weight_kg = 78.4 kg')
    expect(q(root, '.annot')).toHaveTextContent('after coffee')
  })

  it('delete asks inline; No restores, Yes emits remove with the id', async () => {
    const entry = new Note({ occurredAt: at, text: 'Doomed' })
    const { root, waitForChanges } = await render(<oyl-entry-row entry={entry} />)
    const removed = vi.fn()
    root.addEventListener('remove', (e) => removed((e as CustomEvent).detail))
    click(q(root, '[data-act="delete"]')!)
    await waitForChanges()
    const group = q(root, '[role="group"]')!
    expect(group).toHaveAttribute('aria-label', 'Delete?')
    expect(q(root, '[data-act="confirm-no"]')).not.toBeNull()
    click(q(root, '[data-act="confirm-no"]')!)
    await waitForChanges()
    expect(q(root, '[role="group"]')).toBeNull()
    expect(q(root, '[data-act="delete"]')).not.toBeNull()
    expect(removed).not.toHaveBeenCalled()
    click(q(root, '[data-act="delete"]')!)
    await waitForChanges()
    click(q(root, '[data-act="confirm-yes"]')!)
    expect(removed).toHaveBeenCalledWith(entry.id)
  })
})
