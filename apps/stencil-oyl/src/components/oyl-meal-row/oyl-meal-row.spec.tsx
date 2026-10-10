import { render, h, describe, it, expect, vi } from '@stencil/vitest'
import { Consumption } from '@oyl/all-of-oyl'
import { consumptionMeta } from '../../nutrition/format.js'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
const at = new Date('2026-10-08T08:10:00')

describe('oyl-meal-row', () => {
  it('renders the label and the meta line', async () => {
    const c = new Consumption({ occurredAt: at, nutrients: { calories: 150, protein: 5 }, servings: 2 })
    const { root } = await render(<oyl-meal-row consumption={c} label="Oatmeal ×2" />)
    expect(q(root, '.title')).toHaveTextContent('Oatmeal ×2')
    expect(q(root, '.meta')).toHaveTextContent(consumptionMeta(c))
    expect(q(root, '[data-act="delete"]')).toHaveAttribute('aria-label', 'Delete Oatmeal ×2')
  })

  it('delete asks inline; No restores, Yes emits remove with the id', async () => {
    const c = new Consumption({ occurredAt: at, nutrients: { calories: 99 }, note: 'Snack' })
    const { root, waitForChanges } = await render(<oyl-meal-row consumption={c} label="Snack" />)
    const removed = vi.fn()
    root.addEventListener('remove', (e) => removed((e as CustomEvent).detail))
    click(q(root, '[data-act="delete"]')!)
    await waitForChanges()
    expect(q(root, '[role="group"]')).toHaveAttribute('aria-label', 'Delete?')
    expect(root.shadowRoot!.activeElement).toBe(q(root, '[data-act="confirm-no"]'))
    click(q(root, '[data-act="confirm-no"]')!)
    await waitForChanges()
    expect(q(root, '[role="group"]')).toBeNull()
    expect(removed).not.toHaveBeenCalled()
    click(q(root, '[data-act="delete"]')!)
    await waitForChanges()
    click(q(root, '[data-act="confirm-yes"]')!)
    expect(removed).toHaveBeenCalledWith(c.id)
  })
})
