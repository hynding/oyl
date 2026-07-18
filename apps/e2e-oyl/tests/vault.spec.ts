/**
 * Vault screen: all four composer types, the Upcoming horizon, subscription renew →
 * finance expense (the cross-store orchestration in dataState.renewSubscription),
 * gift-idea ↔ contact dependency, and deletes.
 *
 * NOTE: vault collections (documents/possessions/subscriptions/contacts/giftIdeas) have
 * no Strapi backend yet — in-session assertions only (see planner.spec.ts note). The
 * renew-created Transaction IS backed.
 */
import { test, expect } from '../lib/fixtures'
import { inlineConfirm, navTo } from '../lib/actions'

function isoDaysFromToday(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

test('empty states for every vault section', async ({ page, signIn }) => {
  await signIn('/vault')
  const vault = page.locator('oyl-vault')
  await expect(vault).toContainText('Nothing coming up in the next 90 days.')
  await expect(vault).toContainText('No documents yet.')
  await expect(vault).toContainText('No possessions yet.')
  await expect(vault).toContainText('No subscriptions yet.')
  await expect(vault).toContainText('No contacts yet.')
  await expect(vault).toContainText('No gift ideas yet.')
})

test('a document with an expiry lands in Documents and Upcoming', async ({ page, signIn }) => {
  await signIn('/vault')
  const composer = page.locator('oyl-vault-composer')
  await composer.locator('button[data-type="document"]').click()
  await composer.locator('input[name="name"]').fill('Passport')
  await composer.locator('input[name="kind"]').fill('id')
  await composer.locator('input[name="expiresOn"]').fill(isoDaysFromToday(30))
  await composer.locator('button[type="submit"]').click()
  await expect(page.locator('oyl-vault')).not.toContainText('No documents yet.')
  await expect(page.locator('oyl-vault')).toContainText('Passport')
  await expect(page.locator('oyl-vault ol.upcoming-list li')).toHaveCount(1)
})

test('a possession stores price and location', async ({ page, signIn }) => {
  await signIn('/vault')
  const composer = page.locator('oyl-vault-composer')
  await composer.locator('button[data-type="possession"]').click()
  await composer.locator('input[name="name"]').fill('Laptop')
  await composer.locator('input[name="location"]').fill('Desk')
  await composer.locator('input[name="amount"]').fill('999.99')
  await composer.locator('button[type="submit"]').click()
  await expect(page.locator('oyl-vault')).toContainText('Laptop')
  await expect(page.locator('oyl-vault')).not.toContainText('No possessions yet.')
})

test('renewing a subscription records a finance expense (cross-store)', async ({ page, signIn }) => {
  await signIn('/vault')
  const composer = page.locator('oyl-vault-composer')
  await composer.locator('button[data-type="subscription"]').click()
  await composer.locator('input[name="name"]').fill('StreamFlix')
  await composer.locator('input[name="amount"]').fill('9.99')
  await composer.locator('input[name="anchor"]').fill(isoDaysFromToday(0))
  await composer.locator('select[name="category"]').selectOption('entertainment')
  await composer.locator('button[type="submit"]').click()
  const sub = page.locator('oyl-subscription-row')
  await expect(sub).toContainText('StreamFlix')

  await sub.locator('[data-act="renew"]').click()
  // The confirmation is announced from the vault's live region.
  await expect(page.locator('oyl-vault')).toContainText('Renewed — expense recorded')

  // The renewal charge shows up in this month's finance ledger.
  await navTo(page, 'finance')
  const ledger = page.locator('oyl-finance ol.ledger oyl-vault-item')
  await expect(ledger).toHaveCount(1)
  await expect(ledger).toContainText('entertainment')
  await expect(ledger).toContainText('9.99')
})

test('the Upcoming horizon select changes the window', async ({ page, signIn }) => {
  await signIn('/vault')
  const composer = page.locator('oyl-vault-composer')
  await composer.locator('button[data-type="subscription"]').click()
  await composer.locator('input[name="name"]').fill('Annual thing')
  await composer.locator('input[name="amount"]').fill('50')
  await composer.locator('input[name="cadenceN"]').fill('1')
  await composer.locator('select[name="cadenceUnit"]').selectOption('years')
  await composer.locator('input[name="anchor"]').fill(isoDaysFromToday(60))
  await composer.locator('button[type="submit"]').click()
  // Renews in ~60 days: inside the default 90-day horizon…
  await expect(page.locator('oyl-vault ol.upcoming-list li')).toHaveCount(1)
  // …but outside a 30-day horizon.
  await page.locator('oyl-vault select[aria-label="Horizon"]').selectOption({ label: 'Next 30 days' })
  await expect(page.locator('oyl-vault')).toContainText('Nothing coming up in the next 30 days.')
})

test('gift ideas require a contact first, then attach to one', async ({ page, signIn }) => {
  await signIn('/vault')
  // No contacts yet → the gift form offers a hint instead of a select.
  await expect(page.locator('oyl-gift-idea-form')).toContainText('Add a contact first.')

  const composer = page.locator('oyl-vault-composer')
  await composer.locator('button[data-type="contact"]').click()
  await composer.locator('input[name="name"]').fill('Alex Friend')
  await composer.locator('button[type="submit"]').click()
  await expect(page.locator('oyl-contact-row')).toContainText('Alex Friend')

  const giftForm = page.locator('oyl-gift-idea-form')
  await giftForm.locator('input[name="giftText"]').fill('Fancy teapot')
  await giftForm.locator('select[name="giftContact"]').selectOption({ label: 'Alex Friend' })
  await giftForm.locator('button').last().click()
  await expect(page.locator('oyl-vault')).toContainText('Fancy teapot')
  await expect(page.locator('oyl-vault')).not.toContainText('No gift ideas yet.')
})

test('contact log-contact and delete flows', async ({ page, signIn }) => {
  await signIn('/vault')
  const composer = page.locator('oyl-vault-composer')
  await composer.locator('button[data-type="contact"]').click()
  await composer.locator('input[name="name"]').fill('Sam Doe')
  await composer.locator('button[type="submit"]').click()
  const contact = page.locator('oyl-contact-row')
  await expect(contact).toContainText('Sam Doe')
  await contact.locator('[data-act="log"]').click()
  // Delete with inline confirm.
  await inlineConfirm(contact, 'delete', 'yes')
  await expect(page.locator('oyl-contact-row')).toHaveCount(0)
  await expect(page.locator('oyl-vault')).toContainText('No contacts yet.')
})
