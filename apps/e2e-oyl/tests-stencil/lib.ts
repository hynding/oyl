/**
 * Stencil-shell helpers. Playwright CSS pierces open shadow roots, so most vanilla selectors
 * carry over with these renames: oyl-status-panel → oyl-status, oyl-theme-toggle →
 * oyl-theme-picker, `button[data-act]` → `ui-button[data-act]`, nav anchors live in
 * `oyl-nav ui-nav a`. Form inputs sit inside ui-field: `ui-field[name=…] input`.
 */
import { expect, type Locator, type Page } from '@playwright/test'
export { awaitOutboxDrained, primeLocalMode } from '../lib/actions'

/** Navigate via the primary nav (exercises the link interceptor, not page.goto). */
export async function navTo(page: Page, route: string): Promise<void> {
  await page.locator(`oyl-nav ui-nav a[href="/${route}"]`).click()
  await expect(page).toHaveURL(`/${route}`)
}

/** The rendered text of an element INCLUDING its shadow tree (textContent stops at shadow roots). */
export function deepText(locator: Locator): Promise<string> {
  return locator.evaluate((el) => {
    const walk = (n: Node): string =>
      ((n as Element).shadowRoot ? walk((n as Element).shadowRoot!) : '') +
      [...n.childNodes].map((c) => (c.nodeType === 3 ? c.textContent ?? '' : c.nodeType === 1 ? walk(c) : '')).join('')
    return walk(el)
  })
}

/** Add a journal note through the stencil composer. */
export async function addNote(page: Page, text: string, tags?: string): Promise<void> {
  const form = page.locator('oyl-log-form')
  await form.locator('ui-segment [data-value="note"]').click()
  await form.locator('ui-textarea[name="text"] textarea').fill(text)
  if (tags) await form.locator('ui-field[name="tags"] input').fill(tags)
  await form.locator('ui-button[type="submit"] button').click()
}

/** Add a task through the stencil planner composer (due defaults to the shown day). */
export async function addTask(page: Page, title: string, due?: string): Promise<void> {
  const form = page.locator('oyl-plan-composer')
  await form.locator('ui-segment [data-value="task"]').click()
  await form.locator('ui-field[name="title"] input').fill(title)
  if (due) await form.locator('ui-field[name="due"] input').fill(due)
  await form.locator('ui-button[type="submit"] button').click()
}

/** Add a consumable to the catalog through the stencil nutrition screen's disclosure form. */
export async function addConsumable(page: Page, name: string, calories: string): Promise<void> {
  const details = page.locator('oyl-nutrition details')
  if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) await details.locator('summary').click()
  const form = page.locator('oyl-consumable-form')
  await form.locator('ui-field[name="name"] input').fill(name)
  await form.locator('ui-field[name="calories"] input').fill(calories)
  await form.locator('ui-button[type="submit"] button').click()
}

/** Log an ad-hoc meal through the stencil meal composer. */
export async function logAdhoc(page: Page, note: string, calories: string, protein?: string): Promise<void> {
  const form = page.locator('oyl-meal-form')
  await form.locator('ui-segment [data-value="adhoc"]').click()
  await form.locator('ui-field[name="note"] input').fill(note)
  await form.locator('ui-field[name="calories"] input').fill(calories)
  if (protein) await form.locator('ui-field[name="protein"] input').fill(protein)
  await form.locator('ui-button[type="submit"] button').click()
}

/** Open a collapsed `<details>` (scoped — several exist per screen) if it is not already open. */
async function openDetails(details: Locator): Promise<void> {
  if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) await details.locator('summary').click()
}

/** Log an expense through the stencil finance composer (cash unless `accountLabel` is given). */
export async function addExpense(page: Page, amount: string, category = 'groceries', accountLabel?: string): Promise<void> {
  const form = page.locator('oyl-transaction-form')
  await form.locator('ui-segment [data-value="expense"]').click()
  if (accountLabel !== undefined) await form.locator('ui-select[name="account"] select').selectOption({ label: accountLabel })
  await form.locator('ui-field[name="amount"] input').fill(amount)
  await form.locator('ui-select[name="category"] select').selectOption(category)
  await form.locator('ui-button[type="submit"] button').click()
}

/** Add an account through the Accounts section's disclosure form. */
export async function addAccount(page: Page, name: string, currency = 'USD'): Promise<void> {
  await openDetails(page.locator('oyl-finance section.accounts details'))
  const form = page.locator('oyl-account-form')
  await form.locator('ui-field[name="name"] input').fill(name)
  await form.locator('ui-select[name="currency"] select').selectOption(currency)
  await form.locator('ui-button[type="submit"] button').click()
}

/** Add a budget through the Budgets section's disclosure form. */
export async function addBudget(page: Page, category: string, limit: string): Promise<void> {
  await openDetails(page.locator('oyl-finance section.budgets details'))
  const form = page.locator('oyl-budget-form')
  await form.locator('ui-select[name="category"] select').selectOption(category)
  await form.locator('ui-field[name="limit"] input').fill(limit)
  await form.locator('ui-button[type="submit"] button').click()
}

export type VaultKind = 'documents' | 'possessions' | 'subscriptions' | 'contacts'

/** Show a vault kind (segment) and open its "New …" disclosure form. */
export async function vaultKind(page: Page, kind: VaultKind): Promise<void> {
  await page.locator(`oyl-vault ui-segment [data-value="${kind}"]`).click()
  await openDetails(page.locator(`oyl-vault section.${kind} details`))
}

export async function addDocument(page: Page, name: string, kind: string, expiresOn?: string): Promise<void> {
  await vaultKind(page, 'documents')
  const form = page.locator('oyl-document-form')
  await form.locator('ui-field[name="name"] input').fill(name)
  await form.locator('ui-field[name="kind"] input').fill(kind)
  if (expiresOn) await form.locator('ui-field[name="expiresOn"] input').fill(expiresOn)
  await form.locator('ui-button[type="submit"] button').click()
}

export async function addSubscription(page: Page, name: string, amount: string, anchor: string, opts: { unit?: string; category?: string } = {}): Promise<void> {
  await vaultKind(page, 'subscriptions')
  const form = page.locator('oyl-subscription-form')
  await form.locator('ui-field[name="name"] input').fill(name)
  await form.locator('ui-field[name="amount"] input').fill(amount)
  if (opts.unit) await form.locator('ui-select[name="cadenceUnit"] select').selectOption(opts.unit)
  await form.locator('ui-field[name="anchor"] input').fill(anchor)
  if (opts.category) await form.locator('ui-select[name="category"] select').selectOption(opts.category)
  await form.locator('ui-button[type="submit"] button').click()
}

export async function addContact(page: Page, name: string): Promise<void> {
  await vaultKind(page, 'contacts')
  const form = page.locator('oyl-contact-form')
  await form.locator('ui-field[name="name"] input').fill(name)
  await form.locator('ui-button[type="submit"] button').click()
}

/** Click a ui-button by its data-act (the inner control, as a user would). */
export function act(scope: Locator | Page, name: string): Locator {
  return scope.locator(`ui-button[data-act="${name}"] button`)
}



/** Add a goal through the Goals screen's disclosure form (preset by label; period only when given). */
export async function addGoal(page: Page, opts: { preset?: string; name?: string; target: string; period?: string }): Promise<void> {
  await openDetails(page.locator('oyl-goals details'))
  const form = page.locator('oyl-goal-form')
  if (opts.preset) await form.locator('ui-select[name="preset"] select').selectOption({ label: opts.preset })
  if (opts.name) await form.locator('ui-field[name="name"] input').fill(opts.name)
  await form.locator('ui-field[name="target"] input').fill(opts.target)
  if (opts.period) await form.locator('ui-select[name="period"] select').selectOption(opts.period)
  await form.locator('ui-button[type="submit"] button').click()
}
