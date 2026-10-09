import { render, h, describe, it, expect, vi } from '@stencil/vitest'

const ta = (root: HTMLElement) => root.shadowRoot!.querySelector('textarea')!
const label = (root: HTMLElement) => root.shadowRoot!.querySelector('label')!
const domEvent = (el: Element, type: string) => { const ev = el.ownerDocument.createEvent('Event'); ev.initEvent(type, true, false); return ev }

describe('ui-textarea', () => {
  it('binds a label to the textarea and reflects name', async () => {
    const { root } = await render(<ui-textarea label="What happened?" name="text" placeholder="A line…" rows={3} required />)
    const el = ta(root)
    expect(el.id).not.toBe('')
    expect(label(root)).toHaveAttribute('for', el.id)
    expect(label(root)).toHaveTextContent('What happened?')
    expect(root).toHaveAttribute('name', 'text')
    expect(el).toHaveAttribute('name', 'text')
    expect(el).toHaveAttribute('placeholder', 'A line…')
    expect(el).toHaveAttribute('rows', '3')
    expect(el).toHaveAttribute('required', '')
  })

  it('emits a composed uiInput with the value and updates value', async () => {
    const { root } = await render(<ui-textarea label="T" name="t" />)
    const handler = vi.fn()
    root.addEventListener('uiInput', (e) => handler((e as CustomEvent).detail))
    const el = ta(root)
    el.value = 'hello'
    el.dispatchEvent(domEvent(el, 'input'))
    expect(handler).toHaveBeenCalledWith({ value: 'hello' })
    expect((root as any).value).toBe('hello')
  })

  it('describes with a hint, and an error replaces it and marks invalid', async () => {
    const a = await render(<ui-textarea label="T" name="t" hint="Optional" />)
    expect(ta(a.root).getAttribute('aria-describedby')).toBe(a.root.shadowRoot!.querySelector('.hint')!.id)
    const b = await render(<ui-textarea label="T" name="t" hint="Optional" error="Say something" />)
    expect(b.root.shadowRoot!.querySelector('.hint')).toBeNull()
    expect(ta(b.root)).toHaveAttribute('aria-invalid', 'true')
    expect(ta(b.root).getAttribute('aria-describedby')).toBe(b.root.shadowRoot!.querySelector('.error')!.id)
  })

  it('⌘/Ctrl+Enter emits uiSubmit', async () => {
    const { root } = await render(<ui-textarea label="T" name="t" />)
    const submit = vi.fn()
    root.addEventListener('uiSubmit', submit)
    ta(root).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(submit).not.toHaveBeenCalled()
    ta(root).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))
    ta(root).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
    expect(submit).toHaveBeenCalledTimes(2)
  })

  it('submits its value through the form-associated path', async () => {
    const { root, waitForChanges } = await render(
      <form>
        <ui-textarea label="T" name="t" value="x" />
      </form>,
    )
    const el = root.querySelector('ui-textarea') as HTMLElement & { value: string; __formValue?: unknown }
    expect(el.__formValue).toBe('x')
    el.value = 'y'
    await waitForChanges()
    expect(el.__formValue).toBe('y')
  })
})
