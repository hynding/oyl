import { render, h, describe, it, expect, vi } from '@stencil/vitest'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const field = (root: HTMLElement, name: string) => q(root, `ui-field[name="${name}"]`) as HTMLElement & { value: string; error?: string }
const select = (root: HTMLElement, name: string) => q(root, `ui-select[name="${name}"]`) as HTMLElement & { value: string; options: { value: string; label: string }[] }
const pick = (root: HTMLElement, name: string, value: string) => select(root, name).dispatchEvent(new CustomEvent('uiChange', { detail: { value }, bubbles: true, composed: true }))
const submit = (root: HTMLElement) => { const f = q(root, 'form')!; const ev = f.ownerDocument.createEvent('Event'); ev.initEvent('submit', true, true); f.dispatchEvent(ev) }
const flush = () => new Promise((r) => setTimeout(r, 0))
const store = () => ({ add: vi.fn(async (a: unknown) => a) })

describe('oyl-account-form', () => {
  it('submits an Account with name and currency, clears the name and emits added', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-account-form store={s} />)
    const added = vi.fn()
    root.addEventListener('added', added)
    expect(select(root, 'currency').options.map((o) => o.value)).toEqual(['USD', 'EUR', 'GBP'])
    field(root, 'name').value = 'Checking'
    pick(root, 'currency', 'GBP')
    submit(root)
    await flush(); await waitForChanges()
    const a = s.add.mock.calls[0][0] as any
    expect(a.name).toBe('Checking')
    expect(a.currency).toBe('GBP')
    expect(added).toHaveBeenCalledTimes(1)
    expect(field(root, 'name').value).toBe('')
  })

  it('an empty name shows the domain error inline and marks the name invalid', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-account-form store={s} />)
    submit(root)
    await flush(); await waitForChanges()
    expect(s.add).not.toHaveBeenCalled()
    expect(q(root, '[data-role="error"]')!.textContent).toMatch(/non-empty/)
    expect(field(root, 'name').error).toMatch(/non-empty/)
  })
})
