import type { OFFGetByBarcodeResponse, OFFProduct, OFFProductSummary, OFFSearchResponse } from './off-types'

const SEARCH_FIELDS = 'code,product_name,brands,image_front_small_url,nutriscore_grade,nova_group'
const PRODUCT_FIELDS = [
  'code', 'product_name', 'generic_name', 'brands',
  'image_url', 'image_front_small_url', 'image_front_url',
  'serving_size', 'serving_quantity', 'quantity', 'nutriments',
  'nutriscore_grade', 'nutriscore_score', 'nova_group',
  'ecoscore_grade', 'allergens_tags', 'traces_tags',
  'categories_tags', 'labels_tags', 'ingredients_text',
  'nutrient_levels', 'last_modified_t',
].join(',')

export type OFFClientConfig = {
  baseUrl: string
  appName: string
  appVersion: string
  clientId: string
}

export type OFFClient = {
  searchByQuery(query: string, signal: AbortSignal): Promise<OFFProductSummary[]>
  fetchByBarcode(barcode: string, signal: AbortSignal): Promise<OFFProduct | null>
}

function buildHeaders(cfg: OFFClientConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'X-App-Name': cfg.appName,
    'X-App-Version': cfg.appVersion,
    'X-Client-Id': cfg.clientId,
    Accept: 'application/json',
  }
  if (cfg.baseUrl.includes('openfoodfacts.net')) {
    headers.Authorization = 'Basic ' + btoa('off:off')
  }
  return headers
}

export function createOFFClient(cfg: OFFClientConfig): OFFClient {
  return {
    async searchByQuery(query, signal) {
      const params = new URLSearchParams({
        search_terms: query,
        fields: SEARCH_FIELDS,
        page_size: '20',
      })
      const res = await fetch(`${cfg.baseUrl}/search?${params.toString()}`, {
        headers: buildHeaders(cfg),
        signal,
      })
      if (!res.ok) throw new Error(`OFF search failed: ${res.status}`)
      const json = (await res.json()) as OFFSearchResponse
      return json.products ?? []
    },
    async fetchByBarcode(barcode, signal) {
      const params = new URLSearchParams({ fields: PRODUCT_FIELDS })
      const res = await fetch(`${cfg.baseUrl}/product/${encodeURIComponent(barcode)}?${params.toString()}`, {
        headers: buildHeaders(cfg),
        signal,
      })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`OFF product failed: ${res.status}`)
      const json = (await res.json()) as OFFGetByBarcodeResponse
      if (json.status === 0 || !json.product) return null
      return json.product
    },
  }
}

export function createOFFClientFromEnv(): OFFClient {
  const baseUrl = import.meta.env.VITE_OFF_BASE_URL
  const appName = import.meta.env.VITE_OFF_APP_NAME
  const appVersion = import.meta.env.VITE_OFF_APP_VERSION
  const clientId = import.meta.env.VITE_OFF_CLIENT_ID
  if (!baseUrl || !appName || !appVersion || !clientId) {
    console.warn('[OFF] missing VITE_OFF_* env vars; OFF identification will be degraded')
  }
  return createOFFClient({
    baseUrl: baseUrl ?? 'https://world.openfoodfacts.net/api/v3',
    appName: appName ?? 'OYL/dev',
    appVersion: appVersion ?? 'dev',
    clientId: clientId ?? 'https://github.com/hynding/oyl',
  })
}
