/**
 * Seed the verify-stack Strapi by ensuring a known user exists (idempotent
 * register-or-login) via the shared core in tests/fixtures/seed.ts. Optionally
 * tries to seed the same nutrition-item the e2e suite expects, but does not
 * fail if the fresh Strapi's Authenticated role lacks permission — the verify
 * flow populates the pantry through the UI anyway.
 *
 * Run via `pnpm verify:seed` from the repo root.
 *
 * Prints a JSON summary on stdout: apiToken + user (consumable by
 * authenticateInBrowser, or pasted into devtools as `localStorage.apiToken` /
 * `localStorage.user`) plus the URLs where the verify stack is reachable.
 */

import { ensureLoggedIn, seed, TEST_USER } from '../tests/fixtures/seed'

let apiToken: string
let user: { id: number; username: string; email: string }
let seededItem: { documentId: string; id: number } | { error: string }

try {
  const ctx = await seed()
  apiToken = ctx.apiToken
  user = ctx.user
  seededItem = ctx.seededItem
} catch (itemErr) {
  // Nutrition-item create failing on a fresh Strapi is expected (the
  // Authenticated role has no CRUD permissions by default). Fall back to the
  // user-only path so the verify stack still gets a usable auth context.
  const { jwt, user: u } = await ensureLoggedIn()
  apiToken = jwt
  user = u
  seededItem = { error: itemErr instanceof Error ? itemErr.message : String(itemErr) }
}

const summary = {
  reactUrl: process.env.VERIFY_REACT_URL ?? 'http://localhost:15041',
  strapiUrl: process.env.VERIFY_STRAPI_URL ?? `http://localhost:${process.env.E2E_STRAPI_PORT ?? '13337'}`,
  testUser: {
    email: TEST_USER.email,
    password: TEST_USER.password,
    username: TEST_USER.username,
  },
  apiToken,
  user,
  seededItem,
}

console.log(JSON.stringify(summary, null, 2))
