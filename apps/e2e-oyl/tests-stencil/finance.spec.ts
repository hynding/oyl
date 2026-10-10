/**
 * Finance screen on the stencil shell: expense/income logging (server-backed round trip),
 * month tiles, accounts, budgets, ledger filtering, inline validation (date, positive
 * amount) and inline delete confirms. All three kinds are backed, so persistence is asserted.
 */
import { test, expect } from '../lib/fixtures'
import { inlineConfirm } from '../lib/actions'
import { addAccount, addBudget, addExpense, awaitOutboxDrained, deepText } from './lib'

const ledger = (page: import('@playwright/test').Page) => page.locator('oyl-finance ol.ledger oyl-item-row')
const totals = (page: import('@playwright/test').Page) => deepText(page.locator('oyl-finance [data-role="totals"]'))

test('empty states for ledger, budgets, accounts and dashed tiles', async ({ page, signIn }) => {
  await signIn('/finance')
  const text = () => deepText(page.locator('oyl-finance'))
  await expect.poll(text).toContain('No transactions this month.')
  expect(await text()).toContain('No budgets yet.')
  expect(await text()).toContain('No accounts yet.')
  expect(await totals(page)).toContain('—spent')
})

test('an expense with a decimal amount round-trips through the backend and totals the month', async ({ page, signIn }) => {
  await signIn('/finance')
  await addExpense(page, '12.34', 'groceries')
  await expect(ledger(page)).toHaveCount(1)
  await expect.poll(() => deepText(ledger(page))).toContain('groceries')
  expect(await deepText(ledger(page))).toContain('12.34')
  await expect.poll(() => totals(page)).toContain('$12.34spent')
  await awaitOutboxDrained(page)
  await page.reload()
  await expect(ledger(page)).toHaveCount(1)
  await expect.poll(() => deepText(ledger(page))).toContain('groceries')
  await expect.poll(() => totals(page)).toContain('$12.34spent')
})

test('income flips the composer and logs with a plus sign', async ({ page, signIn }) => {
  await signIn('/finance')
  const form = page.locator('oyl-transaction-form')
  await form.locator('ui-segment [data-value="income"]').click()
  await expect(form.locator('ui-button[type="submit"]')).toHaveText('Add income')
  await form.locator('ui-field[name="amount"] input').fill('100')
  await form.locator('ui-select[name="category"] select').selectOption('salary')
  await form.locator('ui-button[type="submit"] button').click()
  await expect(ledger(page)).toHaveCount(1)
  await expect.poll(() => deepText(ledger(page))).toContain('salary')
  expect(await deepText(ledger(page))).toContain('+$100.00')
  await expect.poll(() => totals(page)).toContain('+$100.00net')
})

test('validation: a non-positive amount and a missing date are rejected inline', async ({ page, signIn }) => {
  await signIn('/finance')
  const form = page.locator('oyl-transaction-form')
  await form.locator('ui-field[name="amount"] input').fill('0')
  await form.locator('ui-button[type="submit"] button').click()
  await expect(form.locator('[data-role="error"]')).toContainText('Amount must be positive')
  await form.locator('ui-field[name="amount"] input').fill('5')
  await form.locator('ui-field[name="date"] input').fill('')
  await form.locator('ui-button[type="submit"] button').click()
  await expect(form.locator('[data-role="error"]')).toContainText('Pick a date')
  await expect(ledger(page)).toHaveCount(0)
})

test('accounts: create, spend from it, and filter the ledger by account', async ({ page, signIn }) => {
  await signIn('/finance')
  await addAccount(page, 'Checking')
  await expect(page.locator('oyl-finance ol.accounts oyl-item-row')).toHaveCount(1)
  await expect.poll(() => deepText(page.locator('oyl-finance ol.accounts oyl-item-row'))).toContain('Checking')

  const form = page.locator('oyl-transaction-form')
  await form.locator('ui-select[name="account"] select').selectOption({ label: 'Checking · USD' })
  // Choosing a real account removes the free currency select (the account's currency wins).
  await expect(form.locator('ui-select[name="currency"]')).toHaveCount(0)
  await form.locator('ui-field[name="amount"] input').fill('20')
  await form.locator('ui-button[type="submit"] button').click()
  await expect(ledger(page)).toHaveCount(1)

  // Cash-only expense for contrast.
  await form.locator('ui-select[name="account"] select').selectOption({ index: 0 })
  await expect(form.locator('ui-select[name="currency"]')).toHaveCount(1)
  await form.locator('ui-field[name="amount"] input').fill('7')
  await form.locator('ui-button[type="submit"] button').click()
  await expect(ledger(page)).toHaveCount(2)

  // Filter to the account → only its transaction remains in view.
  await page.locator('oyl-finance ui-select[name="ledgerFilter"] select').selectOption({ label: 'Checking' })
  await expect(ledger(page)).toHaveCount(1)
  await expect.poll(() => deepText(ledger(page))).toContain('Checking')
  await page.locator('oyl-finance ui-select[name="ledgerFilter"] select').selectOption({ label: 'Cash' })
  await expect(ledger(page)).toHaveCount(1)
  await expect.poll(() => deepText(ledger(page))).toContain('$7.00')

  await awaitOutboxDrained(page)
  await page.reload()
  await expect(page.locator('oyl-finance ol.accounts oyl-item-row')).toHaveCount(1)
})

test('budgets: create one and see it tracked against spending', async ({ page, signIn }) => {
  await signIn('/finance')
  await addExpense(page, '30', 'dining')
  await addBudget(page, 'dining', '150')
  const row = page.locator('oyl-budget-row')
  await expect(row).toHaveCount(1)
  await expect.poll(() => deepText(row)).toContain('dining')
  expect(await deepText(row)).toContain('$30.00 of $150.00')
  await awaitOutboxDrained(page)
  await page.reload()
  await expect(page.locator('oyl-budget-row')).toHaveCount(1)
  await expect.poll(() => deepText(page.locator('oyl-budget-row'))).toContain('dining')
})

test('deleting a transaction asks inline and clears the tiles', async ({ page, signIn }) => {
  await signIn('/finance')
  await addExpense(page, '9', 'other')
  const row = ledger(page)
  await inlineConfirm(row, 'delete', 'no')
  await expect(row).toHaveCount(1)
  await inlineConfirm(row, 'delete', 'yes')
  await expect(ledger(page)).toHaveCount(0)
  await expect.poll(() => totals(page)).toContain('—spent')
})
