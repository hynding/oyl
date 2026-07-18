import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boot } from './boot'
import { registerUser } from './helpers'

let baseUrl: string
let stop: () => Promise<void>
let jwtA: string
let jwtB: string

beforeAll(async () => {
  ;({ baseUrl, stop } = await boot())
  ;({ jwt: jwtA } = await registerUser(baseUrl, `bootA-${Date.now()}`))
  ;({ jwt: jwtB } = await registerUser(baseUrl, `bootB-${Date.now()}`))
})
afterAll(async () => { await stop?.() })

const h = (jwt?: string) => ({ 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) })

/** Every collection key the aggregate boot read must carry (Strapi REST plural paths). */
const EXPECTED_KEYS = [
  'notes', 'consumptions', 'transactions', 'measurements', 'activity-sessions',
  'accounts', 'budgets', 'goals',
  'activities', 'consumables', 'consumable-products',
]

const getBootstrap = async (jwt?: string) => fetch(`${baseUrl}/bootstrap`, { headers: h(jwt) })

describe('GET /bootstrap — one-round-trip boot read (booted)', () => {
  it('unauthenticated request is rejected (401/403)', async () => {
    const res = await getBootstrap()
    expect([401, 403]).toContain(res.status)
  })

  it('returns every backed collection as an array under its REST path key', async () => {
    const res = await getBootstrap(jwtA)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown[]> }
    for (const key of EXPECTED_KEYS) {
      expect(Array.isArray(body.data[key]), `data.${key} should be an array`).toBe(true)
    }
  })

  it('personal rows are owner-scoped: A sees its note, B does not', async () => {
    const recordId = `boot-note-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const put = await fetch(`${baseUrl}/notes/${recordId}`, {
      method: 'PUT',
      headers: h(jwtA),
      body: JSON.stringify({ data: { text: 'bootstrap smoke', occurredAt: new Date().toISOString() } }),
    })
    expect(put.status).toBe(200)

    const aBody = (await (await getBootstrap(jwtA)).json()) as { data: { notes: Array<{ recordId: string }> } }
    const bBody = (await (await getBootstrap(jwtB)).json()) as { data: { notes: Array<{ recordId: string }> } }
    expect(aBody.data.notes.some((r) => r.recordId === recordId)).toBe(true)
    expect(bBody.data.notes.some((r) => r.recordId === recordId)).toBe(false)
  })

  it('component fields are populated + sanitized exactly like per-collection reads', async () => {
    const uniq = `${Date.now()}-${Math.random().toString(36).slice(2)}`

    // Transaction: finance.money component under `amount`.
    const txId = `boot-tx-${uniq}`
    const putTx = await fetch(`${baseUrl}/transactions/${txId}`, {
      method: 'PUT',
      headers: h(jwtA),
      body: JSON.stringify({ data: {
        occurredAt: new Date().toISOString(),
        amount: { minor: 1234, currency: 'USD', exponent: 2 },
        category: 'groceries',
        direction: 'expense',
      } }),
    })
    expect(putTx.status).toBe(200)

    // Budget: finance.money component under `limit`.
    const budgetId = `boot-budget-${uniq}`
    const putBudget = await fetch(`${baseUrl}/budgets/${budgetId}`, {
      method: 'PUT',
      headers: h(jwtA),
      body: JSON.stringify({ data: {
        category: 'dining',
        period: 'month',
        limit: { minor: 15000, currency: 'USD', exponent: 2 },
      } }),
    })
    expect(putBudget.status).toBe(200)

    // Consumable: nutrition-facts component under `facts`.
    const conId = `boot-con-${uniq}`
    const putCon = await fetch(`${baseUrl}/consumables/${conId}`, {
      method: 'PUT',
      headers: h(jwtA),
      body: JSON.stringify({ data: {
        name: `Boot Oats ${uniq}`,
        slug: `boot_oats_${Date.now()}`,
        facts: { calories: 150, protein: 5 },
      } }),
    })
    expect(putCon.status).toBe(200)

    const body = (await (await getBootstrap(jwtA)).json()) as { data: Record<string, Array<Record<string, unknown>>> }
    const tx = body.data['transactions']!.find((r) => r['recordId'] === txId)
    expect(tx, 'transaction present in bootstrap').toBeDefined()
    expect(tx!['amount'], 'amount component populated').toMatchObject({ minor: 1234, currency: 'USD', exponent: 2 })

    const budget = body.data['budgets']!.find((r) => r['recordId'] === budgetId)
    expect(budget, 'budget present in bootstrap').toBeDefined()
    expect(budget!['limit'], 'limit component populated').toMatchObject({ minor: 15000, currency: 'USD', exponent: 2 })

    const con = body.data['consumables']!.find((r) => r['recordId'] === conId)
    expect(con, 'consumable present in bootstrap').toBeDefined()
    expect(con!['facts'], 'facts component populated').toMatchObject({ calories: 150, protein: 5 })
  })

  it('catalog rows are public-or-mine: a public activity created by A is visible to B', async () => {
    const recordId = `boot-act-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const post = await fetch(`${baseUrl}/activities`, {
      method: 'POST',
      headers: h(jwtA),
      body: JSON.stringify({ data: { recordId, name: `Bootstrap Run ${recordId}`, slug: recordId, visibility: 'public' } }),
    })
    expect([200, 201]).toContain(post.status)

    const bBody = (await (await getBootstrap(jwtB)).json()) as { data: { activities: Array<{ recordId: string }> } }
    expect(bBody.data.activities.some((r) => r.recordId === recordId)).toBe(true)
  })
})
