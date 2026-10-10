import { render, h, describe, it, expect, vi } from '@stencil/vitest'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const field = (root: HTMLElement, name: string) => q(root, `ui-field[name="${name}"]`) as HTMLElement & { value: string; error?: string }
const pick = (root: HTMLElement, name: string, value: string) => q(root, `ui-select[name="${name}"]`)!.dispatchEvent(new CustomEvent('uiChange', { detail: { value }, bubbles: true, composed: true }))
const submit = (root: HTMLElement) => { const f = q(root, 'form')!; const ev = f.ownerDocument.createEvent('Event'); ev.initEvent('submit', true, true); f.dispatchEvent(ev) }
const flush = () => new Promise((r) => setTimeout(r, 0))
const store = () => ({ addPossession: vi.fn(async (p: unknown) => p) })

describe('oyl-possession-form', () => {
  it('builds a Possession with every optional field, clears and emits added', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-possession-form store={s} />)
    const added = vi.fn()
    root.addEventListener('added', added)
    field(root, 'name').value = 'Laptop'
    field(root, 'location').value = 'Desk'
    field(root, 'warrantyUntil').value = '2027-01-01'
    field(root, 'amount').value = '999.99'
    pick(root, 'currency', 'EUR')
    field(root, 'purchasedOn').value = '2026-01-15'
    submit(root)
    await flush(); await waitForChanges()
    const p = s.addPossession.mock.calls[0][0] as any
    expect(p.name).toBe('Laptop')
    expect(p.location).toBe('Desk')
    expect(p.warrantyUntil.value).toBe('2027-01-01')
    expect(p.purchasePrice.minor).toBe(99999)
    expect(p.purchasePrice.currency).toBe('EUR')
    expect(p.purchasedOn.value).toBe('2026-01-15')
    expect(added).toHaveBeenCalledTimes(1)
    expect(field(root, 'name').value).toBe('')
    expect(field(root, 'amount').value).toBe('')
  })

  it('leaves blank optionals undefined and ignores a zero price', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-possession-form store={s} />)
    field(root, 'name').value = 'Mug'
    field(root, 'amount').value = '0'
    submit(root)
    await flush(); await waitForChanges()
    const p = s.addPossession.mock.calls[0][0] as any
    expect(p.location).toBeUndefined()
    expect(p.warrantyUntil).toBeUndefined()
    expect(p.purchasePrice).toBeUndefined()
    expect(p.purchasedOn).toBeUndefined()
  })

  it('an empty name shows the domain error inline', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-possession-form store={s} />)
    submit(root)
    await flush(); await waitForChanges()
    expect(s.addPossession).not.toHaveBeenCalled()
    expect(field(root, 'name').error).toMatch(/non-empty/)
  })
})
