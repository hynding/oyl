import { Component, Element, Event, Prop, State, h, type EventEmitter } from '@stencil/core'
import { Transaction, Money, type Account, type Entry, type Id } from '@oyl/all-of-oyl'
import { effect, now } from '@oyl/all-of-oyl/client'
import { CURRENCIES, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../../finance/format.js'

export interface TransactionWriter {
  add(entry: Entry): Promise<unknown>
}
export interface AccountsReader {
  all(): readonly Account[]
}

export type Direction = 'expense' | 'income'
type FieldError = 'amount' | 'date' | null

/**
 * The finance composer: an expense or income with amount (+ currency unless an account is
 * chosen — the account's currency wins), account, category (per direction), date and note.
 * Vanilla's validation order (date, then amount) precedes the domain constructor. The
 * composer owns currency/category/account as state: `ui-select` syncs silently when its
 * options change, so it never trusts the select for a value it was not told about.
 */
@Component({ tag: 'oyl-transaction-form', styleUrl: 'oyl-transaction-form.css', shadow: true })
export class OylTransactionForm {
  @Element() host!: HTMLElement

  @Prop() store!: TransactionWriter
  @Prop() accounts!: AccountsReader

  /** A transaction was added; detail = its direction. */
  @Event() added!: EventEmitter<Direction>

  @State() direction: Direction = 'expense'
  @State() accountId = ''
  @State() currency: string = CURRENCIES[0]!
  @State() category: string = EXPENSE_CATEGORIES[0]!
  @State() error = ''
  @State() fieldError: FieldError = null
  @State() list: readonly Account[] = []

  private stop = () => {}

  componentWillLoad() {
    this.stop = effect(() => {
      this.list = this.accounts.all()
      if (this.accountId !== '' && !this.list.some((a) => a.id === this.accountId)) this.accountId = ''
    })
  }

  disconnectedCallback() {
    this.stop()
  }

  private field(name: string): (HTMLElement & { value: string }) | null {
    return this.host.shadowRoot?.querySelector(`ui-field[name="${name}"]`) as (HTMLElement & { value: string }) | null
  }

  private categories(): readonly string[] {
    return this.direction === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  }

  private onDirection = (e: CustomEvent<{ value: string }>) => {
    e.stopPropagation()
    this.direction = e.detail.value as Direction
    const cats = this.categories()
    if (!cats.includes(this.category)) this.category = cats[0]!
    this.error = ''
    this.fieldError = null
  }

  private onSubmit = (ev: Event) => {
    ev.preventDefault()
    void this.submit()
  }

  private fail(message: string, field: FieldError) {
    this.error = message
    this.fieldError = field
  }

  private async submit() {
    this.error = ''
    this.fieldError = null
    const date = this.field('date')?.value ?? ''
    if (!date) return this.fail('Pick a date', 'date')
    const amt = Number(this.field('amount')?.value ?? '')
    if (!(amt > 0)) return this.fail('Amount must be positive', 'amount')
    try {
      const acc = this.accountId ? this.list.find((a) => a.id === this.accountId) : undefined
      const currency = acc ? acc.currency : this.currency
      const note = this.field('note')?.value ?? ''
      const props: ConstructorParameters<typeof Transaction>[0] = {
        occurredAt: new Date(`${date}T12:00:00`),
        amount: Money.fromMajor(amt, currency),
        category: this.category,
        direction: this.direction,
      }
      if (acc) props.account = { id: acc.id as Id, currency: acc.currency }
      if (note) props.note = note
      await this.store.add(new Transaction(props))
      for (const name of ['amount', 'note']) { const f = this.field(name); if (f) f.value = '' }
      this.added.emit(this.direction)
    } catch (err) {
      this.fail(err instanceof Error ? err.message : String(err), 'amount')
    }
  }

  render() {
    const cats = this.categories()
    return (
      <ui-card>
        <form onSubmit={this.onSubmit}>
          <ui-segment
            name="direction"
            label="Direction"
            options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]}
            value={this.direction}
            onUiChange={this.onDirection}
          />
          <div class="row2">
            <ui-field name="amount" label="Amount" type="number" error={this.fieldError === 'amount' ? this.error : undefined} />
            {this.accountId === '' && (
              <ui-select
                name="currency"
                label="Currency"
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                value={this.currency}
                onUiChange={(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.currency = e.detail.value }}
              />
            )}
          </div>
          <div class="row2">
            <ui-select
              name="account"
              label="Account"
              options={[{ value: '', label: 'Cash (no account)' }, ...this.list.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }))]}
              value={this.accountId}
              onUiChange={(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.accountId = e.detail.value }}
            />
            <ui-select
              name="category"
              label="Category"
              options={cats.map((c) => ({ value: c, label: c }))}
              value={this.category}
              onUiChange={(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.category = e.detail.value }}
            />
          </div>
          <div class="row2">
            <ui-field name="date" label="Date" type="date" value={now().toISOString().slice(0, 10)} error={this.fieldError === 'date' ? this.error : undefined} />
            <ui-field name="note" label="Note (optional)" />
          </div>
          <p data-role="error" aria-live="polite">{this.error}</p>
          <div class="actions">
            <ui-button type="submit" variant="primary">{this.direction === 'income' ? 'Add income' : 'Add expense'}</ui-button>
          </div>
        </form>
      </ui-card>
    )
  }
}
