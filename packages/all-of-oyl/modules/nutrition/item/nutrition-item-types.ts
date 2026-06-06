import type { TDataItem } from "../../data";

export type TNutritionItem = {
  name: string
  barcode?: string | null
  brand?: string | null
  image_url?: string | null
  serving_size?: number | null
  serving_unit: 'g' | 'ml' | 'serving'
  package_quantity?: string | null
  calories_per_100?: number | null
  protein_per_100?: number | null
  carbs_per_100?: number | null
  fat_per_100?: number | null
  nutri_score?: 'a' | 'b' | 'c' | 'd' | 'e' | null
  nutri_score_value?: number | null
  nova_group?: 1 | 2 | 3 | 4 | null
  allergens?: string[] | null
  source: 'user' | 'openfoodfacts'
  data?: Record<string, unknown>
}

export type TNutritionItemData = TNutritionItem & TDataItem
