import { render, h, describe, it, expect, vi } from '@stencil/vitest'
import { Account } from '@oyl/all-of-oyl'
import { core } from '../../../vitest-setup.js'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const field = (root: HTMLElement, name: string) => q(root, `ui-field[name="${name}"]`) as HTMLElement & { value: string; error?: string }
const select = (root: HTMLElement, name: string) => q(root, `ui-select[name="${name}"]`) as (HTMLElement & { value: string; options: { value: string; label: string }[] }) | null
const pick = (root: HTMLElement, name: string, value: string) => select(root, name)!.dispatchEvent(new CustomEvent('uiChange', { detail: { value }, bubbles: true, composed: true }))
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
const segOption = (root: HTMLElement, value: string) => q(root, 'ui-segment')!.shadowRoot!.querySelector(`[data-value="${value}"]`)!
const submitBtn = (root: HTMLElement) => q(root, 'ui-button[type="submit"]')!
const submit = (root: HTMLElement) => { const f = q(root, 'form')!; const ev = f.ownerDocument.createEvent('Event'); ev.initEvent('submit', true, true); f.dispatchEvent(ev) }
const flush = () => new Promise((r) => setTimeout(r, 0))

const checking = new Account({ name: 'Checking', currency: 'EUR' })

async function stores(accounts: Account[] = []) {
  const { signal } = await core()
  const rev = signal(0)
  const list = [...accounts]
  return {
    journal: { add: vi.fn(async (t: unknown) => t) },
    accounts: {
      all: () => { rev.get(); return [...list] },
      add: vi.fn(async (a: Account) => { list.push(a); rev.set(rev.get() + 1); return a }),
      remove: vi.fn(async (id: string) => { const i = list.findIndex((a) => a.id === id); if (i >= 0) list.splice(i, 1); rev.set(rev.get() + 1) }),
    },
  }
}

describe('oyl-transaction-form', () => {
  it('defaults to an expense with the expense categories, a currency select, Cash + accounts, today', async () => {
    const s = await stores([checking])
    const { root } = await render(<oyl-transaction-form store={s.journal} accounts={s.accounts} />)
    expect((q(root, 'ui-segment') as any).value).toBe('expense')
    expect(select(root, 'category')!.options.map((o) => o.value)).toEqual(['groceries', 'dining', 'transport', 'utilities', 'entertainment', 'other'])
    expect(select(root, 'currency')!.options.map((o) => o.value)).toEqual(['USD', 'EUR', 'GBP'])
    expect(select(root, 'account')!.options).toEqual([{ value: '', label: 'Cash (no account)' }, { value: checking.id, label: 'Checking · EUR' }])
    expect(field(root, 'date').value).toBe(new Date().toISOString().slice(0, 10))
    expect(submitBtn(root)).toHaveTextContent('Add expense')
  })

  it('reacts to an account added to the store', async () => {
    const s = await stores()
    const { root, waitForChanges } = await render(<oyl-transaction-form store={s.journal} accounts={s.accounts} />)
    expect(select(root, 'account')!.options).toHaveLength(1)
    await s.accounts.add(checking)
    await flush(); await waitForChanges()
    expect(select(root, 'account')!.options).toHaveLength(2)
  })

  it('choosing an account removes the currency select; back to Cash restores it with the chosen currency', async () => {
    const s = await stores([checking])
    const { root, waitForChanges } = await render(<oyl-transaction-form store={s.journal} accounts={s.accounts} />)
    pick(root, 'currency', 'GBP')
    pick(root, 'account', checking.id)
    await waitForChanges()
    expect(select(root, 'currency')).toBeNull()
    pick(root, 'account', '')
    await waitForChanges()
    expect(select(root, 'currency')!.value).toBe('GBP')
  })

  it('an account removed while chosen resets the composer to Cash', async () => {
    const s = await stores([checking])
    const { root, waitForChanges } = await render(<oyl-transaction-form store={s.journal} accounts={s.accounts} />)
    pick(root, 'account', checking.id)
    await waitForChanges()
    await s.accounts.remove(checking.id)
    await flush(); await waitForChanges()
    expect(select(root, 'currency')).not.toBeNull()
    field(root, 'amount').value = '5'
    submit(root)
    await flush(); await waitForChanges()
    const t = s.journal.add.mock.calls[0][0] as any
    expect(t.accountId).toBeUndefined()
    expect(t.amount.currency).toBe('USD')
  })

  it('income flips the categories and the submit text; the category re-derives', async () => {
    const s = await stores()
    const { root, waitForChanges } = await render(<oyl-transaction-form store={s.journal} accounts={s.accounts} />)
    pick(root, 'category', 'other')
    click(segOption(root, 'income'))
    await waitForChanges()
    expect(select(root, 'category')!.options.map((o) => o.value)).toEqual(['salary', 'freelance', 'gift', 'refund', 'other'])
    expect(select(root, 'category')!.value).toBe('other')
    expect(submitBtn(root)).toHaveTextContent('Add income')
    click(segOption(root, 'expense'))
    await waitForChanges()
    pick(root, 'category', 'groceries')
    click(segOption(root, 'income'))
    await waitForChanges()
    field(root, 'amount').value = '100'
    submit(root)
    await flush(); await waitForChanges()
    const t = s.journal.add.mock.calls[0][0] as any
    expect(t.direction).toBe('income')
    expect(t.category).toBe('salary')
  })

  it('validates the date first, then the amount, before touching the store', async () => {
    const s = await stores()
    const { root, waitForChanges } = await render(<oyl-transaction-form store={s.journal} accounts={s.accounts} />)
    field(root, 'date').value = ''
    field(root, 'amount').value = '0'
    submit(root)
    await flush(); await waitForChanges()
    expect(q(root, '[data-role="error"]')).toHaveTextContent('Pick a date')
    expect(field(root, 'date').error).toBe('Pick a date')
    field(root, 'date').value = '2026-10-08'
    submit(root)
    await flush(); await waitForChanges()
    expect(q(root, '[data-role="error"]')).toHaveTextContent('Amount must be positive')
    expect(field(root, 'amount').error).toBe('Amount must be positive')
    expect(field(root, 'date').error).toBeUndefined()
    expect(s.journal.add).not.toHaveBeenCalled()
  })

  it('logs a cash expense with the chosen currency, clears amount + note, emits added with the direction', async () => {
    const s = await stores()
    const { root, waitForChanges } = await render(<oyl-transaction-form store={s.journal} accounts={s.accounts} />)
    const added = vi.fn()
    root.addEventListener('added', (e) => added((e as CustomEvent).detail))
    field(root, 'amount').value = '12.34'
    pick(root, 'currency', 'EUR')
    pick(root, 'category', 'dining')
    field(root, 'date').value = '2026-10-08'
    field(root, 'note').value = 'lunch'
    submit(root)
    await flush(); await waitForChanges()
    const t = s.journal.add.mock.calls[0][0] as any
    expect(t.kind).toBe('transaction')
    expect(t.amount.minor).toBe(1234)
    expect(t.amount.currency).toBe('EUR')
    expect(t.category).toBe('dining')
    expect(t.direction).toBe('expense')
    expect(t.note).toBe('lunch')
    expect(t.accountId).toBeUndefined()
    const d = t.occurredAt as Date
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()]).toEqual([2026, 10, 8, 12])
    expect(added).toHaveBeenCalledWith('expense')
    expect(field(root, 'amount').value).toBe('')
    expect(field(root, 'note').value).toBe('')
  })

  it('logs against an account with the account currency', async () => {
    const s = await stores([checking])
    const { root, waitForChanges } = await render(<oyl-transaction-form store={s.journal} accounts={s.accounts} />)
    pick(root, 'account', checking.id)
    await waitForChanges()
    field(root, 'amount').value = '20'
    submit(root)
    await flush(); await waitForChanges()
    const t = s.journal.add.mock.calls[0][0] as any
    expect(t.accountId).toBe(checking.id)
    expect(t.amount.currency).toBe('EUR')
    expect(t.note).toBeUndefined()
  })
})
