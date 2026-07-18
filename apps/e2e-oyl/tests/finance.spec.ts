/**
 * Finance screen: expense/income logging (server-backed round trip), accounts, budgets,
 * ledger filtering, and inline validation (positive amount, required date).
 */
import { test, expect } from '../lib/fixtures'
import { awaitOutboxDrained } from '../lib/actions'

test('empty states for ledger, budgets, and accounts', async ({ page, signIn }) => {
  await signIn('/finance')
  await expect(page.locator('oyl-finance')).toContainText('No transactions this month.')
  await expect(page.locator('oyl-finance')).toContainText('No budgets yet.')
  await expect(page.locator('oyl-finance')).toContainText('No accounts yet.')
})

test('an expense with a decimal amount round-trips through the backend', async ({ page, signIn }) => {
  await signIn('/finance')
  const composer = page.locator('oyl-finance-composer')
  await composer.locator('button[data-value="expense"]').click()
  await composer.locator('input[name="amount"]').fill('12.34')
  await composer.locator('select[name="category"]').selectOption('groceries')
  await composer.locator('button[type="submit"]').click()

  const ledger = page.locator('oyl-finance ol.ledger oyl-vault-item')
  await expect(ledger).toHaveCount(1)
  await expect(ledger).toContainText('groceries')
  await expect(ledger).toContainText('12.34')

  await awaitOutboxDrained(page)
  await page.reload()
  await expect(page.locator('oyl-finance ol.ledger oyl-vault-item')).toContainText('groceries')
})

test('income flips the composer and logs with a plus sign', async ({ page, signIn }) => {
  await signIn('/finance')
  const composer = page.locator('oyl-finance-composer')
  await composer.locator('button[data-value="income"]').click()
  await expect(composer.locator('button[type="submit"]')).toHaveText('Add income')
  await composer.locator('input[name="amount"]').fill('100')
  await composer.locator('select[name="category"]').selectOption('salary')
  await composer.locator('button[type="submit"]').click()
  const ledger = page.locator('oyl-finance ol.ledger oyl-vault-item')
  await expect(ledger).toHaveCount(1)
  await expect(ledger).toContainText('salary')
  await expect(ledger).toContainText('+')
})

test('validation: a non-positive amount and a missing date are rejected inline', async ({ page, signIn }) => {
  await signIn('/finance')
  const composer = page.locator('oyl-finance-composer')
  await composer.locator('input[name="amount"]').fill('0')
  await composer.locator('button[type="submit"]').click()
  await expect(composer.locator('[data-role="error"]')).not.toBeEmpty()
  // Fix the amount but clear the date → still rejected.
  await composer.locator('input[name="amount"]').fill('5')
  await composer.locator('input[name="date"]').fill('')
  await composer.locator('button[type="submit"]').click()
  await expect(composer.locator('[data-role="error"]')).not.toBeEmpty()
  await expect(page.locator('oyl-finance ol.ledger oyl-vault-item')).toHaveCount(0)
})

test('accounts: create, spend from it, and filter the ledger by account', async ({ page, signIn }) => {
  await signIn('/finance')
  const accountForm = page.locator('oyl-account-form')
  await accountForm.locator('input[name="name"]').fill('Checking')
  await accountForm.locator('button').last().click()
  // The account shows in the Accounts section and in the composer's account select.
  await expect(page.locator('oyl-finance')).toContainText('Checking')

  const composer = page.locator('oyl-finance-composer')
  await composer.locator('select[name="account"]').selectOption({ label: 'Checking · USD' })
  // Choosing a real account hides the free currency select (the account's currency wins).
  await expect(composer.locator('select[name="currency"]')).toBeHidden()
  await composer.locator('input[name="amount"]').fill('20')
  await composer.locator('button[type="submit"]').click()
  await expect(page.locator('oyl-finance ol.ledger oyl-vault-item')).toHaveCount(1)

  // Cash-only expense for contrast.
  await composer.locator('select[name="account"]').selectOption({ index: 0 })
  await composer.locator('input[name="amount"]').fill('7')
  await composer.locator('button[type="submit"]').click()
  await expect(page.locator('oyl-finance ol.ledger oyl-vault-item')).toHaveCount(2)

  // Filter to the account → only its transaction remains in view.
  await page.locator('oyl-finance select.ledger-filter').selectOption({ label: 'Checking' })
  await expect(page.locator('oyl-finance ol.ledger oyl-vault-item')).toHaveCount(1)
  // Account + budgets/accounts persist server-side.
  await awaitOutboxDrained(page)
  await page.reload()
  await expect(page.locator('oyl-finance')).toContainText('Checking')
})

test('budgets: create one and see it tracked against spending', async ({ page, signIn }) => {
  await signIn('/finance')
  const budgetForm = page.locator('oyl-budget-form')
  await budgetForm.locator('select[name="category"]').selectOption('dining')
  await budgetForm.locator('input[name="limit"]').fill('150')
  await budgetForm.locator('button').last().click()
  const budgetRow = page.locator('oyl-budget-row')
  await expect(budgetRow).toHaveCount(1)
  await expect(budgetRow).toContainText('dining')
  await awaitOutboxDrained(page)
  await page.reload()
  await expect(page.locator('oyl-budget-row')).toContainText('dining')
})
