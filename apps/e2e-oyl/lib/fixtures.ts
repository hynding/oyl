/**
 * Shared e2e fixtures.
 *
 * - `hygiene` (auto): every test fails if the page produced a console error/warning, an
 *   uncaught page error, a failed network request, or a 4xx/5xx response — unless the test
 *   explicitly allowed it via `hygiene.allow(/pattern/)` (for intentional negative paths,
 *   e.g. a wrong-password login expecting a 400). This is the standing guarantee that the
 *   app runs clean; new features inherit it for free.
 * - `user`: a freshly registered backend account (unique per test) for data isolation.
 * - `signIn`: seeds localStorage (remote mode, e2e backend URL, JWT session) before the
 *   first navigation, so the page boots signed-in exactly like a returning user.
 */
import { test as base, expect, type Page, type APIRequestContext } from '@playwright/test'
import { API_URL } from './urls'

export type TestUser = {
  username: string
  email: string
  password: string
  jwt: string
  id: number
}

export type Hygiene = {
  /** Permit console messages / request URLs matching the pattern (intentional failures). */
  allow: (pattern: RegExp) => void
  /** Violations collected so far (exposed for tests that assert on them). */
  violations: () => string[]
}

let userSeq = 0

/** Register a unique user against the e2e backend. */
export async function registerUser(request: APIRequestContext): Promise<TestUser> {
  const unique = `${Date.now().toString(36)}${(userSeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const username = `e2e_${unique}`
  const email = `${username}@example.com`
  const password = 'e2e-Password-1'
  const res = await request.post(`${API_URL}/auth/local/register`, {
    data: { username, email, password },
  })
  expect(res.ok(), `register ${username}: ${res.status()} ${await res.text().catch(() => '')}`).toBe(true)
  const body = (await res.json()) as { jwt: string; user: { id: number } }
  return { username, email, password, jwt: body.jwt, id: body.user.id }
}

/**
 * Seed remote-mode config + session into localStorage before any page script runs.
 * Only-if-absent: init scripts re-run on every navigation, and unconditionally
 * re-setting keys would clobber state the app itself wrote (e.g. Apply & reload
 * persisting a new backend URL, or logout removing the session).
 */
export async function primeRemoteSession(page: Page, user: TestUser): Promise<void> {
  await page.addInitScript(
    ([api, auth]) => {
      if (!localStorage.getItem('oyl/storage-mode')) localStorage.setItem('oyl/storage-mode', 'remote')
      if (!localStorage.getItem('oyl/api-base-url')) localStorage.setItem('oyl/api-base-url', api)
      if (!localStorage.getItem('oyl/auth')) localStorage.setItem('oyl/auth', auth)
    },
    [API_URL, JSON.stringify({ token: user.jwt, user: { id: user.id, username: user.username, email: user.email } })] as const,
  )
}

/** Seed remote-mode config with NO session (exercises the forced-login guard). */
export async function primeRemoteSignedOut(page: Page): Promise<void> {
  await page.addInitScript((api) => {
    if (!localStorage.getItem('oyl/storage-mode')) localStorage.setItem('oyl/storage-mode', 'remote')
    if (!localStorage.getItem('oyl/api-base-url')) localStorage.setItem('oyl/api-base-url', api)
  }, API_URL)
}

export const test = base.extend<{
  hygiene: Hygiene
  user: TestUser
  /** Navigate signed-in (remote mode against the e2e backend) and wait for the shell. */
  signIn: (path?: string) => Promise<void>
}>({
  hygiene: [
    async ({ page }, use) => {
      const violations: string[] = []
      const allowed: RegExp[] = []
      const isAllowed = (text: string) => allowed.some((re) => re.test(text))
      const record = (text: string) => {
        if (!isAllowed(text)) violations.push(text)
      }

      page.on('console', (msg) => {
        const type = msg.type()
        if (type === 'error' || type === 'warning') {
          // Include the source URL: browser-generated messages like "Failed to load
          // resource" carry the URL only in the location, and allow() patterns match URLs.
          const url = msg.location().url
          record(`console.${type}: ${msg.text()}${url ? ` (${url})` : ''}`)
        }
      })
      page.on('pageerror', (err) => record(`pageerror: ${err.message}`))
      page.on('requestfailed', (req) => {
        const failure = req.failure()?.errorText ?? 'unknown'
        // Aborted requests are routine (navigation cancels in-flight fetches).
        if (failure === 'net::ERR_ABORTED') return
        record(`requestfailed: ${req.method()} ${req.url()} (${failure})`)
      })
      page.on('response', (res) => {
        if (res.status() >= 400) record(`http ${res.status()}: ${res.request().method()} ${res.url()}`)
      })

      await use({ allow: (re) => allowed.push(re), violations: () => [...violations] })

      expect
        .soft(violations, 'page must stay free of console errors/warnings, page errors, and failed requests')
        .toEqual([])
    },
    { auto: true },
  ],

  user: async ({ request }, use) => {
    await use(await registerUser(request))
  },

  signIn: async ({ page, user }, use) => {
    await use(async (path = '/') => {
      await primeRemoteSession(page, user)
      await page.goto(path)
      await expect(page.locator('oyl-shell')).toBeVisible()
    })
  },
})

export { expect }
