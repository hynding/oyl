import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boot } from './boot'

let baseUrl: string
let stop: () => Promise<void>

beforeAll(async () => {
  delete process.env['GOOGLE_CLIENT_ID']
  delete process.env['GOOGLE_CLIENT_SECRET']
  ;({ baseUrl, stop } = await boot())
})
afterAll(async () => { await stop?.() })

describe('google oauth unconfigured', () => {
  it('config answers 200 { configured: false }', async () => {
    const res = await fetch(`${baseUrl}/google/config`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ configured: false })
  })
  it('connect and callback answer 501', async () => {
    expect((await fetch(`${baseUrl}/google/connect?mode=login`, { redirect: 'manual' })).status).toBe(501)
    expect((await fetch(`${baseUrl}/google/callback?code=x&state=y`, { redirect: 'manual' })).status).toBe(501)
  })
})
