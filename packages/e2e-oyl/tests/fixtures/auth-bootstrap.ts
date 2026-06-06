import type { Page } from '@playwright/test'
import type { SeedContext } from './seed'

/**
 * Bypass the login UI by injecting the API token + user into localStorage
 * before the SPA boots. Matches the keys used by AuthProvider in react-oyl.
 */
export async function authenticateInBrowser(page: Page, ctx: SeedContext) {
  await page.addInitScript(({ apiToken, user }) => {
    localStorage.setItem('apiToken', apiToken)
    localStorage.setItem('user', JSON.stringify(user))
  }, { apiToken: ctx.apiToken, user: ctx.user })
}
