/**
 * Strapi test-data seed.
 *
 * Idempotent: re-run safely. Creates a known test user (registering on first
 * run, logging in on subsequent runs) and seeds a small set of nutrition-items
 * with known names + a known barcode used by barcode-related tests.
 *
 * Returns an `auth` object the tests use to inject the API token + user into
 * localStorage before the SPA bootstraps.
 */

const STRAPI_PORT = Number(process.env.E2E_STRAPI_PORT ?? 3337)
const STRAPI_BASE = `http://localhost:${STRAPI_PORT}/api`

export const TEST_USER = {
  email: process.env.E2E_TEST_USER_EMAIL ?? 'e2e-user@oyl.local',
  password: process.env.E2E_TEST_USER_PASSWORD ?? 'e2e-password-123',
  username: process.env.E2E_TEST_USER_USERNAME ?? 'e2e-user',
}

export const SEEDED_BARCODE = '5060337502222'
export const SEEDED_ITEM_NAME = 'E2E Oat Drink'
export const SEEDED_ITEM_BRAND = 'E2E Foods'

export type SeedContext = {
  apiToken: string
  user: { id: number; username: string; email: string }
  seededItem: { documentId: string; id: number }
}

export async function ensureLoggedIn(): Promise<{ jwt: string; user: { id: number; username: string; email: string } }> {
  // Try login first — most runs hit this path.
  const loginRes = await fetch(`${STRAPI_BASE}/auth/local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: TEST_USER.email, password: TEST_USER.password }),
  })
  if (loginRes.ok) {
    const json = (await loginRes.json()) as { jwt: string; user: { id: number; username: string; email: string } }
    return json
  }
  // Login failed → register.
  const regRes = await fetch(`${STRAPI_BASE}/auth/local/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: TEST_USER.email,
      password: TEST_USER.password,
      username: TEST_USER.username,
    }),
  })
  if (!regRes.ok) {
    const body = await regRes.text()
    throw new Error(`Seed: register failed (${regRes.status}): ${body}`)
  }
  return (await regRes.json()) as { jwt: string; user: { id: number; username: string; email: string } }
}

async function ensureNutritionItem(jwt: string): Promise<{ documentId: string; id: number }> {
  const params = new URLSearchParams({ 'filters[barcode][$eq]': SEEDED_BARCODE, 'pagination[pageSize]': '1' })
  const findRes = await fetch(`${STRAPI_BASE}/nutrition-items?${params}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  })
  if (findRes.ok) {
    const { data } = (await findRes.json()) as { data: Array<{ documentId: string; id: number }> }
    if (data.length > 0) return data[0]
  }
  const createRes = await fetch(`${STRAPI_BASE}/nutrition-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({
      data: {
        name: SEEDED_ITEM_NAME,
        brand: SEEDED_ITEM_BRAND,
        barcode: SEEDED_BARCODE,
        serving_size: 100,
        serving_unit: 'g',
        calories_per_100: 200,
        protein_per_100: 10,
        carbs_per_100: 20,
        fat_per_100: 5,
        source: 'user',
      },
    }),
  })
  if (!createRes.ok) {
    const body = await createRes.text()
    throw new Error(`Seed: create nutrition-item failed (${createRes.status}): ${body}`)
  }
  const json = (await createRes.json()) as { data: { documentId: string; id: number } } | { documentId: string; id: number }
  // The controller may return either { data: doc } or { doc } depending on whether it deduped.
  return 'data' in json ? json.data : json
}

export async function seed(): Promise<SeedContext> {
  const { jwt, user } = await ensureLoggedIn()
  const seededItem = await ensureNutritionItem(jwt)
  return { apiToken: jwt, user, seededItem }
}
