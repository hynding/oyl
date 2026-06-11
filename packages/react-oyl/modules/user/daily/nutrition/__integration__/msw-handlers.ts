import { http, HttpResponse } from 'msw'

type AnyRecord = Record<string, unknown> & { id?: number; documentId?: string }

export type IntegrationStore = {
  userNutritions: AnyRecord[]
  nutritionItems: AnyRecord[]
  nutritionSearches: AnyRecord[]
  offSearch?: (query: string) => unknown
  offBarcode?: (code: string) => unknown
  events: string[]
}

export function emptyStore(): IntegrationStore {
  return { userNutritions: [], nutritionItems: [], nutritionSearches: [], events: [] }
}

let _nextId = 100
function next() { return _nextId++ }

export function buildHandlers(store: IntegrationStore) {
  return [
    // --- user-nutritions -----------------------------------------------------
    http.get('http://localhost:3337/api/user-nutritions', () => {
      store.events.push('GET /user-nutritions')
      return HttpResponse.json({ data: store.userNutritions })
    }),
    http.post('http://localhost:3337/api/user-nutritions', async ({ request }) => {
      const body = (await request.json()) as { data: AnyRecord }
      const id = next()
      const doc = { id, documentId: `un-${id}`, ...body.data }
      store.userNutritions.push(doc)
      store.events.push(`POST /user-nutritions ${JSON.stringify(body.data)}`)
      return HttpResponse.json({ data: doc })
    }),
    http.put('http://localhost:3337/api/user-nutritions/:id', async ({ params, request }) => {
      const body = (await request.json()) as { data: AnyRecord }
      const idx = store.userNutritions.findIndex(
        n => n.documentId === params.id || String(n.id) === params.id,
      )
      if (idx >= 0) store.userNutritions[idx] = { ...store.userNutritions[idx], ...body.data }
      store.events.push(`PUT /user-nutritions/${params.id} ${JSON.stringify(body.data)}`)
      return HttpResponse.json({ data: store.userNutritions[idx] })
    }),

    // --- nutrition-items -----------------------------------------------------
    http.get('http://localhost:3337/api/nutrition-items', ({ request }) => {
      const url = new URL(request.url)
      const barcode = url.searchParams.get('filters[barcode][$eq]')
      if (barcode) {
        const found = store.nutritionItems.filter(i => i.barcode === barcode)
        store.events.push(`GET /nutrition-items barcode=${barcode}`)
        return HttpResponse.json({ data: found })
      }
      store.events.push('GET /nutrition-items')
      return HttpResponse.json({ data: store.nutritionItems })
    }),
    http.post('http://localhost:3337/api/nutrition-items', async ({ request }) => {
      const body = (await request.json()) as { data: AnyRecord }
      const id = next()
      const doc = { id, documentId: `ni-${id}`, ...body.data }
      store.nutritionItems.push(doc)
      store.events.push(`POST /nutrition-items ${JSON.stringify(body.data)}`)
      return HttpResponse.json({ data: doc })
    }),

    // --- nutrition-searches --------------------------------------------------
    http.get('http://localhost:3337/api/nutrition-searches', () => {
      store.events.push('GET /nutrition-searches')
      return HttpResponse.json({ data: store.nutritionSearches })
    }),
    http.post('http://localhost:3337/api/nutrition-searches', async ({ request }) => {
      const body = (await request.json()) as { data: AnyRecord }
      const id = next()
      const doc = { id, documentId: `ns-${id}`, ...body.data }
      store.nutritionSearches.push(doc)
      store.events.push(`POST /nutrition-searches ${JSON.stringify(body.data)}`)
      return HttpResponse.json({ data: doc })
    }),

    // --- OFF v2 (pinned: v3 has no /search yet) -----------------------------
    http.get(/.*\/api\/v2\/search/, ({ request }) => {
      const url = new URL(request.url)
      const q = url.searchParams.get('search_terms') ?? ''
      store.events.push(`OFF search ${q}`)
      return HttpResponse.json(
        store.offSearch?.(q) ?? { products: [], count: 0, page: 1, page_count: 0, page_size: 0 },
      )
    }),
    http.get(/.*\/api\/v2\/product\/.+/, ({ request }) => {
      const url = new URL(request.url)
      const code = url.pathname.split('/').pop() ?? ''
      store.events.push(`OFF product ${code}`)
      const result = store.offBarcode?.(code)
      return HttpResponse.json(result ?? { status: 0 })
    }),
  ]
}
