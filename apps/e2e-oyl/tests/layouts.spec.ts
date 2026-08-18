/**
 * Interchangeable shell layouts: toolbar picker, oyl-shell[layout] frame swap,
 * persistence in oyl/settings alongside the theme, nav orientation reflection,
 * and cross-screen navigation in every layout (desktop + mobile projects).
 * Plan A: widget regions exist but are empty — `dashboard` is visually ≈ classic
 * until Plan B fills the band, so frame assertions use the host attribute.
 */
import { test, expect } from '../lib/fixtures'

const trigger = 'oyl-layout-picker button[data-layout-trigger]'
const ALL = ['classic', 'sidebar', 'workspace', 'dashboard', 'focus', 'studio', 'wide'] as const

/**
 * Open the picker, choose a layout, then close the popover with Escape.
 * The panel deliberately stays open after a selection (live-preview browsing, same
 * as the theme picker) and the trigger is a toggle — so the helper always leaves
 * the panel closed, keeping repeated picks deterministic and the frame unobscured.
 */
async function pickLayout(page: import('@playwright/test').Page, id: string) {
  await page.locator(trigger).click()
  await page.locator(`oyl-layout-picker [data-layout-option="${id}"]`).click()
  await expect(page.locator('oyl-shell')).toHaveAttribute('layout', id)
  await page.keyboard.press('Escape')
  await expect(page.locator('oyl-layout-picker [data-layout-panel]')).toBeHidden()
}

test('defaults to classic and persists a picked layout across reload', async ({ page, signIn }) => {
  await signIn('/')
  await expect(page.locator('oyl-shell')).toHaveAttribute('layout', 'classic')
  await pickLayout(page, 'sidebar')
  const stored = await page.evaluate(
    () => JSON.parse(localStorage.getItem('oyl/settings') ?? '{}') as { layout?: string },
  )
  expect(stored.layout).toBe('sidebar')
  await page.reload()
  await expect(page.locator('oyl-shell')).toHaveAttribute('layout', 'sidebar')
  await expect(page.locator(trigger)).toContainText('Sidebar')
})

test('offers every catalog layout and reflects nav orientation per layout', async ({ page, signIn }) => {
  await signIn('/')
  await page.locator(trigger).click()
  await expect(page.locator('oyl-layout-picker [data-layout-option]')).toHaveCount(ALL.length)
  await page.keyboard.press('Escape')
  await pickLayout(page, 'sidebar')
  await expect(page.locator('oyl-nav')).toHaveAttribute('orientation', 'vertical')
  await pickLayout(page, 'focus')
  await expect(page.locator('oyl-nav')).toHaveAttribute('orientation', 'horizontal')
})

test('studio keeps its header docked while the page scrolls under it', async ({
  page,
  signIn,
  isMobile,
}) => {
  test.skip(isMobile, 'the floating-panel frame is desktop-only')
  await signIn('/journal')
  await pickLayout(page, 'studio')
  await page.evaluate(() => window.scrollTo(0, 900))
  // The point of the glass header: the primary actions stay reachable no matter
  // how far down a long day list the reader has travelled.
  await expect(page.locator('oyl-layout-picker')).toBeInViewport()
  await expect(page.locator('oyl-shell')).toHaveAttribute('layout', 'studio')
})

test('the desktop frame is a real grid in every layout', async ({ page, signIn, isMobile }) => {
  test.skip(isMobile, 'below 641px the shell is deliberately a stacked column')
  await signIn('/')
  for (const id of ALL) {
    await pickLayout(page, id)
    // Regression guard: a bare `oyl-shell` rule in the outer document beats the
    // shell's own `:host { display: grid }` (encapsulation context outranks cascade
    // layers), which silently flattens every layout into one stacked column.
    const display = await page
      .locator('oyl-shell')
      .evaluate((el) => getComputedStyle(el).display)
    expect(display, id).toBe('grid')
  }
})

test('workspace docks the highlights deck as a right-hand aside', async ({ page, signIn, isMobile }) => {
  test.skip(isMobile, 'the three-column frame is desktop-only; phones keep the bottom-tab arrangement')
  await signIn('/')
  await pickLayout(page, 'workspace')
  const [nav, main, deck] = await Promise.all([
    page.locator('oyl-nav').boundingBox(),
    page.locator('oyl-router').boundingBox(),
    page.locator('oyl-widgets').boundingBox(),
  ])
  expect(nav).not.toBeNull()
  expect(main).not.toBeNull()
  expect(deck).not.toBeNull()
  // Reading order across the frame: nav rail, page, highlights aside.
  expect(nav!.x + nav!.width).toBeLessThanOrEqual(main!.x)
  expect(deck!.x).toBeGreaterThanOrEqual(main!.x + main!.width)
})

test('navigation works in every layout', async ({ page, signIn }) => {
  await signIn('/')
  for (const id of ALL) {
    await pickLayout(page, id)
    await page.locator('oyl-nav a[data-route="journal"]').click()
    await expect(page).toHaveURL(/\/journal$/)
    await page.locator('oyl-nav a[data-route="status"]').click()
    await expect(page).toHaveURL(/\/status$/)
  }
})

test('theme and layout persist independently (neither write clobbers the other)', async ({ page, signIn }) => {
  await signIn('/')
  await pickLayout(page, 'wide')
  await page.locator('oyl-theme-toggle button[data-picker-trigger]').click()
  await page.locator('oyl-theme-toggle [data-theme-option="forest"]').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest')
  await expect(page.locator('oyl-shell')).toHaveAttribute('layout', 'wide')
  const stored = await page.evaluate(
    () => JSON.parse(localStorage.getItem('oyl/settings') ?? '{}') as { theme?: string; layout?: string },
  )
  expect(stored).toMatchObject({ theme: 'forest', layout: 'wide' })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest')
  await expect(page.locator('oyl-shell')).toHaveAttribute('layout', 'wide')
})

test('no layout overflows a phone sideways', async ({ page, signIn, isMobile }) => {
  test.skip(!isMobile, 'mobile-project geometry check')
  await signIn('/')
  for (const id of ALL) {
    await pickLayout(page, id)
    // A sideways overflow makes Chrome widen the LAYOUT viewport, which drags the
    // fixed bottom tab bar below the visual viewport. The header row is the usual
    // culprit: its toolbar must wrap rather than push the document wide.
    // Compare against the CONFIGURED viewport, never window.innerWidth: the
    // widened layout viewport is the symptom, so innerWidth grows to match the
    // overflow and the check would always pass.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth, id).toBeLessThanOrEqual(page.viewportSize()!.width)
  }
})

test('mobile keeps the bottom tab bar usable in every layout', async ({ page, signIn, isMobile }) => {
  test.skip(!isMobile, 'mobile-project geometry check')
  await signIn('/')
  for (const id of ALL) {
    await pickLayout(page, id)
    // Measure the tab bar itself (oyl-nav's inner <nav>, the fixed element — same
    // idiom as mobile.spec.ts): the host collapses once its bar is position: fixed.
    const nav = page.locator('oyl-nav nav')
    await expect(nav).toBeVisible()
    const [navBox, viewport] = await Promise.all([nav.boundingBox(), page.viewportSize()])
    // The tab bar must sit at the bottom edge regardless of layout (fixed dock).
    expect(navBox, id).not.toBeNull()
    expect(viewport).not.toBeNull()
    expect(Math.abs(navBox!.y + navBox!.height - viewport!.height), id).toBeLessThan(2)
  }
})
