import { render, h, describe, it, expect, vi } from '@stencil/vitest'

const input = (root: HTMLElement) => root.shadowRoot!.querySelector('input')!
const label = (root: HTMLElement) => root.shadowRoot!.querySelector('label')!
/** An Event from the test DOM's own window (Node's global Event is a different class). */
const domEvent = (el: Element, type: string) => {
  const ev = el.ownerDocument.createEvent('Event')
  ev.initEvent(type, true, false)
  return ev
}

describe('ui-field', () => {
  it('binds a label to a text input by default', async () => {
    const { root } = await render(<ui-field label="Email" name="email" />)
    const el = input(root)
    expect(el).toHaveAttribute('type', 'text')
    expect(el).toHaveAttribute('name', 'email')
    expect(root).toHaveAttribute('name', 'email')
    expect(el.id).not.toBe('')
    expect(label(root)).toHaveAttribute('for', el.id)
    expect(label(root)).toHaveTextContent('Email')
  })

  it('accepts datetime-local', async () => {
    const { root } = await render(<ui-field label="When" name="when" type="datetime-local" value="2026-10-08T09:30" />)
    expect(input(root)).toHaveAttribute('type', 'datetime-local')
    expect(input(root).value).toBe('2026-10-08T09:30')
  })

  it('passes type, required and autocomplete through', async () => {
    const { root } = await render(<ui-field label="Password" name="pw" type="password" required autocomplete="current-password" />)
    const el = input(root)
    expect(el).toHaveAttribute('type', 'password')
    expect(el).toHaveAttribute('required', '')
    expect(el).toHaveAttribute('autocomplete', 'current-password')
  })

  it('passes disabled through and reflects it', async () => {
    const { root } = await render(<ui-field label="N" name="n" disabled />)
    expect(input(root).disabled).toBe(true)
    expect(root).toHaveAttribute('disabled', '')
  })

  it('emits a composed uiInput event with the value and updates value', async () => {
    const { root } = await render(<ui-field label="Name" name="n" />)
    const handler = vi.fn()
    const nativeInput = vi.fn()
    root.addEventListener('uiInput', (e) => handler((e as CustomEvent).detail))
    root.addEventListener('input', nativeInput)
    const el = input(root)
    el.value = 'Ada'
    el.dispatchEvent(domEvent(el, 'input'))
    expect(handler).toHaveBeenCalledWith({ value: 'Ada' })
    expect((root as any).value).toBe('Ada')
    expect(nativeInput).not.toHaveBeenCalled()
  })

  it('emits uiChange when the input commits', async () => {
    const { root } = await render(<ui-field label="Name" name="n" value="Ada" />)
    const handler = vi.fn()
    root.addEventListener('uiChange', (e) => handler((e as CustomEvent).detail))
    input(root).dispatchEvent(domEvent(input(root), 'change'))
    expect(handler).toHaveBeenCalledWith({ value: 'Ada' })
  })

  it('describes the input with the hint', async () => {
    const { root } = await render(<ui-field label="Email" name="e" hint="We never share it" />)
    const el = input(root)
    const hint = root.shadowRoot!.querySelector('.hint')!
    expect(hint).toHaveTextContent('We never share it')
    expect(el.getAttribute('aria-describedby')).toBe(hint.id)
    expect(el.hasAttribute('aria-invalid')).toBe(false)
  })

  it('an error replaces the hint and marks the input invalid', async () => {
    const { root } = await render(<ui-field label="Email" name="e" hint="h" error="Enter a valid email" />)
    const el = input(root)
    const error = root.shadowRoot!.querySelector('.error')!
    expect(error).toHaveTextContent('Enter a valid email')
    expect(root.shadowRoot!.querySelector('.hint')).toBeNull()
    expect(el).toHaveAttribute('aria-invalid', 'true')
    expect(el.getAttribute('aria-describedby')).toBe(error.id)
  })

  it('submits its value through the form-associated path', async () => {
    const { root, waitForChanges } = await render(
      <form>
        <ui-field label="Name" name="name" value="x" />
      </form>,
    )
    const field = root.querySelector('ui-field') as HTMLElement & { value: string; __formValue?: unknown }
    // happy-dom cannot build FormData from ElementInternals; the setup shim records
    // what setFormValue received (see vitest-setup.ts).
    expect(field.__formValue).toBe('x')
    field.value = 'y'
    await waitForChanges()
    expect(field.__formValue).toBe('y')
  })
})
