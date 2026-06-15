import { afterAll, beforeAll, beforeEach } from 'vitest'
import { httpProtocolContract } from '@oyl/all-of-oyl/testing'
import { boot, truncateRecords } from './boot'
import { registerUser } from './helpers'

let baseUrl: string
let stop: () => Promise<void>
let jwt: string

beforeAll(async () => {
  ;({ baseUrl, stop } = await boot())
  ;({ jwt } = await registerUser(baseUrl, `conf-${Date.now()}`))
})
afterAll(async () => { await stop?.() })
beforeEach(async () => { await truncateRecords() })

httpProtocolContract('apps/strapi-oyl (booted)', () => ({
  baseUrl,
  fetch: globalThis.fetch,
  getToken: async () => jwt,
}))
