/** Small cross-spec helpers. Playwright CSS pierces the app's open shadow roots. */
import { expect, type Locator, type Page } from '@playwright/test'
import { API_URL } from './urls'

/** Navigate via the primary nav (exercises the link interceptor, not page.goto). */
export async function navTo(page: Page, route: string): Promise<void> {
  await page.locator(`oyl-nav a[data-route="${route}"]`).click()
  await expect(page).toHaveURL(`/${route}`)
}

/** Add a journal note through the composer. */
export async function addNote(page: Page, text: string, tags?: string): Promise<void> {
  const form = page.locator('oyl-log-form')
  await form.locator('button[data-type="note"]').click()
  await form.locator('textarea[name="text"]').fill(text)
  if (tags) await form.locator('input[name="tags"]').fill(tags)
  await form.locator('button[type="submit"]').click()
}

/** Two-step inline confirm: trigger an action button, then confirm (or cancel) in place. */
export async function inlineConfirm(scope: Locator, act: string, answer: 'yes' | 'no' = 'yes'): Promise<void> {
  await scope.locator(`[data-act="${act}"]`).click()
  await scope.locator(`[data-act="confirm-${answer}"]`).click()
}

/** Wait until the durable write outbox has fully flushed to the backend. */
export async function awaitOutboxDrained(page: Page, timeout = 10_000): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem('oyl/write-outbox')
          if (!raw) return 0
          try {
            const parsed = JSON.parse(raw) as unknown
            return Array.isArray(parsed) ? parsed.length : 0
          } catch {
            return 0
          }
        }),
      { message: 'write outbox should drain to the backend', timeout },
    )
    .toBe(0)
}

/** Boot signed-out on the e2e backend in LOCAL storage mode (dev-host default persona). */
export async function primeLocalMode(page: Page): Promise<void> {
  await page.addInitScript((api) => {
    localStorage.setItem('oyl/storage-mode', 'local')
    localStorage.setItem('oyl/api-base-url', api)
  }, API_URL)
}

/** The active element, descending through open shadow roots (for focus assertions). */
export async function deepActiveElement(page: Page): Promise<{ tag: string; text: string }> {
  return page.evaluate(() => {
    let el: Element | null = document.activeElement
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement
    return { tag: el?.tagName ?? '', text: (el?.textContent ?? '').trim() }
  })
}
