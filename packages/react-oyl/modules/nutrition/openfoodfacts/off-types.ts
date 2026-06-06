// OFF v3 response shapes — subset of fields we request.
// Source spec: docs/superpowers/specs/2026-06-02-user-daily-nutrition-design.md
// Field names below match the v3 spec; if a name turns out to be different at
// implementation time, update both this file and normalize-product.ts together.

export type OFFNutriments = {
  'energy-kcal_100g'?: number
  'energy-kcal_100ml'?: number
  proteins_100g?: number
  proteins_100ml?: number
  carbohydrates_100g?: number
  carbohydrates_100ml?: number
  fat_100g?: number
  fat_100ml?: number
}

export type OFFProduct = {
  code: string
  product_name?: string
  generic_name?: string
  brands?: string
  image_url?: string
  image_front_small_url?: string
  image_front_url?: string
  serving_size?: string | null
  serving_quantity?: number | null
  quantity?: string | null
  nutriments?: OFFNutriments
  nutriscore_grade?: 'a' | 'b' | 'c' | 'd' | 'e'
  nutriscore_score?: number
  nova_group?: number
  ecoscore_grade?: 'a' | 'b' | 'c' | 'd' | 'e'
  allergens_tags?: string[]
  traces_tags?: string[]
  categories_tags?: string[]
  labels_tags?: string[]
  ingredients_text?: string
  nutrient_levels?: Record<string, 'low' | 'moderate' | 'high'>
  last_modified_t?: number
}

export type OFFProductSummary = {
  code: string
  product_name?: string
  brands?: string
  image_front_small_url?: string
  nutriscore_grade?: 'a' | 'b' | 'c' | 'd' | 'e'
  nova_group?: number
}

export type OFFSearchResponse = {
  products: OFFProductSummary[]
  count: number
  page: number
  page_count: number
  page_size: number
}

export type OFFGetByBarcodeResponse = {
  status: 0 | 1
  product?: OFFProduct
}
