import { render, h, describe, it, expect, vi } from '@stencil/vitest'

const input = (root: HTMLElement) => root.shadowRoot!.querySelector('input')!
const label = (root: HTMLElement) => root.shadowRoot!.querySelector('label')!
type Host = HTMLElement & { checked: boolean; __formValue?: unknown }

describe('ui-checkbox', () => {
  it('binds a label to a checkbox input and reflects name', async () => {
    const { root } = await render(<ui-checkbox label="Repeat" name="repeat" />)
    const el = input(root)
    expect(el).toHaveAttribute('type', 'checkbox')
    expect(el).toHaveAttribute('name', 'repeat')
    expect(root).toHaveAttribute('name', 'repeat')
    expect(el.checked).toBe(false)
    expect(label(root)).toHaveAttribute('for', el.id)
    expect(label(root)).toHaveTextContent('Repeat')
  })

  it('reflects checked and passes disabled through', async () => {
    const { root } = await render(<ui-checkbox label="On" name="on" checked disabled />)
    expect(root).toHaveAttribute('checked', '')
    expect(input(root).checked).toBe(true)
    expect(input(root).disabled).toBe(true)
  })

  it('toggling emits a composed uiChange with the new state and updates checked', async () => {
    const { root, waitForChanges } = await render(<ui-checkbox label="Repeat" name="repeat" />)
    const handler = vi.fn()
    const nativeChange = vi.fn()
    root.addEventListener('uiChange', (e) => handler((e as CustomEvent).detail))
    root.addEventListener('change', nativeChange)
    input(root).click()
    await waitForChanges()
    expect(handler).toHaveBeenCalledWith({ checked: true })
    expect((root as Host).checked).toBe(true)
    expect(root).toHaveAttribute('checked', '')
    expect(nativeChange).not.toHaveBeenCalled()
  })

  it('setting checked from outside updates the input', async () => {
    const { root, waitForChanges } = await render(<ui-checkbox label="Repeat" name="repeat" />)
    ;(root as Host).checked = true
    await waitForChanges()
    expect(input(root).checked).toBe(true)
  })

  it('submits "on" when checked and nothing when not, through the form-associated path', async () => {
    const { root, waitForChanges } = await render(
      <form>
        <ui-checkbox label="Repeat" name="repeat" />
      </form>,
    )
    const box = root.querySelector('ui-checkbox') as Host
    expect(box.__formValue).toBeNull()
    box.checked = true
    await waitForChanges()
    expect(box.__formValue).toBe('on')
  })

  it('uses a custom value as the form value', async () => {
    const { root } = await render(<ui-checkbox label="Weekly" name="cadence" value="weekly" checked />)
    expect((root as Host).__formValue).toBe('weekly')
  })
})
