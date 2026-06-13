import { describe, expect, it } from 'vitest'
import { Account } from './account.js'
import { Transaction } from './transaction.js'
import { Id } from '../core/id.js'
import { MetricKey } from '../core/metric-key.js'
import { Money } from '../core/money.js'
import { DomainError } from '../core/domain-error.js'

const checking = new Account({ id: Id.of('00000000-0000-4000-8000-000000000032'), name: 'Checking', currency: 'USD' })
const when = new Date('2026-06-01T12:00:00Z')
const key = (s: string) => MetricKey.of(s)

describe('Transaction', () => {
  it('emits expense spending in major units under the category', () => {
    const groceries = new Transaction({ occurredAt: when, amount: Money.usd(4210), category: 'groceries', direction: 'expense', account: checking })
    expect(groceries.kind).toBe('transaction')
    expect(groceries.accountId).toBe(checking.id)
    expect(groceries.metrics().get(key('finance.spend.groceries'))).toBeCloseTo(42.1)
    expect(groceries.metrics().size).toBe(1)
  })

  it('emits income under finance.income', () => {
    const salary = new Transaction({ occurredAt: when, amount: Money.usd(500000), category: 'salary', direction: 'income' })
    expect(salary.accountId).toBeUndefined()
    expect(salary.metrics().get(key('finance.income.salary'))).toBe(5000)
  })

  it('a refund is a negative expense — finance.spend is net-of-refunds', () => {
    const refund = new Transaction({ occurredAt: when, amount: Money.usd(-1500), category: 'groceries', direction: 'expense' })
    expect(refund.metrics().get(key('finance.spend.groceries'))).toBe(-15)
  })

  it('rejects currency mismatch with the account, and bad categories', () => {
    let caught1: unknown
    try {
      new Transaction({ occurredAt: when, amount: Money.of(100, 'EUR'), category: 'groceries', direction: 'expense', account: checking })
    } catch (e) {
      caught1 = e
    }
    expect((caught1 as DomainError)?.code).toBe('CURRENCY_MISMATCH')

    let caught2: unknown
    try {
      new Transaction({ occurredAt: when, amount: Money.usd(100), category: 'two words', direction: 'expense' })
    } catch (e) {
      caught2 = e
    }
    expect((caught2 as DomainError)?.code).toBe('INVALID_SLUG')
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const tx = new Transaction({
      id: Id.of('00000000-0000-4000-8000-000000000102'),
      occurredAt: when,
      amount: Money.usd(4210),
      category: 'groceries',
      direction: 'expense',
      account: checking,
    })
    const revived = Transaction.fromJSON({ ...tx.toJSON(), futureField: 3 })
    expect(revived.amount.equals(Money.usd(4210))).toBe(true)
    expect(revived.accountId).toBe(checking.id)
    expect(revived.direction).toBe('expense')
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(3)
  })

  it('rejects conflicting account provenance', () => {
    let caught: unknown
    try {
      new Transaction({
        occurredAt: when,
        amount: Money.usd(100),
        category: 'groceries',
        direction: 'expense',
        account: checking,
        accountId: Id.of('00000000-0000-4000-8000-000000000099'),
      })
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_ID')
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [
      { kind: 'transaction', id: '00000000-0000-4000-8000-000000000102', occurredAt: when.toISOString(), category: 'groceries', direction: 'expense' }, // no amount
      { kind: 'transaction', id: '00000000-0000-4000-8000-000000000102', occurredAt: when.toISOString(), amount: Money.usd(1).toJSON(), category: 'groceries', direction: 'sideways' },
      { kind: 'transaction', id: '00000000-0000-4000-8000-000000000102', occurredAt: when.toISOString(), amount: Money.usd(1).toJSON(), category: 'groceries', direction: 'expense', accountId: 'nope' },
    ]) {
      let caught: unknown
      try {
        Transaction.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
