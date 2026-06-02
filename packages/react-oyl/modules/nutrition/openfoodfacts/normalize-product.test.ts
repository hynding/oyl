import { describe, expect, it } from 'vitest'
import type { OFFProduct } from './off-types'
import { normalizeProduct } from './normalize-product'

const base: OFFProduct = {
  code: '5060337502222',
  product_name: 'Oat Drink',
  brands: 'Oatly, Foo',
  image_url: 'https://x/full.jpg',
  image_front_small_url: 'https://x/small.jpg',
  image_front_url: 'https://x/front.jpg',
  serving_quantity: 240,
  quantity: '1 L',
  nutriments: {
    'energy-kcal_100ml': 47,
    proteins_100ml: 1,
    carbohydrates_100ml: 6.6,
    fat_100ml: 1.5,
  },
  nutriscore_grade: 'b',
  nutriscore_score: 1,
  nova_group: 4,
  allergens_tags: ['en:gluten', 'en:milk'],
  categories_tags: ['en:plant-based-foods', 'en:beverages'],
  ingredients_text: 'Water, oats (10%)…',
  ecoscore_grade: 'c',
  labels_tags: ['en:organic'],
  nutrient_levels: { fat: 'low' },
  last_modified_t: 1700000000,
}

describe('normalizeProduct', () => {
  it('promotes columns and produces curated data subset', () => {
    const r = normalizeProduct(base)
    expect(r.columns.name).toBe('Oat Drink')
    expect(r.columns.brand).toBe('Oatly')
    expect(r.columns.image_url).toBe('https://x/small.jpg')
    expect(r.columns.serving_unit).toBe('ml')
    expect(r.columns.serving_size).toBe(240)
    expect(r.columns.package_quantity).toBe('1 L')
    expect(r.columns.calories_per_100).toBe(47)
    expect(r.columns.protein_per_100).toBe(1)
    expect(r.columns.nutri_score).toBe('b')
    expect(r.columns.nova_group).toBe(4)
    expect(r.columns.allergens).toEqual(['gluten', 'milk'])
    expect(r.columns.source).toBe('openfoodfacts')
    expect(r.columns.barcode).toBe('5060337502222')
    expect(r.data.image_front_url).toBe('https://x/front.jpg')
    expect(r.data.categories_tags).toEqual(['en:plant-based-foods', 'en:beverages'])
    expect(r.data.ingredients_text).toBe('Water, oats (10%)…')
    expect(r.data.ecoscore_grade).toBe('c')
    expect(r.data).not.toHaveProperty('nutriments')
    expect(r.data).not.toHaveProperty('product_name')
  })

  it('prefers g over ml when both present', () => {
    const r = normalizeProduct({
      ...base,
      nutriments: { 'energy-kcal_100g': 50, 'energy-kcal_100ml': 47 },
    })
    expect(r.columns.serving_unit).toBe('g')
    expect(r.columns.calories_per_100).toBe(50)
  })

  it('falls back to serving when neither g nor ml macros present', () => {
    const r = normalizeProduct({ ...base, nutriments: {} })
    expect(r.columns.serving_unit).toBe('serving')
    expect(r.columns.calories_per_100).toBeNull()
  })

  it('preserves nulls — no zero coercion', () => {
    const r = normalizeProduct({ ...base, nutriments: { 'energy-kcal_100ml': 47 } })
    expect(r.columns.protein_per_100).toBeNull()
    expect(r.columns.carbs_per_100).toBeNull()
    expect(r.columns.fat_per_100).toBeNull()
  })

  it('falls back to generic_name then code when product_name missing', () => {
    expect(normalizeProduct({ ...base, product_name: undefined }).columns.name).toBe(base.code)
    expect(normalizeProduct({ ...base, product_name: undefined, generic_name: 'Generic Oat' }).columns.name).toBe('Generic Oat')
  })

  it('strips en: prefix from allergens', () => {
    expect(normalizeProduct({ ...base, allergens_tags: ['en:gluten', 'en:milk'] }).columns.allergens).toEqual(['gluten', 'milk'])
  })

  it('clamps nova_group to 1-4 or null', () => {
    expect(normalizeProduct({ ...base, nova_group: 7 as unknown as number }).columns.nova_group).toBeNull()
    expect(normalizeProduct({ ...base, nova_group: undefined }).columns.nova_group).toBeNull()
  })
})
