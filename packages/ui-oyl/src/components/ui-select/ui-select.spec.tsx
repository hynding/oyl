import { render, h, describe, it, expect, vi } from '@stencil/vitest'

const sel = (root: HTMLElement) => root.shadowRoot!.querySelector('select')!
const label = (root: HTMLElement) => root.shadowRoot!.querySelector('label')!
const domEvent = (el: Element, type: string) => { const ev = el.ownerDocument.createEvent('Event'); ev.initEvent(type, true, false); return ev }
type Host = HTMLElement & { value: string; options: { value: string; label: string }[]; __formValue?: unknown }
const fruit = [{ value: 'apple', label: 'Apple' }, { value: 'pear', label: 'Pear' }]

describe('ui-select', () => {
  it('binds a label to a select with the options and reflects name', async () => {
    const { root } = await render(<ui-select label="Fruit" name="fruit" options={fruit} />)
    const el = sel(root)
    expect(el).toHaveAttribute('name', 'fruit')
    expect(root).toHaveAttribute('name', 'fruit')
    expect(label(root)).toHaveAttribute('for', el.id)
    expect(label(root)).toHaveTextContent('Fruit')
    expect([...el.options].map((o) => [o.value, o.textContent])).toEqual([['apple', 'Apple'], ['pear', 'Pear']])
  })

  it('selects the initial value and adopts the first option when none is given', async () => {
    const a = await render(<ui-select label="F" name="f" options={fruit} value="pear" />)
    expect(sel(a.root).value).toBe('pear')
    const b = await render(<ui-select label="F" name="f" options={fruit} />)
    expect(sel(b.root).value).toBe('apple')
    expect((b.root as Host).value).toBe('apple')
  })

  it('a user change emits a composed uiChange and updates value; the native change is stopped', async () => {
    const { root, waitForChanges } = await render(<ui-select label="F" name="f" options={fruit} />)
    const handler = vi.fn()
    const native = vi.fn()
    root.addEventListener('uiChange', (e) => handler((e as CustomEvent).detail))
    root.addEventListener('change', native)
    sel(root).value = 'pear'
    sel(root).dispatchEvent(domEvent(sel(root), 'change'))
    await waitForChanges()
    expect(handler).toHaveBeenCalledWith({ value: 'pear' })
    expect((root as Host).value).toBe('pear')
    expect(native).not.toHaveBeenCalled()
  })

  it('setting value from outside updates the select', async () => {
    const { root, waitForChanges } = await render(<ui-select label="F" name="f" options={fruit} />)
    ;(root as Host).value = 'pear'
    await waitForChanges()
    expect(sel(root).value).toBe('pear')
  })

  it('replacing the options keeps a still-present value and otherwise adopts the first, silently', async () => {
    const { root, waitForChanges } = await render(<ui-select label="F" name="f" options={fruit} value="pear" />)
    const handler = vi.fn()
    root.addEventListener('uiChange', handler)
    ;(root as Host).options = [...fruit, { value: 'fig', label: 'Fig' }]
    await waitForChanges()
    expect((root as Host).value).toBe('pear')
    ;(root as Host).options = [{ value: 'fig', label: 'Fig' }, { value: 'kiwi', label: 'Kiwi' }]
    await waitForChanges()
    expect((root as Host).value).toBe('fig')
    expect(sel(root).value).toBe('fig')
    ;(root as Host).options = []
    await waitForChanges()
    expect((root as Host).value).toBe('')
    expect(handler).not.toHaveBeenCalled()
  })

  it('passes disabled through; hint and error wire aria like ui-field', async () => {
    const a = await render(<ui-select label="F" name="f" options={fruit} disabled hint="Pick one" />)
    expect(sel(a.root).disabled).toBe(true)
    const hint = a.root.shadowRoot!.querySelector('.hint')!
    expect(hint).toHaveTextContent('Pick one')
    expect(sel(a.root).getAttribute('aria-describedby')).toBe(hint.id)
    const b = await render(<ui-select label="F" name="f" options={fruit} hint="h" error="Required" />)
    const error = b.root.shadowRoot!.querySelector('.error')!
    expect(error).toHaveTextContent('Required')
    expect(b.root.shadowRoot!.querySelector('.hint')).toBeNull()
    expect(sel(b.root)).toHaveAttribute('aria-invalid', 'true')
    expect(sel(b.root).getAttribute('aria-describedby')).toBe(error.id)
  })

  it('submits its value through the form-associated path', async () => {
    const { root, waitForChanges } = await render(
      <form>
        <ui-select label="F" name="f" options={fruit} value="pear" />
      </form>,
    )
    const host = root.querySelector('ui-select') as Host
    expect(host.__formValue).toBe('pear')
    host.value = 'apple'
    await waitForChanges()
    expect(host.__formValue).toBe('apple')
  })
})
