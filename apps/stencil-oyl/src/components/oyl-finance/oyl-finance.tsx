import { Component, Element, Prop, State, h } from '@stencil/core'
import { DayKey, periodWindowOf, type Account, type Budget, type DayRange, type Id, type Money, type Transaction } from '@oyl/all-of-oyl'
import { effect, now } from '@oyl/all-of-oyl/client'
import { formatMoney } from '@oyl/all-of-oyl/format'
import { accountSpendLabel, monthHeading, monthTotals, signedMoney, transactionLines, transactionValue, type MonthTotal } from '../../finance/format.js'
import type { AccountsReader, Direction, TransactionWriter } from '../oyl-transaction-form/oyl-transaction-form.js'
import type { BudgetStatus } from '../oyl-budget-row/oyl-budget-row.js'
import type { BudgetsWriter } from '../oyl-budget-form/oyl-budget-form.js'
import type { AccountsWriter } from '../oyl-account-form/oyl-account-form.js'

export interface FinanceReader extends TransactionWriter {
  transactionsIn(range: DayRange): readonly Transaction[]
  budgetStatus(budget: Budget, day: DayKey): BudgetStatus
  accountBalance(account: Account): Money
  accountSpend(account: Account, day: DayKey): Money
  remove(id: Id): Promise<unknown>
}
export interface BudgetsStore extends BudgetsWriter {
  all(): readonly Budget[]
  remove(id: Id): Promise<unknown>
}
export interface AccountsStore extends AccountsReader, AccountsWriter {
  remove(id: Id): Promise<unknown>
}

/**
 * The month's finances: spent/income/net tiles per currency, the composer, the ledger with
 * an account filter, then Budgets and Accounts with collapsed add forms. Lists and math are
 * vanilla's (`periodWindowOf('month', today)`, `budgetStatus`, `accountBalance/Spend`).
 */
@Component({ tag: 'oyl-finance', styleUrl: 'oyl-finance.css', shadow: true })
export class OylFinance {
  @Element() host!: HTMLElement

  @Prop() store!: FinanceReader
  @Prop() budgets!: BudgetsStore
  @Prop() accounts!: AccountsStore
  @Prop() tz = 'UTC'

  @State() filter = ''
  @State() txs: readonly Transaction[] = []
  @State() budgetList: readonly Budget[] = []
  @State() accountList: readonly Account[] = []
  @State() announcement = ''

  private stop = () => {}

  componentWillLoad() {
    // One effect over the journal (transactionsIn tracks it), budgets and accounts revisions. Each
    // run assigns fresh arrays, so the screen re-renders and budget/account rows get fresh status.
    this.stop = effect(() => {
      const today = this.today()
      this.txs = [...this.store.transactionsIn(periodWindowOf('month', today))].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      this.budgetList = this.budgets.all()
      this.accountList = this.accounts.all()
    })
  }

  disconnectedCallback() {
    this.stop()
  }

  private today() {
    return DayKey.from(now(), this.tz)
  }

  private onFilter = (e: CustomEvent<{ value: string }>) => {
    e.stopPropagation()
    this.filter = e.detail.value
  }

  private onRemoveTx = (e: CustomEvent<string>) => {
    e.stopPropagation()
    void this.store.remove(e.detail as Id)
    this.announcement = 'Deleted'
  }

  private onRemoveBudget = (e: CustomEvent<Id>) => {
    e.stopPropagation()
    void this.budgets.remove(e.detail)
    this.announcement = 'Deleted'
  }

  private onRemoveAccount = (e: CustomEvent<string>) => {
    e.stopPropagation()
    void this.accounts.remove(e.detail as Id)
    this.announcement = 'Deleted'
  }

  private onTxAdded = (e: CustomEvent<Direction>) => {
    e.stopPropagation()
    this.announcement = e.detail === 'income' ? 'Income added' : 'Expense added'
  }

  private onBudgetAdded = (e: Event) => {
    e.stopPropagation()
    this.announcement = 'Budget added'
  }

  private onAccountAdded = (e: Event) => {
    e.stopPropagation()
    this.announcement = 'Account added'
  }

  private renderTiles(totals: readonly MonthTotal[]) {
    if (totals.length === 0) {
      return (
        <div class="tiles">
          {['spent', 'income', 'net'].map((cap) => <div class="tile" aria-label={`— ${cap}`}><b>—</b><small>{cap}</small></div>)}
        </div>
      )
    }
    const many = totals.length > 1
    return totals.map((t) => (
      <div class="tiles" data-currency={t.currency}>
        {([['spent', formatMoney(t.spent)], ['income', formatMoney(t.income)], ['net', signedMoney(t.net)]] as const).map(([cap, value]) => {
          const caption = many ? `${t.currency} ${cap}` : cap
          return <div class="tile" aria-label={`${value} ${caption}`}><b>{value}</b><small>{caption}</small></div>
        })}
      </div>
    ))
  }

  render() {
    const today = this.today()
    const accounts = this.accountList
    const filter = this.filter === '' || this.filter === 'cash' || accounts.some((a) => a.id === this.filter) ? this.filter : ''
    const namesById = new Map(accounts.map((a) => [a.id as string, a.name]))
    const rows = this.txs.filter((tx) => (filter === '' ? true : filter === 'cash' ? tx.accountId === undefined : tx.accountId === filter))
    return (
      <div class="screen">
        <h2 tabindex="-1">{monthHeading(today)}</h2>
        <div class="sr-only" aria-live="polite">{this.announcement}</div>
        <div class="totals" data-role="totals" role="group" aria-label="Month totals">{this.renderTiles(monthTotals(this.txs))}</div>
        <oyl-transaction-form store={this.store} accounts={this.accounts} onAdded={this.onTxAdded} />
        <div class="section-head">
          <div class="section-label">This month</div>
          {accounts.length > 0 && (
            <ui-select
              name="ledgerFilter"
              label="Show"
              options={[{ value: '', label: 'All accounts' }, { value: 'cash', label: 'Cash' }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]}
              value={filter}
              onUiChange={this.onFilter}
            />
          )}
        </div>
        {rows.length > 0 ? (
          <ol class="ledger">
            {rows.map((tx) => (
              <li key={tx.id}>
                <oyl-item-row
                  itemId={tx.id}
                  label={tx.category}
                  lines={transactionLines(tx, namesById, this.tz)}
                  value={transactionValue(tx)}
                  tone={tx.direction === 'income' ? 'ok' : undefined}
                  onRemove={this.onRemoveTx}
                />
              </li>
            ))}
          </ol>
        ) : (
          <div class="empty" data-role="ledger-empty">{filter === '' ? 'No transactions this month.' : 'No transactions for this view.'}</div>
        )}
        <section class="budgets">
          <div class="section-label">Budgets</div>
          <details>
            <summary>New budget</summary>
            <oyl-budget-form store={this.budgets} onAdded={this.onBudgetAdded} />
          </details>
          {this.budgetList.length > 0 ? (
            <ol class="budgets">
              {this.budgetList.map((b) => (
                <li key={b.id}>
                  <oyl-budget-row budget={b} status={this.store.budgetStatus(b, today)} onRemove={this.onRemoveBudget} />
                </li>
              ))}
            </ol>
          ) : (
            <div class="empty">No budgets yet.</div>
          )}
        </section>
        <section class="accounts">
          <div class="section-label">Accounts</div>
          <details>
            <summary>New account</summary>
            <oyl-account-form store={this.accounts} onAdded={this.onAccountAdded} />
          </details>
          {accounts.length > 0 ? (
            <ol class="accounts">
              {accounts.map((a) => (
                <li key={a.id}>
                  <oyl-item-row
                    itemId={a.id}
                    label={a.name}
                    lines={[`${a.currency} · ${accountSpendLabel(this.store.accountSpend(a, today))}`]}
                    value={formatMoney(this.store.accountBalance(a))}
                    removeLabel={`Delete account ${a.name}`}
                    onRemove={this.onRemoveAccount}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <div class="empty">No accounts yet.</div>
          )}
        </section>
      </div>
    )
  }
}
