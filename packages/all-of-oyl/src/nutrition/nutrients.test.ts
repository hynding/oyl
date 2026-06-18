import { describe, expect, it } from 'vitest'
import { assertNutrients, nutrientsToJSON, nutrientsFromJSON } from './nutrients.js'
import { DomainError } from '../core/domain-error.js'

describe('nutrients helpers', () => {
  it('round-trips present fields', () => {
    const n = { calories: 200, protein: 10 }
    expect(nutrientsFromJSON(nutrientsToJSON(n))).toEqual(n)
  })
  it('rejects a negative nutrient', () => {
    let code: unknown
    try { assertNutrients({ calories: -1 }) } catch (e) { code = (e as DomainError).code }
    expect(code).toBe('INVALID_QUANTITY')
  })
})
