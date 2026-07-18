/**
 * Mobile-specific UX (runs only on the mobile project; desktop asserts the inverse):
 * the ≤640px fixed bottom tab bar, horizontal tab scrolling, reserved page padding,
 * no horizontal page overflow, and touch-driven form entry.
 */
import { test, expect } from '../lib/fixtures'
import { addNote } from '../lib/actions'

test('nav docks as a fixed bottom tab bar on mobile (and stays in the header on desktop)', async ({ page, signIn, isMobile }) => {
  await signIn('/')
  const nav = page.locator('oyl-nav nav')
  const pos = await nav.evaluate((el) => {
    const s = getComputedStyle(el)
    return { position: s.position, bottom: s.bottom }
  })
  if (isMobile) {
    expect(pos.position).toBe('fixed')
    // The shell must reserve space so the tab bar never covers page content.
    const pagePadding = await page.locator('oyl-shell').evaluate((el) => {
      const pageEl = el.shadowRoot?.querySelector('.page')
      return pageEl ? parseFloat(getComputedStyle(pageEl).paddingBottom) : 0
    })
    expect(pagePadding).toBeGreaterThan(0)
  } else {
    expect(pos.position).not.toBe('fixed')
  }
})

test('no horizontal page overflow on any screen', async ({ page, signIn }) => {
  for (const route of ['/status', '/journal', '/nutrition', '/planner', '/vault', '/goals', '/insights', '/finance', '/profile']) {
    await signIn(route)
    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement
      return el ? el.scrollWidth - el.clientWidth : 0
    })
    expect(overflow, `${route} must not scroll horizontally`).toBeLessThanOrEqual(0)
  }
})

test('every nav tab is reachable and tappable on mobile', async ({ page, signIn, isMobile }) => {
  test.skip(!isMobile, 'mobile-only: exercises the horizontally scrollable tab bar')
  await signIn('/')
  // The last tab may start offscreen in the scrollable bar — tapping must still work.
  for (const route of ['finance', 'insights', 'journal']) {
    await page.locator(`oyl-nav a[data-route="${route}"]`).click()
    await expect(page).toHaveURL(`/${route}`)
    await expect(page.locator(`oyl-nav a[data-route="${route}"]`)).toHaveAttribute('aria-current', 'page')
  }
})

test('nav tap targets meet a minimum touch size on mobile', async ({ page, signIn, isMobile }) => {
  test.skip(!isMobile, 'mobile-only: touch target audit')
  await signIn('/')
  const sizes = await page.locator('oyl-nav a').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return { h: r.height, route: el.getAttribute('data-route') }
    }),
  )
  for (const s of sizes) {
    expect(s.h, `nav tab ${s.route} touch height`).toBeGreaterThanOrEqual(32)
  }
})

test('logging a journal note works with touch input', async ({ page, signIn, isMobile }) => {
  test.skip(!isMobile, 'mobile-only: end-to-end touch form entry')
  await signIn('/journal')
  await addNote(page, 'Logged from a phone')
  await expect(page.locator('oyl-entry-row')).toContainText('Logged from a phone')
})
