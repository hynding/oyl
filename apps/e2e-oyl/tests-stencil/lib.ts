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

/** Click a ui-button by its data-act (the inner control, as a user would). */
export function act(scope: Locator | Page, name: string): Locator {
  return scope.locator(`ui-button[data-act="${name}"] button`)
}


