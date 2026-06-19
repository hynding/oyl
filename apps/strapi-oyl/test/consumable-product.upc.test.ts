import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ConsumableProduct, strapiRowToShape } from '@oyl/all-of-oyl'
import { boot } from './boot'
import { registerUser } from './helpers'

let baseUrl: string
let stop: () => Promise<void>
let jwtA: string
let jwtB: string

beforeAll(async () => {
  ;({ baseUrl, stop } = await boot())
  ;({ jwt: jwtA } = await registerUser(baseUrl, `cpA-${Date.now()}`))
  ;({ jwt: jwtB } = await registerUser(baseUrl, `cpB-${Date.now()}`))
})
afterAll(async () => { await stop?.() })

const h = (jwt?: string) => ({ 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) })

const createProduct = (jwt: string, data: Record<string, unknown>) =>
  fetch(`${baseUrl}/consumable-products`, {
    method: 'POST',
    headers: h(jwt),
    body: JSON.stringify({ data }),
  })

const putProduct = (jwt: string, recordId: string, data: Record<string, unknown>) =>
  fetch(`${baseUrl}/consumable-products/${recordId}`, {
    method: 'PUT',
    headers: h(jwt),
    body: JSON.stringify({ data }),
  })

const listProducts = async (jwt: string): Promise<unknown[]> => {
  const res = await fetch(`${baseUrl}/consumable-products`, { headers: h(jwt) })
  const body = (await res.json()) as { data: unknown[] }
  return body.data
}

const getProduct = (jwt: string, recordId: string) =>
  fetch(`${baseUrl}/consumable-products/${recordId}`, { headers: h(jwt) })

/** A full facts payload covering amounts, servingSize, and additional. */
const sampleFacts = {
  calories: 150,
  protein: 5,
  servingSize: { amount: 28, unit: 'g' },
  additional: [{ slug: 'iron', amount: 2 }],
}

describe('consumable-product content-type — UPC dedup + catalog visibility (booted)', () => {
  it('unauthenticated request is rejected (401/403)', async () => {
    const res = await fetch(`${baseUrl}/consumable-products`, { headers: h() })
    expect([401, 403]).toContain(res.status)
  })

  it('A creates a product WITH a upc; B list includes it (UPC products are public)', async () => {
    const upc = `000-test-upc-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const recId = crypto.randomUUID()
    const res = await createProduct(jwtA, {
      recordId: recId,
      name: `UPC Product ${upc}`,
      consumableId: crypto.randomUUID(),
      upc,
    })
    expect(res.status).toBe(201)
    const created = (await res.json()) as { data: { recordId: string } }
    expect(created.data.recordId).toBe(recId)

    // B should see it in the list (UPC products are public)
    const bList = await listProducts(jwtB)
    expect(bList.some((r: any) => r.upc === upc)).toBe(true)
  })

  it('B creates the SAME upc → resolves to the SAME single row (dedup); exactly ONE row for that upc', async () => {
    const upc = `dedup-upc-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const recIdA = crypto.randomUUID()
    const recIdB = crypto.randomUUID()

    // A creates a product with this UPC
    const resA = await createProduct(jwtA, {
      recordId: recIdA,
      name: `Dedup Product A ${upc}`,
      consumableId: crypto.randomUUID(),
      upc,
    })
    expect(resA.status).toBe(201)
    const bodyA = (await resA.json()) as { data: { recordId: string } }
    const originalRecordId = bodyA.data.recordId

    // B creates a product with the SAME UPC → should return the existing row (dedup)
    const resB = await createProduct(jwtB, {
      recordId: recIdB,
      name: `Dedup Product B ${upc}`,
      consumableId: crypto.randomUUID(),
      upc,
    })
    // Returns 200 for dedup (existing row returned, not 201 created)
    expect([200, 201]).toContain(resB.status)
    const bodyB = (await resB.json()) as { data: { recordId: string } }
    // The returned recordId must equal A's original row — not a second row
    expect(bodyB.data.recordId).toBe(originalRecordId)

    // List shows exactly ONE row for that UPC
    const aList = await listProducts(jwtA)
    const matches = aList.filter((r: any) => r.upc === upc)
    expect(matches).toHaveLength(1)
  })

  it('A creates a product WITHOUT a upc → B list EXCLUDES it (non-UPC private); A list includes it', async () => {
    const recId = `priv-prod-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const res = await createProduct(jwtA, {
      recordId: recId,
      name: `Private Product ${recId}`,
      consumableId: crypto.randomUUID(),
      // no upc — should default to private
    })
    expect(res.status).toBe(201)

    const aList = await listProducts(jwtA)
    const bList = await listProducts(jwtB)

    // A sees it (creator)
    expect(aList.some((r: any) => r.recordId === recId)).toBe(true)
    // B does NOT see it (private, non-UPC)
    expect(bList.some((r: any) => r.recordId === recId)).toBe(false)
  })

  it('creator is server-stamped: a client-supplied creator field is ignored', async () => {
    const recId = `creator-stamp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    // A creates a product but supplies a fake creator id in the body
    const res = await createProduct(jwtA, {
      recordId: recId,
      name: `Creator Stamp Test ${recId}`,
      consumableId: crypto.randomUUID(),
      // Attempt to forge creator to user B by supplying a raw id (server must ignore this)
      creator: 9999,
    })
    expect(res.status).toBe(201)

    // B should NOT see it (product is private, creator is A — not the fake 9999)
    const bList = await listProducts(jwtB)
    expect(bList.some((r: any) => r.recordId === recId)).toBe(false)

    // A CAN see it (creator correctly set to A)
    const aList = await listProducts(jwtA)
    expect(aList.some((r: any) => r.recordId === recId)).toBe(true)
  })

  // --- PUT path tests ---

  it('PUT with a new upc creates a public row visible to others', async () => {
    const upc = `put-new-upc-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const recIdA = crypto.randomUUID()

    // A PUTs a product with a fresh UPC
    const res = await putProduct(jwtA, recIdA, {
      name: `PUT UPC Product ${upc}`,
      consumableId: crypto.randomUUID(),
      upc,
    })
    expect([200, 201]).toContain(res.status)
    const body = (await res.json()) as { data: { recordId: string; upc: string } }
    expect(body.data.recordId).toBe(recIdA)
    expect(body.data.upc).toBe(upc)

    // B should see it in the list (UPC products are public)
    const bList = await listProducts(jwtB)
    expect(bList.some((r: any) => r.upc === upc)).toBe(true)
  })

  it('PUT dedup convergence + non-mutation: B PUT same upc returns existing row, name unchanged', async () => {
    const upc = `put-dedup-upc-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const recIdA = crypto.randomUUID()
    const recIdB = crypto.randomUUID()

    // A PUTs a product with this UPC first
    const resA = await putProduct(jwtA, recIdA, {
      name: 'Original',
      consumableId: crypto.randomUUID(),
      upc,
    })
    expect([200, 201]).toContain(resA.status)
    const bodyA = (await resA.json()) as { data: { recordId: string; name: string } }
    const originalRecordId = bodyA.data.recordId
    expect(originalRecordId).toBe(recIdA)

    // B PUTs a DIFFERENT recordId with the SAME upc but a different name
    const resB = await putProduct(jwtB, recIdB, {
      name: 'Changed',
      consumableId: crypto.randomUUID(),
      upc,
    })
    expect([200, 201]).toContain(resB.status)
    const bodyB = (await resB.json()) as { data: { recordId: string; name: string } }
    // (a) The response recordId equals A's original row, NOT B's
    expect(bodyB.data.recordId).toBe(originalRecordId)
    // (b) first-write-wins: name is still 'Original', not 'Changed'
    expect(bodyB.data.name).toBe('Original')

    // Exactly ONE row carries that upc (no duplicate)
    const aList = await listProducts(jwtA)
    const matches = aList.filter((r: any) => r.upc === upc)
    expect(matches).toHaveLength(1)
  })

  it('PUT non-UPC cross-creator is refused (404); original row unchanged', async () => {
    const recIdA = `put-private-${Date.now()}-${Math.random().toString(36).slice(2)}`

    // A creates a non-UPC (private) product
    const resA = await createProduct(jwtA, {
      recordId: recIdA,
      name: 'A Private Product',
      consumableId: crypto.randomUUID(),
      // no upc — private
    })
    expect(resA.status).toBe(201)

    // B PUTs A's recordId with no upc → must be refused with 404
    const resB = await putProduct(jwtB, recIdA, {
      name: 'B Hijack Attempt',
      consumableId: crypto.randomUUID(),
      // no upc
    })
    expect(resB.status).toBe(404)

    // A's row is unchanged: A can still read it and the name is 'A Private Product'
    const getRes = await getProduct(jwtA, recIdA)
    expect(getRes.status).toBe(200)
    const getBody = (await getRes.json()) as { data: { name: string } }
    expect(getBody.data.name).toBe('A Private Product')
  })

  it('facts override + netWeight + consumableId round-trip: ConsumableProduct.fromJSON decodes correctly', async () => {
    const recId = crypto.randomUUID()
    const consumableId = crypto.randomUUID()
    const upc = `facts-rt-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const res = await createProduct(jwtA, {
      recordId: recId,
      name: `Facts Round-trip ${recId}`,
      consumableId,
      upc,
      brand: 'TestBrand',
      netWeight: { amount: 500, unit: 'g' },
      servingsPerContainer: 10,
      facts: sampleFacts,
      ingredients: ['oats', 'salt'],
      allergens: ['gluten'],
    })
    expect(res.status).toBe(201)

    // Read back via GET /:recordId
    const getRes = await getProduct(jwtA, recId)
    expect(getRes.status).toBe(200)
    const body = (await getRes.json()) as { data: unknown }
    const row = body.data

    // Verify raw facts structure
    const rawRow = row as Record<string, unknown>
    const rawFacts = rawRow['facts'] as Record<string, unknown>
    expect(rawFacts['calories']).toBe(150)
    expect(rawFacts['protein']).toBe(5)
    const rawSS = rawFacts['servingSize'] as Record<string, unknown>
    expect(rawSS['amount']).toBe(28)
    expect(rawSS['unit']).toBe('g')
    const rawAdditional = rawFacts['additional'] as Array<Record<string, unknown>>
    expect(rawAdditional).toHaveLength(1)
    expect(rawAdditional[0]!['slug']).toBe('iron')
    expect(rawAdditional[0]!['amount']).toBe(2)

    // netWeight, consumableId, ingredients, allergens pass through
    const rawNetWeight = rawRow['netWeight'] as Record<string, unknown>
    expect(rawNetWeight['amount']).toBe(500)
    expect(rawNetWeight['unit']).toBe('g')
    expect(rawRow['consumableId']).toBe(consumableId)
    expect(rawRow['ingredients']).toEqual(['oats', 'salt'])
    expect(rawRow['allergens']).toEqual(['gluten'])

    // Domain round-trip: strapiRowToShape + ConsumableProduct.fromJSON
    const shape = strapiRowToShape(row) as Record<string, unknown>
    const product = ConsumableProduct.fromJSON(shape)
    expect(product.name).toBe(`Facts Round-trip ${recId}`)
    expect(product.consumableId.toString()).toBe(consumableId)
    expect(product.upc).toBe(upc)
    expect(product.brand).toBe('TestBrand')
    expect(product.netWeight).toEqual({ amount: 500, unit: 'g' })
    expect(product.servingsPerContainer).toBe(10)
    // facts override
    expect(product.facts).toBeDefined()
    expect(product.facts!.calories).toBe(150)
    expect(product.facts!.protein).toBe(5)
    expect(product.facts!.servingSize?.amount).toBe(28)
    expect(product.facts!.servingSize?.unit).toBe('g')
    expect(product.facts!.additional).toHaveLength(1)
    expect(product.facts!.additional![0]!.slug).toBe('iron')
    expect(product.facts!.additional![0]!.amount).toBe(2)
    expect(product.ingredients).toEqual(['oats', 'salt'])
    expect(product.allergens).toEqual(['gluten'])
  })
})
