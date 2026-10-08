import { render, h, describe, it, expect } from '@stencil/vitest'

const items = [
  { name: 'journal', href: '/journal', label: 'Journal', icon: 'journal' },
  { name: 'planner', href: '/planner', label: 'Planner', icon: 'planner' },
  { name: 'status', href: '/status', label: 'Status', icon: 'status' },
] as const

const links = (root: HTMLElement) => Array.from(root.shadowRoot!.querySelectorAll('a'))

describe('ui-nav', () => {
  it('renders a labelled nav with one anchor per item', async () => {
    const { root } = await render(<ui-nav items={[...items]} />)
    expect(root.shadowRoot!.querySelector('nav')).toHaveAttribute('aria-label', 'Primary')
    const a = links(root)
    expect(a.map((x) => x.getAttribute('href'))).toEqual(['/journal', '/planner', '/status'])
    expect(a[0]).toHaveTextContent('Journal')
    expect(a[0].querySelector('ui-icon')).toHaveAttribute('name', 'journal')
  })

  it('marks only the current item', async () => {
    const { root, setProps, waitForChanges } = await render(<ui-nav items={[...items]} current="planner" />)
    const current = () => links(root).filter((a) => a.getAttribute('aria-current') === 'page')
    expect(current().map((a) => a.textContent?.trim())).toEqual(['Planner'])
    await setProps({ current: 'status' })
    await waitForChanges()
    expect(current().map((a) => a.textContent?.trim())).toEqual(['Status'])
  })

  it('reflects orientation with a top default', async () => {
    const { root, setProps, waitForChanges } = await render(<ui-nav items={[...items]} />)
    expect(root).toHaveAttribute('orientation', 'top')
    await setProps({ orientation: 'bottom' })
    await waitForChanges()
    expect(root).toHaveAttribute('orientation', 'bottom')
  })

  it('leaves anchor clicks to the host app (no interception)', async () => {
    const { root } = await render(<ui-nav items={[...items]} />)
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true })
    links(root)[0].dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
  })
})
