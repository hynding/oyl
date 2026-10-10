import { render, h, describe, it, expect, vi } from '@stencil/vitest'
import { Budget, Money } from '@oyl/all-of-oyl'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
const usd = (major: number) => Money.fromMajor(major, 'USD')
const status = (ratio: number, met: boolean, spent: number) => ({ progress: { current: spent, target: 150, ratio, met, paused: false, empty: false } as never, spent: usd(spent) })

describe('oyl-budget-row', () => {
  it('renders the category, the bar and the label when under budget', async () => {
    const budget = new Budget({ category: 'dining', limit: usd(150) })
    const { root } = await render(<oyl-budget-row budget={budget} status={status(0.62, true, 93)} />)
    expect(q(root, '.title')).toHaveTextContent('dining')
    expect((q(root, '.fill') as HTMLElement).style.getPropertyValue('inline-size')).toBe('62%')
    expect(q(root, '.bar')).not.toHaveClass('over')
    expect(q(root, '.label')).toHaveTextContent('$93.00 of $150.00 · $57.00 left')
  })

  it('prefers the name and marks over-budget', async () => {
    const budget = new Budget({ name: 'Eating out', category: 'dining', limit: usd(150) })
    const { root } = await render(<oyl-budget-row budget={budget} status={status(1, false, 200)} />)
    expect(q(root, '.title')).toHaveTextContent('Eating out')
    expect(q(root, '.bar')).toHaveClass('over')
    expect(q(root, '.label')).toHaveClass('over')
    expect(q(root, '.label')).toHaveTextContent('over by $50.00')
  })

  it('delete asks inline; Yes emits remove with the id', async () => {
    const budget = new Budget({ category: 'dining', limit: usd(150) })
    const { root, waitForChanges } = await render(<oyl-budget-row budget={budget} status={status(0, true, 0)} />)
    const removed = vi.fn()
    root.addEventListener('remove', (e) => removed((e as CustomEvent).detail))
    click(q(root, '[data-act="delete"]')!)
    await waitForChanges()
    expect(q(root, '[role="group"]')).toHaveAttribute('aria-label', 'Delete?')
    click(q(root, '[data-act="confirm-no"]')!)
    await waitForChanges()
    expect(removed).not.toHaveBeenCalled()
    click(q(root, '[data-act="delete"]')!)
    await waitForChanges()
    click(q(root, '[data-act="confirm-yes"]')!)
    expect(removed).toHaveBeenCalledWith(budget.id)
  })
})
