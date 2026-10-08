import { render, h, describe, it, expect, vi } from '@stencil/vitest'
import { Account, Budget, DayKey, DayRange, Money, Transaction } from '@oyl/all-of-oyl'
import { core } from '../../../vitest-setup.js'
import { monthHeading } from '../../finance/format.js'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)
const qa = (root: HTMLElement, sel: string) => [...root.shadowRoot!.querySelectorAll(sel)]
const flush = () => new Promise((r) => setTimeout(r, 0))
const today = () => DayKey.from(new Date(), 'UTC')
const usd = (major: number) => Money.fromMajor(major, 'USD')
const ledger = (root: HTMLElement) => qa(root, 'ol.ledger oyl-item-row') as (HTMLElement & { label: string; value: string; lines: string[] })[]
const tileRows = (root: HTMLElement) => qa(root, '[data-role="totals"] .tiles').map((r) => ({ currency: r.getAttribute('data-currency'), values: [...r.querySelectorAll('.tile b')].map((b) => b.textContent) }))
const pickFilter = (root: HTMLElement, value: string) => q(root, 'ui-select[name="ledgerFilter"]')!.dispatchEvent(new CustomEvent('uiChange', { detail: { value }, bubbles: true, composed: true }))

const checking = new Account({ name: 'Checking', currency: 'USD' })
const tx = (major: number, direction: 'expense' | 'income', day: DayKey, extra: Partial<{ currency: string; note: string; accountId: string }> = {}) =>
  new Transaction({
    occurredAt: new Date(`${day.value}T12:00:00Z`), amount: Money.fromMajor(major, extra.currency ?? 'USD'), category: direction === 'income' ? 'salary' : 'groceries', direction,
    ...(extra.note ? { note: extra.note } : {}), ...(extra.accountId ? { accountId: extra.accountId as never } : {}),
  })

async function stores(txs: Transaction[] = [], budgets: Budget[] = [], accounts: Account[] = []) {
  const { signal } = await core()
  const jRev = signal(0), bRev = signal(0), aRev = signal(0)
  const all = [...txs], bs = [...budgets], as = [...accounts]
  const bump = (s: { get(): number; set(v: number): void }) => s.set(s.get() + 1)
  return {
    journal: {
      transactionsIn: (range: DayRange) => { jRev.get(); return all.filter((t) => range.contains(DayKey.from(t.occurredAt, 'UTC'))) },
      budgetStatus: vi.fn((b: Budget) => { jRev.get(); return { progress: { current: 93, target: 150, ratio: 0.62, met: true, paused: false, empty: false }, spent: usd(93) } }),
      accountBalance: vi.fn(() => { jRev.get(); return usd(2415.8) }),
      accountSpend: vi.fn(() => { jRev.get(); return usd(65) }),
      add: vi.fn(async (t: Transaction) => { all.push(t); bump(jRev); return t }),
      remove: vi.fn(async (id: string) => { const i = all.findIndex((t) => t.id === id); if (i >= 0) all.splice(i, 1); bump(jRev) }),
    },
    budgets: {
      all: () => { bRev.get(); return [...bs] },
      add: vi.fn(async (b: Budget) => { bs.push(b); bump(bRev); return b }),
      remove: vi.fn(async (id: string) => { const i = bs.findIndex((b) => b.id === id); if (i >= 0) bs.splice(i, 1); bump(bRev) }),
    },
    accounts: {
      all: () => { aRev.get(); return [...as] },
      add: vi.fn(async (a: Account) => { as.push(a); bump(aRev); return a }),
      remove: vi.fn(async (id: string) => { const i = as.findIndex((a) => a.id === id); if (i >= 0) as.splice(i, 1); bump(aRev) }),
    },
  }
}

const mount = async (s: Awaited<ReturnType<typeof stores>>) => render(<oyl-finance store={s.journal} budgets={s.budgets} accounts={s.accounts} tz="UTC" />)

describe('oyl-finance', () => {
  it('shows the month, dashed tiles, the composer and the three empty states', async () => {
    const s = await stores()
    const { root } = await mount(s)
    expect(q(root, 'h2')).toHaveTextContent(monthHeading(today()))
    expect(tileRows(root)).toEqual([{ currency: null, values: ['—', '—', '—'] }])
    expect(q(root, 'oyl-transaction-form')).not.toBeNull()
    expect(q(root, 'ui-select[name="ledgerFilter"]')).toBeNull()
    expect(q(root, '[data-role="ledger-empty"]')).toHaveTextContent('No transactions this month.')
    expect(q(root, 'section.budgets details oyl-budget-form')).not.toBeNull()
    expect(q(root, 'section.budgets .empty')).toHaveTextContent('No budgets yet.')
    expect(q(root, 'section.accounts details oyl-account-form')).not.toBeNull()
    expect(q(root, 'section.accounts .empty')).toHaveTextContent('No accounts yet.')
  })

  it('totals per currency and lists the month newest first with account names and signs', async () => {
    const t = today()
    const s = await stores([
      tx(10, 'expense', t.addDays(-1), { accountId: checking.id, note: 'weekly shop' }),
      tx(30, 'income', t),
      tx(5, 'expense', t, { currency: 'EUR' }),
      tx(99, 'expense', t.addDays(-45)),
    ], [], [checking])
    const { root } = await mount(s)
    expect(tileRows(root)).toEqual([
      { currency: 'USD', values: ['$10.00', '$30.00', '+$20.00'] },
      { currency: 'EUR', values: ['€5.00', '€0.00', '−€5.00'] },
    ])
    const rows = ledger(root)
    expect(rows.map((r) => r.label)).toEqual(['salary', 'groceries', 'groceries'])
    expect(rows.map((r) => r.value)).toEqual(['+$30.00', '−€5.00', '−$10.00'])
    expect(rows[2].lines[0]).toContain('Checking')
    expect(rows[2].lines[1]).toBe('weekly shop')
    expect(q(root, '[data-role="ledger-empty"]')).toBeNull()
  })

  it('filters the ledger by account and by cash', async () => {
    const t = today()
    const s = await stores([tx(20, 'expense', t, { accountId: checking.id }), tx(7, 'expense', t)], [], [checking])
    const { root, waitForChanges } = await mount(s)
    const filter = q(root, 'ui-select[name="ledgerFilter"]') as any
    expect(filter.options).toEqual([{ value: '', label: 'All accounts' }, { value: 'cash', label: 'Cash' }, { value: checking.id, label: 'Checking' }])
    expect(ledger(root)).toHaveLength(2)
    pickFilter(root, checking.id)
    await waitForChanges()
    expect(ledger(root).map((r) => r.value)).toEqual(['−$20.00'])
    pickFilter(root, 'cash')
    await waitForChanges()
    expect(ledger(root).map((r) => r.value)).toEqual(['−$7.00'])
    await s.journal.remove((ledger(root)[0] as any).itemId)
    await flush(); await waitForChanges()
    expect(ledger(root)).toHaveLength(0)
    expect(q(root, '[data-role="ledger-empty"]')).toHaveTextContent('No transactions for this view.')
  })

  it('row removals call the right store and announce; form adds announce by kind', async () => {
    const t = today()
    const a = tx(1, 'expense', t)
    const b = new Budget({ category: 'dining', limit: usd(150) })
    const s = await stores([a], [b], [checking])
    const { root, waitForChanges } = await mount(s)
    const live = () => q(root, '[aria-live]')!
    q(root, 'ol.ledger oyl-item-row')!.dispatchEvent(new CustomEvent('remove', { detail: a.id, bubbles: true }))
    await flush(); await waitForChanges()
    expect(s.journal.remove).toHaveBeenCalledWith(a.id)
    expect(live()).toHaveTextContent('Deleted')
    const budgetRow = q(root, 'oyl-budget-row') as any
    expect(budgetRow.status.spent.minor).toBe(9300)
    budgetRow.dispatchEvent(new CustomEvent('remove', { detail: b.id, bubbles: true }))
    await flush(); await waitForChanges()
    expect(s.budgets.remove).toHaveBeenCalledWith(b.id)
    expect(qa(root, 'oyl-budget-row')).toHaveLength(0)
    const acctRow = q(root, 'ol.accounts oyl-item-row') as any
    expect(acctRow.label).toBe('Checking')
    expect(acctRow.value).toBe('$2415.80')
    expect(acctRow.lines[0]).toBe('USD · $65.00 this month')
    acctRow.dispatchEvent(new CustomEvent('remove', { detail: checking.id, bubbles: true }))
    await flush(); await waitForChanges()
    expect(s.accounts.remove).toHaveBeenCalledWith(checking.id)
    for (const [tag, detail, text] of [['oyl-transaction-form', 'income', 'Income added'], ['oyl-transaction-form', 'expense', 'Expense added'], ['oyl-budget-form', undefined, 'Budget added'], ['oyl-account-form', undefined, 'Account added']] as const) {
      q(root, tag)!.dispatchEvent(new CustomEvent('added', { detail, bubbles: true }))
      await waitForChanges()
      expect(live()).toHaveTextContent(text)
    }
  })
})
