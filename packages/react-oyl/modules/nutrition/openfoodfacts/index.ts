export { createOFFClient, createOFFClientFromEnv } from './openfoodfacts-client'
export type { OFFClient, OFFClientConfig } from './openfoodfacts-client'
export type {
  OFFProduct, OFFProductSummary, OFFSearchResponse, OFFGetByBarcodeResponse, OFFNutriments,
} from './off-types'
export { normalizeProduct } from './normalize-product'
export type { NormalizedProduct } from './normalize-product'
export { useNutritionSearch } from './useNutritionSearch'
export type {
  LocalResult, LocalResultSource, NutritionSearchCache, UseNutritionSearchArgs,
} from './useNutritionSearch'
export { useBarcodeScanner } from './useBarcodeScanner'
