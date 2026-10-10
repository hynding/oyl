import { render, h, describe, it, expect, vi } from '@stencil/vitest'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const qa = (root: HTMLElement, sel: string) => Array.from(root.shadowRoot!.querySelectorAll(sel))
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))

describe('oyl-progress-row', () => {
  it('renders the name verbatim, the bar and the label', async () => {
    const { root } = await render(<oyl-progress-row itemId="b1" name="dining" ratio={0.62} tone="met" label="$93.00 of $150.00 · $57.00 left" />)
    expect(q(root, '.title')).toHaveTextContent('dining')
    expect(q(root, '.title .ok')).toBeNull()
    const bar = q(root, '.bar')!
    expect(bar).toHaveAttribute('role', 'progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '62')
    expect(bar).toHaveClass('met')
    expect((q(root, '.fill') as HTMLElement).style.getPropertyValue('inline-size')).toBe('62%')
    expect(q(root, '.label')).toHaveTextContent('$93.00 of $150.00 · $57.00 left')
    expect(q(root, '.label')).not.toHaveClass('warn')
    expect(q(root, '[data-act="delete"]')).toHaveAttribute('aria-label', 'Delete dining')
    expect(qa(root, '[data-act]').map((b) => b.getAttribute('data-act'))).toEqual(['delete'])
  })

  it('warn tone marks the bar and the label; met adds the check; no tone adds no class', async () => {
    const warn = await render(<oyl-progress-row itemId="b1" name="Eating out" ratio={1} tone="warn" label="over by $50.00" removeLabel="Delete budget Eating out" />)
    expect(q(warn.root, '.bar')).toHaveClass('warn')
    expect(q(warn.root, '.label')).toHaveClass('warn')
    expect(q(warn.root, '[data-act="delete"]')).toHaveAttribute('aria-label', 'Delete budget Eating out')
    const met = await render(<oyl-progress-row itemId="g1" name="Sleep more" met={true} ratio={1} tone="met" label="8 / 7.5 h" />)
    expect(q(met.root, '.title .ok')).toHaveTextContent('✓')
    const plain = await render(<oyl-progress-row itemId="g2" name="Run" ratio={0.3} label="6 / 20 min" />)
    expect(q(plain.root, '.bar')!.className).toBe('bar')
    const muted = await render(<oyl-progress-row itemId="g3" name="Run" ratio={0} tone="muted" label="Paused" />)
    expect(q(muted.root, '.bar')).toHaveClass('muted')
  })

  it('renders an optional action before Delete that emits act without opening the confirm', async () => {
    const { root, waitForChanges } = await render(<oyl-progress-row itemId="g1" name="Sleep" ratio={0.5} label="4 / 8 h" action={{ act: 'pause', label: 'Pause' }} />)
    const acted = vi.fn()
    root.addEventListener('act', (e) => acted((e as CustomEvent).detail))
    expect(qa(root, '[data-act]').map((b) => b.getAttribute('data-act'))).toEqual(['pause', 'delete'])
    expect(q(root, '[data-act="pause"]')).toHaveTextContent('Pause')
    click(q(root, '[data-act="pause"]')!)
    await waitForChanges()
    expect(acted).toHaveBeenCalledWith({ act: 'pause', itemId: 'g1' })
    expect(q(root, '[role="group"]')).toBeNull()
  })

  it('delete asks inline; Yes emits remove with the id', async () => {
    const { root, waitForChanges } = await render(<oyl-progress-row itemId="b1" name="dining" ratio={0} label="$0.00 of $150.00 · $150.00 left" />)
    const removed = vi.fn()
    root.addEventListener('remove', (e) => removed((e as CustomEvent).detail))
    click(q(root, '[data-act="delete"]')!)
    await waitForChanges()
    expect(q(root, '[role="group"]')).toHaveAttribute('aria-label', 'Delete?')
    expect(root.shadowRoot!.activeElement).toBe(q(root, '[data-act="confirm-no"]'))
    click(q(root, '[data-act="confirm-no"]')!)
    await waitForChanges()
    expect(removed).not.toHaveBeenCalled()
    click(q(root, '[data-act="delete"]')!)
    await waitForChanges()
    click(q(root, '[data-act="confirm-yes"]')!)
    expect(removed).toHaveBeenCalledWith('b1')
  })
})
