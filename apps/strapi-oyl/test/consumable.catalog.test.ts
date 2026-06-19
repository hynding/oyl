import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Consumable, strapiRowToShape } from '@oyl/all-of-oyl'
import { boot } from './boot'
import { registerUser } from './helpers'

let baseUrl: string
let stop: () => Promise<void>
let jwtA: string
let jwtB: string

beforeAll(async () => {
  ;({ baseUrl, stop } = await boot())
  ;({ jwt: jwtA } = await registerUser(baseUrl, `conA-${Date.now()}`))
  ;({ jwt: jwtB } = await registerUser(baseUrl, `conB-${Date.now()}`))
})
afterAll(async () => { await stop?.() })

const h = (jwt?: string) => ({ 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) })

const createConsumable = (jwt: string, data: Record<string, unknown>) =>
  fetch(`${baseUrl}/consumables`, {
    method: 'POST',
    headers: h(jwt),
    body: JSON.stringify({ data }),
  })

const putConsumable = (jwt: string, recordId: string, data: Record<string, unknown>) =>
  fetch(`${baseUrl}/consumables/${recordId}`, {
    method: 'PUT',
    headers: h(jwt),
    body: JSON.stringify({ data }),
  })

const listConsumables = async (jwt: string): Promise<unknown[]> => {
  const res = await fetch(`${baseUrl}/consumables`, { headers: h(jwt) })
  const body = (await res.json()) as { data: unknown[] }
  return body.data
}

const getConsumable = (jwt: string, recordId: string) =>
  fetch(`${baseUrl}/consumables/${recordId}`, { headers: h(jwt) })

/** A full facts payload covering amounts, servingSize, and additional. */
const sampleFacts = {
  calories: 350,
  protein: 12,
  servingSize: { amount: 100, unit: 'g' },
  additional: [{ slug: 'vitamin-c', amount: 6 }],
}

describe('consumable content-type — catalog visibility (booted)', () => {
  it('unauthenticated request is rejected (401/403)', async () => {
    const res = await fetch(`${baseUrl}/consumables`, { headers: h() })
    expect([401, 403]).toContain(res.status)
  })

  it('user A creates a PUBLIC consumable with full facts; user B list includes it', async () => {
    const uniq = `pub-con-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const res = await createConsumable(jwtA, {
      recordId: uniq,
      name: `Public Consumable ${uniq}`,
      slug: `pub-con-${uniq}`,
      facts: sampleFacts,
      ingredients: ['oats'],
      allergens: ['gluten'],
      visibility: 'public',
    })
    expect(res.status).toBe(201)
    const created = (await res.json()) as { data: { id: number; recordId: string } }
    expect(created.data.id).toBeTypeOf('number')
    expect(created.data.recordId).toBe(uniq)

    // B should see it in the list
    const bList = await listConsumables(jwtB)
    expect(bList.some((r: any) => r.recordId === uniq)).toBe(true)
  })

  it('facts + ingredients/allergens round-trip: returned row decodes via Consumable.fromJSON', async () => {
    // recordId must be a UUID (domain Id constraint) so that strapiRowToShape(row).id passes Id.of()
    const uniq = crypto.randomUUID()
    const label = `rt${Date.now()}`
    const createRes = await createConsumable(jwtA, {
      recordId: uniq,
      name: `RoundTrip ${label}`,
      slug: `rt_con_${label}`,
      facts: sampleFacts,
      ingredients: ['oats', 'honey'],
      allergens: ['gluten'],
      visibility: 'public',
    })
    expect(createRes.status).toBe(201)

    // Read back as A via GET /consumables/:recordId
    const getRes = await getConsumable(jwtA, uniq)
    expect(getRes.status).toBe(200)
    const body = (await getRes.json()) as { data: unknown }
    const row = body.data

    // Verify raw row has populated facts with servingSize + additional
    const rawRow = row as Record<string, unknown>
    expect(rawRow['facts']).toBeDefined()
    const rawFacts = rawRow['facts'] as Record<string, unknown>
    expect(rawFacts['calories']).toBe(350)
    expect(rawFacts['protein']).toBe(12)
    expect(rawFacts['servingSize']).toBeDefined()
    const rawSS = rawFacts['servingSize'] as Record<string, unknown>
    expect(rawSS['amount']).toBe(100)
    expect(rawSS['unit']).toBe('g')
    expect(Array.isArray(rawFacts['additional'])).toBe(true)
    const rawAdditional = rawFacts['additional'] as Array<Record<string, unknown>>
    expect(rawAdditional.length).toBe(1)
    expect(rawAdditional[0]!['slug']).toBe('vitamin-c')
    expect(rawAdditional[0]!['amount']).toBe(6)

    // ingredients + allergens round-trip
    expect(rawRow['ingredients']).toEqual(['oats', 'honey'])
    expect(rawRow['allergens']).toEqual(['gluten'])

    // Full domain round-trip: strapiRowToShape + Consumable.fromJSON
    // strapiRowToShape strips Strapi internal keys (id, recordId, etc.) and
    // maps recordId → id so Consumable.fromJSON gets the domain id.
    // Nested component objects (facts, servingSize, additional items) pass through
    // because they lack recordId — their Strapi numeric id is harmlessly ignored
    // by nutritionFactsFromJSON (it only reads known fields).
    const shape = strapiRowToShape(row) as Record<string, unknown>
    const consumable = Consumable.fromJSON(shape)
    expect(consumable.name).toBe(`RoundTrip ${label}`)
    expect(consumable.facts.calories).toBe(350)
    expect(consumable.facts.protein).toBe(12)
    expect(consumable.facts.servingSize?.amount).toBe(100)
    expect(consumable.facts.servingSize?.unit).toBe('g')
    expect(consumable.facts.additional).toHaveLength(1)
    expect(consumable.facts.additional![0]!.slug).toBe('vitamin-c')
    expect(consumable.facts.additional![0]!.amount).toBe(6)
    expect(consumable.ingredients).toEqual(['oats', 'honey'])
    expect(consumable.allergens).toEqual(['gluten'])
  })

  it('user A creates a PRIVATE consumable; B does NOT see it but A does', async () => {
    const uniq = `priv-con-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const res = await createConsumable(jwtA, {
      recordId: uniq,
      name: `Private Consumable ${uniq}`,
      slug: `priv-con-${uniq}`,
      facts: sampleFacts,
      visibility: 'private',
    })
    expect(res.status).toBe(201)

    const aList = await listConsumables(jwtA)
    const bList = await listConsumables(jwtB)

    expect(aList.some((r: any) => r.recordId === uniq)).toBe(true)
    expect(bList.some((r: any) => r.recordId === uniq)).toBe(false)
  })

  it('creator is server-stamped: B cannot see A\'s private consumable', async () => {
    const uniq = `creator-con-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const res = await createConsumable(jwtA, {
      recordId: uniq,
      name: `CreatorStamp ${uniq}`,
      slug: `creator-con-${uniq}`,
      facts: sampleFacts,
      visibility: 'private',
    })
    expect(res.status).toBe(201)

    // B cannot access it at all via findOne
    const bGet = await getConsumable(jwtB, uniq)
    expect(bGet.status).toBe(404)
  })

  it('PUT to a new recordId creates the consumable (upsert); a second PUT updates one row', async () => {
    const uniq = `upsert-con-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const first = await putConsumable(jwtA, uniq, {
      name: `v1 ${uniq}`,
      slug: `upsert-con-${uniq}`,
      facts: sampleFacts,
      visibility: 'public',
    })
    expect(first.status).toBe(200)
    const created = (await first.json()) as { data: { recordId: string } }
    expect(created.data.recordId).toBe(uniq)

    const second = await putConsumable(jwtA, uniq, {
      name: `v2 ${uniq}`,
      slug: `upsert-con-${uniq}`,
      facts: sampleFacts,
      visibility: 'public',
    })
    expect(second.status).toBe(200)

    // Idempotent upsert: exactly one row, latest write wins.
    const aList = await listConsumables(jwtA)
    const matches = aList.filter((r: any) => r.recordId === uniq)
    expect(matches).toHaveLength(1)
    expect((matches[0] as any).name).toBe(`v2 ${uniq}`)
  })

  it('user B cannot update user A consumable by recordId (404, A unchanged)', async () => {
    const uniq = `upd-con-${Date.now()}`
    const res = await putConsumable(jwtA, uniq, {
      name: `Update Test ${uniq}`,
      slug: `upd-con-${uniq}`,
      facts: sampleFacts,
      visibility: 'public',
    })
    expect(res.status).toBe(200)

    const bPut = await putConsumable(jwtB, uniq, { name: 'tampered', slug: `upd-con-${uniq}`, facts: sampleFacts })
    expect(bPut.status).toBe(404)

    // A can still read it unchanged
    const aGet = await getConsumable(jwtA, uniq)
    expect(aGet.status).toBe(200)
    const aRow = (await aGet.json()) as { data: { name: string } }
    expect(aRow.data.name).toBe(`Update Test ${uniq}`)
  })

  it('user B cannot delete user A consumable by recordId (404)', async () => {
    const uniq = `del-con-${Date.now()}`
    const res = await putConsumable(jwtA, uniq, {
      name: `Delete Test ${uniq}`,
      slug: `del-con-${uniq}`,
      facts: sampleFacts,
      visibility: 'public',
    })
    expect(res.status).toBe(200)

    const bDel = await fetch(`${baseUrl}/consumables/${uniq}`, { method: 'DELETE', headers: h(jwtB) })
    expect(bDel.status).toBe(404)

    // A can still read it
    const aGet = await getConsumable(jwtA, uniq)
    expect(aGet.status).toBe(200)
  })
})
