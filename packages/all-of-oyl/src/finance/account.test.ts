import { describe, expect, it } from 'vitest'
import { Account } from './account.js'
import { Id } from '../core/id.js'
import { DomainError } from '../core/domain-error.js'
import { Journal } from '../core/journal.js'
import { Transaction } from './transaction.js'
import { Money } from '../core/money.js'
import { DayKey } from '../core/day-key.js'

describe('Account', () => {
  it('constructs with name and ISO currency', () => {
    const checking = new Account({ name: 'Checking', currency: 'USD' })
    expect(checking.name).toBe('Checking')
    expect(checking.currency).toBe('USD')
    expect(Id.of(checking.id)).toBe(checking.id)
  })

  it('rejects bad currencies and empty names', () => {
    for (const props of [
      { name: 'Checking', currency: 'dollars' },
      { name: 'Checking', currency: 'usd' },
      { name: '', currency: 'USD' },
    ]) {
      let caught: unknown
      try {
        new Account(props)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
    }
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const shape = { id: '00000000-0000-4000-8000-000000000032', name: 'Checking', currency: 'USD', futureField: [] }
    expect(Account.fromJSON(shape).toJSON()).toEqual(shape)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [null, { name: 'Checking' }, { id: 'nope', name: 'Checking', currency: 'USD' }]) {
      let caught: unknown
      try {
        Account.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})

describe('Account.balanceIn / spentIn', () => {
  const day = DayKey.of('2026-06-15')
  const tx = (
    minor: number,
    dir: 'income' | 'expense',
    acc: Account,
    cur = 'USD',
    when = '2026-06-10T12:00:00Z',
  ): Transaction =>
    new Transaction({
      occurredAt: new Date(when),
      amount: Money.of(minor, cur, 2),
      category: dir === 'income' ? 'salary' : 'groceries',
      direction: dir,
      accountId: acc.id,
    })

  it('spentIn sums this-month expenses for the account, ignoring others and prior months', () => {
    const journal = new Journal('UTC')
    const checking = new Account({ name: 'Checking', currency: 'USD' })
    const visa = new Account({ name: 'Visa', currency: 'USD' })
    journal.add(tx(6500, 'expense', checking))
    journal.add(tx(1500, 'expense', checking))
    journal.add(tx(9999, 'expense', visa))
    journal.add(tx(5000, 'expense', checking, 'USD', '2026-04-10T12:00:00Z')) // prior month
    expect(checking.spentIn(journal, day).minor).toBe(8000)
    expect(visa.spentIn(journal, day).minor).toBe(9999)
  })

  it('spentIn returns a typed zero in the account currency when there are no transactions', () => {
    const journal = new Journal('UTC')
    const z = new Account({ name: 'Savings', currency: 'EUR' }).spentIn(journal, day)
    expect(z.minor).toBe(0)
    expect(z.currency).toBe('EUR')
  })

  it('balanceIn is income minus expense over all recorded transactions for the account', () => {
    const journal = new Journal('UTC')
    const checking = new Account({ name: 'Checking', currency: 'USD' })
    const visa = new Account({ name: 'Visa', currency: 'USD' })
    journal.add(tx(200000, 'income', checking))
    journal.add(tx(50000, 'expense', checking))
    journal.add(tx(9999, 'expense', visa))
    expect(checking.balanceIn(journal).minor).toBe(150000)
  })

  it('balanceIn is negative when expenses exceed income', () => {
    const journal = new Journal('UTC')
    const acc = new Account({ name: 'Cash', currency: 'USD' })
    journal.add(tx(5000, 'expense', acc))
    expect(acc.balanceIn(journal).minor).toBe(-5000)
  })

  it('balanceIn returns a typed zero for an account with no transactions', () => {
    const journal = new Journal('UTC')
    const z = new Account({ name: 'Savings', currency: 'EUR' }).balanceIn(journal)
    expect(z.minor).toBe(0)
    expect(z.currency).toBe('EUR')
  })

  it('balanceIn skips a transaction tagged to the account but in a different currency (R1 guard)', () => {
    const journal = new Journal('UTC')
    const checking = new Account({ name: 'Checking', currency: 'USD' })
    journal.add(tx(10000, 'income', checking, 'USD'))
    journal.add(tx(5000, 'income', checking, 'EUR'))
    expect(checking.balanceIn(journal).minor).toBe(10000)
    expect(checking.balanceIn(journal).currency).toBe('USD')
  })
})
