import { render, h, describe, it, expect, vi } from '@stencil/vitest'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const field = (root: HTMLElement, name: string) => q(root, `ui-field[name="${name}"]`) as HTMLElement & { value: string; error?: string }
const select = (root: HTMLElement, name: string) => q(root, `ui-select[name="${name}"]`) as HTMLElement & { value: string; options: { value: string; label: string }[] }
const pick = (root: HTMLElement, name: string, value: string) => select(root, name).dispatchEvent(new CustomEvent('uiChange', { detail: { value }, bubbles: true, composed: true }))
const submit = (root: HTMLElement) => { const f = q(root, 'form')!; const ev = f.ownerDocument.createEvent('Event'); ev.initEvent('submit', true, true); f.dispatchEvent(ev) }
const flush = () => new Promise((r) => setTimeout(r, 0))
const store = () => ({ add: vi.fn(async (b: unknown) => b) })

describe('oyl-budget-form', () => {
  it('offers the expense categories, a limit and a currency', async () => {
    const { root } = await render(<oyl-budget-form store={store()} />)
    expect(select(root, 'category').options.map((o) => o.value)).toEqual(['groceries', 'dining', 'transport', 'utilities', 'entertainment', 'other'])
    expect(field(root, 'limit')).toHaveAttribute('type', 'number')
    expect(select(root, 'currency').options.map((o) => o.value)).toEqual(['USD', 'EUR', 'GBP'])
  })

  it('submits a Budget with the limit as Money, clears the limit and emits added', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-budget-form store={s} />)
    const added = vi.fn()
    root.addEventListener('added', added)
    pick(root, 'category', 'dining')
    pick(root, 'currency', 'EUR')
    field(root, 'limit').value = '150'
    submit(root)
    await flush(); await waitForChanges()
    const b = s.add.mock.calls[0][0] as any
    expect(b.category).toBe('dining')
    expect(b.limit.minor).toBe(15000)
    expect(b.limit.currency).toBe('EUR')
    expect(added).toHaveBeenCalledTimes(1)
    expect(field(root, 'limit').value).toBe('')
  })

  it('a non-positive limit shows the domain error inline', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-budget-form store={s} />)
    field(root, 'limit').value = '0'
    submit(root)
    await flush(); await waitForChanges()
    expect(s.add).not.toHaveBeenCalled()
    expect(q(root, '[data-role="error"]')!.textContent).toMatch(/positive/)
    expect(field(root, 'limit').error).toMatch(/positive/)
  })
})
