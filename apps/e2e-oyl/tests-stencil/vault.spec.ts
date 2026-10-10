/**
 * Vault screen on the stencil shell: the four kinds one at a time, the Upcoming horizon,
 * subscription renew → finance expense (dataState.renewSubscription), the gift-idea ↔ contact
 * dependency, and deletes.
 *
 * NOTE: vault collections have no Strapi backend yet — in-session assertions only. The
 * renew-created Transaction IS backed (asserted on the Finance ledger).
 */
import { test, expect } from '../lib/fixtures'
import { inlineConfirm } from '../lib/actions'
import { addContact, addDocument, addSubscription, deepText, navTo, vaultKind } from './lib'

function isoDaysFromToday(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const vaultText = (page: import('@playwright/test').Page) => deepText(page.locator('oyl-vault'))

test('empty states for upcoming and every kind', async ({ page, signIn }) => {
  await signIn('/vault')
  await expect.poll(() => vaultText(page)).toContain('Nothing coming up in the next 90 days.')
  expect(await vaultText(page)).toContain('No documents yet.')
  for (const [kind, text] of [['possessions', 'No possessions yet.'], ['subscriptions', 'No subscriptions yet.'], ['contacts', 'No contacts yet.']] as const) {
    await page.locator(`oyl-vault ui-segment [data-value="${kind}"]`).click()
    await expect.poll(() => vaultText(page)).toContain(text)
  }
  expect(await vaultText(page)).toContain('No gift ideas yet.')
  expect(await deepText(page.locator('oyl-gift-idea-form'))).toContain('Add a contact first.')
})

test('a document with an expiry lands in Documents and Upcoming', async ({ page, signIn }) => {
  await signIn('/vault')
  await addDocument(page, 'Passport', 'id', isoDaysFromToday(30))
  const row = page.locator('oyl-vault ol.documents oyl-item-row')
  await expect(row).toHaveCount(1)
  await expect.poll(() => deepText(row)).toContain('Passport')
  await expect(page.locator('oyl-vault ol.upcoming li')).toHaveCount(1)
  await expect.poll(() => deepText(page.locator('oyl-vault ol.upcoming li'))).toContain('Passport')
})

test('a possession stores price and location', async ({ page, signIn }) => {
  await signIn('/vault')
  await vaultKind(page, 'possessions')
  const form = page.locator('oyl-possession-form')
  await form.locator('ui-field[name="name"] input').fill('Laptop')
  await form.locator('ui-field[name="location"] input').fill('Desk')
  await form.locator('ui-field[name="amount"] input').fill('999.99')
  await form.locator('ui-button[type="submit"] button').click()
  const row = page.locator('oyl-vault ol.possessions oyl-item-row')
  await expect(row).toHaveCount(1)
  await expect.poll(() => deepText(row)).toContain('Laptop')
  const text = await deepText(row)
  expect(text).toContain('Desk')
  expect(text).toContain('$999.99')
})

test('renewing a subscription records a finance expense (cross-store)', async ({ page, signIn }) => {
  await signIn('/vault')
  await addSubscription(page, 'StreamFlix', '9.99', isoDaysFromToday(0), { category: 'entertainment' })
  const sub = page.locator('oyl-vault ol.subscriptions oyl-item-row')
  await expect(sub).toHaveCount(1)
  await expect.poll(() => deepText(sub)).toContain('StreamFlix')
  expect(await deepText(page.locator('oyl-vault .monthly-total'))).toContain('9.99')
  await sub.locator('[data-act="renew"]').click()
  await expect.poll(() => vaultText(page)).toContain('Renewed — expense recorded')
  await navTo(page, 'finance')
  const ledger = page.locator('oyl-finance ol.ledger oyl-item-row')
  await expect(ledger).toHaveCount(1)
  await expect.poll(() => deepText(ledger)).toContain('entertainment')
  const text = await deepText(ledger)
  expect(text).toContain('9.99')
})

test('the Upcoming horizon select changes the window', async ({ page, signIn }) => {
  await signIn('/vault')
  await addSubscription(page, 'Annual thing', '50', isoDaysFromToday(60), { unit: 'years' })
  await expect(page.locator('oyl-vault ol.upcoming li')).toHaveCount(1)
  await page.locator('oyl-vault ui-select[name="horizon"] select').selectOption({ label: 'Next 30 days' })
  await expect.poll(() => vaultText(page)).toContain('Nothing coming up in the next 30 days.')
  await page.locator('oyl-vault ui-select[name="horizon"] select').selectOption({ label: 'Next year' })
  await expect(page.locator('oyl-vault ol.upcoming li')).toHaveCount(1)
})

test('gift ideas require a contact first, then attach to one', async ({ page, signIn }) => {
  await signIn('/vault')
  await page.locator('oyl-vault ui-segment [data-value="contacts"]').click()
  await expect.poll(() => deepText(page.locator('oyl-gift-idea-form'))).toContain('Add a contact first.')
  await addContact(page, 'Alex Friend')
  await expect(page.locator('oyl-vault ol.contacts oyl-item-row')).toHaveCount(1)
  const giftForm = page.locator('oyl-gift-idea-form')
  await giftForm.locator('ui-field[name="giftText"] input').fill('Fancy teapot')
  await giftForm.locator('ui-select[name="giftContact"] select').selectOption({ label: 'Alex Friend' })
  await giftForm.locator('ui-button[type="submit"] button').click()
  const gift = page.locator('oyl-vault ol.gifts oyl-item-row')
  await expect(gift).toHaveCount(1)
  await expect.poll(() => deepText(gift)).toContain('Fancy teapot')
  const text = await deepText(gift)
  expect(text).toContain('For Alex Friend')
})

test('contact log-contact and delete flows', async ({ page, signIn }) => {
  await signIn('/vault')
  await addContact(page, 'Sam Doe')
  const contact = page.locator('oyl-vault ol.contacts oyl-item-row')
  await expect(contact).toHaveCount(1)
  await expect.poll(() => deepText(contact)).toContain('Never contacted')
  await contact.locator('[data-act="log"]').click()
  await expect.poll(() => deepText(contact)).toContain('Last contacted today')
  await inlineConfirm(contact, 'delete', 'no')
  await expect(contact).toHaveCount(1)
  await inlineConfirm(contact, 'delete', 'yes')
  await expect(page.locator('oyl-vault ol.contacts oyl-item-row')).toHaveCount(0)
  await expect.poll(() => vaultText(page)).toContain('No contacts yet.')
})
