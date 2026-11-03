import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boot } from './boot'
import { registerUser } from './helpers'

let baseUrl: string
let stop: () => Promise<void>
let jwt: string
const saved = process.env['OYL_ADMIN_EMAILS']
const username = `access-${Date.now()}`

beforeAll(async () => {
  ;({ baseUrl, stop } = await boot())
  ;({ jwt } = await registerUser(baseUrl, username))
})
afterAll(async () => {
  if (saved === undefined) delete process.env['OYL_ADMIN_EMAILS']
  else process.env['OYL_ADMIN_EMAILS'] = saved
  await stop?.()
})

const getAccess = async (token?: string) =>
  fetch(`${baseUrl}/access`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })

describe('GET /access — admin allowlist (booted)', () => {
  it('unauthenticated request is rejected (401/403)', async () => {
    expect([401, 403]).toContain((await getAccess()).status)
  })

  it('nobody is an admin while OYL_ADMIN_EMAILS is unset', async () => {
    delete process.env['OYL_ADMIN_EMAILS']
    const res = await getAccess(jwt)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ admin: false })
  })

  it('a listed address (any case) or its @domain makes the user an admin; others are not', async () => {
    process.env['OYL_ADMIN_EMAILS'] = `someone@else.dev, ${username.toUpperCase()}@TEST.DEV`
    expect(await (await getAccess(jwt)).json()).toEqual({ admin: true })
    process.env['OYL_ADMIN_EMAILS'] = '@test.dev'
    expect(await (await getAccess(jwt)).json()).toEqual({ admin: true })
    process.env['OYL_ADMIN_EMAILS'] = 'someone@else.dev @other.dev'
    expect(await (await getAccess(jwt)).json()).toEqual({ admin: false })
  })
})
