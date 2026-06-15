import { repositoryContract } from './repository-contract.js'
import { createHttpClient, createHttpRepository } from './http-repository.js'
import { COLLECTIONS } from '../collections.js'

/**
 * Run the full Repository contract against any server speaking the OYL sync protocol.
 * `makeDeps` returns fresh per-test transport deps (a fresh fake, or a real fetch+URL with a
 * reset server). Reused by SP1 (fake) and SP2 (real backend) — one executable spec (R1).
 */
export function httpProtocolContract(
  label: string,
  makeDeps: () => { baseUrl: string; fetch: typeof globalThis.fetch; getToken: () => Promise<string | undefined | null> },
): void {
  repositoryContract(label, () => {
    const { baseUrl, fetch, getToken } = makeDeps()
    return createHttpRepository(createHttpClient({ baseUrl, fetch, getToken }), 'lifeAreas', COLLECTIONS.lifeAreas)
  })
}
