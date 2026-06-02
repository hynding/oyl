import type { OFFProduct } from './off-types'
import type { TNutritionItem } from '@oyl/all-of-oyl/modules'

export type NormalizedProduct = {
  columns: Omit<TNutritionItem, 'data'> & { barcode: string }
  data: Record<string, unknown>
}

function pickUnit(n: OFFProduct['nutriments']): { unit: 'g' | 'ml' | 'serving'; suffix: '100g' | '100ml' | null } {
  if (!n) return { unit: 'serving', suffix: null }
  if (n['energy-kcal_100g'] !== undefined) return { unit: 'g', suffix: '100g' }
  if (n['energy-kcal_100ml'] !== undefined) return { unit: 'ml', suffix: '100ml' }
  return { unit: 'serving', suffix: null }
}

function macro(n: OFFProduct['nutriments'], key: 'energy-kcal' | 'proteins' | 'carbohydrates' | 'fat', suffix: '100g' | '100ml' | null): number | null {
  if (!n || !suffix) return null
  const value = n[`${key}_${suffix}` as keyof typeof n]
  return typeof value === 'number' ? value : null
}

function stripPrefix(tag: string): string {
  const colon = tag.indexOf(':')
  return colon === -1 ? tag : tag.slice(colon + 1)
}

function clampNova(v: number | undefined): 1 | 2 | 3 | 4 | null {
  if (typeof v !== 'number') return null
  if (v === 1 || v === 2 || v === 3 || v === 4) return v
  return null
}

export function normalizeProduct(p: OFFProduct): NormalizedProduct {
  const { unit, suffix } = pickUnit(p.nutriments)
  const brand = (p.brands ?? '').split(',')[0]?.trim() || null
  const name = p.product_name?.trim() || p.generic_name?.trim() || p.code
  return {
    columns: {
      barcode: p.code,
      name,
      brand,
      image_url: p.image_front_small_url ?? null,
      serving_size: typeof p.serving_quantity === 'number' ? p.serving_quantity : null,
      serving_unit: unit,
      package_quantity: p.quantity ?? null,
      calories_per_100: macro(p.nutriments, 'energy-kcal', suffix),
      protein_per_100: macro(p.nutriments, 'proteins', suffix),
      carbs_per_100: macro(p.nutriments, 'carbohydrates', suffix),
      fat_per_100: macro(p.nutriments, 'fat', suffix),
      nutri_score: p.nutriscore_grade ?? null,
      nutri_score_value: typeof p.nutriscore_score === 'number' ? p.nutriscore_score : null,
      nova_group: clampNova(p.nova_group),
      allergens: p.allergens_tags?.map(stripPrefix) ?? null,
      source: 'openfoodfacts',
    },
    data: {
      generic_name: p.generic_name ?? null,
      categories_tags: p.categories_tags ?? [],
      ingredients_text: p.ingredients_text ?? null,
      ecoscore_grade: p.ecoscore_grade ?? null,
      nutrient_levels: p.nutrient_levels ?? null,
      labels_tags: p.labels_tags ?? [],
      image_front_url: p.image_front_url ?? null,
      traces_tags: p.traces_tags?.map(stripPrefix) ?? [],
      off_last_modified_t: p.last_modified_t ?? null,
    },
  }
}
