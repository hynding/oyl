import { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { buildHandlers, emptyStore, type IntegrationStore } from './msw-handlers'

/**
 * Wires:
 *  - MSW to intercept OFF + Strapi calls.
 *  - In-memory mocks for useData (per-path), useAuth, useUserProfile.
 *
 * Test files that use this harness must hoist the mocks at the top of the file
 * via `vi.mock(...)`. See add-from-recent.test.tsx for the canonical pattern.
 */

export function makeStore(): IntegrationStore {
  return emptyStore()
}

export function startMockServer(store: IntegrationStore) {
  const server = setupServer(...buildHandlers(store))
  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
  afterEach(() => server.resetHandlers(...buildHandlers(store)))
  afterAll(() => server.close())
  return server
}

export function renderSection(children: ReactNode) {
  return render(<>{children}</>)
}

/** Helper to flush queued timers + microtasks for code that uses both. */
export async function flush(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

/** Re-export so test files don't need to import vi twice. */
export { vi }
