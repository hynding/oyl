import { render, h, describe, it, expect, vi } from '@stencil/vitest'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const qa = (root: HTMLElement, sel: string) => [...root.shadowRoot!.querySelectorAll(sel)]
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))

describe('oyl-item-row', () => {
  it('renders the label, the non-blank lines and a toned value', async () => {
    const { root } = await render(<oyl-item-row itemId="t1" label="groceries" lines={['Oct 8 · Checking', undefined, '', 'weekly shop']} value="+$12.34" tone="ok" />)
    expect(q(root, '.title')).toHaveTextContent('groceries')
    expect(qa(root, '.line').map((l) => l.textContent)).toEqual(['Oct 8 · Checking', 'weekly shop'])
    expect(q(root, '.value')).toHaveTextContent('+$12.34')
    expect(q(root, '.value')).toHaveClass('ok')
    expect(q(root, '[data-act="delete"]')).toHaveAttribute('aria-label', 'Delete groceries')
  })

  it('omits the value column and honours a custom remove label', async () => {
    const { root } = await render(<oyl-item-row itemId="a1" label="Checking" lines={['USD']} removeLabel="Delete account Checking" />)
    expect(q(root, '.value')).toBeNull()
    expect(q(root, '[data-act="delete"]')).toHaveAttribute('aria-label', 'Delete account Checking')
  })

  it('renders an optional secondary action that emits act without opening the confirm', async () => {
    const plain = await render(<oyl-item-row itemId="s1" label="StreamFlix" lines={[]} />)
    expect(qa(plain.root, '[data-act]').map((b) => b.getAttribute('data-act'))).toEqual(['delete'])
    const { root, waitForChanges } = await render(<oyl-item-row itemId="s1" label="StreamFlix" lines={[]} action={{ act: 'renew', label: 'Renew' }} />)
    const acted = vi.fn()
    root.addEventListener('act', (e) => acted((e as CustomEvent).detail))
    expect(qa(root, '[data-act]').map((b) => b.getAttribute('data-act'))).toEqual(['renew', 'delete'])
    expect(q(root, '[data-act="renew"]')).toHaveTextContent('Renew')
    click(q(root, '[data-act="renew"]')!)
    await waitForChanges()
    expect(acted).toHaveBeenCalledWith({ act: 'renew', itemId: 's1' })
    expect(q(root, '[role="group"]')).toBeNull()
  })

  it('delete asks inline; No restores, Yes emits remove with the item id', async () => {
    const { root, waitForChanges } = await render(<oyl-item-row itemId="t1" label="dining" lines={[]} />)
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
    expect(removed).toHaveBeenCalledWith('t1')
  })
})
