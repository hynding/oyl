import { render, h, describe, it, expect, vi } from '@stencil/vitest'

const options = [{ value: 'note', label: 'Note' }, { value: 'measurement', label: 'Measurement' }, { value: 'photo', label: 'Photo' }]
const radios = (root: HTMLElement) => Array.from(root.shadowRoot!.querySelectorAll<HTMLButtonElement>('[role="radio"]'))
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))

describe('ui-segment', () => {
  it('renders a labelled radiogroup with one radio per option and the value checked', async () => {
    const { root } = await render(<ui-segment name="type" label="Entry type" options={options} value="note" />)
    const group = root.shadowRoot!.querySelector('[role="radiogroup"]')!
    expect(group).toHaveAttribute('aria-label', 'Entry type')
    expect(root).toHaveAttribute('name', 'type')
    expect(root).toHaveAttribute('value', 'note')
    const r = radios(root)
    expect(r.map((b) => b.dataset.value)).toEqual(['note', 'measurement', 'photo'])
    expect(r.map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
    expect(r.map((b) => b.tabIndex)).toEqual([0, -1, -1])
    expect(r[1]).toHaveTextContent('Measurement')
  })

  it('click selects, reflects and emits uiChange', async () => {
    const { root, waitForChanges } = await render(<ui-segment name="type" label="Entry type" options={options} value="note" />)
    const changed = vi.fn()
    root.addEventListener('uiChange', (e) => changed((e as CustomEvent).detail))
    click(radios(root)[1])
    await waitForChanges()
    expect(changed).toHaveBeenCalledWith({ value: 'measurement' })
    expect(root).toHaveAttribute('value', 'measurement')
    expect(radios(root)[1]).toHaveAttribute('aria-checked', 'true')
  })

  it('arrow keys move and select with wraparound', async () => {
    const { root, waitForChanges } = await render(<ui-segment name="type" label="Entry type" options={options} value="photo" />)
    const group = root.shadowRoot!.querySelector('[role="radiogroup"]')!
    group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await waitForChanges()
    expect((root as any).value).toBe('note')
    group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await waitForChanges()
    expect((root as any).value).toBe('photo')
  })
})
