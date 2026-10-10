import { render, h, describe, it, expect, vi } from '@stencil/vitest'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const field = (root: HTMLElement, name: string) => q(root, `ui-field[name="${name}"]`) as HTMLElement & { value: string; error?: string }
const select = (root: HTMLElement, name: string) => q(root, `ui-select[name="${name}"]`) as HTMLElement & { value: string; options: { value: string; label: string }[] }
const pick = (root: HTMLElement, name: string, value: string) => select(root, name).dispatchEvent(new CustomEvent('uiChange', { detail: { value }, bubbles: true, composed: true }))
const submit = (root: HTMLElement) => { const f = q(root, 'form')!; const ev = f.ownerDocument.createEvent('Event'); ev.initEvent('submit', true, true); f.dispatchEvent(ev) }
const flush = () => new Promise((r) => setTimeout(r, 0))
const store = () => ({ addSubscription: vi.fn(async (s: unknown) => s) })
const todayIso = () => new Date().toISOString().slice(0, 10)

describe('oyl-subscription-form', () => {
  it('defaults: every 1 month from today, entertainment, USD', async () => {
    const { root } = await render(<oyl-subscription-form store={store()} />)
    expect(field(root, 'cadenceN').value).toBe('1')
    expect(select(root, 'cadenceUnit').value).toBe('months')
    expect(select(root, 'cadenceUnit').options.map((o) => o.value)).toEqual(['days', 'weeks', 'months', 'years'])
    expect(field(root, 'anchor').value).toBe(todayIso())
    expect(select(root, 'category').value).toBe('entertainment')
    expect(select(root, 'currency').value).toBe('USD')
  })

  it('builds a Subscription, re-defaults everything and emits added', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-subscription-form store={s} />)
    const added = vi.fn()
    root.addEventListener('added', added)
    field(root, 'name').value = 'Annual thing'
    field(root, 'amount').value = '50'
    pick(root, 'currency', 'GBP')
    field(root, 'cadenceN').value = '2'
    pick(root, 'cadenceUnit', 'years')
    field(root, 'anchor').value = '2026-12-01'
    pick(root, 'category', 'software')
    submit(root)
    await flush(); await waitForChanges()
    const sub = s.addSubscription.mock.calls[0][0] as any
    expect(sub.name).toBe('Annual thing')
    expect(sub.amount.minor).toBe(5000)
    expect(sub.amount.currency).toBe('GBP')
    expect(sub.cadence.n).toBe(2)
    expect(sub.cadence.unit).toBe('years')
    expect(sub.anchor.value).toBe('2026-12-01')
    expect(sub.category).toBe('software')
    expect(added).toHaveBeenCalledTimes(1)
    expect(field(root, 'name').value).toBe('')
    expect(field(root, 'cadenceN').value).toBe('1')
    expect(select(root, 'cadenceUnit').value).toBe('months')
    expect(field(root, 'anchor').value).toBe(todayIso())
    expect(select(root, 'currency').value).toBe('USD')
    expect(select(root, 'category').value).toBe('entertainment')
  })

  it('a missing amount shows the domain error inline', async () => {
    const s = store()
    const { root, waitForChanges } = await render(<oyl-subscription-form store={s} />)
    field(root, 'name').value = 'Thing'
    submit(root)
    await flush(); await waitForChanges()
    expect(s.addSubscription).not.toHaveBeenCalled()
    expect(q(root, '[data-role="error"]')!.textContent).not.toBe('')
  })
})
